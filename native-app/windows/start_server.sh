#!/bin/bash
# Runs the TIBIALY Rails server in the foreground. TIBIALY.vbs keeps this alive in a hidden
# wsl.exe, because WSL can shut the distro down once nothing on the Windows side is attached.
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
mkdir -p log tmp/pids

# Only reached when /up did not answer. Clear a stale pid file left by a WSL shutdown, but never
# touch it while something is listening: then Puma reports the busy port in the log instead.
if ! ss -ltn | grep -q ':3000 '; then
  rm -f tmp/pids/server.pid
fi

echo "---- $(date): launch requested ----" >> log/launcher.log
exec bin/rails server -p 3000 -b 127.0.0.1 >> log/launcher.log 2>&1
