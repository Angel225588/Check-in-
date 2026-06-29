#!/usr/bin/env node
/**
 * PreToolUse guard (Bash): protect production + history.
 *  - force-push        -> DENY (irreversible; needs a deliberate, separate decision)
 *  - commit/push main  -> ASK  (main = prod; only land there intentionally)
 * Enforces CLAUDE.md git rules. Fail-OPEN on error.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ok = () => process.exit(0);
const emit = (decision, reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason },
  }));
  process.exit(0);
};

let data;
try { data = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { ok(); }

try {
  const cmd = (data.tool_input && data.tool_input.command) || "";
  if (!/\bgit\b/.test(cmd)) ok();

  if (/git\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/.test(cmd)) {
    emit("deny", "🚫 GIT GUARD: force-push blocked — irreversible. Rewriting remote history needs an explicit, separate CEO sign-off, not an inline push.");
  }

  let branch = "";
  try { branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
  const onMain = branch === "main" || branch === "master";
  const pushMain = /git\s+push\b[^\n]*\b(main|master)\b/.test(cmd) || (/git\s+push\b/.test(cmd) && onMain);
  const commitMain = /git\s+commit\b/.test(cmd) && onMain;

  if (commitMain) emit("ask", "⚠️ GIT GUARD: committing on '" + branch + "' (PRODUCTION). Feature work belongs on a branch — only commit to main when this is an INTENDED prod landing. Confirm?");
  if (pushMain) emit("ask", "⚠️ GIT GUARD: pushing to main = a PRODUCTION deploy (Vercel auto-deploys main). Previews come from feature branches. Confirm this is meant to go live?");
  ok();
} catch { ok(); }
