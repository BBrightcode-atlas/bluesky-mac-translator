---
title: Store Screenshot Capture Guide
---

# Store 스크린샷 가이드

Chrome Web Store에 올릴 스크린샷 5장. 사용자가 직접 캡처해서 `docs/screenshots/` 에 저장.

## 규격

- 사이즈: **1280×800** (권장) 또는 640×400. PNG 또는 JPG.
- 최소 1장, 최대 5장. **3~5장 권장** (스토어 conversion rate에 직접 영향).
- 텍스트 오버레이/주석 OK. 단 콘텐츠 자체에 사용자가 식별 가능한 정보(타인 게시물, 이메일 등) 없도록 신경.

## 도구

CleanShot, macOS 기본 screenshot (⌘⇧4), Skitch 등. 1280×800 영역만 캡처하려면 **Chrome Window 사이즈를 정확히 1280×800으로** 맞춰두면 편함:
- DevTools 열기 → 우상단 ⋮ → "More tools" → "Device toolbar" → 사이즈 입력
- 또는 Chrome의 device emulation: `Responsive` mode에서 1280×800 직접 입력

## 5장 (권장 순서)

### 1. Bluesky 게시물 인라인 번역 (Hero shot)

- 영어 또는 일본어 게시물 본문에 우리 "번역" 링크가 보이는 화면
- 클릭 후 한국어 번역 결과가 인라인으로 펼쳐진 상태 캡처
- 가능하면 "이것이 Bluesky의 기본 Google Translate 새 탭 대신 인라인" 임을 보이는 컨텍스트

오버레이 텍스트 후보: `"외국어 게시물 → 한 번에 인라인 번역"`

### 2. Bluesky 답글 작성 번역

- 답글 모달 (composePostView) 열린 상태
- 한국어 답글 작성 후 "번역" 누른 상태 — 영어 미리보기 표시
- "반영하기" 버튼이 함께 보이게

오버레이 텍스트 후보: `"답글을 원 포스트의 언어로 자동 번역"`

### 3. Buffer Create Post 모달

- publish.buffer.com → "+ New Post" → 채널 선택 → composer 영역에 한국어로 작성한 상태
- 하단 toolbar(media/gif/emoji 옆) 에 우리 "번역" 버튼 + 번역 결과 + "반영하기"

오버레이 텍스트 후보: `"Buffer에서 다국어 게시물 한 번에 작성"`

### 4. Buffer Community 댓글 번역

- publish.buffer.com/community → 게시물 → 댓글 thread
- 외국어 댓글 본문 아래 우리 "번역" 결과 + 답글 작성 textarea 아래 우리 widget 모두 보이는 화면

오버레이 텍스트 후보: `"댓글 읽고 답글까지 — Community 통합"`

### 5. 옵션 페이지

- 확장 옵션 페이지의 두 개 LanguageSelector + ClaudeStatus 카드
- 깔끔하게 정리된 UI 한 컷

오버레이 텍스트 후보: `"두 줄 설정 — 읽기 / 작성 언어"`

## 캡처 팁

- **Dark mode** 로 통일 (사용자 스크린샷이 dark였으니 일관성)
- 게시물 텍스트는 **간단하고 짧은** 영어/일본어로 고르기 (긴 텍스트 = 캡처 영역 부족)
- 사이드바·다른 탭·북마크는 깔끔하게 (DevTools 닫기, sidebar 가능하면 collapse)
- 본인 계정 정보 (이메일, 실명) 보이는 영역은 흐림 처리

## 저장 + commit

캡처 후 다음 경로에 저장:

```
docs/screenshots/
├── 01-bsky-post.png        (또는 .jpg)
├── 02-bsky-reply.png
├── 03-buffer-composer.png
├── 04-buffer-community.png
└── 05-options.png
```

그 후 commit:

```bash
git add docs/screenshots/
git commit -m "docs: store listing screenshots"
git push
```

## 스토어 업로드

각 PNG를 Chrome Web Store Developer Dashboard 의 "Store listing" → "Screenshots" 에 1장씩 업로드. 순서는 위 1→5 그대로.
