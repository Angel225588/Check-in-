/**
 * Mistral implementation of AiProvider. EU-hosted (Paris) — guest PII never
 * leaves an EU sovereign provider, which is the whole point of the migration.
 *
 * API shapes verified against the live API on 2026-08-15:
 *   POST /v1/ocr                → { pages: [{ markdown, ... }], usage_info }
 *   POST /v1/chat/completions   → { choices: [{ message: { content } }] }
 */
import { AI_CONFIG, requireMistralKey } from "./config";
import { AiError, postJson } from "./http";
import type { AiProvider, ExtractJsonInput, OcrInput, OcrOutput } from "./provider";

interface OcrResponse {
  pages?: Array<{ markdown?: string }>;
  usage_info?: { pages_processed?: number };
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
}

export class MistralProvider implements AiProvider {
  readonly name = "mistral";

  async ocr({ base64, mimeType, signal }: OcrInput): Promise<OcrOutput> {
    const apiKey = requireMistralKey();
    const dataUrl = `data:${mimeType};base64,${base64}`;

    // PDFs go as document_url, images as image_url — the endpoint discriminates
    // on the chunk type, not the mime inside the data URL.
    const document =
      mimeType === "application/pdf"
        ? { type: "document_url", document_url: dataUrl }
        : { type: "image_url", image_url: dataUrl };

    const json = await postJson<OcrResponse>(
      "/v1/ocr",
      { model: AI_CONFIG.ocrModel, document, include_image_base64: false },
      { apiKey, timeoutMs: AI_CONFIG.ocrTimeoutMs, signal },
    );

    const pages = Array.isArray(json.pages) ? json.pages : [];
    return {
      markdown: pages.map((p) => p.markdown || "").join("\n"),
      pages: pages.length,
      pagesProcessed: json.usage_info?.pages_processed,
    };
  }

  async extractJson<T>({
    prompt,
    document,
    schema,
    schemaName,
    maxOutputTokens,
    signal,
  }: ExtractJsonInput): Promise<T> {
    const apiKey = requireMistralKey();

    // Hard input cap. Throwing beats silently truncating: a clipped roster
    // would drop guests with no visible error.
    const total = prompt.length + document.length;
    if (total > AI_CONFIG.maxInputChars) {
      throw new AiError(
        `Input of ${total} chars exceeds the ${AI_CONFIG.maxInputChars} cap`,
        413,
        false,
      );
    }

    // Cap is a ceiling, never raised by a caller.
    const maxTokens = Math.min(
      maxOutputTokens ?? AI_CONFIG.maxOutputTokens,
      AI_CONFIG.maxOutputTokens,
    );

    const json = await postJson<ChatResponse>(
      "/v1/chat/completions",
      {
        model: AI_CONFIG.chatModel,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: document },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: schemaName, schema, strict: true },
        },
      },
      { apiKey, timeoutMs: AI_CONFIG.chatTimeoutMs, signal },
    );

    const choice = json.choices?.[0];
    const content = choice?.message?.content;
    if (!content) throw new AiError("Empty response from model", 502, false);

    // A length-truncated JSON body parses as invalid; surface the real cause
    // instead of a confusing parse error.
    if (choice?.finish_reason === "length") {
      throw new AiError(`Response hit the ${maxTokens}-token cap and was truncated`, 502, false);
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      throw new AiError("Model returned invalid JSON", 502, false);
    }
  }
}

let cached: AiProvider | null = null;

/** The app-wide provider. Swap the implementation here to change vendors. */
export function getAiProvider(): AiProvider {
  if (!cached) cached = new MistralProvider();
  return cached;
}

/** Test seam — resets the memoised provider. */
export function __resetAiProvider(): void {
  cached = null;
}
