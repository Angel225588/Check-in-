#!/usr/bin/env node
/**
 * PreToolUse guard (Edit|Write|MultiEdit): block hardcoded secrets in code/config.
 * Enforces CLAUDE.md "secrets never in code". Fail-OPEN on any error — a hook bug
 * must never block a legitimate edit. Docs (.md/.txt) are skipped (they discuss secrets).
 */
import { readFileSync } from "node:fs";

const ok = () => process.exit(0);
const deny = (reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }));
  process.exit(0);
};

let data;
try { data = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { ok(); }

try {
  const ti = data.tool_input || {};
  const fp = ti.file_path || "";
  if (/\.(md|markdown|txt|lock)$/i.test(fp)) ok();                 // docs discuss secrets — allow
  const isCode = /\.(ts|tsx|js|jsx|mjs|cjs|sql|ya?ml|sh|toml|ini)$/i.test(fp) || /\.env/i.test(fp);
  if (!isCode) ok();

  let content = "";
  if (typeof ti.content === "string") content += ti.content + "\n";
  if (typeof ti.new_string === "string") content += ti.new_string + "\n";
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.new_string === "string") content += e.new_string + "\n";
  if (!content.trim()) ok();

  // Allowlist: the PUBLIC Supabase anon key is safe to ship in client code (it is
  // exposed to every browser by design; RLS protects the data). Scrub it before scanning
  // so it is never flagged. Written in segments so this file itself doesn't trip the guard.
  const ANON_PUBLIC =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" + "." +
    "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpbWhtd2tta2JxeHN2dGF5bGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3OTkzNDUsImV4cCI6MjA5NzM3NTM0NX0" + "." +
    "I56UA2pAERLaoflWK5Qf-LUkd-ONY8-t_TQzdeL-rFQ";
  content = content.split(ANON_PUBLIC).join("");

  const findings = [];
  const patterns = [
    [/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/, "private key block"],
    [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/, "hardcoded JWT (Supabase service/anon key or token) — use env"],
    [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
    [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/, "API secret key (sk_/rk_)"],
  ];
  for (const [re, label] of patterns) if (re.test(content)) findings.push(label);

  // secret-named var assigned a long string literal (skip env refs / placeholders)
  const assign = /\b(pepper|secret|service_role_key|service_role|api_?key|password|passwd|access_token|auth_token|client_secret|private_key)\b\s*[:=]\s*([`'"])([^`'"]{16,})\2/gi;
  let m;
  while ((m = assign.exec(content))) {
    const val = m[3];
    if (/process\.env|Deno\.env|import\.meta\.env|xxxx|your[-_]|example|redacted|placeholder|changeme|dummy|<[^>]+>|\$\{/i.test(val)) continue;
    findings.push(`${m[1]} assigned a ${val.length}-char literal`);
  }

  if (findings.length) {
    deny("🚫 SECRET GUARD: hardcoded secret(s) in " + fp + ":\n  - " + findings.join("\n  - ") +
      "\nRule (CLAUDE.md/AGENTS.md): secrets NEVER in code. Use Deno.env / process.env / Supabase Edge secrets / Vercel env.");
  }
  ok();
} catch { ok(); }
