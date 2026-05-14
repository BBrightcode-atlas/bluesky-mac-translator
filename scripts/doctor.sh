#!/usr/bin/env bash

INSTALL_DIR="$HOME/Library/Application Support/flotter-bsky-translator"
LOG_DIR="$HOME/Library/Logs/flotter-bsky-translator"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.flotter.bsky_translator"

ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
fail() { printf "  \033[1;31m✗\033[0m %s\n" "$*"; FAILED=1; }

FAILED=0
echo "Bluesky Translator 진단"

command -v apfel >/dev/null 2>&1 && ok "apfel 설치됨" || fail "apfel 미설치 (brew install apfel)"
command -v node  >/dev/null 2>&1 && ok "node 설치됨: $(node --version)" || fail "node 미설치"

[ -d "$INSTALL_DIR/host" ]             && ok "host dist 존재" || fail "host dist 없음 ($INSTALL_DIR/host)"
[ -d "$INSTALL_DIR/extension" ]        && ok "extension dist 존재" || fail "extension dist 없음"
[ -x "$INSTALL_DIR/host-launcher.sh" ] && ok "host-launcher.sh 실행 가능" || fail "host-launcher.sh 없음/실행 불가"
[ -f "$NMH_DIR/$HOST_NAME.json" ]      && ok "NMH manifest 존재" || fail "NMH manifest 없음"
[ -d "$LOG_DIR" ]                      && ok "로그 디렉토리 OK" || fail "로그 디렉토리 없음"

if command -v curl >/dev/null 2>&1; then
  if curl -fsS -m 1 http://127.0.0.1:11434/v1/models >/dev/null 2>&1; then
    ok "apfel --serve 응답 OK (port 11434)"
  else
    echo "  ⓘ apfel --serve 미응답 (다음 번역 시 NMH가 자동 spawn)"
  fi
fi

exit "$FAILED"
