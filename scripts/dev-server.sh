#!/usr/bin/env bash
# Rebuild and restart the preview server without the two traps this project hit:
#   1. `pkill -f "next start -p PORT"` matches the shell running it and kills
#      its own parent (exit 144).
#   2. rebuilding .next underneath a running server makes every asset 404 and
#      the app renders a blank page — which then looks like a design failure.
set -e
PORT="${1:-4120}"
LOG="${2:-/tmp/next-$PORT.log}"
PID=$(fuser "$PORT/tcp" 2>/dev/null | tr -d ' ' || true)
[ -n "$PID" ] && kill -9 $PID 2>/dev/null || true
sleep 1
npx next build > "$LOG.build" 2>&1
nohup npx next start -p "$PORT" > "$LOG" 2>&1 &
for _ in $(seq 1 40); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$PORT/upload" || true)
  [ "$code" = "200" ] && { echo "server up on $PORT (fresh build)"; exit 0; }
  sleep 2
done
echo "server did not come up on $PORT; see $LOG"
exit 1
