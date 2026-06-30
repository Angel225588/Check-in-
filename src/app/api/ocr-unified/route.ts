import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { sanitizeAndValidateClient } from "@/lib/validate";
import { mistralOcr, hasMistral } from "@/lib/mistral-ocr";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp"];

// Scanner / gallery image of a daily report → Mistral OCR (EU). No Google.
// Mistral OCR returns the table as markdown; we parse it to the client roster.
// (VIP-list classification is a separate flow — /api/ocr-vip.)
export async function POST(request: NextRequest) {
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!hasMistral()) {
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
        { error: "Requête invalide. Envoie une image en multipart form-data." },
        { status: 400 },
      );
    }
    const file = formData.get("image") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Aucune image fournie" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 10 Mo)." }, { status: 400 });
    }
    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json(
        { error: "Type non supporté. Utilise JPEG, PNG ou WebP." },
        { status: 400 },
      );
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "Fichier vide" }, { status: 400 });
    }
    const base64 = Buffer.from(bytes).toString("base64");

    const { clients } = await mistralOcr(mistralKey as string, base64, mimeType);
    const valid = clients.filter((c) =>
      sanitizeAndValidateClient(c as unknown as Record<string, unknown>),
    );

    return NextResponse.json({ type: "clients", clients: valid, engine: "mistral" });
  } catch (err) {
    console.error(safeLogError("Unified OCR (mistral) error:", err));
    return NextResponse.json(
      { error: "Lecture de l'image échouée. Réessaie ou saisis manuellement." },
      { status: 502 },
    );
  }
}
