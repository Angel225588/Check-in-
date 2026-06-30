// Mistral OCR 4 (EU / Paris) — the ONLY cloud OCR provider. Guest data never
// goes to a US service (Google Gemini removed from the reception routes). The
// /v1/ocr endpoint accepts a PDF (document_url) or image (image_url) directly and
// returns markdown tables; parseMistralMarkdown turns those into Client[].
import { parseMistralMarkdown, parseMistralVip, detectDocType } from "./mistral-parser";
import type { Client } from "./types";

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";

export interface MistralOcrResult {
  /** "clients" = breakfast/arrival list · "vip" = VIP guest list. */
  type: "clients" | "vip";
  /** Parsed rows. For a VIP doc these are VIP-shaped (level/notes), tagged list_only. */
  clients: Client[];
  pages: number;
  markdown: string;
}

/** True when a usable Mistral key is configured. */
export function hasMistral(): boolean {
  const k = process.env.MISTRAL_API_KEY;
  return !!k && k !== "your_mistral_api_key_here";
}

/**
 * OCR a document (PDF or image) with Mistral OCR. Returns parsed clients + the raw
 * markdown (kept only in-memory; never persisted). Throws on a non-2xx response so
 * the route can surface a clear failure instead of silently degrading.
 */
export async function mistralOcr(
  apiKey: string,
  base64: string,
  mimeType: string,
): Promise<MistralOcrResult> {
  const dataUrl = `data:${mimeType};base64,${base64}`;
  const document =
    mimeType === "application/pdf"
      ? { type: "document_url", document_url: dataUrl }
      : { type: "image_url", image_url: dataUrl };

  const r = await fetch(MISTRAL_OCR_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "mistral-ocr-latest", document, include_image_base64: false }),
  });
  if (!r.ok) throw new Error(`Mistral OCR HTTP ${r.status}`);

  const j = await r.json();
  const pages = Array.isArray(j.pages) ? j.pages : [];
  const markdown = pages.map((p: { markdown?: string }) => p.markdown || "").join("\n");
  const type = detectDocType(markdown);
  const clients = type === "vip" ? parseMistralVip(markdown) : parseMistralMarkdown(markdown);
  return { type, clients, pages: pages.length, markdown };
}
