#!/usr/bin/env bash

INSTALL_DIR="$HOME/Library/Application Support/flotter-bsky-translator"
LOG_DIR="$HOME/Library/Logs/flotter-bsky-translator"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.flotter.bsky_translator"

ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*"; FAILED=1; }

FAILED=0
echo "Bluesky Translator 진단"

command -v claude >/dev/null 2>&1 && ok "claude CLI 설치됨: $(claude --version 2>/dev/null | head -1)" || fail "claude 미설치 (npm i -g @anthropic-ai/claude-code)"
command -v node  >/dev/null 2>&1 && ok "node 설치됨: $(node --version)" || fail "node 미설치"

[ -d "$INSTALL_DIR/host" ]             && ok "host dist 존재" || fail "host dist 없음 ($INSTALL_DIR/host)"
[ -d "$INSTALL_DIR/extension" ]        && ok "extension dist 존재" || fail "extension dist 없음"
[ -x "$INSTALL_DIR/host-launcher.sh" ] && ok "host-launcher.sh 실행 가능" || fail "host-launcher.sh 없음/실행 불가"
[ -f "$NMH_DIR/$HOST_NAME.json" ]      && ok "NMH manifest 존재" || fail "NMH manifest 없음"
[ -d "$LOG_DIR" ]                      && ok "로그 디렉토리 OK" || fail "로그 디렉토리 없음"

exit "$FAILED"
