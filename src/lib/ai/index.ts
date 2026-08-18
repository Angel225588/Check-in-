/**
 * The one import site for AI in this app.
 *
 *   import { getAiProvider } from "@/lib/ai";
 *
 * Nothing outside src/lib/ai/ should reference a vendor endpoint, SDK or
 * model id. If you find yourself adding one, add it here instead.
 */
export { getAiProvider, MistralProvider, __resetAiProvider } from "./mistral";
export { AI_CONFIG, hasMistralKey, requireMistralKey } from "./config";
export { AiError } from "./http";
export type { AiProvider, OcrInput, OcrOutput, ExtractJsonInput } from "./provider";
