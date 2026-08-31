import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { getRoutePolicy } from "@/lib/security/config";
import { securityError } from "@/lib/security/errors";
import {
  guardError,
  holdBudget,
  readValidatedFile,
  settleFailed,
  settleOk,
  type AiBudgetHold,
} from "@/lib/security/guard";
import { ocrCost } from "@/lib/security/budget";
import { sanitizeAndValidateClient } from "@/lib/validate";
import { getAiProvider, hasMistralKey, AiError } from "@/lib/ai";
import { parseMistralMarkdown, parseMistralVip, detectDocType } from "@/lib/mistral-parser";

// Single-image OCR → Mistral (EU). Kept as PhotoCapture's default endpoint;
// the roster/VIP flows call /api/ocr-unified explicitly.
export const runtime = "nodejs";


export async function POST(request: NextRequest) {
  if (!hasMistralKey()) {
    return NextResponse.json(
      securityError("service_unconfigured"),
      { status: 500 },
    );
  }

  const policy = getRoutePolicy("/api/ocr")!;
  let hold: AiBudgetHold | null = null;
  let settled = false;
  let providerCalled = false;

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

    const file = formData.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // Size ceiling and type both come from the bytes. `file.type` is set by
    // the client and used to be the only check — GIF and BMP included, which
    // the app never needs.
    const read = await readValidatedFile(file, policy);
    if (!read.ok || !read.bytes || !read.detectedType) {
      return guardError(read.code ?? "invalid_request");
    }

    const budget = await holdBudget(request, policy);
    if (!budget.ok) return budget.response;
    hold = budget.hold;

    providerCalled = true;
    const { markdown, pagesProcessed } = await getAiProvider().ocr({
      base64: read.bytes.toString("base64"),
      // The detected type, never the claimed one.
      mimeType: read.detectedType,
      signal: request.signal,
    });

    await settleOk(hold, ocrCost(pagesProcessed ?? 1));
    settled = true;

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
  } finally {
    // Release ONLY if the provider was never reached. Once a call is made we
    // may already have been billed for it — a multi-page OCR that fails
    // part-way still pays for the pages it processed — so a failure after
    // that point keeps the pessimistic reservation. Under-spending is the
    // safe direction for a cap; releasing here would let repeated failures
    // spend without ever being counted.
    if (hold && !settled && !providerCalled) await settleFailed(hold);
  }
}
