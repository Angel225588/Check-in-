import { chromium } from "playwright";
import { readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));
function chrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  for (const d of readdirSync(root).filter((x) => x.startsWith("chromium-")).sort().reverse()) {
    const p = join(root, d, "chrome-linux", "chrome");
    if (existsSync(p)) return p;
  }
}
const relLum = ([r, g, b]) => {
  const s = [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};
const contrast = (a, b) => {
  const [hi, lo] = relLum(a) > relLum(b) ? [relLum(a), relLum(b)] : [relLum(b), relLum(a)];
  return (hi + 0.05) / (lo + 0.05);
};

const b = await chromium.launch({ headless: true, executablePath: chrome(), args: ["--no-sandbox", "--disable-dev-shm-usage"] });
let bad = 0, checked = 0, small = 0;
for (const mode of ["dark", "light"]) {
  const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1 });
  await p.goto("file://" + join(HERE, "search-v2.html"), { waitUntil: "load" });
  if (mode === "light") await p.evaluate(() => document.body.classList.add("light"));
  await p.keyboard.press("Digit2"); await p.keyboard.press("Digit2"); await p.keyboard.press("Digit4");
  await p.waitForTimeout(200);

  const samples = await p.evaluate(() => {
    const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 4).map(Number);
    const stack = (el) => {
      const out = []; let n = el;
      while (n && n !== document.documentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] > 0.02)) out.push(c);
        n = n.parentElement;
      }
      out.push([18, 16, 14]);
      return out;
    };
    const comp = (layers) => {
      let [r, g, bb] = layers[layers.length - 1].slice(0, 3);
      for (let i = layers.length - 2; i >= 0; i--) {
        const L = layers[i], a = L[3] === undefined ? 1 : L[3];
        r = L[0] * a + r * (1 - a); g = L[1] * a + g * (1 - a); bb = L[2] * a + bb * (1 - a);
      }
      return [r, g, bb];
    };
    const res = [];
    for (const el of document.querySelectorAll(".frame *")) {
      const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (!direct) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 3 || r.height < 3) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.opacity === "0") continue;
      res.push({
        text: el.textContent.trim().slice(0, 26),
        color: parse(cs.color).slice(0, 3),
        bg: comp(stack(el)),
        size: parseFloat(cs.fontSize),
        weight: cs.fontWeight,
        w: Math.round(r.width), h: Math.round(r.height),
        tappable: !!el.closest("button,.k,.chip,.row,.nav,.m"),
      });
    }
    return res;
  });

  for (const s of samples) {
    checked++;
    const large = s.size >= 24 || (s.size >= 18.66 && Number(s.weight) >= 700);
    const need = large ? 3 : 4.5;
    const got = contrast(s.color, s.bg);
    if (got < need) { bad++; console.log(`  [${mode}] LOW ${got.toFixed(2)}:1 (needs ${need}) — "${s.text}" ${s.size}px`); }
  }

  const targets = await p.evaluate(() =>
    [...document.querySelectorAll(".frame button, .frame .k, .frame .chip, .frame .row, .frame .nav, .frame .m")]
      .map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim().slice(0, 18), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((x) => x.w > 0 && (x.w < 44 || x.h < 44)));
  for (const t of targets) { small++; console.log(`  [${mode}] SMALL TARGET ${t.w}x${t.h} — "${t.t}"`); }
  await p.close();
}
await b.close();
console.log(`\n${checked} text nodes checked · ${bad} below AA · ${small} tap targets under 44px`);
process.exit(bad === 0 && small === 0 ? 0 : 1);
