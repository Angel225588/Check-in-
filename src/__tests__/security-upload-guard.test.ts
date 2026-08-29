// @vitest-environment node
/**
 * Fix: a hard body-size limit on uploads, enforced from real bytes rather than
 * a header the caller controls — plus the route-policy invariants that back
 * "every route is covered".
 */
import { describe, it, expect } from "vitest";
import { readValidatedFile, readJsonBody } from "@/lib/security/guard";
import {
  ROUTE_POLICIES,
  getRoutePolicy,
  MAX_PDF_PAGES,
  MAX_VERIFY_ENTRIES,
  MAX_BRIEF_FILES,
} from "@/lib/security/config";

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];
const JPEG_HEADER = [0xff, 0xd8, 0xff];

function makeFile(header: number[], totalBytes: number, type: string): File {
  const bytes = new Uint8Array(totalBytes);
  bytes.set(header, 0);
  return new File([bytes], "upload", { type });
}

const imagePolicy = getRoutePolicy("/api/ocr-unified")!;
const pdfPolicy = getRoutePolicy("/api/ocr-pdf")!;

describe("upload size ceiling", () => {
  it("accepts a file inside the limit and reports the detected type", async () => {
    const r = await readValidatedFile(makeFile(JPEG_HEADER, 1024, "image/jpeg"), imagePolicy);
    expect(r.ok).toBe(true);
    expect(r.detectedType).toBe("image/jpeg");
  });

  it("rejects a file over the route's limit", async () => {
    const r = await readValidatedFile(
      makeFile(JPEG_HEADER, imagePolicy.maxBodyBytes + 1, "image/jpeg"),
      imagePolicy
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("payload_too_large");
  });

  it("rejects an empty file", async () => {
    const r = await readValidatedFile(makeFile([], 0, "image/jpeg"), imagePolicy);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("invalid_request");
  });

  it("honours a smaller shared budget, as the brief route uses per file", async () => {
    // Five files each under the per-file cap used to total five times it.
    const file = makeFile(JPEG_HEADER, 5_000, "image/jpeg");
    expect((await readValidatedFile(file, imagePolicy, 10_000)).ok).toBe(true);
    const tight = await readValidatedFile(file, imagePolicy, 1_000);
    expect(tight.ok).toBe(false);
    expect(tight.code).toBe("payload_too_large");
  });

  it("rejects content that lies about its type regardless of size", async () => {
    const r = await readValidatedFile(makeFile(PDF_HEADER, 2048, "image/png"), imagePolicy);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("unsupported_file_type");
  });

  it("accepts a real PDF even when the client claims something else", async () => {
    const r = await readValidatedFile(
      makeFile(PDF_HEADER, 4096, "application/octet-stream"),
      pdfPolicy
    );
    expect(r.ok).toBe(true);
    expect(r.detectedType).toBe("application/pdf");
  });
});

describe("JSON body limit is measured, not trusted", () => {
  function jsonRequest(payload: string, declared?: string): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (declared !== undefined) headers["content-length"] = declared;
    return new Request("https://app.test/api/verify-extraction", {
      method: "POST",
      headers,
      body: payload,
    });
  }

  it("accepts a small body", async () => {
    const r = await readJsonBody<{ a: number }>(jsonRequest('{"a":1}'), 1_000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.body.a).toBe(1);
  });

  it("rejects a body over the limit when no content-length is sent", async () => {
    // This is the exact bypass: the old check read content-length only, so
    // omitting the header removed the cap entirely.
    const big = JSON.stringify({ pad: "x".repeat(2_000) });
    const r = await readJsonBody(jsonRequest(big), 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("payload_too_large");
  });

  it("rejects a body whose content-length understates its real size", async () => {
    const big = JSON.stringify({ pad: "x".repeat(2_000) });
    const r = await readJsonBody(jsonRequest(big, "10"), 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("payload_too_large");
  });

  it("rejects an oversized declared length before reading the body", async () => {
    const r = await readJsonBody(jsonRequest('{"a":1}', "999999999"), 500);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("payload_too_large");
  });

  it("rejects malformed JSON and empty bodies", async () => {
    const bad = await readJsonBody(jsonRequest("{not json"), 1_000);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.code).toBe("invalid_request");
    expect((await readJsonBody(jsonRequest(""), 1_000)).ok).toBe(false);
  });
});

describe("route policy covers the API surface", () => {
  it("lists exactly the routes that exist", () => {
    expect(ROUTE_POLICIES.map((p) => p.path).sort()).toEqual([
      "/api/ocr",
      "/api/ocr-morning-brief",
      "/api/ocr-pdf",
      "/api/ocr-unified",
      "/api/privacy/erase",
      "/api/privacy/export",
      "/api/verify-extraction",
    ]);
  });

  it("leaves no route public", () => {
    for (const p of ROUTE_POLICIES) expect(p.public).toBe(false);
  });

  it("gives every route a finite body limit and POST only", () => {
    for (const p of ROUTE_POLICIES) {
      expect(Number.isFinite(p.maxBodyBytes)).toBe(true);
      expect(p.maxBodyBytes).toBeGreaterThan(0);
      expect(p.methods).toEqual(["POST"]);
    }
  });

  it("allows no upload type on the routes that take no upload", () => {
    for (const path of ["/api/privacy/erase", "/api/privacy/export"]) {
      expect(getRoutePolicy(path)!.allowedTypes).toEqual([]);
    }
  });

  it("never allows GIF or BMP anywhere", () => {
    for (const p of ROUTE_POLICIES) {
      expect(p.allowedTypes).not.toContain("image/gif");
      expect(p.allowedTypes).not.toContain("image/bmp");
    }
  });

  it("caps the previously-unbounded inputs", () => {
    expect(MAX_PDF_PAGES).toBeGreaterThan(0);
    expect(MAX_VERIFY_ENTRIES).toBeGreaterThan(0);
    expect(MAX_BRIEF_FILES).toBeGreaterThan(0);
  });

  it("only marks AI routes as spending money", () => {
    expect(getRoutePolicy("/api/privacy/erase")!.callsAi).toBe(false);
    expect(getRoutePolicy("/api/ocr-pdf")!.callsAi).toBe(true);
    for (const p of ROUTE_POLICIES) {
      if (!p.callsAi) {
        expect(p.worstCase.ocrPages + p.worstCase.chatCalls).toBe(0);
      }
    }
  });

  it("returns null for unknown paths, so middleware denies by default", () => {
    expect(getRoutePolicy("/api/does-not-exist")).toBeNull();
    expect(getRoutePolicy("/api/ocr-vip")).toBeNull(); // retired with Gemini
  });
});
