/**
 * The single AI interface for the whole app. Every route talks to this — never
 * to a vendor SDK or endpoint directly — so swapping providers again is one
 * implementation file, not a migration across the codebase.
 *
 * Two operations, deliberately distinct, because they carry different risk:
 *
 *  - `ocr()`      transcription only. Returns document markdown. No model is
 *                 asked to interpret anything, so it cannot invent a room
 *                 number. Everything tabular (rosters, VIP lists) goes here and
 *                 is parsed deterministically afterwards.
 *
 *  - `extractJson()` genuine language understanding against a strict JSON
 *                 schema. Reserved for documents that are prose, not tables
 *                 (the French morning brief; extraction verification).
 */

export interface OcrInput {
  /** Base64 document bytes (no data: prefix). */
  base64: string;
  /** e.g. "application/pdf", "image/jpeg". */
  mimeType: string;
  signal?: AbortSignal;
}

export interface OcrOutput {
  /** Concatenated per-page markdown, in page order. */
  markdown: string;
  pages: number;
  /** Provider-reported pages processed, for cost attribution. */
  pagesProcessed?: number;
}

export interface ExtractJsonInput {
  /** Instructions. Must not contain the document itself — pass that as `document`. */
  prompt: string;
  /** Document content (typically markdown from `ocr()`). */
  document: string;
  /** JSON Schema the response is forced to satisfy. */
  schema: Record<string, unknown>;
  /** Schema name, required by the structured-output API. */
  schemaName: string;
  /** Optional override, still clamped to the configured hard cap. */
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AiProvider {
  /** Identifier surfaced in API responses as `engine`. */
  readonly name: string;
  ocr(input: OcrInput): Promise<OcrOutput>;
  extractJson<T>(input: ExtractJsonInput): Promise<T>;
}
