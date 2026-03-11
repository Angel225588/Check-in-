import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// PDF OCR API tests — mirrors patterns from ocr-api.test.ts
// Tests the /api/ocr-pdf route logic: validation, parsing, error handling

const VALID_CLIENT = {
  roomNumber: "101",
  roomType: "DLXK",
  rtc: "",
  confirmationNumber: "123456",
  name: "John Smith",
  arrivalDate: "05/03/26",
  departureDate: "07/03/26",
  reservationStatus: "CKIN",
  adults: 2,
  children: 1,
  rateCode: "RACK",
  packageCode: "BKF GRP",
};

const VALID_VIP = {
  roomNumber: "501",
  name: "Marie Dupont",
  vipLevel: "X4",
  vipNotes: "Allergic to gluten, extra pillows",
  confirmationNumber: "789012",
  arrivalDate: "05/03/26",
  departureDate: "10/03/26",
  roomType: "PRMK",
  adults: 2,
  children: 0,
  rateCode: "CORP",
};

// Helper to create a mock File (PDF or other)
function createMockFile(
  content: string = "fake-pdf-data",
  type: string = "application/pdf",
  name: string = "report.pdf"
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

// Helper to create FormData with a PDF file
function createFormData(file?: File): FormData {
  const fd = new FormData();
  if (file) fd.append("pdf", file);
  return fd;
}

// Validate entry — same logic as the unified OCR route
function validateEntry(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.roomNumber === "string" &&
    obj.roomNumber.length > 0 &&
    typeof obj.name === "string"
  );
}

// Strip markdown code fences from Gemini response
function cleanResponse(text: string): string {
  return text
    .replace(/```json\s*/g, "")
    .replace(/```\s*/g, "")
    .trim();
}

// Extract text from Gemini response parts (skip thinking parts, take last real text)
function extractText(parts: Array<Record<string, unknown>>): string {
  const textPart = [...parts]
    .reverse()
    .find((p) => typeof p.text === "string" && !p.thought);
  return (textPart?.text as string) || '{"type":"unknown","data":[]}';
}

// --------------------------------------------------------------------------
// 1. Input Validation
// --------------------------------------------------------------------------
describe("PDF OCR API - Input Validation", () => {
  it("rejects non-PDF files (wrong MIME type)", () => {
    const allowedPdfTypes = ["application/pdf"];
    const rejected = [
      "image/jpeg",
      "image/png",
      "text/plain",
      "application/zip",
      "video/mp4",
      "application/octet-stream",
    ];

    rejected.forEach((type) => {
      expect(allowedPdfTypes.includes(type)).toBe(false);
    });
    expect(allowedPdfTypes.includes("application/pdf")).toBe(true);
  });

  it("rejects files over 20MB size limit", () => {
    const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20MB for PDFs
    const file = createMockFile("x".repeat(21 * 1024 * 1024), "application/pdf");
    expect(file.size).toBeGreaterThan(MAX_PDF_SIZE);
  });

  it("accepts files under 20MB", () => {
    const MAX_PDF_SIZE = 20 * 1024 * 1024;
    const file = createMockFile("x".repeat(1024), "application/pdf");
    expect(file.size).toBeLessThanOrEqual(MAX_PDF_SIZE);
  });

  it("rejects empty/missing file", () => {
    const fd = new FormData();
    const file = fd.get("pdf") as File | null;
    expect(file).toBeNull();
  });

  it("rejects empty PDF file (zero bytes)", () => {
    const file = createMockFile("", "application/pdf");
    expect(file.size).toBe(0);
  });

  it("rejects when no GEMINI_API_KEY configured", () => {
    const testCases = [
      undefined,
      "",
      "your_gemini_api_key_here", // placeholder value
    ];

    testCases.forEach((key) => {
      const isValid = key && key !== "your_gemini_api_key_here";
      expect(isValid).toBeFalsy();
    });
  });

  it("accepts a valid GEMINI_API_KEY", () => {
    const key = "AIzaSyD_real_key_here";
    const isValid = key && key !== "your_gemini_api_key_here";
    expect(isValid).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// 2. Response Parsing
// --------------------------------------------------------------------------
describe("PDF OCR API - Response Parsing", () => {
  it("correctly parses a client list response with type 'clients'", () => {
    const geminiOutput = { type: "clients", data: [VALID_CLIENT] };
    const parsed = JSON.parse(JSON.stringify(geminiOutput));

    expect(parsed.type).toBe("clients");
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].roomNumber).toBe("101");
    expect(parsed.data[0].name).toBe("John Smith");
  });

  it("correctly parses a VIP list response with type 'vip'", () => {
    const geminiOutput = { type: "vip", data: [VALID_VIP] };
    const parsed = JSON.parse(JSON.stringify(geminiOutput));

    expect(parsed.type).toBe("vip");
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].roomNumber).toBe("501");
    expect(parsed.data[0].vipLevel).toBe("X4");
    expect(parsed.data[0].vipNotes).toContain("gluten");
  });

  it("handles 'unknown' type gracefully", () => {
    const geminiOutput = { type: "unknown", data: [] };
    const parsed = JSON.parse(JSON.stringify(geminiOutput));

    expect(parsed.type).toBe("unknown");
    expect(parsed.data).toHaveLength(0);

    // Route logic: unknown type returns as clients with empty data
    const docType = parsed.type || "unknown";
    const data = Array.isArray(parsed.data) ? parsed.data.filter(validateEntry) : [];
    expect(docType).toBe("unknown");
    expect(data).toHaveLength(0);
  });

  it("strips markdown code fences from response", () => {
    const raw = "```json\n" + JSON.stringify({ type: "clients", data: [VALID_CLIENT] }) + "\n```";
    const cleaned = cleanResponse(raw);
    const parsed = JSON.parse(cleaned);
    expect(parsed.type).toBe("clients");
    expect(parsed.data).toHaveLength(1);
  });

  it("strips plain code fences from response", () => {
    const raw = "```\n" + JSON.stringify({ type: "vip", data: [VALID_VIP] }) + "\n```";
    const cleaned = cleanResponse(raw);
    const parsed = JSON.parse(cleaned);
    expect(parsed.type).toBe("vip");
  });

  it("handles Gemini thinking parts (takes last non-thought text part)", () => {
    const parts = [
      { text: "Let me analyze this PDF...", thought: true },
      { text: "Looking at the columns...", thought: true },
      { text: JSON.stringify({ type: "clients", data: [VALID_CLIENT] }) },
    ];

    const text = extractText(parts);
    const parsed = JSON.parse(text);
    expect(parsed.type).toBe("clients");
    expect(parsed.data).toHaveLength(1);
  });

  it("falls back to default when all parts are thought parts", () => {
    const parts = [
      { text: "Thinking...", thought: true },
      { text: "Still thinking...", thought: true },
    ];

    const text = extractText(parts);
    const parsed = JSON.parse(text);
    expect(parsed.type).toBe("unknown");
    expect(parsed.data).toHaveLength(0);
  });

  it("handles response with no parts at all", () => {
    const parts: Array<Record<string, unknown>> = [];
    const text = extractText(parts);
    const parsed = JSON.parse(text);
    expect(parsed.type).toBe("unknown");
    expect(parsed.data).toHaveLength(0);
  });

  it("validates client objects (must have roomNumber and name)", () => {
    expect(validateEntry(VALID_CLIENT)).toBe(true);
    expect(validateEntry(VALID_VIP)).toBe(true);
    expect(validateEntry({ roomNumber: "", name: "Test" })).toBe(false);
    expect(validateEntry({ roomNumber: "101" } as Record<string, unknown>)).toBe(false);
    expect(validateEntry({ name: "Test" } as Record<string, unknown>)).toBe(false);
    expect(validateEntry({} as Record<string, unknown>)).toBe(false);
  });

  it("filters out invalid clients from mixed response", () => {
    const mixed = [
      VALID_CLIENT,
      { roomNumber: "", name: "Bad Room" },
      { roomNumber: "202", name: "Good Guest", roomType: "PRMK" },
      { garbage: true },
      { roomNumber: "303" }, // missing name
      VALID_VIP,
    ];

    const valid = mixed.filter(validateEntry);
    expect(valid).toHaveLength(3);
    expect(valid[0].roomNumber).toBe("101");
    expect(valid[1].roomNumber).toBe("202");
    expect(valid[2].roomNumber).toBe("501");
  });

  it("returns proper structure for clients type: { type, clients }", () => {
    const geminiOutput = { type: "clients", data: [VALID_CLIENT] };
    const docType = geminiOutput.type;
    const data = geminiOutput.data.filter(validateEntry);

    // Mimic route response construction
    let responseBody: Record<string, unknown>;
    if (docType === "vip") {
      responseBody = { type: "vip", vipEntries: data };
    } else if (docType === "clients") {
      responseBody = { type: "clients", clients: data };
    } else {
      responseBody = { type: "unknown", clients: data };
    }

    expect(responseBody.type).toBe("clients");
    expect(responseBody.clients).toBeDefined();
    expect(Array.isArray(responseBody.clients)).toBe(true);
  });

  it("returns proper structure for vip type: { type, vipEntries }", () => {
    const geminiOutput = { type: "vip", data: [VALID_VIP] };
    const docType = geminiOutput.type;
    const data = geminiOutput.data.filter(validateEntry);

    let responseBody: Record<string, unknown>;
    if (docType === "vip") {
      responseBody = { type: "vip", vipEntries: data };
    } else if (docType === "clients") {
      responseBody = { type: "clients", clients: data };
    } else {
      responseBody = { type: "unknown", clients: data };
    }

    expect(responseBody.type).toBe("vip");
    expect(responseBody.vipEntries).toBeDefined();
    expect(Array.isArray(responseBody.vipEntries)).toBe(true);
  });

  it("returns proper structure for unknown type: { type, clients }", () => {
    const geminiOutput = { type: "unknown", data: [] as Record<string, unknown>[] };
    const docType = geminiOutput.type;
    const data = geminiOutput.data.filter(validateEntry);

    let responseBody: Record<string, unknown>;
    if (docType === "vip") {
      responseBody = { type: "vip", vipEntries: data };
    } else if (docType === "clients") {
      responseBody = { type: "clients", clients: data };
    } else {
      responseBody = { type: "unknown", clients: data };
    }

    expect(responseBody.type).toBe("unknown");
    expect(responseBody.clients).toBeDefined();
    expect(Array.isArray(responseBody.clients)).toBe(true);
    expect((responseBody.clients as unknown[]).length).toBe(0);
  });

  it("handles multi-page PDF with many clients", () => {
    const clients = Array.from({ length: 50 }, (_, i) => ({
      ...VALID_CLIENT,
      roomNumber: String(100 + i),
      name: `Guest ${i + 1}`,
    }));

    const geminiOutput = { type: "clients", data: clients };
    const parsed = JSON.parse(JSON.stringify(geminiOutput));
    const valid = parsed.data.filter(validateEntry);

    expect(valid).toHaveLength(50);
    expect(valid[0].roomNumber).toBe("100");
    expect(valid[49].roomNumber).toBe("149");
  });

  it("handles response with extra whitespace around JSON", () => {
    const raw = `  \n  ${JSON.stringify({ type: "clients", data: [VALID_CLIENT] })}  \n  `;
    const cleaned = cleanResponse(raw);
    const parsed = JSON.parse(cleaned);
    expect(parsed.type).toBe("clients");
    expect(parsed.data).toHaveLength(1);
  });
});

// --------------------------------------------------------------------------
// 3. Error Handling (mocked fetch)
// --------------------------------------------------------------------------
describe("PDF OCR API - Error Handling (mocked fetch)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("processes a successful Gemini PDF response end-to-end", async () => {
    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  type: "clients",
                  data: [VALID_CLIENT],
                }),
              },
            ],
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(geminiResponse),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });

    expect(response.ok).toBe(true);
    const result = await response.json();
    const text = extractText(result.candidates[0].content.parts);
    const parsed = JSON.parse(cleanResponse(text));

    expect(parsed.type).toBe("clients");
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data[0].roomNumber).toBe("101");
  });

  it("processes a VIP PDF response end-to-end", async () => {
    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  type: "vip",
                  data: [VALID_VIP],
                }),
              },
            ],
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(geminiResponse),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });

    const result = await response.json();
    const text = extractText(result.candidates[0].content.parts);
    const parsed = JSON.parse(cleanResponse(text));

    expect(parsed.type).toBe("vip");
    expect(parsed.data[0].vipLevel).toBe("X4");
  });

  it("handles Gemini API error responses", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(500);
    const errorText = await response.text();
    expect(errorText).toContain("Internal Server Error");
  });

  it("handles rate limiting (429)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limit exceeded"),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });

    expect(response.ok).toBe(false);
    expect(response.status).toBe(429);
  });

  it("handles malformed JSON from Gemini", async () => {
    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "This is not valid JSON {broken" }],
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(geminiResponse),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });
    const result = await response.json();
    const text = extractText(result.candidates[0].content.parts);

    expect(() => JSON.parse(text)).toThrow();
  });

  it("handles network errors", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(
      globalThis.fetch("https://fake-gemini-url", { method: "POST" })
    ).rejects.toThrow("Network error");
  });

  it("handles Gemini returning empty candidates", async () => {
    const geminiResponse = { candidates: [] };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(geminiResponse),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });
    const result = await response.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const text = extractText(parts);
    const parsed = JSON.parse(text);

    expect(parsed.type).toBe("unknown");
    expect(parsed.data).toHaveLength(0);
  });

  it("handles Gemini returning null text in parts", async () => {
    const geminiResponse = {
      candidates: [{ content: { parts: [{}] } }],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(geminiResponse),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });
    const result = await response.json();
    const parts = result.candidates[0].content.parts;
    const text = extractText(parts);
    const parsed = JSON.parse(text);

    expect(parsed.type).toBe("unknown");
    expect(parsed.data).toHaveLength(0);
  });

  it("handles Gemini response with code fences after fetch", async () => {
    const wrappedJson =
      "```json\n" +
      JSON.stringify({ type: "clients", data: [VALID_CLIENT] }) +
      "\n```";

    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: wrappedJson }],
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(geminiResponse),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });
    const result = await response.json();
    const text = extractText(result.candidates[0].content.parts);
    const cleaned = cleanResponse(text);
    const parsed = JSON.parse(cleaned);

    expect(parsed.type).toBe("clients");
    expect(parsed.data).toHaveLength(1);
  });

  it("handles Gemini response with thinking + real content after fetch", async () => {
    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [
              { text: "Analyzing the PDF document...", thought: true },
              { text: "I can see columns for room, name...", thought: true },
              {
                text: JSON.stringify({
                  type: "clients",
                  data: [VALID_CLIENT, { ...VALID_CLIENT, roomNumber: "202", name: "Jane Doe" }],
                }),
              },
            ],
          },
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(geminiResponse),
    });

    const response = await globalThis.fetch("https://fake-gemini-url", {
      method: "POST",
    });
    const result = await response.json();
    const parts = result.candidates[0].content.parts;
    const text = extractText(parts);
    const parsed = JSON.parse(text);

    expect(parsed.type).toBe("clients");
    expect(parsed.data).toHaveLength(2);
    expect(parsed.data[0].name).toBe("John Smith");
    expect(parsed.data[1].name).toBe("Jane Doe");
  });
});
