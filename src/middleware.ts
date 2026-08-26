import { NextRequest, NextResponse } from "next/server";

// Simple in-memory rate limiter (resets on cold start, good enough for single-instance Vercel)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute per IP

function getRateLimitKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Clean old entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) rateLimitMap.delete(key);
  }
}, 5 * 60_000);

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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Everything that is not an API route is a page: give it a nonce and go.
  if (!pathname.startsWith("/api/")) {
    const nonce = makeNonce();
    const headers = new Headers(request.headers);
    // Next reads this to stamp its own inline scripts.
    headers.set("x-nonce", nonce);

    const res = NextResponse.next({ request: { headers } });
    res.headers.set("Content-Security-Policy", cspWithNonce(nonce));
    return res;
  }

  // 1. API auth. FAILS CLOSED.
  //
  // This used to be `if (apiToken) { ...check... }` — so an unset token meant
  // no check at all, and a deploy that simply forgot the environment variable
  // silently published every OCR route to the internet. Absent configuration
  // is not permission to skip authentication; in production it is a
  // misconfiguration and the request is refused.
  //
  // Development keeps the open path deliberately, so `next dev` works with no
  // setup, and says so in the response rather than looking authenticated.
  const apiToken = process.env.API_AUTH_TOKEN;
  if (!apiToken) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "server_misconfigured", detail: "API_AUTH_TOKEN is not set" },
        { status: 500 }
      );
    }
  } else {
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.replace("Bearer ", "");

    if (bearerToken !== apiToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  // 2. Rate limiting
  const key = getRateLimitKey(request);
  if (isRateLimited(key)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment." },
      { status: 429 }
    );
  }

  return NextResponse.next();
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
