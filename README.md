# Bluesky Mac Translator

bsky.app 게시물을 `claude` CLI로 한국어/일본어/중국어로 번역하는 Chrome extension. 답글 작성 시 원 포스트의 언어로도 번역. 사내 전용.

## 설치

```bash
curl -fsSL https://raw.githubusercontent.com/flotter-atlas/bluesky-mac-translator/main/install.sh | bash
```

요구사항: macOS + claude CLI (`npm i -g @anthropic-ai/claude-code` + `claude login`), Homebrew, Chrome.

설치 흐름:
1. claude CLI 존재 확인 + node/pnpm 자동 설치
2. repo clone + 빌드
3. `~/Library/Application Support/flotter-bsky-translator/`로 산출물 배치
4. Chrome 개발자 모드에서 unpacked 로드 → ID 입력
5. 자동 진단(`doctor.sh`)

## 사용

### 게시물 번역
1. https://bsky.app/ 새로고침
2. 게시물 텍스트 아래 **번역** 클릭
3. claude로 스트리밍 응답
4. 다시 클릭하면 접힘

### 답글 번역 (v0.0.2+)

외국어 포스트에 답글을 작성할 때 compose 박스 아래의 **번역** 버튼을 누르면, 답글 텍스트가 원 포스트의 언어로 번역되어 미리보기로 표시됩니다. compose 내용은 바뀌지 않으니 직접 복사해서 붙여넣으세요.

옵션 페이지: 기본 번역 언어 선택, claude CLI 진단.

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

- 설계: [docs/superpowers/specs/2026-05-15-claude-cli-backend-and-reply-translation-design.md](docs/superpowers/specs/2026-05-15-claude-cli-backend-and-reply-translation-design.md)
- 초기 설계 (apfel 시절, 참조용): [docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md](docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md)
- 트러블슈팅: [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
- 릴리스 스모크: [docs/SMOKE.md](docs/SMOKE.md)
