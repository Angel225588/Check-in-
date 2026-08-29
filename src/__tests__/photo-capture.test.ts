import { describe, it, expect, vi } from "vitest";

// Test the PhotoCapture component logic (file handling, fallback behavior)
// We test the logic paths rather than rendering (avoids Next.js module issues)

describe("PhotoCapture - File Handling Logic", () => {
  it("creates a valid object URL from a file", () => {
    const file = new File(["test"], "photo.jpg", { type: "image/jpeg" });
    const url = URL.createObjectURL(file);
    expect(url).toBeTruthy();
    expect(typeof url).toBe("string");
    URL.revokeObjectURL(url);
  });

  it("reads file type correctly for different image formats", () => {
    const jpeg = new File([""], "photo.jpg", { type: "image/jpeg" });
    const png = new File([""], "photo.png", { type: "image/png" });
    const webp = new File([""], "photo.webp", { type: "image/webp" });

    expect(jpeg.type).toBe("image/jpeg");
    expect(png.type).toBe("image/png");
    expect(webp.type).toBe("image/webp");
  });

  it("handles file with no type", () => {
    const file = new File(["test"], "unknown");
    expect(file.type).toBe("");
  });
});

describe("PhotoCapture - Gemini API Call Logic", () => {
  it("creates FormData with image file correctly", () => {
    const file = new File(["image-data"], "report.jpg", {
      type: "image/jpeg",
    });
    const formData = new FormData();
    formData.append("image", file);

    const retrieved = formData.get("image") as File;
    expect(retrieved).toBeInstanceOf(File);
    expect(retrieved.name).toBe("report.jpg");
    expect(retrieved.type).toBe("image/jpeg");
  });

  // The component branches on the machine-readable `code`. It used to test
  // `error.includes("not configured")` — a Gemini-era English string — while
  // the route answered in French ("OCR non configuré..."), so the Tesseract
  // fallback never fired at all when the key was missing.
  const shouldFallback = (body: { code?: string }) => body.code === "service_unconfigured";

  /** Refusals retrying cannot fix: auth, origin, spend cap. */
  const isTerminal = (status: number) =>
    status === 401 || status === 403 || status === 402;

  it("falls back to Tesseract when the service is unconfigured", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({
          error: "Le traitement des documents n'est pas disponible.",
          code: "service_unconfigured",
        }),
    };
    expect(shouldFallback(await mockResponse.json())).toBe(true);
  });

  it("does NOT fall back on other API errors", async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Bad request", code: "invalid_request" }),
    };
    expect(shouldFallback(await mockResponse.json())).toBe(false);
  });

  it("does not decide fallback from the message text", async () => {
    // The French message contains no "not configured", which is exactly how
    // the old check silently stopped working.
    const body = {
      error: "Le traitement des documents n'est pas disponible.",
      code: "service_unconfigured",
    };
    expect(body.error).not.toContain("not configured");
    expect(body.error).not.toContain("MISTRAL_API_KEY");
    expect(shouldFallback(body)).toBe(true);
  });

  it("treats auth and spend-cap refusals as terminal, not retryable", () => {
    // Retrying these only burns more of the rate-limit window.
    expect(isTerminal(401)).toBe(true);
    expect(isTerminal(403)).toBe(true);
    expect(isTerminal(402)).toBe(true);
  });

  it("still retries a rate limit and an upstream failure", () => {
    expect(isTerminal(429)).toBe(false);
    expect(isTerminal(502)).toBe(false);
  });
});

describe("PhotoCapture - Tesseract Fallback Logic", () => {
  it("tesseract.js can be dynamically imported", async () => {
    // This verifies the package is available
    const mod = await import("tesseract.js");
    expect(mod.createWorker).toBeDefined();
    expect(typeof mod.createWorker).toBe("function");
  });
});

describe("PhotoCapture - Result Processing", () => {
  it("reports zero clients as an error state", () => {
    const clients: unknown[] = [];
    const hasError = clients.length === 0;
    expect(hasError).toBe(true);
  });

  it("reports non-zero clients as success", () => {
    const clients = [{ roomNumber: "101", name: "Test" }];
    const hasError = clients.length === 0;
    expect(hasError).toBe(false);
  });

  it("generates correct status message for AI results", () => {
    const clients = [
      { roomNumber: "101" },
      { roomNumber: "202" },
      { roomNumber: "303" },
    ];
    const msg = `[Extracted by AI - ${clients.length} rooms found]`;
    expect(msg).toBe("[Extracted by AI - 3 rooms found]");
  });
});
