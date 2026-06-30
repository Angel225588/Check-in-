import { NextRequest, NextResponse } from "next/server";
import { safeLogError } from "@/lib/log-safe";
import { sanitizeAndValidateClient } from "@/lib/validate";
import { mistralOcr, hasMistral } from "@/lib/mistral-ocr";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// PDF reception report → Mistral OCR (EU). No Google. Mistral accepts the PDF
// directly (document_url), so no Files-API upload step is needed.
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
        { error: "Requête invalide. Envoie un PDF en multipart form-data." },
        { status: 400 },
      );
    }
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Aucun PDF fourni" }, { status: 400 });
    }

    const mimeType = file.type || "";
    if (mimeType !== "application/pdf") {
      return NextResponse.json(
        { error: "Type non supporté. Seuls les fichiers PDF sont acceptés." },
        { status: 400 },
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 20 Mo)." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    if (bytes.byteLength === 0) {
      return NextResponse.json({ error: "Fichier vide" }, { status: 400 });
    }
    const base64 = Buffer.from(bytes).toString("base64");

    const { type, clients, pages } = await mistralOcr(mistralKey as string, base64, "application/pdf");
    const valid =
      type === "vip"
        ? clients.filter((c) => c.roomNumber && c.name) // VIP rows: room+name is enough
        : clients.filter((c) => sanitizeAndValidateClient(c as unknown as Record<string, unknown>));

    return NextResponse.json({ type, pages, clients: valid, engine: "mistral" });
  } catch (err) {
    console.error(safeLogError("OCR PDF (mistral) error:", err));
    return NextResponse.json(
      { error: "Lecture du document échouée. Réessaie ou saisis manuellement." },
      { status: 502 },
    );
  }
}
