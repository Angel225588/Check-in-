/**
 * Mistral OCR test — proves Mistral OCR 4 (French, EU) reads our hotel reports.
 * Key comes from the ENV (never hardcoded). Usage:
 *   MISTRAL_API_KEY="..." node scripts/test-mistral-ocr.mjs "image-ref/client list.pdf"
 * Endpoint: POST https://api.mistral.ai/v1/ocr · model mistral-ocr-latest.
 */
import { readFileSync } from "node:fs";
import { extname, basename } from "node:path";

const KEY = process.env.MISTRAL_API_KEY;
if (!KEY) { console.error("✗ missing MISTRAL_API_KEY (pass it via env, never hardcode)"); process.exit(2); }

const file = process.argv[2] || "image-ref/client list.pdf";
const ext = extname(file).toLowerCase();
const isPdf = ext === ".pdf";
const mime = isPdf ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg";
const dataUrl = `data:${mime};base64,${readFileSync(file).toString("base64")}`;
const document = isPdf
  ? { type: "document_url", document_url: dataUrl }
  : { type: "image_url", image_url: dataUrl };

const run = async () => {
  const t0 = Date.now();
  const r = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "mistral-ocr-latest", document, include_image_base64: false }),
  });
  const ms = Date.now() - t0;
  const text = await r.text();
  if (!r.ok) { console.error(`✗ HTTP ${r.status}: ${text.slice(0, 800)}`); process.exit(1); }
  const j = JSON.parse(text);
  const pages = j.pages || [];
  console.log(`✅ Mistral OCR ${r.status} · ${pages.length} page(s) · ${ms}ms · file=${basename(file)} · model=${j.model || "?"}`);
  if (j.usage_info) console.log("usage:", JSON.stringify(j.usage_info));
  pages.forEach((p, i) => {
    const md = (p.markdown || "").trim();
    console.log(`\n──── page ${i + 1} · ${md.length} chars ────`);
    console.log(md.slice(0, 3500));
  });
};
run().catch((e) => { console.error(e); process.exit(1); });
