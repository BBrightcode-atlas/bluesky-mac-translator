# Bluesky Translator

![icon](extension/public/icon/128.png)

**bsky.app과 publish.buffer.com에서 [Claude](https://claude.com/)로 번역하는 Chrome 확장.**

지원 사이트 및 기능:
- **Bluesky** (`bsky.app`) — 게시물 본문 인라인 번역 + 답글 작성 시 원 포스트 언어로 자동 번역 + 새 글 작성 번역
- **Buffer** (`publish.buffer.com`) — Create Post composer + Community 댓글 본문 번역 + 답글 작성 번역
- API key가 확장에 저장되지 않음 — 사용자 머신의 `claude` CLI를 통해서만 호출
- 분석/추적/광고 없음

> ⚠️ **사전 요구사항**: macOS + [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) (`claude login` 까지 완료) + Chrome. claude의 API 호출 비용은 사용자의 Anthropic 계정으로 청구됩니다.

---

## 빠른 시작

### 1) Claude CLI 설치 (한 번)

```bash
npm i -g @anthropic-ai/claude-code
claude login
```

### 2) 확장 설치

```bash
curl -fsSL https://raw.githubusercontent.com/bbrightcode-atlas/bluesky-mac-translator/main/install.sh | bash
```

설치 스크립트가 하는 일:
1. `claude` / `node` / `pnpm` 존재 확인
2. 이 repo를 `~/Library/Application Support/flotter-bsky-translator/src/` 에 clone
3. extension과 host 빌드
4. 빌드 산출물을 같은 디렉토리의 `extension/`, `host/`로 배치
5. Chrome에서 사용할 **NMH launcher** (`host-launcher.sh`) 생성
6. Chrome 개발자 모드 안내 후, 입력받은 확장 ID로 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.flotter.bsky_translator.json` 생성
7. `doctor.sh` 자가진단

### 3) Chrome에서 로드

`chrome://extensions` → "개발자 모드" ON → "압축해제된 확장 프로그램 로드" → 안내된 경로 선택.

---

## 사용법

### Bluesky 게시물 번역

Bluesky 피드 또는 thread 페이지에서 외국어 포스트 본문 옆의 **번역** 링크를 클릭. 스트리밍 응답이 인라인으로 뜹니다. 한 번 더 누르면 접힙니다.

기본 번역 대상 언어는 옵션 페이지에서 한국어/일본어/중국어 중 선택.

### Bluesky 답글 / 새 글 번역

외국인 포스트에 답글 모달을 열고 한국어로 작성한 다음, compose 박스 아래의 **번역** 버튼을 누르세요. 답글 텍스트가 원 포스트의 언어로 번역되어 미리보기로 표시됩니다. 새 글(답글이 아닌) 모달에도 같은 UI가 뜨며, 이 경우 대상 언어는 옵션 페이지의 "Buffer 작성 번역 언어" setting을 따릅니다.

- **반영하기** 버튼을 누르면 compose 박스 내용이 번역문으로 교체됩니다 (Cmd+Z로 복구 가능).
- compose 텍스트는 자동으로 바뀌지 않으므로, 미리보기를 확인한 후 직접 반영 여부를 결정합니다.

### Buffer Create Post (publish.buffer.com)

`+ New Post` → 채널 선택 → compose 영역에 한국어로 작성 → 하단 toolbar(media/gif/emoji 아이콘 줄)에 **번역** 버튼이 자리잡습니다. 클릭 시 옵션 페이지의 "Buffer 작성 번역 언어" 로 번역되고, **반영하기**로 compose에 적용.

### Buffer Community 댓글

`Community` → 게시물 클릭 → 댓글 thread:
- 외국어 댓글 본문 아래 **번역** 버튼 — 한국어로 미리보기
- 답글 작성 textarea 아래 **번역** 버튼 — 한국어 답글을 부모 댓글의 언어로 번역 + **반영하기**로 textarea에 적용

### 옵션 페이지

확장 아이콘 우클릭 → "옵션" 또는 `chrome://extensions` → 확장 카드 → "확장 프로그램 옵션".

- **번역 대상 언어 (Bluesky 게시물 읽기)** — bsky 외국어 게시물을 어떤 언어로 읽을지 (한국어/일본어/중국어).
- **Buffer 작성 번역 언어** — Buffer composer + Bluesky 새 글 작성에서 한국어 → 어떤 외국어로 번역할지 (English/일본어/중국어/한국어).
- Claude CLI 진단 — 경로 / 버전 표시.

---

## 동작 원리

```
┌─ Bluesky 탭 ────────────────────────┐
│ content script                      │
│   · post-detector / compose-detector │
│   · Shadow DOM 번역 UI 주입          │
└────────┬────────────────────────────┘
         │ chrome.runtime.connect('translate')
         ▼
┌─ Service Worker (background) ───────┐
│   · 요청 직렬화 + LRU 캐시(200건)    │
│   · 에러 코드 분기                    │
└────────┬────────────────────────────┘
         │ chrome.runtime.connectNative
         ▼ stdio (length-prefixed JSON)
┌─ NMH host (host/dist/index.js) ─────┐
│   · 요청당 child_process.spawn:      │
│     claude -p <prompt> --bare        │
│       --output-format stream-json    │
│   · NDJSON 라인 → chunk message      │
└────────┬────────────────────────────┘
         ▼ child_process
   Claude CLI (사용자 머신에 로그인됨)
         ▼
   Anthropic API
```

핵심 설계 결정:
- **확장 내부에 API key 없음** — claude CLI가 자체 자격증명 관리. NMH host도 자격증명에 접근하지 않음.
- **요청당 새 `claude` 프로세스** — stateless, 컨텍스트 누수 없음. `--bare` 로 hooks/plugin sync/CLAUDE.md auto-discovery 모두 skip해서 ~2.7초 cold start.
- **답글 언어 자동 감지** — 별도 langdetect 없이 프롬프트에 "원 포스트와 같은 언어로 번역" 지시. Claude가 둘 다 처리.

---

## 권한 (Permissions)

| 권한 | 이유 |
|---|---|
| `storage` | 두 개 setting 필드 (`targetLang` 게시물 읽기, `bufferTargetLang` compose 작성) 저장 |
| `nativeMessaging` | macOS에 설치된 NMH host와 stdio 통신 |
| `host_permissions: https://bsky.app/*` | bsky.app DOM에 번역 UI 주입 + 포스트 텍스트 읽기 |
| `host_permissions: https://publish.buffer.com/*` | Buffer composer + community 댓글 DOM에 번역 UI 주입 |

위 두 사이트 외 어떤 사이트에도 접근하지 않습니다. 분석/광고/추적 코드 없음.

자세한 데이터 처리: [Privacy Policy](https://bbrightcode-atlas.github.io/bluesky-mac-translator/PRIVACY)

---

## 업데이트

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/install.sh
```

그 후 `chrome://extensions` 에서 확장 "새로고침" (↻) 클릭.

## 제거

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/uninstall.sh
```

NMH manifest와 설치 디렉토리가 제거됩니다. `claude` CLI 자체는 건드리지 않으므로 별도로 `npm uninstall -g @anthropic-ai/claude-code` 필요.

## 진단

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/scripts/doctor.sh
```

claude CLI / host dist / extension dist / NMH manifest / 로그 디렉토리 상태를 한 번에 점검.

---

## 개발

```bash
git clone https://github.com/bbrightcode-atlas/bluesky-mac-translator.git
cd bluesky-mac-translator
pnpm install

# 개발 (extension HMR)
pnpm -F @flotter/bsky-translator-extension dev

# 빌드
pnpm -F @flotter/bsky-translator-extension build
pnpm -F @flotter/bsky-translator-host build

# 전체 검증 (typecheck + lint + lint:dom + test)
pnpm check
```

### 프로젝트 구조

```
bluesky-mac-translator/
├── extension/              # Chrome 확장 (WXT + React)
│   ├── entrypoints/
│   │   ├── content.ts      # bsky.app 페이지 주입
│   │   ├── background.ts   # service worker
│   │   └── options/        # 옵션 페이지 React 앱
│   └── lib/                # 공유 로직 (detector / UI / 캐시 / 프롬프트)
├── host/                   # NMH host (Node.js)
│   ├── src/
│   │   ├── index.ts        # NMH 진입점
│   │   ├── claude-spawn.ts # claude CLI subprocess 관리
│   │   ├── claude-stream-parser.ts
│   │   └── protocol.ts     # length-prefixed JSON
│   └── dist/
├── docs/                   # Privacy / 트러블슈팅 / 스모크
├── scripts/                # doctor / lint helpers
├── install.sh / uninstall.sh
└── README.md
```

### 테스트

```bash
pnpm -r test            # 모든 워크스페이스
pnpm -F extension test
pnpm -F host test
```

vitest + happy-dom. 68개 테스트.

### Spec / Plan

- 설계 (현재): [`docs/superpowers/specs/2026-05-15-claude-cli-backend-and-reply-translation-design.md`](docs/superpowers/specs/2026-05-15-claude-cli-backend-and-reply-translation-design.md)
- 구현 plan: [`docs/superpowers/plans/2026-05-15-claude-cli-backend-and-reply-translation.md`](docs/superpowers/plans/2026-05-15-claude-cli-backend-and-reply-translation.md)
- 초기 설계 (apfel 시절, 참조용): [`docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md`](docs/superpowers/specs/2026-05-13-bluesky-mac-translator-design.md)

---

## FAQ

**Q. Windows / Linux에서도 동작하나요?**
현재 install 스크립트는 macOS 전용 (Native Messaging Host 경로가 다름). 코어 로직은 OS-agnostic이라 install 흐름만 조정하면 가능합니다. PR 환영.

**Q. claude CLI 호출 비용이 부담스러운데, 다른 백엔드로 바꿀 수 있나요?**
NMH host의 `claude-spawn.ts` 한 곳만 다른 명령으로 교체하면 됩니다 (예: 로컬 LLM, OpenAI, Gemini 등). 다만 본 repo는 claude만 지원합니다.

**Q. Apple Intelligence (apfel) 백엔드는 어떻게 됐나요?**
초기 버전(v0.0.1)이 apfel을 백엔드로 썼지만 번역 품질이 SNS 비격식 문장에서 너무 약해 claude CLI로 교체했습니다. 자세한 결정 배경은 위 spec 문서 참조.

**Q. Bluesky DOM 구조가 바뀌면 어떻게 되나요?**
`extension/lib/post-detector.ts` 와 `compose-detector.ts` 의 selector 배열에 새 후보를 추가하면 됩니다. fallback chain으로 구현되어 있어 일부 selector가 깨져도 다른 후보로 동작.

---

## License

[MIT](LICENSE)

## 기여

이슈 / PR 환영: https://github.com/bbrightcode-atlas/bluesky-mac-translator
