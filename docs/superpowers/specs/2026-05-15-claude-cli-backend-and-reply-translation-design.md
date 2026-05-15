# Spec: Claude CLI 백엔드 + 답글 작성 번역

- **Date**: 2026-05-15
- **Status**: Approved (브레인스토밍 합의 완료, 구현 대기)
- **Supersedes** (부분): `2026-05-13-bluesky-mac-translator-design.md` 의 apfel HTTP 백엔드 가정

## 1. Problem / Motivation

현재 확장은 apfel(Apple on-device FoundationModel, OpenAI-compatible HTTP)로 번역한다. 실제 SNS 비격식 문장에서 번역이 "한국어이긴 한데 이해가 어렵다" 수준이라 모델 자체의 한계가 명백하다. 동시에 외국어 포스트에 한국어로 답글을 쓰고 싶을 때 번역 기능이 없다.

이 스펙은 두 가지를 한 릴리스에 묶는다:
- **A. 번역 품질**: apfel 백엔드를 완전히 걷어내고 `claude` CLI로 교체한다. NMH host가 요청마다 `claude -p` 자식 프로세스를 spawn한다.
- **B. 답글 작성 번역**: Bluesky의 답글 작성 박스에 "번역" 버튼을 더해, 작성 완료 후 클릭하면 **원 포스트의 언어**로 번역한 결과를 **compose 박스 아래 미리보기**로 보여 준다 (compose 텍스트는 건드리지 않는다).

## 2. Scope

### In scope
- apfel 관련 코드/설정/문서 전부 제거 (백엔드, ensure_running, doctor.sh 점검 항목, 옵션 페이지 endpoint 편집기, settings 필드).
- host가 `claude -p <prompt> --output-format stream-json` 을 요청당 1회 spawn하고 NDJSON 라인을 NMH chunk 메시지로 stream.
- 캐시를 background로 이동 (탭 간 공유).
- 답글 작성 박스 detector + 미리보기 UI.
- 답글일 때만 번역 UI 노출 (새 글 작성에는 노출하지 않음).
- 옵션 페이지를 claude CLI 진단(`which claude`, `claude --version`)으로 교체.
- 단위 테스트 갱신 (apfel 관련 삭제, 신규 모듈 테스트 추가).
- README / install.sh / uninstall.sh / doctor.sh 갱신.

### Out of scope
- 새 글 작성(답글이 아닌) 번역. 답글 시나리오만.
- 작성 중 자동 번역 (디바운스 등). 명시적 "번역" 클릭만.
- 번역문으로 compose 텍스트 자동 교체. 사용자가 직접 복사·붙여넣기.
- 인라인 언어 셀렉터. 게시글 번역의 대상 언어는 옵션 페이지에서 한 번 고른다. 답글 번역은 원 포스트 언어로 자동.
- 다중 백엔드 선택 (apfel/claude 토글). claude만.
- claude CLI 자동 설치/로그인. 미설치/미로그인 시 친절한 안내만.

## 3. Architecture

```
bsky.app tab
┌─────────────────────────────────────────────┐
│ content script                              │
│  · post-detector       (기존)               │
│  · compose-detector    (신규)               │
│  · inject-ui           (post용, 기존)       │
│  · inject-reply-ui     (compose용, 신규)    │
└──────────────────┬──────────────────────────┘
                   │ chrome.runtime.sendMessage
                   │ { kind: 'translate', mode, payload }
                   ▼
        ┌──────────────────────────────┐
        │ background (service worker)   │
        │  · NMH 호출 직렬화 (기존)      │
        │  · LRU cache (탭 간 공유)      │
        │  · sender 탭으로 chunk relay  │
        └──────────────┬────────────────┘
                       │ chrome.runtime.connectNative
                       ▼ stdio (length-prefixed JSON)
        ┌──────────────────────────────┐
        │ NMH host (host/dist/index.js) │
        │  · 요청당 child_process.spawn │
        │     `claude -p <prompt>       │
        │        --output-format        │
        │        stream-json`           │
        │  · NDJSON line → chunk msg    │
        │  · child exit/err → done/err  │
        └──────────────┬────────────────┘
                       ▼
              claude CLI
              (사용자 머신에 이미 로그인됨)
```

**핵심 변경 vs 현재**:
- `lib/translate.ts` (HTTP fetch) 삭제. translate 경로는 background NMH 단일 채널.
- `host/src/index.ts` 가 apfel HTTP 서버 spawn/lifecycle 대신 요청당 `claude` spawn.
- `lib/prompts.ts` 가 두 모드(post/reply) 프롬프트 분기.
- `lib/storage.ts` 에서 `apfelEndpoint`, `autoRestartServer` 제거. `targetLang` 만 남는다.

## 4. Components

### 신규
- **`lib/compose-detector.ts`** — 페이지에서 compose 박스(`[data-testid="composerTextInput"]`, 또는 `[role="textbox"][contenteditable="true"]` fallback) 와 그 위쪽 quoted post 영역을 찾는다. 반환: `{ composeEl, originalPostEl } | null`. originalPost 없으면 reply가 아니므로 `null` 반환 (= 마운트 안 함).
- **`lib/inject-reply-ui.ts`** — composeEl 옆에 Shadow DOM host 마운트. `host.addEventListener('click'/'pointerdown'/'mousedown', stopPropagation)` 으로 버블링 차단. UI: "번역" 트리거 버튼 + 결과 미리보기 박스. `TranslatorHandle` 과 유사한 인터페이스 (`trigger`, `result`, `show/hide/reset/appendChunk/showError/destroy`).

### 변경
- **`host/src/index.ts`** — apfel HTTP 서버 spawn / port probe / ensure_running 로직을 모두 제거. 새 책임: NMH `Request` 수신 → `child_process.spawn('claude', ['-p', prompt, '--output-format', 'stream-json'])` → stdout NDJSON 라인 파싱 → 각 chunk(`{type:'assistant', message:{content:[{type:'text', text:...}]}}` 형식의 text delta) 를 NMH `{type:'chunk', text:string}` 메시지로 전송 → child exit 시 `{type:'done'}`. stderr / non-zero exit → `{type:'error', message, code}`. 동시에 한 child만 (background에서 직렬화하므로 host 안에서도 1-in-flight assertion).
- **`host/src/types.ts`** — `Request` 와 `Response` 타입을 §5의 프로토콜대로.
- **`entrypoints/background.ts`** — `kind:'translate'` 분기 추가. cache hit이면 sender에게 일괄 응답, miss면 NMH로 위임하면서 chunk를 sender 탭으로 relay (chrome.runtime port 또는 sendMessage 반복). 완성 시 cache.set. 기존 `kind:'nmh'`/`kind:'ensure_ready'` 는 제거.
- **`lib/prompts.ts`** — 두 함수: `buildPostPrompt(text, targetLang): string` + `buildReplyPrompt({originalPost, reply}): string`. 시스템 지시 포함: "Output only the translation. No prefix, no quotes, no explanation. Preserve @mentions, URLs, hashtags, emoji verbatim. Match casual SNS tone." reply 프롬프트는 추가로 "Translate the reply into the same language as the original post above." host 와 extension 이 독립 빌드라 같은 문자열을 host 쪽에서도 별도로 갖는다(`host/src/index.ts` 안에 동일 구현). 두 사본은 plan의 코드 블록을 단일 출처로 본다.
- **`lib/storage.ts`** — `Settings` 에서 `apfelEndpoint`, `autoRestartServer` 삭제. `targetLang` 만 유지. `isLocalEndpoint` 도 삭제.
- **`entrypoints/options/App.tsx`** — `EndpointEditor`, `AutoRestartToggle`, `ServerStatus` 제거. 새 `ClaudeStatus` 카드 (NMH로 host에 `{type:'diagnose'}` 보내면 host가 `which claude` / `claude --version` 결과를 반환). 안내문도 brew → claude 로그인으로.
- **`entrypoints/content.ts`** — post 스캔 외에 compose 스캔도 MutationObserver 같은 tick에서 수행. translate 호출을 `chrome.runtime.sendMessage` 단일 경로로.

### 삭제
- `lib/translate.ts`, `lib/translate.test.ts`
- `lib/nmh-client-content.ts` (background-only 경로로 통합. content 는 sendMessage만 씀)
- `entrypoints/options/components/EndpointEditor.tsx`, `AutoRestartToggle.tsx`, `ServerStatus.tsx` 및 관련 테스트
- `host/src/` 의 apfel 관련 모듈(있다면 ensure_running, port-probe 등)
- `install.sh` / `doctor.sh` 의 apfel 점검 분기 (claude 점검으로 교체)

### 그대로
- `lib/post-detector.ts`, `lib/inject-ui.ts` (post용), `lib/cache.ts`, `lib/concurrency.ts`, `lib/theme.ts`

## 5. Data Flow + NMH Protocol

### Protocol

**Request** (background → host, 단일 메시지):
```ts
type Request =
  | { type: 'translate'; mode: 'post';  text: string;  targetLang: 'ko'|'ja'|'zh' }
  | { type: 'translate'; mode: 'reply'; originalPost: string; reply: string }
  | { type: 'diagnose' };
```

**Response** (host → background, port.postMessage 다중):
```ts
type Response =
  | { type: 'chunk'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string; code?: 'claude_not_found'|'claude_auth'|'claude_failed' }
  | { type: 'diagnose_result'; claudePath: string|null; version: string|null; loggedIn: boolean };
```

다중 메시지 스트리밍을 위해 `connectNative` 의 port를 background에서 한 요청 동안 유지한다 (`done` 또는 `error` 수신 후 close).

### Flow 1 — Post 번역

1. content: 새 post 발견 → `mountTranslatorUI(post)`.
2. 사용자: "번역" 클릭.
3. content → background: `sendMessage({kind:'translate', mode:'post', text, targetLang})` (실제 응답은 별도 port 또는 다회 sendMessage; 4번 참조).
4. background:
   - `cacheKey = sha256(JSON.stringify({mode:'post', text, targetLang}))`.
   - cache hit → sender에 일괄 `{chunk, text:cached}` + `{done}` 한 번에.
   - miss → host로 port 열고 `{type:'translate', mode:'post', text, targetLang}` 전송. 받는 chunk를 sender 탭으로 relay.
5. host:
   - `spawn('claude', ['-p', buildPostPrompt(text,targetLang), '--output-format','stream-json'])`.
   - stdout NDJSON 라인마다 텍스트 delta 추출 → `postMessage({type:'chunk', text:delta})`.
   - child exit 0 → `postMessage({type:'done'})`. exit ≠ 0 또는 stderr 시 §6 매핑으로 `{type:'error', ...}`.
6. background: `done` 수신 시 누적 텍스트를 cache.set, port close.

### Flow 2 — Reply 번역

1. content: MutationObserver tick에서 `compose-detector` 가 `(composeEl, originalPostEl)` 발견 → `mountReplyUI(composeEl, originalPostEl)`. originalPost 없으면 마운트 안 함.
2. 사용자: 한국어로 답글 작성 → "번역" 클릭.
3. content:
   - `reply = composeEl.textContent.trim()` (`contenteditable` 이라 textContent 사용).
   - `originalPost = extractPostText(originalPostEl)`.
   - 비어 있으면 인라인 "내용을 먼저 작성하세요" 표시 후 return.
   - sendMessage `{kind:'translate', mode:'reply', originalPost, reply}`.
4. background → host (Flow 1과 동일).
5. host: `spawn('claude', ['-p', buildReplyPrompt({originalPost, reply}), '--output-format','stream-json'])`.
6. content: 미리보기 박스에 chunk 누적. compose textarea는 **건드리지 않는다**.

### Edge cases
- 같은 reply UI에서 재클릭 (텍스트 변경 후) → 새 cacheKey, 재요청. in-flight 있으면 `AbortController.abort()` 로 취소.
- compose가 페이지에서 사라짐 (MutationObserver tick) → reply UI destroy, in-flight abort.
- 사용자가 미리보기를 다시 닫음 → `hide()` 만. 다음 클릭 시 cache hit으로 즉시 복귀.
- post UI와 reply UI가 같은 페이지에 동시에 있음 → background 캐시는 mode가 키에 포함되므로 충돌 없음.

### 캐시 정책
- 위치: **background** (탭 간 공유). content 쪽 LruCache 제거.
- 키: payload 의 SHA-256.
- 크기: LRU 200 entries.
- TTL: 없음. 새로 service worker가 깨어나면 빈 캐시로 시작 (휘발성 수용).

## 6. Error Handling

| 발생 위치 | 단서 | 코드 | UI 메시지 | 사용자 액션 |
|---|---|---|---|---|
| `connectNative` (host 못 찾음) | `chrome.runtime.lastError.message === 'Specified native messaging host not found.'` | (background에서 매핑) | "NMH가 설치되어 있지 않습니다. 옵션 페이지에서 설치 안내를 확인하세요." | 옵션 페이지 열기 버튼 |
| `connectNative` forbidden | `lastError`에 `forbidden` | 같음 | "이 확장의 ID가 NMH manifest에 허용되지 않습니다. 옵션 페이지 참고." | 옵션 페이지 열기 |
| Host crash / disconnect | onDisconnect 즉시 발생 | `claude_failed` | "호스트가 종료되었습니다. 다시 시도하세요." | retry |
| `claude` 미설치 | `spawn` ENOENT | `claude_not_found` | "claude CLI가 설치되어 있지 않습니다. `npm i -g @anthropic-ai/claude-code` 후 다시 시도하세요." | retry |
| `claude` 인증 실패 | child exit + stderr에 `not logged in` / `authentication` | `claude_auth` | "claude 로그인이 필요합니다. 터미널에서 `claude login` 후 다시 시도하세요." | retry |
| 기타 child fail | exit ≠ 0, 또는 30초 timeout | `claude_failed` | host가 받은 stderr 앞 200자 그대로 + retry. | retry |
| compose 비어 있음 (reply only) | content가 사전 차단 | — | 인라인 hint: "내용을 먼저 작성하세요." | — |
| 사용자 취소 | UI 숨김 또는 페이지 이동 | — | AbortController.abort() → background는 host port close → host는 child에 SIGTERM. | — |

옵션 페이지의 **ClaudeStatus** 카드가 같은 분류를 사전에 노출한다 (which / version / login status).

## 7. Testing

### vitest + happy-dom (extension 쪽)
- **`lib/compose-detector.test.ts`** (신규) — fixture DOM 3종: reply with quoted post / new post (no quote) / no compose. 각각의 반환값.
- **`lib/inject-reply-ui.test.ts`** (신규) — mount, host click stopPropagation, trigger click 동작, appendChunk 누적, reset, showError, destroy.
- **`lib/prompts.test.ts`** (신규) — `buildPostPrompt` / `buildReplyPrompt` snapshot. 멘션/URL/이모지 포함 케이스.
- **`entrypoints/background.test.ts`** (신규) — `chrome.runtime.onMessage` mock. kind:'translate' dispatch, cache hit 즉시 응답, miss는 NMH port relay 호출 확인.

### vitest (host 쪽)
- **`host/src/claude-spawn.test.ts`** (신규) — `child_process.spawn` mock. 정상 stream-json NDJSON 시퀀스 입력 → 기대 `chunk`/`done` 메시지 시퀀스 출력. ENOENT → code `claude_not_found`. stderr `not logged in` + exit ≠ 0 → code `claude_auth`. 일반 stderr → code `claude_failed`.

### 삭제될 테스트
- `lib/translate.test.ts`
- (옵션 페이지 컴포넌트 단위 테스트는 현재 없음. 컴포넌트 자체만 삭제됨.)

### Manual smoke (README 체크리스트에 반영)
1. 외국어 post에 "번역" → 한국어 미리보기 스트리밍 정상.
2. 외국인 post에 한국어 답글 작성 → "번역" → compose 아래 원어 번역 표시. compose 텍스트 그대로.
3. `claude logout` 후 재시도 → `claude_auth` 안내.
4. PATH에서 claude 숨김 (`PATH=/usr/bin` 등) 후 재시도 → `claude_not_found` 안내.

## 8. Migration / Cleanup

apfel 제거 작업 (한 PR 안에서):
1. `pnpm` workspace 의 host 소스에서 apfel spawn/HTTP 모듈 삭제.
2. `lib/translate.ts`, `lib/nmh-client-content.ts` 삭제. import 사이트 정리.
3. `lib/storage.ts` 의 `apfelEndpoint`, `autoRestartServer` 삭제. chrome.storage.sync 에 남은 키는 무시 (다음에 user가 옵션 페이지 열면 자동으로 default로 수렴).
4. 옵션 페이지에서 endpoint 편집기, 자동 재시작 토글, ServerStatus 카드 제거.
5. `install.sh`: apfel `brew install` 단계 → claude CLI 존재 확인으로 교체. NMH manifest는 그대로 (host launcher 경로/내용은 동일 — claude 가 PATH 어디에 있는지는 launcher가 그때그때 찾음).
6. `uninstall.sh`: apfel 제거 안 함 (사용자 환경 변경 최소화). NMH manifest + dist만 제거.
7. `scripts/doctor.sh`: apfel 점검 라인 → claude 점검으로 교체.
8. `README.md`: 백엔드 설명 갱신, 답글 번역 사용법 추가.

## 9. Open Questions

- **claude `--output-format stream-json` 의 정확한 NDJSON 스키마**: 구현 단계에서 한 번 실측해서 host 파서를 짜고 fixture로 박는다. SDK 문서 또는 `claude -p --output-format stream-json hi` 출력 캡처. host 단위 테스트 fixture로 안정화.
- **답글 compose의 정확한 selector**: Bluesky 가 `[data-testid="composerTextInput"]` 을 안정적으로 노출하는지, 또는 dynamic role=textbox + contenteditable=true 가 더 견고한지 — 구현 시 실제 페이지에서 확인하고 양쪽 fallback 으로 둔다.
- **인용 포스트 영역의 정확한 DOM**: compose 모달이 reply일 때 위에 띄우는 quote 영역도 selector 실측 필요. extractPostText 가 그대로 동작하면 best.
