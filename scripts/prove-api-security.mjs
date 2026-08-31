/**
 * Black-box proof of the API security layer, against a REAL running server.
 *
 * Every other test for this layer runs the middleware in-process. That proves
 * the logic and nothing about deployment: whether the middleware is actually
 * invoked for these paths, whether the cookie survives a real Set-Cookie
 * round-trip, whether the route sees the forwarded headers. This makes real
 * HTTP requests and asserts on real responses.
 *
 * Requires a server started with a DUMMY MISTRAL_API_KEY: every guard this
 * checks runs *before* the provider call, so no request here reaches Mistral
 * and none costs money. Without a key the routes short-circuit on
 * service_unconfigured and the guards never run at all.
 *
 *   MISTRAL_API_KEY=dummy SESSION_SECRET=... npx next start -p 3123
 *   node scripts/prove-api-security.mjs
 */

import net from "node:net";

const BASE = process.env.BASE_URL || "http://localhost:3123";
const HOST = new URL(BASE).host;

/**
 * Send a handcrafted request over a raw socket.
 *
 * fetch/undici refuses to send a content-length that disagrees with the body,
 * which is exactly the case the middleware pre-check exists for: a client that
 * declares a huge body. Only a raw socket can pose that question.
 */
function rawRequest(requestText) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE);
    const socket = net.connect(Number(url.port), url.hostname, () => {
      socket.write(requestText);
    });
    let data = "";
    socket.on("data", (chunk) => {
      data += chunk.toString();
    });
    socket.on("end", () => resolve(data));
    socket.on("error", reject);
    socket.setTimeout(10_000, () => {
      socket.destroy();
      resolve(data);
    });
  });
}

function statusOf(rawResponse) {
  const match = /^HTTP\/1\.[01] (\d{3})/.exec(rawResponse);
  return match ? Number(match[1]) : 0;
}

/**
 * Pass --observe when the server runs with SECURITY_MODE=observe. The three
 * enforcement checks then assert the INVERSE: nothing new is rejected. Running
 * both ways is how this script is shown to be capable of failing — green in
 * one mode and green in the other would mean it measures nothing.
 */
const OBSERVE = process.argv.includes("--observe");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗ ${name}\x1b[0m${detail ? ` — ${detail}` : ""}`);
  }
}

/** A multipart body carrying `bytes` as the named field. */
function multipart(field, bytes, filename, contentType) {
  const boundary = "----proofboundary" + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; ` +
      `filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    body: Buffer.concat([head, Buffer.from(bytes), tail]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * A fresh client per check.
 *
 * The first version of this script reused one cookie and one IP throughout, so
 * the early checks spent the rate-limit budget and everything after them came
 * back 429 — the script testing itself rather than the app. Each check now
 * gets its own device and its own IP; only the rate-limit check pins them.
 */
let clientSeq = 0;
function freshClient() {
  clientSeq += 1;
  return `10.90.${Math.floor(clientSeq / 250)}.${clientSeq % 250}`;
}

const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, ...new Array(64).fill(0)]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(0)]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new Array(64).fill(0)]);

async function main() {
  console.log(
    `\n\x1b[1mAPI security proof → ${BASE}\x1b[0m` +
      (OBSERVE ? " \x1b[33m[SECURITY_MODE=observe]\x1b[0m\n" : "\n")
  );

  // ---------------------------------------------------------------- page load
  const page = await fetch(`${BASE}/upload`, { redirect: "manual" });
  const setCookie = page.headers.get("set-cookie") ?? "";
  check("page load succeeds", page.status === 200, `got ${page.status}`);
  check("page load mints the device cookie", setCookie.includes("cin_did="), setCookie.slice(0, 60));
  check("cookie is HttpOnly", /HttpOnly/i.test(setCookie));
  check("cookie is SameSite=Lax", /SameSite=Lax/i.test(setCookie));
  check(
    "CSP still carries a per-request nonce",
    (page.headers.get("content-security-policy") ?? "").includes("nonce-")
  );

  const cookie = (setCookie.match(/cin_did=[^;]+/) ?? [""])[0];
  check("captured a usable cookie", cookie.length > 20);

  // ------------------------------------------------------------ origin gating
  const noOrigin = await fetch(`${BASE}/api/ocr-unified`, { method: "POST" });
  check("curl with no Origin is refused 403", noOrigin.status === 403, `got ${noOrigin.status}`);

  const crossSite = await fetch(`${BASE}/api/ocr-unified`, {
    method: "POST",
    headers: { origin: "https://evil.example", cookie },
  });
  check("cross-site POST is refused 403", crossSite.status === 403, `got ${crossSite.status}`);

  // ------------------------------------------------------------ method / path
  const wrongMethod = await fetch(`${BASE}/api/ocr-unified`, {
    method: "GET",
    headers: { origin: BASE, cookie },
  });
  check("GET on a POST-only route is 405", wrongMethod.status === 405, `got ${wrongMethod.status}`);

  const unknown = await fetch(`${BASE}/api/not-a-route`, {
    method: "POST",
    headers: { origin: BASE, cookie },
  });
  check("unknown /api path is denied 400", unknown.status === 400, `got ${unknown.status}`);

  // ------------------------------------------------------- no-lockout promise
  const noCookie = await fetch(`${BASE}/api/ocr-unified`, {
    method: "POST",
    headers: { origin: BASE, "x-forwarded-for": freshClient() },
  });
  check(
    "same-origin POST with NO cookie is not 401/403",
    noCookie.status !== 401 && noCookie.status !== 403,
    `got ${noCookie.status}`
  );
  check(
    "...and it is handed a cookie for next time",
    (noCookie.headers.get("set-cookie") ?? "").includes("cin_did=")
  );

  const foreignCookie = await fetch(`${BASE}/api/ocr-unified`, {
    method: "POST",
    headers: {
      origin: BASE,
      cookie: "cin_did=garbage.deadbeef",
      "x-forwarded-for": freshClient(),
    },
  });
  check(
    "same-origin POST with an unverifiable cookie is not 401",
    foreignCookie.status !== 401,
    `got ${foreignCookie.status}`
  );

  // ---------------------------------------------------------------- body size
  // NOTE ON WHAT IS NOT TESTED HERE.
  //
  // The middleware rejects on an oversized `content-length` before parsing the
  // body, and it was tempting to call that "refused before a byte is read".
  // Over real HTTP it is not: `next start` does not flush the response until
  // the request completes, so a client declaring 500MB and sending nothing
  // just hangs — verified with a raw socket, no response in 15s. The header
  // check saves the multipart parse and the file read, not the transfer.
  //
  // What stops a huge upload arriving at all is the platform in front of the
  // app (Vercel's own request-size limit), not this code. The logic itself is
  // covered in security-middleware.test.ts; what is provable end-to-end is the
  // real-bytes path below.

  // Real-bytes path: an actual payload over the 10MB route cap.
  const oversized = multipart(
    "image",
    Buffer.concat([Buffer.from(JPEG), Buffer.alloc(11 * 1024 * 1024)]),
    "big.jpg",
    "image/jpeg"
  );
  const oversizedRes = await fetch(`${BASE}/api/ocr-unified`, {
    method: "POST",
    headers: {
      origin: BASE,
      cookie,
      "content-type": oversized.contentType,
      "x-forwarded-for": freshClient(),
    },
    body: oversized.body,
  });
  check(
    "an actual 11MB upload is refused 413",
    oversizedRes.status === 413,
    `got ${oversizedRes.status}`
  );

  // -------------------------------------------------------------- magic bytes
  const gifPart = multipart("image", GIF, "roster.jpg", "image/jpeg");
  const gifRes = await fetch(`${BASE}/api/ocr-unified`, {
    method: "POST",
    headers: {
      origin: BASE,
      cookie,
      "content-type": gifPart.contentType,
      "x-forwarded-for": freshClient(),
    },
    body: gifPart.body,
  });
  const gifBody = await gifRes.json().catch(() => ({}));
  if (OBSERVE) {
    // Observe lets it through to the provider — which, with a dummy key, fails
    // upstream. That 502 IS the pass: the guard did not reject it.
    check(
      "observe: a GIF claiming to be JPEG is NOT refused by the guard",
      gifRes.status !== 400,
      `got ${gifRes.status} ${JSON.stringify(gifBody)}`
    );
  } else {
    check(
      "a GIF claiming to be JPEG is refused 400",
      gifRes.status === 400,
      `got ${gifRes.status} ${JSON.stringify(gifBody)}`
    );
    check(
      "...with the unsupported_file_type code",
      gifBody.code === "unsupported_file_type",
      JSON.stringify(gifBody)
    );
  }

  const zipPart = multipart("file", ZIP, "roster.pdf", "application/pdf");
  const zipRes = await fetch(`${BASE}/api/ocr-pdf`, {
    method: "POST",
    headers: {
      origin: BASE,
      cookie,
      "content-type": zipPart.contentType,
      "x-forwarded-for": freshClient(),
    },
    body: zipPart.body,
  });
  check(
    OBSERVE
      ? "observe: an archive claiming to be PDF is NOT refused by the guard"
      : "an archive claiming to be PDF is refused 400",
    OBSERVE ? zipRes.status !== 400 : zipRes.status === 400,
    `got ${zipRes.status}`
  );

  // ------------------------------------------------------------ error hygiene
  const leaky = JSON.stringify(gifBody).toLowerCase();
  check("rejection names no provider", !leaky.includes("mistral"));
  check("rejection carries no stack trace", !leaky.includes("    at "));
  check(
    "rejection carries nothing but error, code and retryAfter",
    Object.keys(gifBody).every((k) => ["error", "code", "retryAfter"].includes(k)),
    Object.keys(gifBody).join(",")
  );

  // ------------------------------------------------------------- rate limited
  // /api/ocr-unified allows 12 per 5 min per device. Reuse ONE cookie so the
  // device bucket is what trips, and send a rejected payload so nothing spends.
  let firstLimited = -1;
  const limitIp = freshClient();
  for (let i = 0; i < 18; i++) {
    const part = multipart("image", GIF, "x.jpg", "image/jpeg");
    const res = await fetch(`${BASE}/api/ocr-unified`, {
      method: "POST",
      headers: {
        origin: BASE,
        cookie,
        "content-type": part.contentType,
        "x-forwarded-for": limitIp,
      },
      body: part.body,
    });
    if (res.status === 429) {
      firstLimited = i;
      if (!OBSERVE) {
        check("rate-limited response carries Retry-After", !!res.headers.get("retry-after"));
        const body = await res.json().catch(() => ({}));
        check("rate-limited response carries the code", body.code === "rate_limited");
      }
      break;
    }
  }
  check(
    OBSERVE
      ? "observe: the rate limit does NOT reject"
      : "the per-device rate limit actually trips",
    OBSERVE ? firstLimited === -1 : firstLimited >= 0,
    OBSERVE ? `unexpectedly limited at ${firstLimited}` : "never saw a 429"
  );

  // -------------------------------------------------------------------- done
  console.log(
    `\n\x1b[1m${passed} passed, ${failed} failed\x1b[0m` +
      (failed === 0 ? " \x1b[32m— all green\x1b[0m\n" : "\n")
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\x1b[31mproof script crashed\x1b[0m", err);
  process.exit(1);
});
