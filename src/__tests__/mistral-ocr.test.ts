import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { mistralOcr } from "@/lib/mistral-ocr";
import { __resetAiProvider } from "@/lib/ai";

const MD = `R118 Package Forecast
|  Room No. | Room Type | RTC | Conf. No. | Name | Arrival Date | Departure Date | Resv. Status | Adl. | Chl. | Rate Code | Package Codes  |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
|  651 | EXST | STKG | 177033255 | JU, DA | 28/02/26 | 01/03/26 | DUOT | 2 | 0 | 12RMOC | BKF COMP  |`;

// The key now lives with the provider, not in application code, so it is set
// on the environment rather than threaded through mistralOcr().
beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
  // Retries would make the failure test wait through real backoff sleeps.
  process.env.MISTRAL_MAX_RETRIES = "0";
  __resetAiProvider();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.MISTRAL_MAX_RETRIES;
});

describe("mistralOcr — single EU OCR provider (no Google)", () => {
  it("sends a PDF as document_url and parses the returned markdown into clients", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ pages: [{ markdown: MD }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await mistralOcr("KEY", "BASE64", "application/pdf");
    expect(res.pages).toBe(1);
    expect(res.clients).toHaveLength(1);
    expect(res.clients[0]).toMatchObject({ name: "JU, DA", packageCode: "BKF COMP", adults: 2 });

    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toContain("api.mistral.ai/v1/ocr");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("mistral-ocr-4-1");
    expect(body.document.type).toBe("document_url");
  });

  it("sends images as image_url", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ pages: [{ markdown: MD }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await mistralOcr("KEY", "B64", "image/jpeg");
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.document.type).toBe("image_url");
  });

  it("throws on a non-2xx response (so the route surfaces a real failure)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 429 })));
    await expect(mistralOcr("KEY", "B64", "image/jpeg")).rejects.toThrow(/429/);
  });
});
