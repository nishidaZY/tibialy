#!/bin/bash
# Ensures the TIBIALY Rails server is up on port 3000, taking over
# the port from any other app that might be using it. Does NOT open a
# browser — the native app wrapper loads the URL itself in a WKWebView.

export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

APP_DIR="${TIBIALY_DIR:-$HOME/Documents/tibialy}"   # where the project lives (TIBIALY_DIR overrides)
LOG_DIR="$APP_DIR/log"
LOG_FILE="$LOG_DIR/launcher.log"
PID_DIR="$APP_DIR/tmp/pids"
PID_FILE="$PID_DIR/native_app_server.pid"
URL="http://localhost:3000"
PORT=3000

mkdir -p "$LOG_DIR" "$PID_DIR"
echo "---- $(date) : launch requested ----" >> "$LOG_FILE"

is_healthy() {
  curl -sSf -o /dev/null --max-time 1 "$URL/up" 2>/dev/null
}

EXISTING_PID="$(lsof -ti tcp:$PORT -sTCP:LISTEN 2>/dev/null | head -n1)"
if [ -n "$EXISTING_PID" ]; then
  if lsof -p "$EXISTING_PID" 2>/dev/null | grep -q "$APP_DIR"; then
    echo "already running as TIBIALY (pid $EXISTING_PID)" >> "$LOG_FILE"
    echo "$EXISTING_PID" > "$PID_FILE"
    exit 0
  else
    echo "port $PORT held by a different app (pid $EXISTING_PID) — stopping it" >> "$LOG_FILE"
    kill "$EXISTING_PID" 2>/dev/null
    for i in $(seq 1 20); do
      lsof -ti tcp:$PORT -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 0.25
    done
  fi
fi

cd "$APP_DIR" || exit 1

nohup bin/rails server >> "$LOG_FILE" 2>&1 &
SERVER_PID=$!
disown
echo "$SERVER_PID" > "$PID_FILE"

for i in $(seq 1 60); do
  if is_healthy; then
    exit 0
  fi
  sleep 0.5
done

echo "server did not come up in time" >> "$LOG_FILE"
exit 1
