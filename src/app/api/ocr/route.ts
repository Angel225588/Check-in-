import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { sanitizeAndValidateClient } from "@/lib/validate";
import { getAiProvider, hasMistralKey, AiError } from "@/lib/ai";
import { parseMistralMarkdown, parseMistralVip, detectDocType } from "@/lib/mistral-parser";

// Single-image OCR → Mistral (EU). Kept as PhotoCapture's default endpoint;
// the roster/VIP flows call /api/ocr-unified explicitly.
export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

export async function POST(request: NextRequest) {
  if (!hasMistralKey()) {
    return NextResponse.json(
      { error: "OCR non configuré sur ce serveur (MISTRAL_API_KEY manquant)." },
      { status: 500 },
    );
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "Invalid request. Send multipart form data with an image." },
        { status: 400 },
      );
    }

    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large. Maximum size is 10MB." }, { status: 400 });
    }

    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use JPEG, PNG, or WebP." },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "File is empty" }, { status: 400 });
    }

    const { markdown } = await getAiProvider().ocr({
      base64: Buffer.from(bytes).toString("base64"),
      mimeType,
      signal: request.signal,
    });

    const type = detectDocType(markdown);
    const parsed = type === "vip" ? parseMistralVip(markdown) : parseMistralMarkdown(markdown);
    const validClients =
      type === "vip"
        ? parsed.filter((c) => c.roomNumber && c.name)
        : parsed.filter((c) => sanitizeAndValidateClient(c as unknown as Record<string, unknown>));

    return NextResponse.json({ clients: validClients });
  } catch (err) {
    console.error(safeLogError("OCR route error", err));
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.status === 429 ? "Rate limit exceeded. Please wait a moment and try again." : "AI processing failed. Try again." },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    return NextResponse.json(
      { error: "Image processing failed. Try again or enter manually." },
      { status: 500 },
    );
  }
}
