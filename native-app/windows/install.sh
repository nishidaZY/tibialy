#!/bin/bash
# Adds a TIBIALY shortcut to the Windows Desktop. Run it inside WSL, from a clone in the Linux
# filesystem: native-app/windows/install.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
export PATH="$HOME/.rbenv/shims:$HOME/.rbenv/bin:$PATH"

if [ -z "${WSL_DISTRO_NAME:-}" ]; then
  echo "Run this inside WSL (Windows Subsystem for Linux)." >&2
  exit 1
fi

case "$REPO" in
  /mnt/*)
    echo "This clone is on the Windows drive ($REPO)." >&2
    echo "Clone it inside WSL instead, for example in ~/tibialy: Windows line endings break the scripts." >&2
    exit 1
    ;;
esac

cd "$REPO"
bundle check >/dev/null 2>&1 || bundle install
bin/rails db:prepare

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(wslpath -w "$HERE/install.ps1")" \
  -Distro "$WSL_DISTRO_NAME" -Repo "$REPO"
