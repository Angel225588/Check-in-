import { NextRequest, NextResponse } from "next/server";
import { getRoutePolicy, getPropertyCode } from "@/lib/security/config";
import { securityError, statusForCode, type SecurityErrorCode } from "@/lib/security/errors";
import {
  MemoryRateLimitStore,
  checkDual,
  clientIpFrom,
  pruneExpired,
} from "@/lib/security/rate-limit";
import {
  SESSION_COOKIE,
  createSession,
  resolveTokenIdentity,
  sessionCookieOptions,
  signSession,
  verifySession,
  type DeviceIdentity,
} from "@/lib/security/identity";

/**
 * Rate-limit state.
 *
 * Was one 30/min bucket per IP shared by every route. Two dimensions now
 * (device identity and IP) with a per-route tier, because a hotel behind one
 * NAT used to share a bucket while an attacker got a fresh one per address,
 * and a cheap image OCR counted the same as a per-page PDF bill.
 */
const rateLimitStore = new MemoryRateLimitStore();

/**
 * Prune lazily rather than with setInterval. A timer at module scope in the
 * Edge runtime has no guarantee about which instance it runs on, and the
 * previous one leaked across reloads.
 */
let lastPrune = 0;
function maybePrune(now: number) {
  if (now - lastPrune < 60_000) return;
  lastPrune = now;
  pruneExpired(rateLimitStore, now);
}

function deny(code: SecurityErrorCode, retryAfter?: number): NextResponse {
  const body = securityError(code, retryAfter);
  const res = NextResponse.json(body, { status: statusForCode(code) });
  if (body.retryAfter) res.headers.set("Retry-After", String(body.retryAfter));
  return res;
}

/**
 * A fresh nonce per request, for the Content Security Policy.
 *
 * `script-src 'unsafe-inline'` had to go: guest names are encrypted in browser
 * storage, and that encryption does not defend against code running inside the
 * page, so script injection is the residual path to guest data. But Next.js
 * emits its own inline scripts to hydrate React — removing 'unsafe-inline'
 * without a nonce renders every page blank. A nonce lets OUR scripts run and
 * still blocks anything injected.
 */
/**
 * Did this request come from a page the app itself served?
 *
 * A browser POST always carries `Origin`; some contexts carry only `Referer`.
 * Both absent means it is not a browser doing a normal request — curl sends
 * neither — so it is refused.
 */
function isSameOrigin(request: NextRequest): boolean {
  const host = request.headers.get("host");
  if (!host) return false;

  const candidates = [
    request.headers.get("origin"),
    request.headers.get("referer"),
  ].filter(Boolean) as string[];

  if (candidates.length === 0) return false;

  return candidates.some((value) => {
    try {
      return new URL(value).host === host;
    } catch {
      return false;
    }
  });
}

function makeNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function cspWithNonce(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  // Dev keeps eval: fast refresh needs it. The strict policy is what ships.
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval'"
    : `'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // styled-jsx injects style elements at runtime. Injected CSS cannot read
    // storage or call into the app, so this is not comparable to a script.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://*.supabase.co",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ") + ";";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const now = Date.now();
  const propertyCode = getPropertyCode();

  const cookieValue = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(cookieValue, undefined, now);

  // Everything that is not an API route is a page: give it a nonce and go.
  if (!pathname.startsWith("/api/")) {
    const nonce = makeNonce();
    const headers = new Headers(request.headers);
    // Next reads this to stamp its own inline scripts.
    headers.set("x-nonce", nonce);

    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", cspWithNonce(nonce));

    // Mint the metering cookie here, on a normal navigation, so the tablet
    // always has one before it ever uploads. Nobody is prompted for anything.
    if (!session) {
      const { value } = await createSession(propertyCode, now);
      res.cookies.set(
        SESSION_COOKIE,
        value,
        sessionCookieOptions(process.env.NODE_ENV === "production"),
      );
    }
    return res;
  }

  // 1. API access control.
  //
  // HISTORY, because the obvious "fix" here is wrong twice over.
  //
  // This was `if (apiToken) { ...check... }`, so an unset variable meant no
  // check at all. The audit flagged that. The first fix was to fail closed —
  // refuse in production when the token is missing — and that broke the app:
  // API_AUTH_TOKEN is not set on any deployment, so every OCR upload returned
  // `server_misconfigured`.
  //
  // Setting the variable would ALSO have broken it, for a deeper reason. These
  // routes are called by the reception tablet's own browser
  // (`upload/page.tsx` → `/api/ocr-pdf`), and nothing sends an Authorization
  // header. A shared secret the browser must present has to ship inside the
  // bundle, where it is readable by anyone — so it is not a secret and not a
  // control. A bearer token cannot authenticate an unauthenticated PWA.
  //
  // So the token stays OPTIONAL, for server-to-server callers that can hold
  // one, and same-origin is enforced for everyone else. That is a real control
  // for a browser-called API: a POST from a browser always carries `Origin`
  // (the Fetch spec requires it for non-GET), while curl and a hostile page on
  // another domain do not match.
  //
  // What it does NOT stop: a script that forges the Origin header. Nothing
  // short of real user authentication does, and that is the Supabase Auth work
  // in docs/GDPR-AUDIT.md §2 — still not shipped. This narrows drive-by abuse
  // of the Mistral key; it is not authentication, and the DPA says so.
  // The token is ADDITIVE, not a replacement. Requiring it once set is the
  // third version of this bug: .env.sample still called it "required in
  // production", and setting it would 401 every upload from the tablet, which
  // sends no Authorization header. A caller is accepted if it presents a valid
  // token OR it is same-origin. Configuring one therefore cannot take the app
  // down — and it cannot lock the browser API down either, which is the point
  // the comment above makes: that is what Supabase Auth is for.
  const tokenIdentity = resolveTokenIdentity(
    request.headers.get("authorization"),
    propertyCode,
  );

  const authorizationHeader = request.headers.get("authorization");
  if (authorizationHeader && !tokenIdentity) {
    // A token was offered and it was wrong. Same-origin must not rescue that.
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!tokenIdentity && !isSameOrigin(request)) {
    return NextResponse.json({ error: "cross_origin_denied" }, { status: 403 });
  }

  // 2. Route policy. An /api path with no entry is denied rather than
  //    inheriting whatever the last route happened to allow.
  const policy = getRoutePolicy(pathname);
  if (!policy) return deny("invalid_request");
  if (!policy.methods.includes(request.method)) return deny("method_not_allowed");

  // Reject an oversized body before reading a byte of it. The route checks
  // again against real bytes, because this header can be absent or a lie.
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > policy.maxBodyBytes) {
    return deny("payload_too_large");
  }

  // 3. Identity for metering. This is NOT authentication — see
  //    src/lib/security/identity.ts. It gives the limiter and the spend cap a
  //    stable key that is not the IP address.
  let identity: DeviceIdentity | null = tokenIdentity;
  let refreshedCookie: string | null = null;

  if (!identity) {
    if (!session) {
      // Same-origin already passed, so this is the app with a missing or
      // stale cookie. A page reload mints one; no password is involved.
      return deny("unauthenticated");
    }
    identity = { kind: "device", id: session.id, propertyCode: session.propertyCode };
    // Slide the expiry so an active shift never lapses mid-service.
    refreshedCookie = await signSession({
      id: session.id,
      propertyCode: session.propertyCode,
      iat: now,
    });
  }

  // 4. Rate limiting: per identity AND per IP, on this route's own tier.
  maybePrune(now);
  const limit = checkDual(
    rateLimitStore,
    {
      identityId: identity.id,
      ip: clientIpFrom(request.headers),
      path: pathname,
      perIdentity: policy.perIdentity,
      perIp: policy.perIp,
    },
    now,
  );

  if (!limit.allowed) return deny("rate_limited", limit.retryAfter);

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(limit.limit));
  res.headers.set("X-RateLimit-Remaining", String(limit.remaining));
  if (refreshedCookie) {
    res.cookies.set(
      SESSION_COOKIE,
      refreshedCookie,
      sessionCookieOptions(process.env.NODE_ENV === "production"),
    );
  }
  return res;
}

export const config = {
  // Pages need the nonce, API routes need the auth check, so the middleware
  // runs on both. Static assets and the image optimiser are excluded: they
  // carry no inline script and paying for middleware on every chunk request
  // would slow the one path that must not get slower.
  matcher: [
    "/((?!_next/static|_next/image|icons/|favicon.svg|manifest.json|theme-init.js).*)",
  ],
};
