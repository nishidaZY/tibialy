#!/bin/bash
# Stops the TIBIALY Rails server started by ensure_server.sh,
# so the hosted session doesn't outlive the app window.

APP_DIR="${TIBIALY_DIR:-$HOME/Documents/tibialy}"   # where the project lives (TIBIALY_DIR overrides)
LOG_FILE="$APP_DIR/log/launcher.log"
PID_FILE="$APP_DIR/tmp/pids/native_app_server.pid"

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null
    for i in $(seq 1 20); do
      kill -0 "$PID" 2>/dev/null || break
      sleep 0.25
    done
    kill -9 "$PID" 2>/dev/null
  fi
  rm -f "$PID_FILE"
fi

echo "---- $(date) : stopped ----" >> "$LOG_FILE"
