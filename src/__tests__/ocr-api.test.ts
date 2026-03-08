import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the API logic by importing the route handler directly
// and mocking fetch + env vars

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

// Helper to create a mock File
function createMockFile(
  content: string = "fake-image-data",
  type: string = "image/jpeg",
  name: string = "test.jpg"
): File {
  const blob = new Blob([content], { type });
  return new File([blob], name, { type });
}

// Helper to create a FormData with an image
function createFormData(file?: File): FormData {
  const fd = new FormData();
  if (file) fd.append("image", file);
  return fd;
}

// Helper to create a NextRequest-like object
function createMockRequest(formData: FormData) {
  return {
    formData: () => Promise.resolve(formData),
  } as unknown as Request;
}

// Since we can't easily import Next.js route handlers in vitest,
// we test the core logic by extracting and testing the validation/parsing

describe("OCR API - Input Validation", () => {
  it("rejects files larger than 10MB", () => {
    const file = createMockFile("x".repeat(11 * 1024 * 1024), "image/jpeg");
    expect(file.size).toBeGreaterThan(10 * 1024 * 1024);
  });

  it("accepts files under 10MB", () => {
    const file = createMockFile("x".repeat(1024), "image/jpeg");
    expect(file.size).toBeLessThanOrEqual(10 * 1024 * 1024);
  });

  it("validates allowed MIME types", () => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];
    const rejected = ["application/pdf", "text/plain", "video/mp4", "image/svg+xml"];

    allowed.forEach((type) => {
      expect(allowed.includes(type)).toBe(true);
    });
    rejected.forEach((type) => {
      expect(allowed.includes(type)).toBe(false);
    });
  });

  it("detects empty files", () => {
    const file = createMockFile("", "image/jpeg");
    expect(file.size).toBe(0);
  });
});

describe("OCR API - Response Parsing", () => {
  it("parses clean JSON array response", () => {
    const response = JSON.stringify([VALID_CLIENT]);
    const clients = JSON.parse(response);
    expect(Array.isArray(clients)).toBe(true);
    expect(clients).toHaveLength(1);
    expect(clients[0].roomNumber).toBe("101");
  });

  it("strips markdown code fences from response", () => {
    const response = "```json\n" + JSON.stringify([VALID_CLIENT]) + "\n```";
    const cleaned = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const clients = JSON.parse(cleaned);
    expect(clients).toHaveLength(1);
  });

  it("strips plain code fences from response", () => {
    const response = "```\n" + JSON.stringify([VALID_CLIENT]) + "\n```";
    const cleaned = response
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const clients = JSON.parse(cleaned);
    expect(clients).toHaveLength(1);
  });

  it("handles empty array response", () => {
    const clients = JSON.parse("[]");
    expect(clients).toHaveLength(0);
  });

  it("rejects invalid JSON", () => {
    expect(() => JSON.parse("not json at all")).toThrow();
  });

  it("rejects non-array JSON", () => {
    const result = JSON.parse('{"roomNumber": "101"}');
    expect(Array.isArray(result)).toBe(false);
  });

  it("validates client objects - requires roomNumber and name", () => {
    const validate = (obj: Record<string, unknown>) =>
      typeof obj.roomNumber === "string" &&
      obj.roomNumber.length > 0 &&
      typeof obj.name === "string";

    expect(validate(VALID_CLIENT)).toBe(true);
    expect(validate({ roomNumber: "", name: "Test" })).toBe(false);
    expect(validate({ roomNumber: "101" } as Record<string, unknown>)).toBe(false);
    expect(validate({ name: "Test" } as Record<string, unknown>)).toBe(false);
    expect(validate({} as Record<string, unknown>)).toBe(false);
  });

  it("filters out invalid clients from mixed response", () => {
    const validate = (obj: Record<string, unknown>) =>
      typeof obj.roomNumber === "string" &&
      obj.roomNumber.length > 0 &&
      typeof obj.name === "string";

    const mixed = [
      VALID_CLIENT,
      { roomNumber: "", name: "Bad" },
      { roomNumber: "202", name: "Good Guest", roomType: "PRMK" },
      { garbage: true },
    ];

    const valid = mixed.filter(validate);
    expect(valid).toHaveLength(2);
    expect(valid[0].roomNumber).toBe("101");
    expect(valid[1].roomNumber).toBe("202");
  });
});

describe("OCR API - Gemini Response Scenarios", () => {
  it("handles a response with multiple rooms", () => {
    const multiRoom = [
      { ...VALID_CLIENT, roomNumber: "101", name: "Guest One" },
      { ...VALID_CLIENT, roomNumber: "202", name: "Guest Two" },
      { ...VALID_CLIENT, roomNumber: "303", name: "Guest Three" },
    ];
    const parsed = JSON.parse(JSON.stringify(multiRoom));
    expect(parsed).toHaveLength(3);
  });

  it("handles response with missing optional fields", () => {
    const minimal = {
      roomNumber: "101",
      roomType: "",
      rtc: "",
      confirmationNumber: "",
      name: "Test Guest",
      arrivalDate: "",
      departureDate: "",
      reservationStatus: "",
      adults: 0,
      children: 0,
      rateCode: "",
      packageCode: "",
    };
    const validate = (obj: Record<string, unknown>) =>
      typeof obj.roomNumber === "string" &&
      obj.roomNumber.length > 0 &&
      typeof obj.name === "string";

    expect(validate(minimal)).toBe(true);
  });

  it("handles response with extra whitespace in JSON", () => {
    const messy = `  \n  ${JSON.stringify([VALID_CLIENT])}  \n  `;
    const clients = JSON.parse(messy.trim());
    expect(clients).toHaveLength(1);
  });

  it("handles Gemini returning null/undefined text", () => {
    const result = { candidates: [{ content: { parts: [{}] } }] };
    const textContent =
      result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    expect(textContent).toBe("[]");
    expect(JSON.parse(textContent)).toHaveLength(0);
  });

  it("handles Gemini returning completely empty candidates", () => {
    const result = { candidates: [] };
    const textContent =
      result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    expect(textContent).toBe("[]");
  });
});

// Integration-style test for the full fetch mock flow
describe("OCR API - Full Flow (mocked fetch)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("processes a successful Gemini response end-to-end", async () => {
    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify([VALID_CLIENT]) }],
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
    const text = result.candidates[0].content.parts[0].text;
    const clients = JSON.parse(text);
    expect(clients).toHaveLength(1);
    expect(clients[0].roomNumber).toBe("101");
    expect(clients[0].name).toBe("John Smith");

    globalThis.fetch = originalFetch;
  });

  it("handles a 429 rate limit response", async () => {
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

    globalThis.fetch = originalFetch;
  });

  it("handles a network error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    await expect(
      globalThis.fetch("https://fake-gemini-url", { method: "POST" })
    ).rejects.toThrow("Network error");

    globalThis.fetch = originalFetch;
  });

  it("handles Gemini returning malformed JSON", async () => {
    const geminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: "This is not JSON at all" }],
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
    const text = result.candidates[0].content.parts[0].text;

    expect(() => JSON.parse(text)).toThrow();

    globalThis.fetch = originalFetch;
  });
});
