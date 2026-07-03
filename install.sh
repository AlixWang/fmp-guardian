#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-.agents/skills/fmp-guardian}"
SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/skills/fmp-guardian"

if [ -e "$TARGET" ]; then
  echo "$TARGET already exists" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"
cp -R "$SOURCE" "$TARGET"
echo "Installed fmp-guardian to $TARGET"
echo "Run: node $TARGET/scripts/fmp-init.mjs"
