#!/usr/bin/env node
/**
 * PostToolUse (Bash): after a git commit, if the branch has unpushed commits,
 * feed Claude a reminder. Enforces CLAUDE.md "never leave work local-only".
 * Always exits 0; surfaces via additionalContext. Fail-OPEN.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ok = () => process.exit(0);
const note = (msg) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: msg },
  }));
  process.exit(0);
};

let data;
try { data = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { ok(); }

try {
  const cmd = (data.tool_input && data.tool_input.command) || "";
  if (!/git\s+commit\b/.test(cmd)) ok();

  let ahead = null;
  try { ahead = execSync("git rev-list --count @{u}..HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { note("🔔 PUSH REMINDER: this branch has no upstream. Run `git push -u origin <branch>` — work isn't real until pushed (CLAUDE.md)."); }

  if (ahead && parseInt(ahead, 10) > 0) {
    note("🔔 PUSH REMINDER: " + ahead + " unpushed commit(s). `git push` now — local-only commits are invisible to Angel/GitHub/Vercel (CLAUDE.md).");
  }
  ok();
} catch { ok(); }
