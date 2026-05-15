#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="$HOME/Library/Application Support/flotter-bsky-translator"
LOG_DIR="$HOME/Library/Logs/flotter-bsky-translator"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.flotter.bsky_translator"

echo "Bluesky Translator 제거"
echo
read -r -p "정말 제거하시겠습니까? [y/N] " ans
[ "$ans" = "y" ] || [ "$ans" = "Y" ] || exit 0

rm -f "$NMH_DIR/$HOST_NAME.json"

echo
echo "✓ 제거 완료. Chrome에서 'Bluesky Translator' 확장을 수동으로 제거하세요."
