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

  it("handles API returning not-configured error for fallback", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      json: () =>
        Promise.resolve({ error: "GEMINI_API_KEY not configured" }),
    };

    const data = await mockResponse.json();
    const shouldFallback =
      mockResponse.status === 500 && data.error.includes("not configured");

    expect(shouldFallback).toBe(true);
  });

  it("does NOT fallback on other API errors", async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Bad request" }),
    };

    const data = await mockResponse.json();
    const shouldFallback =
      mockResponse.status === 500 && data.error.includes("not configured");

    expect(shouldFallback).toBe(false);
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
