---
title: Privacy Policy — Bluesky Translator
---

# Privacy Policy

**Effective date:** 2026-05-15
**Extension:** Bluesky Translator (`bbrightcode-atlas/bluesky-mac-translator`)

## 한 줄 요약

이 확장은 사용자의 데이터를 직접 수집·저장·전송하지 않습니다. 사용자가 번역 버튼을 누른 시점에 한해, 해당 텍스트가 사용자 머신의 `claude` CLI를 통해 Anthropic API로 전송됩니다.

## 수집·전송하는 데이터

### 우리 (확장 개발자) 가 수집하는 데이터
**없음.** 우리는 어떤 분석 서버, 크래시 리포터, 광고 네트워크도 운영하지 않습니다.

### 사용자가 명시적으로 번역을 요청했을 때 전송되는 데이터
사용자가 번역 버튼(또는 답글 번역 버튼)을 클릭하면, 다음 데이터가 사용자 머신의 `claude` CLI(Anthropic Claude Code)로 전달됩니다:

- 번역할 포스트 본문 텍스트, 또는
- 사용자가 작성 중인 답글 텍스트 + 답글이 달릴 원 포스트 텍스트(언어 감지용)

`claude` CLI는 이 텍스트를 Anthropic API로 전송하여 번역을 수행합니다. **이 단계의 데이터 처리는 [Anthropic의 Privacy Policy](https://www.anthropic.com/legal/privacy)** 및 사용자가 `claude login`으로 동의한 약관에 따릅니다.

확장은 Anthropic과의 통신에 어떤 중계 서버도 거치지 않으며, 사용자의 API 자격증명은 사용자 머신의 `claude` CLI 안에만 보관됩니다 — 확장이나 확장의 NMH host는 자격증명에 접근하지 않습니다.

## 로컬 저장

| 항목 | 위치 | 내용 | 영속성 |
|---|---|---|---|
| 기본 번역 대상 언어 | `chrome.storage.sync` | `targetLang` 한 필드 (`'ko'\|'ja'\|'zh'`) | 영구 (Chrome sync) |
| 번역 결과 LRU 캐시 (최대 200건) | Background service worker 메모리 | 텍스트 ↔ 번역문 매핑 | 휘발성 (브라우저 닫으면 소멸) |
| 호스트 디버그 로그 (해당 시) | `~/Library/Logs/flotter-bsky-translator/` | NMH stderr/stdout | 사용자가 직접 삭제 가능 |

## 권한 (Permissions) 사용 목적

- `storage` — 위 `targetLang` 한 필드 저장
- `nativeMessaging` — 사용자 머신의 NMH host(`com.flotter.bsky_translator`)와 stdio로 통신 (claude CLI를 안전하게 spawn)
- `host_permissions: https://bsky.app/*` — bsky.app 페이지의 DOM에 번역 UI를 주입하고 포스트 텍스트를 읽기 위한 권한

## 제3자 서비스

- **Anthropic Claude API** — 번역의 실제 수행. 사용자가 `claude login`으로 직접 인증한 자격증명을 통해 호출됨.

그 외 어떤 분석/광고/추적 서비스도 사용하지 않습니다.

## 데이터 보존 / 삭제

- 확장 자체가 보존하는 사용자 데이터는 `chrome.storage.sync`의 `targetLang` 한 필드뿐입니다. Chrome에서 확장을 제거하면 자동으로 삭제됩니다.
- Anthropic 측의 데이터 보존 정책은 [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy)를 따릅니다.

## 미성년자

이 확장은 미성년자(만 13세 미만)를 대상으로 하지 않습니다. 우리는 미성년자의 데이터를 의도적으로 수집하지 않습니다.

## 변경 이력

이 정책의 변경 사항은 본 페이지의 GitHub commit history에서 확인할 수 있습니다.

## 연락처

이슈 또는 문의: [GitHub Issues](https://github.com/bbrightcode-atlas/bluesky-mac-translator/issues)
