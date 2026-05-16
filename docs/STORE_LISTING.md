---
title: Chrome Web Store Listing Copy
---

# Chrome Web Store Listing Copy

Chrome Web Store Developer Dashboard 의 각 필드에 그대로 붙여넣기 가능. 한/영 두 버전.

---

## Basic info

| 필드 | 값 |
|---|---|
| **Item name** | `Bluesky Translator` |
| **Visibility** | Public |
| **Category** | Productivity |
| **Language** | Korean (primary), English |
| **Pricing** | Free |

---

## Short description (English, 132자 이내)

```
Translate Bluesky posts & replies and Buffer compose/comments via your local Claude CLI. macOS, no API key in extension.
```

(125 chars)

## Short description (Korean, 132자 이내)

```
Bluesky 게시물·답글과 Buffer compose·댓글을 로컬 claude CLI로 번역합니다. macOS 전용, 확장에 API key 저장 없음.
```

(76 chars)

---

## Detailed description (English)

```
Bluesky Translator
==================

Translate posts and reply drafts on Bluesky (bsky.app) and Buffer (publish.buffer.com)
using your local Claude CLI. No API key is stored in the extension.

Features
--------

Bluesky
* Inline streaming translation on post bodies (replaces Bluesky's default
  Google Translate redirect with a one-click inline result).
* Reply composer: translate your Korean draft into the original post's
  language, preview, and apply with one click.
* New-post composer: same compose-direction translation, target language
  configurable.

Buffer
* Create Post composer: translate your draft into a chosen foreign language.
* Community comment threads: read foreign comments in your language, and
  translate your reply draft into the parent comment's language.

How it works
------------

The extension communicates with a local Native Messaging Host (NMH) you
install once via the project's install.sh script. The NMH spawns
`claude -p ... --bare --output-format stream-json` per request and streams
chunks back. The API call is performed by your machine's Claude CLI under
your own Anthropic account credentials — the extension never sees them.

Requirements
------------

* macOS
* Claude Code CLI installed and logged in:
    npm i -g @anthropic-ai/claude-code
    claude login
* Chrome

Installation
------------

Full instructions and install.sh script:
https://github.com/bbrightcode-atlas/bluesky-mac-translator

Privacy
-------

* No analytics, ads, or tracking.
* The extension itself collects no data.
* Post/reply text is sent to Anthropic only when you explicitly click Translate.
* Privacy Policy:
  https://bbrightcode-atlas.github.io/bluesky-mac-translator/PRIVACY
```

## Detailed description (Korean)

```
Bluesky Translator
==================

Bluesky (bsky.app) 와 Buffer (publish.buffer.com) 에서 사용자 머신의 claude
CLI를 통해 번역하는 Chrome 확장입니다. API key는 확장에 저장되지 않습니다.

지원 기능
--------

Bluesky
* 게시물 본문 인라인 스트리밍 번역 (Bluesky 기본의 Google Translate 새 탭
  redirect 자리에 우리 결과가 인라인으로 표시).
* 답글 작성: 한국어로 쓴 답글을 원 포스트의 언어로 번역, 미리보기, 한 번에 반영.
* 새 글 작성: 같은 compose-direction 번역, 대상 언어는 옵션 페이지에서 선택.

Buffer
* Create Post 모달: 작성 중인 글을 옵션에서 고른 외국어로 번역해 적용.
* Community 댓글: 외국어 댓글 본문을 한국어로 읽고, 답글 작성 시 부모 댓글의
  언어로 번역.

동작 원리
--------

확장은 사용자가 install.sh로 한 번 설치하는 Native Messaging Host (NMH)와
통신합니다. NMH는 요청마다 `claude -p ... --bare --output-format stream-json`
을 spawn해서 결과를 스트리밍으로 받습니다. 실제 API 호출은 사용자 머신의
claude CLI가 사용자 본인의 Anthropic 계정 자격증명으로 수행하며, 확장은
그 자격증명에 접근하지 않습니다.

요구사항
--------

* macOS
* Claude Code CLI 설치 + 로그인:
    npm i -g @anthropic-ai/claude-code
    claude login
* Chrome

설치
----

상세 가이드 + install.sh:
https://github.com/bbrightcode-atlas/bluesky-mac-translator

개인정보
--------

* 분석/광고/추적 없음.
* 확장 자체는 어떤 데이터도 수집하지 않음.
* 사용자가 명시적으로 "번역" 버튼을 누른 시점에만 텍스트가 Anthropic으로 전송됨
  (사용자의 claude CLI를 통해서).
* Privacy Policy:
  https://bbrightcode-atlas.github.io/bluesky-mac-translator/PRIVACY
```

---

## Single purpose description

(Chrome Web Store는 single purpose를 명시하라고 요구함.)

```
Translate social-media post text on Bluesky and Buffer using the user's locally installed Claude CLI.
```

---

## Permission justifications

| Permission | Justification |
|---|---|
| `storage` | Persist the user's two language preferences (reading target language for Bluesky posts; compose target language for Buffer drafts and Bluesky new posts). |
| `nativeMessaging` | Communicate with the Native Messaging Host the user installs via the project's install.sh script; the NMH spawns the user's local Claude CLI to perform translations. The extension never handles API credentials directly. |
| `host_permissions: https://bsky.app/*` | Inject translation UI into Bluesky post DOM and read post/reply text the user requests to translate. |
| `host_permissions: https://publish.buffer.com/*` | Inject translation UI into Buffer's Create Post composer and Community comment threads, and read the text the user requests to translate. |

(스토어 폼은 각 권한별로 별도 텍스트 박스를 줍니다 — 위 표의 각 행을 그대로 복사·붙여넣기.)

### Host permission justification (combined, for store)

```
The extension injects a translation UI into Bluesky (bsky.app) post and reply
DOM, and into Buffer (publish.buffer.com) Create Post composer and Community
comment threads. It reads post/reply/comment text only when the user clicks
Translate, and writes a translated draft back into the compose box only when
the user clicks "반영하기" (Apply). No other sites are accessed.
```

### Remote code justification

```
Not applicable — the extension bundles all its JavaScript at build time; no
remote code is fetched or executed at runtime. The only network calls are to
the user's local Native Messaging Host via Chrome's nativeMessaging API.
```

---

## Privacy practices declarations

Chrome Web Store의 privacy practices 폼에서 다음을 선택/입력:

| 항목 | 답변 |
|---|---|
| **Single purpose** | (위 single purpose description 사용) |
| **Data collected by your extension** | None |
| **Data usage and handling certification** | ✓ I do not sell or transfer user data to third parties, outside of the approved use cases. ✓ I do not use or transfer user data for purposes unrelated to my item's single purpose. ✓ I do not use or transfer user data to determine creditworthiness or for lending purposes. |
| **Privacy policy URL** | `https://bbrightcode-atlas.github.io/bluesky-mac-translator/PRIVACY` |

> 참고: 번역 텍스트는 사용자의 claude CLI를 통해 Anthropic으로 전송되지만, 확장 자체가 수집·저장·전송하지 않으므로 "Data collected by your extension"은 None. (Anthropic의 처리는 Anthropic의 privacy policy 적용 — 우리 PRIVACY.md 에 명시되어 있음.)

---

## Store assets (별도 준비 필요)

| 자료 | 사이즈 | 상태 |
|---|---|---|
| Store icon | 128×128 PNG | ✅ `extension/public/icon/128.png` |
| Small promo tile | 440×280 PNG | ❌ 선택사항 |
| Marquee promo tile | 1400×560 PNG | ❌ 선택사항 |
| Screenshot 1 | 1280×800 또는 640×400 PNG | ❌ |
| Screenshot 2 | 〃 | ❌ |
| Screenshot 3 | 〃 | ❌ |
| Screenshot 4 | 〃 | ❌ |
| Screenshot 5 | 〃 | ❌ |

스크린샷 가이드: [SCREENSHOTS.md](./SCREENSHOTS.md)
