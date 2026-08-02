#!/usr/bin/env bash
# Full validation gate for the Check-in PWA.
#
# Runs every verification layer and only exits 0 if ALL pass:
#   1. Type safety     — tsc --noEmit
#   2. Unit/logic tests — vitest (storage, nav, parser, vip, reports, …)
#   3. Production build — next build
#   4. End-to-end       — real browser drives the app, asserts privacy /
#                         check-in / persistence / compression / honest-failure,
#                         and saves screenshots to validation-artifacts/
#
# Usage:  npm run validate      (or)   bash scripts/validate.sh
set -uo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3123}"
BASE_URL="http://localhost:${PORT}"
SERVER_PID=""
FAILED=0

step() { printf '\n\033[1m▶ %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$1"; }
bad()  { printf '\033[31m✗ %s\033[0m\n' "$1"; FAILED=1; }

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

step "1/4 Type check (tsc --noEmit)"
if npx tsc --noEmit; then ok "types clean"; else bad "type errors"; fi

step "2/4 Unit tests (vitest)"
if npx vitest run; then ok "unit tests passed"; else bad "unit tests failed"; fi

step "3/4 Production build (next build)"
if npx next build; then ok "build succeeded"; else bad "build failed"; fi

# Only attempt E2E if the build produced something to serve.
step "4/4 End-to-end (Playwright, real browser)"
if [[ "$FAILED" -eq 1 ]]; then
  bad "skipping E2E — an earlier stage failed"
else
  # Refuse to run against someone else's server. A leftover `next start` on
  # this port answers every request from a build made hours ago, so ours fails
  # to bind, the suite tests the stale bundle, and the failure looks like a
  # product regression. That cost two full runs before it was caught — the
  # E2E was reporting on code that had since changed underneath it.
  if command -v fuser >/dev/null 2>&1 && fuser "${PORT}/tcp" >/dev/null 2>&1; then
    bad "port ${PORT} is already in use — kill the stale server first (fuser -k ${PORT}/tcp)"
    bad "refusing to validate against a build we did not just make"
    cleanup
    exit 1
  fi

  npx next start -p "$PORT" >/tmp/checkin-validate-server.log 2>&1 &
  SERVER_PID=$!

  # Wait for the server to answer (max ~40s).
  READY=0
  for _ in $(seq 1 40); do
    if curl -sf "${BASE_URL}/search" >/dev/null 2>&1; then READY=1; break; fi
    sleep 1
  done

  if [[ "$READY" -ne 1 ]]; then
    bad "server did not come up on ${BASE_URL} (see /tmp/checkin-validate-server.log)"
  else
    if BASE_URL="$BASE_URL" node scripts/e2e-validate.mjs; then
      ok "E2E checks passed"
    else
      bad "E2E checks failed (see validation-artifacts/report.md)"
    fi
  fi
fi

printf '\n──────────────────────────────\n'
if [[ "$FAILED" -eq 0 ]]; then
  printf '\033[32m✅ VALIDATION PASSED — task verified\033[0m\n'
  exit 0
else
  printf '\033[31m❌ VALIDATION FAILED — see output above\033[0m\n'
  exit 1
fi
