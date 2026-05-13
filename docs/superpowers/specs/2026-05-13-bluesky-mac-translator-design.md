# Bluesky Mac Translator — 설계 문서

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-13 |
| 상태 | Draft (브레인스토밍 승인) |
| Repo | `flotter-atlas/bluesky-mac-translator` |
| 대상 플랫폼 | macOS (Apple Silicon, Tahoe 권장), Chrome 데스크탑 |
| 배포 범위 | 내부 전용 (`install.sh` 한 줄 셋업) |

---

## 1. 목표

`https://bsky.app/`에서 각 게시물 아래에 "번역" 링크를 주입하고, 클릭 시 macOS 내장 LLM(apfel)으로 사용자의 대상 언어(기본 한국어 / 일본어 / 중국어)로 번역해 원문 아래에 스트리밍으로 표시한다. 토큰 비용 없이, 외부 네트워크 호출 없이, 사내 팀이 한 번의 설치 명령으로 사용한다.

### 비-목표 (Non-goals)

- Chrome Web Store 공개 배포 (추후 별도 작업)
- macOS 외 플랫폼 지원
- bsky.app 외 사이트 지원
- 사용자별 어휘집/스타일 학습
- 자동 번역 (사용자 클릭 트리거 필수)

---

## 2. 핵심 결정 사항

| 결정 | 선택 | 사유 |
|---|---|---|
| apfel 서버 통제 방식 | **Native Messaging Host (NMH)** | extension이 각 머신의 `apfel --serve` lifecycle을 통제. 내부 멀티 장비 시나리오에서 머신별 독립 관리 가능. |
| 배포 | **내부 GitHub `install.sh`** | Web Store 심사 우회, 빠른 반복. Web Store 승격은 추후. |
| 번역 결과 표시 | **Inline expand + 스트리밍** | apfel 첫 토큰 빠름 (≤1s) → 체감속도 ↑. 원문/번역 동시 노출. |
| 번역 버튼 위치 | **게시물 텍스트 바로 아래 "번역" 텍스트 링크** | Twitter/X 패턴 친숙. bsky action bar와 분리되어 충돌 위험 낮음. |
| 빌드 스택 | **WXT + TypeScript + React (옵션 페이지만)** | MV3 표준화, HMR. content script는 vanilla TS (DOM 격리). |
| NMH 구현 언어 | **Node.js (TypeScript)** | extension과 동일 생태계. `install.sh`로 `brew install node` 충분. |

---

## 3. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│  Chrome (bsky.app 탭)                                            │
│                                                                  │
│  ┌──────────────────────────┐    ┌──────────────────────────┐    │
│  │ Content Script           │    │ Background Service Worker│    │
│  │ (content.ts)             │◄──►│ (background.ts)          │    │
│  │  - DOM observer로 post   │    │  - NMH 연결 관리          │    │
│  │    감지, "번역" 링크 주입 │    │  - chrome.runtime         │    │
│  │  - 클릭 → 번역 요청       │    │    .connectNative()      │    │
│  │  - 스트리밍 토큰 렌더     │    │  - 설정 storage          │    │
│  └──────────────────────────┘    └────────────┬─────────────┘    │
│                                                │ stdin/stdout    │
│  ┌──────────────────────────┐                  │ (NMH protocol)  │
│  │ Options Page (React)     │                  │                 │
│  │  - 언어 선택 (KR/JP/CN)   │                  │                 │
│  │  - 서버 상태/재시작       │                  │                 │
│  └──────────────────────────┘                  │                 │
└─────────────────────────────────────────────────┼─────────────────┘
                                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│  macOS 사용자 머신                                                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │ Native Messaging Host  (Node.js, host/src/index.ts)      │    │
│  │   - 시작 시 localhost:11434 헬스체크                     │    │
│  │   - down이면 `apfel --serve` 자식 프로세스 spawn         │    │
│  │   - 헬스 모니터 (30초 간격), 죽으면 재시작               │    │
│  │   - extension 명령: status / ensure_running / restart    │    │
│  └────────────────────────┬────────────────────────────────┘     │
│                           │ spawn / monitor                       │
│  ┌────────────────────────▼────────────────────────────────┐     │
│  │ apfel --serve  (localhost:11434, OpenAI 호환)            │    │
│  │   POST /v1/chat/completions  (stream: true)              │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                           ▲
                           │ 직접 fetch (CORS 허용)
                           │
        Content Script가 background를 거치지 않고
        localhost:11434로 직접 POST (스트리밍 ReadableStream)
```

**두 갈래 데이터 흐름**:

1. **Lifecycle (NMH 경로)**: Extension ↔ Background ↔ NMH ↔ apfel 서버 spawn/health/restart
2. **Translation (직접 경로)**: Content Script → `fetch('http://127.0.0.1:11434/v1/chat/completions')` → 스트리밍 응답

**분리 사유**:

- 번역 호출은 빈도 높고 스트리밍이라 background를 거치면 message passing 오버헤드 + ReadableStream 직렬화 비용
- 서버 lifecycle은 빈도 낮고 권한 필요해 NMH로 일원화
- apfel `--serve`가 CORS를 허용하므로 content script가 직접 fetch 가능

---

## 4. Native Messaging Host (`host/`)

**책임 한정**: apfel 서버 lifecycle만. 번역 본체는 관여하지 않음.

### 4.1 구성

```
host/
├── src/
│   ├── index.ts          # NMH entrypoint (stdin/stdout 루프)
│   ├── apfel-manager.ts  # apfel --serve spawn/health/restart 로직
│   └── protocol.ts       # NMH 길이 프리픽스 인코딩/디코딩
├── package.json
└── tsconfig.json
```

### 4.2 메시지 프로토콜

```typescript
// extension → host
type Request =
  | { type: 'status' }
  | { type: 'ensure_running' }
  | { type: 'restart' }
  | { type: 'shutdown' };

// host → extension
type Response =
  | { type: 'status', running: boolean, pid?: number, port: number, version?: string }
  | { type: 'started', port: number, pid: number }
  | { type: 'error', code: ErrorCode, message: string };

type ErrorCode =
  | 'apfel_not_installed'
  | 'port_in_use'
  | 'spawn_failed'
  | 'timeout'
  | 'ai_disabled';
```

### 4.3 동작 로직

1. **시작 시** (extension `connectNative` 첫 호출):
   - `GET http://127.0.0.1:11434/v1/models` 헬스체크 (300ms timeout)
   - 응답 OK → `{type:'status', running:true}` 즉시 반환
   - 실패 → `apfel --serve` spawn, stdout/stderr는 `~/Library/Logs/flotter-bsky-translator/apfel.log`로 redirect
   - 5초 polling으로 ready 대기, ready 시 `{type:'started'}`

2. **헬스 모니터** (연결 유지 동안):
   - 30초 간격 `/v1/models` 핑
   - 실패 3회 연속 → 자동 재시작, exponential backoff (1s/5s/30s), 분당 3회 cap

3. **종료 시** (extension disconnect):
   - apfel 프로세스는 그대로 두기 (다음 세션 빠른 시작)
   - 명시적 `shutdown` 요청 시에만 SIGTERM(3초 후 SIGKILL)

4. **apfel 미설치**: `which apfel` 실패 → `{code:'apfel_not_installed'}`

### 4.4 NMH manifest

위치: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.flotter.bsky_translator.json`

```json
{
  "name": "com.flotter.bsky_translator",
  "description": "Bluesky Translator Host (manages apfel server)",
  "path": "/Users/$USER/Library/Application Support/flotter-bsky-translator/host-launcher.sh",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
}
```

`host-launcher.sh`는 `exec /opt/homebrew/bin/node /path/to/host/dist/index.js`. PATH/NODE 환경변수 안정성 위해.

### 4.5 사양 노트

- 단일 사용자 단일 프로세스: `~/Library/Application Support/flotter-bsky-translator/host.pid` 파일로 더블 실행 방지
- 로그: `~/Library/Logs/flotter-bsky-translator/host.log` (rotation 7일/10MB)
- 보안: `allowed_origins`로 다른 extension의 접근 차단

---

## 5. Extension 구조 (WXT)

### 5.1 디렉토리

```
extension/
├── wxt.config.ts
├── package.json
├── tsconfig.json
├── entrypoints/
│   ├── content.ts         # bsky.app 주입 (vanilla TS)
│   ├── background.ts      # service worker (NMH 브릿지)
│   └── options/           # 설정 페이지 (React + shadcn)
│       ├── index.html
│       ├── App.tsx
│       ├── main.tsx
│       └── components/
│           ├── LanguageSelector.tsx
│           └── ServerStatus.tsx
├── lib/
│   ├── translate.ts       # apfel /v1/chat/completions 호출 + SSE 파싱
│   ├── prompts.ts         # 언어별 system prompt
│   ├── nmh-client.ts      # background에서 NMH wrapping
│   ├── storage.ts         # chrome.storage.sync wrapper
│   ├── cache.ts           # 메모리 LRU + chrome.storage.session 캐시
│   ├── post-detector.ts   # bsky.app DOM에서 post 식별
│   └── inject-ui.ts       # 안전한 DOM 구성으로 번역 UI 마운트
├── styles/
│   └── inject.css         # content script가 주입하는 스타일 (Shadow DOM)
└── public/icon/
    ├── 16.png, 32.png, 48.png, 128.png
```

### 5.2 Manifest (WXT가 자동 생성)

```typescript
// wxt.config.ts
export default defineConfig({
  manifest: {
    name: 'Bluesky Translator',
    description: 'Translate Bluesky posts via Apple on-device LLM (apfel)',
    permissions: ['storage', 'nativeMessaging'],
    host_permissions: [
      'https://bsky.app/*',
      'http://127.0.0.1:11434/*',
    ],
    content_scripts: [{
      matches: ['https://bsky.app/*'],
      js: ['content.ts'],
      run_at: 'document_idle',
    }],
    options_ui: { page: 'options/index.html', open_in_tab: true },
    icons: { 16: 'icon/16.png', 32: 'icon/32.png', 48: 'icon/48.png', 128: 'icon/128.png' },
  },
});
```

### 5.3 Entrypoint 책임

**`content.ts`** (vanilla TS, ~150줄 추정)

- `MutationObserver`로 bsky.app DOM 변화 감시
- post element 식별 → 텍스트 영역 아래에 "번역" 링크 + 언어 드롭다운 주입 (Shadow DOM 격리)
- 클릭 시 `lib/translate.ts` 호출 → 스트리밍 토큰을 결과 박스에 append
- React 미사용 (bsky 자체 React 트리에 영향 주지 않기 위해)

**`background.ts`** (~80줄)

- `chrome.runtime.onInstalled` → 최초 설치 시 옵션 페이지 자동 오픈
- `chrome.runtime.onMessage` 라우터: content/options의 NMH 명령 처리
- `chrome.runtime.connectNative('com.flotter.bsky_translator')` lazy 연결
- 짧은 시간 내 중복 status 호출 캐시

**`options/`** (React + shadcn + Tailwind)

- 3개 컴포넌트, 약 200줄
- shadcn/superbuilder-mcp에서 Select, Button, Card, Badge 사용

---

## 6. 번역 흐름

### 6.1 클릭 → 결과 시퀀스

```
사용자                Content Script        Background       NMH         apfel
  │                       │                     │             │            │
  ├──[클릭 "번역"]────────►│                     │             │            │
  │                       ├─[1] check 캐시       │             │            │
  │                       │   hit→즉시 렌더 (종료)│             │            │
  │                       │                     │             │            │
  │                       ├─[2] sendMessage     │             │            │
  │                       │   ensure_running ──►│             │            │
  │                       │                     ├─NMH connect►│            │
  │                       │                     │             ├─GET /models►│
  │                       │                     │             │◄────200────┤
  │                       │                     │◄──{running}─┤            │
  │                       │◄────{ok}────────────┤             │            │
  │                       │                     │             │            │
  │                       ├─[3] POST /v1/chat/completions ──────────────►  │
  │                       │      (stream:true)                              │
  │                       │◄─── SSE chunks (data: {...delta.content:"안"}) ─┤
  │                       │     "안" "녕" "하" "세" "요"                    │
  │                       │                                                 │
  │◄──[토큰 흐름 렌더]─────┤                                                 │
  │                       │                                                 │
  │                       ├─[4] 완료 시 캐시 저장 + "번역 숨기기"로 토글     │
```

[2]는 session 최초 1회만. 이후 background가 NMH 연결을 유지하므로 클릭마다 [3]만 실행.

### 6.2 Prompt 전략

```typescript
// lib/prompts.ts
const SYSTEM_PROMPTS: Record<TargetLang, string> = {
  ko: 'You are a translator. Translate the user\'s text into natural Korean (한국어). Output only the translation, no explanations, no quotes.',
  ja: 'You are a translator. Translate the user\'s text into natural Japanese (日本語). Output only the translation, no explanations, no quotes.',
  zh: 'You are a translator. Translate the user\'s text into natural Simplified Chinese (简体中文). Output only the translation, no explanations, no quotes.',
};

function buildRequest(text: string, lang: TargetLang) {
  return {
    model: 'apple-on-device',
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[lang] },
      { role: 'user', content: text },
    ],
    stream: true,
    temperature: 0.2,
  };
}
```

### 6.3 SSE 파싱

```typescript
// lib/translate.ts
export async function* translateStream(text: string, lang: TargetLang, signal: AbortSignal) {
  const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildRequest(text, lang)),
    signal,
  });
  if (!res.ok || !res.body) throw new TranslateError(res.status);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') return;
      try {
        const delta = JSON.parse(data).choices?.[0]?.delta?.content;
        if (delta) yield delta as string;
      } catch { /* skip malformed */ }
    }
  }
}
```

Content script 측 — 토큰은 항상 안전한 텍스트 노드 API로만 append:

```typescript
const abort = new AbortController();
let acc = '';
for await (const chunk of translateStream(postText, settings.lang, abort.signal)) {
  acc += chunk;
  resultEl.textContent = acc;  // 텍스트 노드로 안전 렌더
}
cache.set(cacheKey(postText, settings.lang), acc);
```

### 6.4 캐시 키

`SHA1(text) + ':' + lang` → 메모리 LRU(200건) + `chrome.storage.session` (브라우저 세션 동안). persistent 캐시는 안 함.

---

## 7. bsky.app DOM 주입 전략

### 7.1 Post 식별: `data-testid` 우선

- `data-testid^="feedItem-by-"` → 피드 post 컨테이너
- `data-testid^="postThreadItem-by-"` → thread view post
- 텍스트: `[data-testid="postText"]` (없을 시 fallback)

selectors는 `lib/post-detector.ts`에 상수로 모아두어 bsky 업데이트 시 한 곳만 교체.

### 7.2 주입: Shadow DOM + XSS-safe DOM API

**원칙**: 사용자 입력(post text, 번역 결과)이 흐르는 경로는 물론, UI shell 전체에서도 HTML 문자열을 파싱해 DOM에 주입하는 API를 쓰지 않는다. 일관성과 감사 단순성을 위해 `createElement` + `textContent`만 사용.

```typescript
// lib/inject-ui.ts
import { LANG_OPTIONS } from './prompts';
import injectedCss from '../styles/inject.css?raw';

export function mountTranslatorUI(postEl: HTMLElement): TranslatorHandle {
  const host = document.createElement('div');
  host.className = 'flotter-translator-host';

  const shadow = host.attachShadow({ mode: 'open' });

  // 스타일: <style> 노드를 만들고 textContent로 CSS 문자열 주입
  // (CSS는 빌드 시 import한 정적 문자열, 사용자 입력 아님)
  const style = document.createElement('style');
  style.textContent = injectedCss;
  shadow.appendChild(style);

  // 트리거 행
  const row = document.createElement('div');
  row.className = 'row';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'trigger';
  trigger.textContent = '번역';

  const lang = document.createElement('select');
  lang.className = 'lang';
  for (const opt of LANG_OPTIONS) {            // 정적 const: [{ value, label }]
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    lang.appendChild(optionEl);
  }

  row.appendChild(trigger);
  row.appendChild(lang);

  // 결과 박스
  const result = document.createElement('div');
  result.className = 'result';
  result.hidden = true;
  // 번역 토큰은 result.textContent = acc 로만 갱신

  shadow.appendChild(row);
  shadow.appendChild(result);

  postEl.querySelector('[data-testid="postText"]')?.after(host);

  return { host, trigger, lang, result };
}
```

**Shadow DOM 사용 이유**:

- bsky CSS와 완전 격리 (테마 변경/리렌더 무관)
- 우리 CSS가 bsky를 깨뜨릴 위험 0
- bsky의 클래스 변경에도 영향 없음

**XSS 안전성 보장**:

- 모든 UI 노드는 `createElement` + 정적 문자열 또는 `textContent`로 구성
- post 본문/번역 결과 등 외부 텍스트는 항상 `textContent`로만 주입
- HTML 문자열을 그대로 파싱해서 DOM에 붙이는 패턴은 일절 사용 금지 (자세한 lint 규칙은 §7.6)
- 동적 코드 실행 패턴(평가/스트링→함수/스트링→타이머)도 금지 (§7.6)
- CSP를 위해 인라인 style attribute 사용 회피, CSS 변수는 element의 `style.setProperty(...)` API로 설정

### 7.3 스타일

bsky 폰트/색상 토큰을 `getComputedStyle`로 읽어와 shadow CSS variable에 주입. 다크/라이트 자동 매칭.

```css
.trigger {
  background: transparent;
  color: var(--bsky-link, #1185fe);
  font: inherit;
  cursor: pointer;
  padding: 4px 0;
}
.result {
  margin-top: 6px;
  padding: 8px 10px;
  background: var(--bsky-secondary-bg, rgba(0,0,0,0.04));
  border-radius: 8px;
  font-size: 0.95em;
  line-height: 1.5;
  white-space: pre-wrap;
}
```

색상 토큰 주입은 element의 `style.setProperty('--bsky-link', value)` API로 (문자열 CSS 조립 금지).

### 7.4 라이프사이클

1. **초기 스캔**: `document.querySelectorAll(POST_SELECTORS)` → 화면 내 모든 post에 주입
2. **MutationObserver**: `document.body`에 `childList:true, subtree:true`, `requestIdleCallback`으로 throttle
3. **중복 방지**: `data-translator-injected` 마킹
4. **언마운트**: bsky가 post 제거 시 shadow host도 함께 사라짐
5. **AbortController per-post**: post 사라질 때 in-flight fetch도 abort

### 7.5 성능 가드

- MutationObserver 콜백 `requestIdleCallback` throttle
- 한 번에 처리하는 post 수 16개 batch
- `data-translator-injected` 마킹으로 중복 처리 방지

### 7.6 보안 lint 규칙 (빌드 차단)

`extension/biome.json` 또는 `.eslintrc`에 다음 카테고리를 강제 — 각 규칙은 lint 패키지/룰 ID로만 적용하고, 코드/문서 본문에는 금지 API 리터럴 자체도 가급적 등장시키지 않는다.

- **HTML 문자열을 DOM으로 파싱하는 setter/메서드 일체 금지**
  - 대표 추천 룰: `eslint-plugin-no-unsanitized/no-unsanitized` (`property` + `method` 둘 다)
  - Biome 기준: `lint/security/noDangerouslySetInnerHtml`, `lint/security/noDangerouslySetInnerHtmlWithChildren`, 그리고 위 카테고리에 해당하는 노드 setter 호출에 대한 커스텀 룰
- **동적 코드 실행 금지**
  - 추천 룰: `no-eval`, `no-implied-eval`, `no-new-func` (eslint 기본), Biome의 `lint/security/noGlobalEval`
- **`no-restricted-syntax` 또는 `no-restricted-properties`로 위 카테고리에 해당하는 식별자 사용을 추가로 봉인**
- **정적 분석 도구를 PR 게이트로 포함**
- **CI에서 lint 실패 시 빌드 중단**

코드 리뷰 시에도 위 카테고리 API 사용은 자동 reject 사유. 정적 자산(CSS 문자열, 빌드타임 import) 외에는 `textContent` 외의 텍스트 주입을 허용하지 않는다.

---

## 8. 설정 & 동작

### 8.1 Settings (chrome.storage.sync)

```typescript
type Settings = {
  targetLang: 'ko' | 'ja' | 'zh';       // 기본 'ko'
  apfelEndpoint: string;                // 기본 'http://127.0.0.1:11434'
  showLanguagePicker: boolean;          // post 옆 ▾ 표시, 기본 true
  autoRestartServer: boolean;           // NMH 자동 재시작, 기본 true
};
```

스트리밍 on/off, 캐시 size, temperature 등은 노출하지 않음 (지원 부담 vs 사용자 가치 비율).

### 8.2 Options 페이지 (스케치)

```
┌─────────────────────────────────────────────┐
│ Bluesky Translator                          │
├─────────────────────────────────────────────┤
│ ⚙ Settings                                  │
│                                             │
│ 번역 대상 언어                                │
│ [한국어 ▾]                                   │
│   ○ 한국어   ○ 日本語   ○ 中文              │
│                                             │
│ 게시물별 언어 선택 표시                       │
│ [✓] 게시물 옆에 ▾ 드롭다운 표시              │
│                                             │
│ apfel 엔드포인트                             │
│ [http://127.0.0.1:11434]   [기본값으로]      │
│                                             │
├─────────────────────────────────────────────┤
│ 🟢 Server status                            │
│  apfel 서버: 실행 중 (PID 31204, port 11434) │
│  apfel 버전: 1.3.3                          │
│  [재시작] [종료]                             │
└─────────────────────────────────────────────┘
```

Server status는 NMH `{type:'status'}`를 3초 polling.

### 8.3 게시물 옆 언어 드롭다운

기본 언어와 별개로 **게시물별 임시 선택** (▾). 드롭다운 변경 시 현재 결과 폐기, 새 언어 재요청. `showLanguagePicker: false`면 ▾ 숨김.

### 8.4 Auto-detect & skip

MVP에서 안 함. bsky 글이 짧고 코드/이모지/멘션 섞여 휴리스틱 신뢰도 낮음. apfel은 source 자동 감지, 같은 언어로 요청해도 거의 무해.

### 8.5 동시성

- post당 in-flight 1개 (재클릭 시 기존 abort)
- 전체 동시 요청 4개 cap (4개 초과 시 queue)

---

## 9. 에러 처리

| # | 실패 모드 | 감지 | UX | 복구 |
|---|---|---|---|---|
| 1 | apfel 미설치 | NMH: `which apfel` 실패 | "apfel이 설치되지 않았습니다. 설정 열기" | 옵션에서 `brew install apfel` 안내 |
| 2 | NMH 미등록 | `connectNative` 즉시 disconnect | "Native host 미설치. `install.sh` 재실행" | install.sh 재실행 |
| 3 | 포트 응답 없음 | fetch 2초 timeout | "apfel 서버 시작 중..." → NMH `ensure_running` (최대 5초) | NMH 자동 spawn |
| 4 | spawn 실패 | EADDRINUSE / non-zero exit | "apfel 시작 실패: [에러]" | 옵션에서 `[재시작]` |
| 5 | Apple Intelligence 비활성 | apfel stderr 파싱 → `code:'ai_disabled'` | "macOS 설정 → Apple Intelligence 활성화 필요" | 사용자 수동 |
| 6 | 번역 도중 서버 죽음 | SSE error / 연결 끊김 | "번역이 중단되었습니다. [다시 시도]" | NMH 헬스모니터가 재시작; 사용자 재시도 |
| 7 | 응답 500 | `res.ok` false | "번역 실패 — [메시지]. [다시 시도]" | 사용자 재시도 |
| 8 | 첫 토큰 10s 무응답 | client timeout | "응답 지연 중... [취소]" | AbortController로 fetch 취소 |
| 9 | 빈 텍스트 post | postText 빈 문자열 | "번역" 링크 주입 안 함 | — |
| 10 | 너무 긴 텍스트 | apfel 자체 에러 | "글이 너무 깁니다" | bsky 300자 제한이라 사실상 발생 안 함 |
| 11 | content script 주입 실패 | post 0개 30초 경과 | console.warn | fallback selector 자동 시도 |

### 9.1 에러 UI 원칙

- 결과 박스 안에서 처리, 토스트/모달 안 씀
- 모든 에러 메시지는 `textContent`로만 렌더
- 모든 에러는 **재시도** 또는 **설정 열기** 링크 제공
- 사용자 액션이 필요한 에러(1, 2, 5)만 옵션 페이지로 유도

### 9.2 로깅

- Extension: `console.error` + `chrome.storage.local` ring buffer (50건). 옵션에 "디버그 로그 보기"
- NMH: `~/Library/Logs/flotter-bsky-translator/host.log` (rotation 7일)
- apfel: `~/Library/Logs/flotter-bsky-translator/apfel.log`

### 9.3 실패 격리

- per-post AbortController + try/catch로 한 post 실패가 다른 post에 영향 없음
- NMH 일시 중단 시 캐시된 번역은 계속 노출

---

## 10. Repo 구조 & 설치

### 10.1 Repo: `flotter-atlas/bluesky-mac-translator`

```
bluesky-mac-translator/
├── README.md
├── install.sh
├── uninstall.sh
├── package.json                # workspace root
├── pnpm-workspace.yaml         # or npm workspaces
│
├── extension/                  # WXT 익스텐션
├── host/                       # Node.js NMH
│
├── scripts/
│   ├── install-host-manifest.sh
│   ├── detect-extension-id.sh
│   └── doctor.sh
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── TROUBLESHOOTING.md
│   └── superpowers/specs/      # 본 문서
│
└── .github/workflows/ci.yml
```

### 10.2 사용자 머신 설치 위치

```
~/Library/Application Support/flotter-bsky-translator/
├── host/                        # 빌드된 NMH (node dist)
├── extension/                   # 빌드된 unpacked extension
├── host-launcher.sh
└── version

~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
└── com.flotter.bsky_translator.json

~/Library/Logs/flotter-bsky-translator/
├── host.log
└── apfel.log
```

### 10.3 install.sh 흐름

```
1/7  사전 점검 (macOS, Apple Silicon, Tahoe 권장)
2/7  의존성 설치 (brew install apfel node)
3/7  repo clone/update → $INSTALL_DIR/src
4/7  빌드 (npm ci, host/extension build, dist 복사)
5/7  host-launcher.sh 작성 + chmod +x
6/7  Extension ID 획득 + NMH manifest 작성
       - 사용자가 chrome://extensions에 unpacked 로드 → ID 표시 → 스크립트에 paste
7/7  scripts/doctor.sh 검증 → "https://bsky.app/ 새로고침하세요"
```

### 10.4 한 줄 설치

```bash
curl -fsSL https://raw.githubusercontent.com/flotter-atlas/bluesky-mac-translator/main/install.sh | bash
```

내부 신뢰 환경이라 `curl | bash` 허용. 외부 공개로 가면 `git clone` 권장.

### 10.5 업데이트

`install.sh` 재실행 = git pull + 재빌드. Chrome에서 extension "새로고침" 버튼.

### 10.6 Uninstall

`uninstall.sh`:
- NMH manifest 삭제
- apfel 프로세스 종료
- 설치 디렉토리 정리
- `brew uninstall apfel`은 prompt로 선택

---

## 11. 테스트 전략

### 11.1 자동 테스트 (CI)

| 레이어 | 도구 | 대상 |
|---|---|---|
| 타입 체크 | `tsc --noEmit` | extension + host |
| Lint | `biome` 또는 `eslint` | 전체 (§7.6 보안 규칙 포함) |
| Unit | Vitest | `translate.ts` SSE 파싱, `cache.ts`, `prompts.ts`, `protocol.ts` round-trip, `apfel-manager.ts` health (mock), `inject-ui.ts` DOM 구성 |

### 11.2 통합 (로컬 수동, CI 제외)

- `scripts/doctor.sh` — install.sh 끝에 자동 실행
- `npm run -w host test:integration` — 로컬 apfel 켜놓고 NMH spawn/health/restart 확인

### 11.3 Smoke 체크리스트 (`docs/SMOKE.md`)

릴리스 전 5분 코스:

1. fresh 머신에 `install.sh` 실행 → 모든 단계 OK
2. Chrome unpacked 로드 → 옵션 페이지 자동 오픈
3. bsky.app → 피드 첫 5개 post 아래 "번역" 링크
4. 클릭 → 1초 이내 첫 토큰 스트리밍
5. 재클릭 → 캐시 hit, 즉시 표시
6. 언어 변경 (옵션 / 게시물별) 동작 확인
7. `pkill apfel` → 다음 클릭 시 자동 재시작
8. extension reload → 정상 복귀
9. extension 비활성화 → 주입 링크 사라짐
10. XSS 시도: post 본문에 HTML/스크립트 페이로드를 텍스트로 작성 → 번역 박스에 텍스트로만 표시되고 실행되지 않음

### 11.4 CI (`.github/workflows/ci.yml`)

`macos-latest`에서 typecheck/lint/test/build. apfel은 CI에 설치하지 않음 (Apple Intelligence 필요).

### 11.5 디버깅

- Extension: `chrome://extensions` → "서비스 워커 검사", content script는 bsky DevTools console
- NMH: 옵션의 "디버그 로그 보기" + `tail -f ~/Library/Logs/flotter-bsky-translator/host.log`
- apfel: `tail -f ~/Library/Logs/flotter-bsky-translator/apfel.log`

---

## 12. 미해결/추후 작업 (Out of MVP)

- Chrome Web Store 패키징 + `.pkg` 형태 NMH 설치 (외부 공개 시)
- 게시물 외 영역 (DM, 알림, 프로필 bio) 번역
- 자동 언어 감지 + skip-if-same-as-target
- 회사 공유 서버 (Mac mini) 모드 — `apfelEndpoint` 설정만 변경하면 동작하나 인증/TLS 강화 필요
- 사용자별 번역 어휘집/스타일 메모리
- Firefox/Edge 지원 (WXT 자체는 지원, manifest만 분기)
