/**
 * Design-drift audit.
 *
 * A brand is recognisable because the SAME few values repeat everywhere — one
 * gold, one card radius, five or six type sizes. Drift is what makes a product
 * look homemade: thirty-seven text sizes read as "someone eyeballed it", even
 * when every individual screen looks fine.
 *
 * This measures the gap between the tokens we declared (globals.css) and what
 * the components actually use. It prints a scorecard and, with --strict, exits
 * non-zero when a budget is exceeded so the gate can hold the line.
 *
 *   node scripts/design-audit.mjs            # report
 *   node scripts/design-audit.mjs --strict   # fail if over budget
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOTS = ["src/app", "src/components"];
const STRICT = process.argv.includes("--strict");

/**
 * Budgets are the CURRENT measured numbers, not aspirations. They exist to
 * stop things getting worse while we converge; lower them as we migrate.
 * A budget you cannot meet today is a gate everyone learns to ignore.
 */
const BUDGET = {
  hexColors: 60,
  distinctHexColors: 27,
  textSizes: 0,
  distinctTextSizes: 0,
  radii: 0,
  distinctRadii: 0,
  rawOpacity: 209,
};

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const PATTERNS = {
  hexColors: /#[0-9A-Fa-f]{3,8}\b/g,
  textSizes: /text-\[[0-9.]+px\]/g,
  radii: /rounded-(?:\w+-)?\[[0-9.]+px\]/g,
  rawOpacity: /(?:bg|text|border)-(?:white|black)\/\[?[0-9.]+\]?/g,
};

const files = ROOTS.flatMap((r) => walk(r));
const hits = { hexColors: [], textSizes: [], radii: [], rawOpacity: [] };
const byFile = {};

for (const f of files) {
  const src = readFileSync(f, "utf8");
  let fileTotal = 0;
  for (const [key, re] of Object.entries(PATTERNS)) {
    const m = src.match(re) || [];
    hits[key].push(...m);
    fileTotal += m.length;
  }
  if (fileTotal) byFile[relative(process.cwd(), f)] = fileTotal;
}

const distinct = (a) => [...new Set(a)];
const tally = (a) =>
  Object.entries(a.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {})).sort((x, y) => y[1] - x[1]);

const metrics = {
  hexColors: hits.hexColors.length,
  distinctHexColors: distinct(hits.hexColors).length,
  textSizes: hits.textSizes.length,
  distinctTextSizes: distinct(hits.textSizes).length,
  radii: hits.radii.length,
  distinctRadii: distinct(hits.radii).length,
  rawOpacity: hits.rawOpacity.length,
};

/**
 * Token classes that resolve to nothing.
 *
 * Tailwind only generates `text-x` / `bg-x` from a `--color-x` token. Writing
 * `text-brand-ink` when the variable is `--brand-ink` produces a class that is
 * silently INERT — the element keeps whatever colour it inherited. That is how
 * the "petit-déjeuner NON inclus" banner lost its contrast: a codemod folded
 * two dark browns into a token name Tailwind never emitted, and nothing failed.
 * A class that does nothing must never ship quietly again.
 */
const css = readFileSync("src/app/globals.css", "utf8");
const declared = new Set([...css.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]));
const TAILWIND_BUILTIN = /^(white|black|transparent|current|inherit|red|green|blue|yellow|amber|slate|gray|grey|zinc|neutral|stone|orange|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose)(-\d{1,3})?$/;
const inert = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  // The lookbehind matters: `var(--aur-bg-elev)` contains the literal
  // "bg-elev", and without it every CSS variable reads as a broken class.
  for (const m of src.matchAll(/(?<![-\w])(?:bg|text|border|ring|from|to|via)-([a-z][a-z0-9-]*)\b/g)) {
    // `border-l-brand` colours the left edge — the side is not part of the
    // token name, so strip it before asking whether the colour exists.
    const name = m[1].replace(/^(?:t|b|l|r|x|y|s|e)-/, "");
    if (declared.has(name) || TAILWIND_BUILTIN.test(name)) continue;
    // Not colours: Tailwind's type scale, radii, sides, and layout keywords.
    // `border-t`, `bg-gradient-to-r` and friends are structure, not paint.
    if (
      /^(xs|sm|base|lg|xl|\dxl|micro|card|pill|md|full|none|auto|hidden)$/.test(name) ||
      /^(t|b|l|r|x|y)(-\d+)?$/.test(name) ||
      /^gradient-to-[a-z]{1,2}$/.test(name) ||
      /^(left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|top|bottom|middle|solid|dashed|dotted|double|inherit|opacity)$/.test(name) ||
      /^\d/.test(name)
    ) continue;
    inert.push(`${relative(process.cwd(), f)}  ${m[0]}`);
  }
}
const inertClasses = [...new Set(inert)];

const tokenCount = (readFileSync("src/app/globals.css", "utf8").match(/^\s*--[a-z-]/gm) || []).length;

console.log(`\n  Design drift — ${files.length} components, ${tokenCount} tokens declared\n`);
const rows = [
  ["raw hex colours", metrics.hexColors, BUDGET.hexColors, `${metrics.distinctHexColors} distinct`],
  ["arbitrary text sizes", metrics.textSizes, BUDGET.textSizes, `${metrics.distinctTextSizes} distinct`],
  ["arbitrary radii", metrics.radii, BUDGET.radii, `${metrics.distinctRadii} distinct`],
  ["raw white/black opacity", metrics.rawOpacity, BUDGET.rawOpacity, ""],
];
let over = false;

/* A class that paints nothing is worse than an off-scale value: it fails
   silently and only a human eye catches it. This is a hard fail, not a
   budget. */
if (inertClasses.length) {
  console.log("  ✗ INERT colour classes — no matching --color-* token, so they paint nothing:");
  for (const i of inertClasses.slice(0, 12)) console.log(`      ${i}`);
  over = true;
} else {
  console.log("  ✓ every colour class resolves to a declared token");
}

for (const [label, value, budget, note] of rows) {
  const bad = value > budget;
  if (bad) over = true;
  console.log(
    `  ${bad ? "✗" : "✓"} ${label.padEnd(26)} ${String(value).padStart(4)} / ${String(budget).padEnd(4)} ${note}`,
  );
}

console.log("\n  Most-used off-scale text sizes (a real scale has 5-7 steps):");
for (const [v, n] of tally(hits.textSizes).slice(0, 8)) console.log(`    ${String(n).padStart(3)} × ${v}`);

console.log("\n  Worst files:");
for (const [f, n] of Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
  console.log(`    ${String(n).padStart(3)}  ${f}`);
}

if (STRICT && over) {
  console.error("\n  Design drift exceeded budget — tighten the component or raise the budget deliberately.\n");
  process.exit(1);
}
console.log("");
