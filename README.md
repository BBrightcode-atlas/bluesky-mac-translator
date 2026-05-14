# Bluesky Mac Translator

bsky.app 게시물을 macOS 내장 LLM(apfel)으로 한국어/일본어/중국어로 빠르게 번역하는 Chrome extension.
사내 전용. 토큰 비용 0, 외부 네트워크 호출 없음.

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/flotter-atlas/bluesky-mac-translator/main/install.sh | bash
```

요구사항: macOS Tahoe + Apple Silicon + Apple Intelligence 활성, Homebrew, Chrome.

설치 흐름:
1. apfel/node/pnpm 자동 설치
2. repo clone + 빌드
3. `~/Library/Application Support/flotter-bsky-translator/`로 산출물 배치
4. Chrome 개발자 모드에서 unpacked 로드 → ID 입력
5. 자동 진단(`doctor.sh`)

## 사용

1. https://bsky.app/ 새로고침
2. 게시물 텍스트 아래 **번역** 링크 클릭
3. 첫 토큰 1초 이내 스트리밍 시작
4. 다시 클릭하면 접힘

옵션 페이지에서: 기본 언어, ▾ 드롭다운 on/off, 엔드포인트 변경, 서버 상태/재시작/종료.

## 업데이트

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/install.sh
```

Chrome에서 확장 "새로고침" 클릭.

## 제거

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/uninstall.sh
```

## 개발

```bash
pnpm install
pnpm -F @flotter/bsky-translator-extension dev   # WXT HMR
pnpm -F @flotter/bsky-translator-host build
pnpm check                                       # typecheck + lint + lint:dom + test
```

## 문서

- 설계: [docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md](docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md)
- 트러블슈팅: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- 릴리스 스모크: [docs/SMOKE.md](docs/SMOKE.md)
