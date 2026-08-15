// Roster/VIP OCR. Transcription-only: the AI returns markdown, and
// parseMistralMarkdown turns that into Client[] deterministically — so a room
// number or guest name can never be invented by a model.
//
// All transport (timeout, retry/backoff, token caps) lives in @/lib/ai.
import { parseMistralMarkdown, parseMistralVip, detectDocType, type DocType } from "./mistral-parser";
import { getAiProvider } from "./ai";
import type { Client } from "./types";

export interface MistralOcrResult {
  /** clients = breakfast roster · vip = VIP list · brief = morning events · nopost = no-room-charge. */
  type: DocType;
  /** Parsed roster rows. Populated only for clients/vip; empty for brief/nopost (handled elsewhere). */
  clients: Client[];
  pages: number;
  markdown: string;
}

export { hasMistralKey as hasMistral } from "./ai";

/**
 * OCR a document (PDF or image) and parse it. Returns parsed clients plus the
 * raw markdown (kept in-memory only; never persisted). Throws on failure so the
 * route surfaces a clear error instead of silently degrading to empty results.
 *
 * `apiKey` is accepted for backwards compatibility with existing callers but is
 * no longer used — the provider reads MISTRAL_API_KEY itself, so the key is
 * never threaded through application code.
 */
export async function mistralOcr(
  _apiKey: string | undefined,
  base64: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<MistralOcrResult> {
  const { markdown, pages } = await getAiProvider().ocr({ base64, mimeType, signal });

  const type = detectDocType(markdown);
  // Only roster docs are parsed into Client[]; brief/no-post are recognised and
  // routed to their own handlers rather than mis-parsed into a broken roster.
  const clients =
    type === "vip" ? parseMistralVip(markdown) : type === "clients" ? parseMistralMarkdown(markdown) : [];

  return { type, clients, pages, markdown };
}
