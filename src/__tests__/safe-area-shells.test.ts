import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every screen keeps out of the status bar — checked in the SOURCE, because
 * that is the only place the whole app is visible at once.
 *
 * The runtime rule (R30) walks eight routes and two overlays. It passed while
 * `/upload` was drawing its "Traitement en cours" header under the iPad's clock,
 * because that is not a route — it is a VIEW of a route, one of four in that
 * file, and a sweep of routes-at-rest can never reach it. Same for a modal
 * nobody opened during the run.
 *
 * So the inset belongs to the screen, once: any container that claims the full
 * height of the display carries `screen-safe`, and `box-sizing: border-box`
 * means the padding eats into the 100dvh rather than pushing past it.
 *
 * This test is the exhaustive half. It reads every file and fails on the shell
 * somebody adds next month.
 */
const SRC = join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/** Every className string in the file, single or double quoted or a template. */
function classNames(src: string): { value: string; line: number }[] {
  const out: { value: string; line: number }[] = [];
  const re = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({ value: m[1] ?? m[2] ?? "", line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

/**
 * A full-height screen: it owns the display, so it owns the strip iOS draws
 * its clock in.
 *
 * A `fixed inset-0` that only lays a tint over the page is not a screen — it
 * has nothing in it to be covered. The test looks for the ones that stack
 * content: a flex column, or a full-height panel inside.
 */
function isScreen(cls: string): boolean {
  const fullHeight = /\bh-dvh\b|\bmin-h-dvh\b/.test(cls);
  const overlay = /\bfixed\b/.test(cls) && /\binset-0\b/.test(cls) && /\bflex\b/.test(cls);
  return fullHeight || overlay;
}

describe("every full-height screen carries the safe-area inset", () => {
  const files = walk(SRC).filter((f) => !f.includes("__tests__"));

  it("finds the app's screens at all — a test that finds nothing proves nothing", () => {
    const n = files.flatMap((f) => classNames(readFileSync(f, "utf8"))).filter((c) => isScreen(c.value)).length;
    expect(n).toBeGreaterThan(15);
  });

  it("gives every one of them screen-safe", () => {
    const missing: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const c of classNames(src)) {
        if (!isScreen(c.value)) continue;
        if (/\bscreen-safe\b/.test(c.value)) continue;
        missing.push(`${file.replace(SRC, "src")}:${c.line}`);
      }
    }
    expect(missing, `these screens would draw under the iPad's clock:\n${missing.join("\n")}`).toEqual([]);
  });
});
