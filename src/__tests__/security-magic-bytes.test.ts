/**
 * Fix: uploads are validated by magic bytes, never by extension or the
 * client-supplied content type.
 *
 * /api/ocr and /api/ocr-unified trusted `file.type` (and accepted GIF and BMP,
 * which nothing in the app produces). /api/ocr-pdf checked no type at all —
 * only size — so a renamed archive reached the provider unexamined.
 */
import { describe, it, expect } from "vitest";
import {
  sniffFileType,
  validateFileBytes,
  isTypeMismatch,
} from "@/lib/security/magic-bytes";
import { ALLOWED_IMAGE_TYPES, ALLOWED_UPLOAD_TYPES } from "@/lib/security/config";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const BMP = new Uint8Array([0x42, 0x4d, 0x36, 0x00]);
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const ELF = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02]);

describe("detection by content", () => {
  it("identifies each format the app handles", () => {
    expect(sniffFileType(PDF)).toBe("application/pdf");
    expect(sniffFileType(JPEG)).toBe("image/jpeg");
    expect(sniffFileType(PNG)).toBe("image/png");
    expect(sniffFileType(WEBP)).toBe("image/webp");
  });

  it("rejects GIF and BMP, which the old allow-lists accepted", () => {
    expect(sniffFileType(GIF)).toBeNull();
    expect(sniffFileType(BMP)).toBeNull();
  });

  it("rejects archives and executables", () => {
    expect(sniffFileType(ZIP)).toBeNull();
    expect(sniffFileType(ELF)).toBeNull();
  });

  it("handles empty and truncated buffers without throwing", () => {
    expect(sniffFileType(new Uint8Array([]))).toBeNull();
    expect(sniffFileType(new Uint8Array([0x25, 0x50]))).toBeNull();
  });

  it("does not mistake another RIFF container for WEBP", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffFileType(wav)).toBeNull();
  });
});

describe("validation against a route allow-list", () => {
  it("accepts a real PDF on the PDF route", () => {
    expect(validateFileBytes(PDF, ["application/pdf"])).toEqual({
      ok: true,
      detected: "application/pdf",
    });
  });

  it("rejects a PDF on an image-only route", () => {
    const r = validateFileBytes(PDF, ALLOWED_IMAGE_TYPES);
    expect(r.ok).toBe(false);
    expect(r.detected).toBe("application/pdf");
  });

  it("rejects an archive claiming to be a PDF — the /api/ocr-pdf hole", () => {
    // That route checked size and nothing else, so this passed before.
    const r = validateFileBytes(ZIP, ALLOWED_UPLOAD_TYPES);
    expect(r.ok).toBe(false);
    expect(r.detected).toBeNull();
  });

  it("returns the detected type, which is what goes to the provider", () => {
    expect(validateFileBytes(JPEG, ALLOWED_IMAGE_TYPES).detected).toBe("image/jpeg");
  });

  it("flags a claimed/detected mismatch for logging", () => {
    const r = validateFileBytes(PNG, ALLOWED_IMAGE_TYPES);
    expect(r.ok).toBe(true);
    expect(isTypeMismatch("image/jpeg", r.detected)).toBe(true);
    expect(isTypeMismatch("image/png", r.detected)).toBe(false);
    expect(isTypeMismatch(undefined, r.detected)).toBe(false);
  });
});
