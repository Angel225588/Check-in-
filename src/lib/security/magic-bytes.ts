/**
 * File-type detection from actual content.
 *
 * `File.type` is set by the client and can say anything. Before this,
 * /api/ocr and /api/ocr-unified trusted it (and accepted GIF and BMP, which
 * the app never needs), and /api/ocr-pdf checked no type at all — a 20MB
 * archive renamed `roster.pdf` reached the provider unexamined.
 *
 * These helpers read the leading bytes instead and accept only the four
 * formats the app genuinely handles.
 */

import type { AllowedUploadType } from "./config";

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) {
    if (bytes[offset + i] !== sig[i]) return false;
  }
  return true;
}

const PDF_SIG = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const JPEG_SIG = [0xff, 0xd8, 0xff];
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIG = [0x52, 0x49, 0x46, 0x46]; // "RIFF"
const WEBP_SIG = [0x57, 0x45, 0x42, 0x50]; // "WEBP" at offset 8

/**
 * Identify a buffer by its magic bytes, or null for anything unsupported —
 * GIF and BMP included.
 */
export function sniffFileType(bytes: Uint8Array): AllowedUploadType | null {
  if (startsWith(bytes, PDF_SIG)) return "application/pdf";
  if (startsWith(bytes, JPEG_SIG)) return "image/jpeg";
  if (startsWith(bytes, PNG_SIG)) return "image/png";
  if (startsWith(bytes, RIFF_SIG) && startsWith(bytes, WEBP_SIG, 8)) {
    return "image/webp";
  }
  return null;
}

export interface FileTypeCheck {
  ok: boolean;
  detected: AllowedUploadType | null;
}

/**
 * Validate a buffer against a route's allow-list, ignoring what the client
 * claimed. The detected type is what callers forward to the provider.
 */
export function validateFileBytes(
  bytes: Uint8Array,
  allowed: readonly AllowedUploadType[]
): FileTypeCheck {
  const detected = sniffFileType(bytes);
  if (detected === null) return { ok: false, detected: null };
  if (!allowed.includes(detected)) return { ok: false, detected };
  return { ok: true, detected };
}

/**
 * Did the client's claimed type disagree with the content? Never used to
 * accept or reject — content always wins — only to log a spoofing attempt.
 */
export function isTypeMismatch(
  claimed: string | undefined,
  detected: AllowedUploadType | null
): boolean {
  if (!claimed || !detected) return false;
  return claimed.toLowerCase() !== detected;
}
