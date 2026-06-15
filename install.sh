#!/usr/bin/env bash
set -euo pipefail

TARGET="${1:-.agents/skills/fmp-guardian}"
mkdir -p "$(dirname "$TARGET")"
cp -R "$(dirname "$0")" "$TARGET"
echo "Installed fmp-guardian to $TARGET"
echo "Run: node $TARGET/scripts/fmp-init.mjs"
