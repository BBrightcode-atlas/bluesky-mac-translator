# Changelog

이 프로젝트는 [Keep a Changelog](https://keepachangelog.com/) 형식과 [SemVer](https://semver.org/)를 따릅니다.

## [0.0.3] — 2026-05-16

### Added
- **Buffer 지원** (`publish.buffer.com`):
  - Create Post composer: 하단 `integrations-bar` 에 인라인 "번역" 버튼. 한국어 작성 후 클릭 → 옵션의 `bufferTargetLang`(기본 English)으로 번역 → "반영하기"로 Slate.js compose에 paste 시뮬레이션 주입.
  - Community 댓글 thread:
    - 외국어 댓글 본문 아래 "번역" — 한국어 미리보기 (반영하기 없음, 읽기 전용).
    - 답글 textarea 아래 "번역" — 한국어 답글을 부모 댓글의 언어로 자동 번역 + "반영하기"로 React-controlled textarea에 주입.
- **Bluesky 새 글 작성 번역** — 답글이 아닌 새 글 모달에도 같은 compose 번역 UI mount. 대상 언어는 `bufferTargetLang` setting 공유.
- **옵션 페이지 2번째 LanguageSelector** — "Buffer 작성 번역 언어" (compose-direction). LanguageSelector 컴포넌트 generic화.
- `host_permissions` 에 `https://publish.buffer.com/*` 추가, content script `matches` 도 확장.
- `applyTranslationToCompose` 에 `HTMLTextAreaElement` / `HTMLInputElement` 분기 — `Object.getOwnPropertyDescriptor` 의 setter + input event로 React-controlled textarea 동기화.
- `mountReplyTranslatorUI` 에 optional `MountTarget` (`{ el, position: 'after' | 'append' }`) 옵션 — site별 mount 위치 커스터마이즈.
- README, CHANGELOG, store listing copy, screenshot 가이드.

### Changed
- Prompt `LANG_NAMES` 에 English 추가, `buildPostPrompt` 의 "for Bluesky" 문구를 generic "for social media posts"로.
- `host/src/types.ts` `TargetLang`: `'ko'|'ja'|'zh'` → `'ko'|'ja'|'zh'|'en'`.
- host element 에 inline `display:block; width:100%; min-width:0;` 강제 — flex-column 부모에서 한 글자씩 wrap 되던 문제 fix.

### Fixed
- Buffer reply form host 위치: footer toolbar 안에 mount하면 글자수 카운터 `0/280` 이 세로로 분해됐던 문제 — textarea 직후로 옮김.
- Buffer composer mount: dropzone 안 → `integrations-bar` 안 (사용자 지정).

---

## [0.0.2] — 2026-05-15

### Added
- **Bluesky 답글 작성 번역** — 답글 모달의 compose 박스에 "번역" 버튼. 클릭 시 한국어 답글을 원 포스트의 언어로 자동 번역, 미리보기, "반영하기" 버튼으로 ProseMirror (tiptap) compose에 적용.
- Bluesky 기본 "번역" 링크(Google Translate redirect) 자리에 우리 trigger 자동 mount (다국어 aria-label 지원: ko/en/zh/ja).
- 옵션 페이지 Claude CLI 진단 카드 (which/version 표시).
- LICENSE (MIT), Privacy Policy, GitHub Pages.

### Changed
- **백엔드 교체**: apfel (Apple on-device FoundationModel) → `claude` CLI. NMH host가 요청당 `claude -p ... --bare --output-format stream-json` spawn.
  - `--bare` flag 로 hooks/plugin sync/CLAUDE.md auto-discovery skip — cold start ~5.3s → 2.7s.
- `host_permissions` 에서 `http://127.0.0.1:11434/*` 제거 (apfel HTTP 서버 없음).
- 옵션 페이지: apfel endpoint editor / autoRestart toggle / ServerStatus 카드 제거 → Claude CLI 진단 카드로 대체.
- README 대대적 보강 (public 대상).

### Fixed
- 번역 버튼 클릭 시 포스트 카드 링크로 click 이벤트 버블링되어 상세 페이지로 navigate되던 버그 — Shadow DOM host에 click/pointerdown/mousedown stopPropagation 일괄 차단.
- Bluesky thread 상세 페이지의 메인 post에서 mount 위치가 카드 아래로 멀리 밀려나던 문제 — postText 안 마지막 자식으로 변경.
- Bluesky 답글 모달의 quoted post에 `[data-testid="postText"]` 가 없는 케이스 (현재 DOM) — `[data-testid="userAvatarImage"]` 의 closest `[role="button"]` 으로 식별 + `extractPostText` self/fallback 보강.
- Chrome NMH가 spawn하는 자식 프로세스의 minimal PATH 때문에 `claude` CLI를 못 찾던 문제 — `host-launcher.sh` 가 PATH 명시적 확장.
- NMH single-instance pidfile 가드 제거 — Chrome NMH는 connectNative마다 새 host child를 spawn하므로 두 번째 child가 즉시 exit되어 "Native host has exited" 에러 발생.
- claude model id: `apple-on-device` → `apple-foundationmodel` (apfel v1.3.4 실측).
- 인라인 lang picker 제거 — 언어 선택은 옵션 페이지에서만.

---

## [0.0.1] — 2026-05-14

### Added
- 초기 구현 — Bluesky 게시물 인라인 번역 (apfel 백엔드).
- WXT + React 옵션 페이지, NMH host (Node.js).
- 한국어/일본어/중국어 번역 대상.
- LRU 캐시, MutationObserver 기반 가상화 피드 지원, install.sh / uninstall.sh / doctor.sh.

[0.0.3]: https://github.com/bbrightcode-atlas/bluesky-mac-translator/releases/tag/v0.0.3
[0.0.2]: https://github.com/bbrightcode-atlas/bluesky-mac-translator/releases/tag/v0.0.2
[0.0.1]: https://github.com/bbrightcode-atlas/bluesky-mac-translator/releases/tag/v0.0.1
