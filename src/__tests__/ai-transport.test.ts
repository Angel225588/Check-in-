/**
 * Transport guarantees for every AI call: timeout, bounded retry with backoff
 * on 429/5xx only, and hard token/input caps.
 *
 * These are the properties that keep a rate-limited or hung provider from
 * turning into a stuck upload screen at 6am service.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MistralProvider, AiError } from "@/lib/ai";

const okOcr = () =>
  new Response(JSON.stringify({ pages: [{ markdown: "# doc" }], usage_info: { pages_processed: 1 } }), {
    status: 200,
  });

const okChat = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] }), {
    status: 200,
  });

const SCHEMA = { type: "object", properties: {}, additionalProperties: false };
const extractArgs = {
  prompt: "p",
  document: "d",
  schema: SCHEMA,
  schemaName: "s",
};

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
  process.env.MISTRAL_BACKOFF_BASE_MS = "1"; // keep retry tests fast
  process.env.MISTRAL_BACKOFF_CAP_MS = "2";
  delete process.env.MISTRAL_MAX_RETRIES;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MISTRAL_BACKOFF_BASE_MS;
  delete process.env.MISTRAL_BACKOFF_CAP_MS;
  delete process.env.MISTRAL_MAX_RETRIES;
  delete process.env.MISTRAL_MAX_OUTPUT_TOKENS;
  delete process.env.MISTRAL_MAX_INPUT_CHARS;
});

describe("retry with backoff", () => {
  it("retries a 429 and succeeds on a later attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(okOcr());
    vi.stubGlobal("fetch", fetchMock);

    const res = await new MistralProvider().ocr({ base64: "B", mimeType: "image/jpeg" });
    expect(res.markdown).toBe("# doc");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("boom", { status: 503 }))
      .mockResolvedValueOnce(okOcr());
    vi.stubGlobal("fetch", fetchMock);

    await new MistralProvider().ocr({ base64: "B", mimeType: "image/jpeg" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 4xx — a bad request retried is just a bad request repeated", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new MistralProvider().ocr({ base64: "B", mimeType: "image/jpeg" }),
    ).rejects.toThrow(AiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the configured number of retries", async () => {
    process.env.MISTRAL_MAX_RETRIES = "2";
    const fetchMock = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new MistralProvider().ocr({ base64: "B", mimeType: "image/jpeg" }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it("retries transient network faults", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(okOcr());
    vi.stubGlobal("fetch", fetchMock);

    await new MistralProvider().ocr({ base64: "B", mimeType: "image/jpeg" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("timeout", () => {
  it("aborts a hung request instead of hanging the upload screen", async () => {
    process.env.MISTRAL_OCR_TIMEOUT_MS = "20";
    process.env.MISTRAL_MAX_RETRIES = "0";

    // Never resolves on its own; only the abort signal ends it.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_u: string, init: RequestInit) =>
          new Promise((_res, rej) => {
            init.signal?.addEventListener("abort", () =>
              rej(Object.assign(new Error("aborted"), { name: "AbortError" })),
            );
          }),
      ),
    );

    await expect(
      new MistralProvider().ocr({ base64: "B", mimeType: "image/jpeg" }),
    ).rejects.toMatchObject({ status: 504 });

    delete process.env.MISTRAL_OCR_TIMEOUT_MS;
  });
});

describe("hard caps", () => {
  it("sends max_tokens on every chat request", async () => {
    process.env.MISTRAL_MAX_OUTPUT_TOKENS = "1234";
    const fetchMock = vi.fn().mockResolvedValue(okChat("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await new MistralProvider().extractJson(extractArgs);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.max_tokens).toBe(1234);
  });

  it("clamps a caller trying to exceed the cap", async () => {
    process.env.MISTRAL_MAX_OUTPUT_TOKENS = "100";
    const fetchMock = vi.fn().mockResolvedValue(okChat("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await new MistralProvider().extractJson({ ...extractArgs, maxOutputTokens: 999_999 });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, { body: string }])[1].body);
    expect(body.max_tokens).toBe(100);
  });

  it("throws rather than silently truncating oversized input", async () => {
    process.env.MISTRAL_MAX_INPUT_CHARS = "50";
    const fetchMock = vi.fn().mockResolvedValue(okChat("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new MistralProvider().extractJson({ ...extractArgs, document: "x".repeat(500) }),
    ).rejects.toMatchObject({ status: 413 });
    // Never sent — a clipped roster would drop guests with no visible error.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a truncated response as a real error, not a parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"a":' }, finish_reason: "length" }] }),
          { status: 200 },
        ),
      ),
    );

    await expect(new MistralProvider().extractJson(extractArgs)).rejects.toThrow(/token cap/);
  });
});

describe("request shape and secret hygiene", () => {
  it("uses structured output with a strict schema", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okChat('{"ok":true}'));
    vi.stubGlobal("fetch", fetchMock);

    await new MistralProvider().extractJson(extractArgs);

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toBe("https://api.mistral.ai/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.temperature).toBe(0);
  });

  it("sends the key as a Bearer header, never in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okOcr());
    vi.stubGlobal("fetch", fetchMock);

    await new MistralProvider().ocr({ base64: "B", mimeType: "application/pdf" });

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).not.toContain("test-key"); // the Gemini routes put the key in the query string
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("never leaks the key in an error message", async () => {
    process.env.MISTRAL_MAX_RETRIES = "0";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream said no", { status: 500 })));

    const err = await new MistralProvider()
      .ocr({ base64: "B", mimeType: "image/jpeg" })
      .catch((e: Error) => e);

    expect(String(err)).not.toContain("test-key");
  });

  it("throws a clear error when the key is missing", async () => {
    delete process.env.MISTRAL_API_KEY;
    await expect(
      new MistralProvider().ocr({ base64: "B", mimeType: "image/jpeg" }),
    ).rejects.toThrow(/MISTRAL_API_KEY not configured/);
  });
});
