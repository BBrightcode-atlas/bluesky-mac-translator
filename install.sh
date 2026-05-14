#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${BMT_REPO_URL:-https://github.com/flotter-atlas/bluesky-mac-translator.git}"
INSTALL_DIR="$HOME/Library/Application Support/flotter-bsky-translator"
SRC_DIR="$INSTALL_DIR/src"
LOG_DIR="$HOME/Library/Logs/flotter-bsky-translator"
NMH_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
HOST_NAME="com.flotter.bsky_translator"

green() { printf "\033[1;32m%s\033[0m\n" "$*"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$*"; }
step()  { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }

step "1/7  사전 점검"
[ "$(uname -s)" = "Darwin" ] || { red "macOS 전용입니다."; exit 1; }
if [ "$(uname -m)" != "arm64" ]; then
  red "경고: Apple Silicon이 아닙니다. apfel은 Apple Silicon 전용."
fi
mkdir -p "$INSTALL_DIR" "$LOG_DIR" "$NMH_DIR"

step "2/7  의존성 설치"
if ! command -v brew >/dev/null 2>&1; then
  red "Homebrew가 필요합니다: https://brew.sh"
  exit 1
fi
command -v apfel >/dev/null 2>&1 || brew install apfel
command -v node  >/dev/null 2>&1 || brew install node
command -v pnpm  >/dev/null 2>&1 || npm install -g pnpm@9.12.0

step "3/7  repo clone / update"
if [ -d "$SRC_DIR/.git" ]; then
  git -C "$SRC_DIR" pull --ff-only
else
  rm -rf "$SRC_DIR"
  git clone "$REPO_URL" "$SRC_DIR"
fi

step "4/7  빌드"
( cd "$SRC_DIR" && pnpm install --frozen-lockfile && pnpm build )
rm -rf "$INSTALL_DIR/host" "$INSTALL_DIR/extension"
cp -R "$SRC_DIR/host/dist"                    "$INSTALL_DIR/host"
cp -R "$SRC_DIR/extension/.output/chrome-mv3" "$INSTALL_DIR/extension"

step "5/7  host-launcher.sh"
NODE_BIN="$(command -v node)"
cat > "$INSTALL_DIR/host-launcher.sh" <<EOF
#!/usr/bin/env bash
exec "$NODE_BIN" "$INSTALL_DIR/host/index.js" "\$@"
EOF
chmod +x "$INSTALL_DIR/host-launcher.sh"

step "6/7  Chrome unpacked 로드 + Extension ID 입력"
echo
echo "1. Chrome에서 chrome://extensions 열기"
echo "2. 우측 상단 '개발자 모드' ON"
echo "3. '압축해제된 확장 프로그램 로드' 클릭 후 다음 경로 선택:"
echo "     $INSTALL_DIR/extension"
echo "4. 표시된 ID (32자리 a-z)를 아래에 붙여넣으세요:"
read -r -p "Extension ID: " EXT_ID
if ! [[ "$EXT_ID" =~ ^[a-z]{32}$ ]]; then
  red "ID 형식이 올바르지 않습니다 (a-z 32자)."
  exit 1
fi

cat > "$NMH_DIR/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "Bluesky Translator Host (manages apfel server)",
  "path": "$INSTALL_DIR/host-launcher.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXT_ID/"]
}
EOF

step "7/7  검증"
"$SRC_DIR/scripts/doctor.sh"

green ""
green "✓ 설치 완료. https://bsky.app/ 을 새로고침하세요."
green "  옵션 페이지: chrome-extension://$EXT_ID/options.html"
