# 릴리스 스모크 체크리스트

릴리스 전 5–10분 체크. 모든 항목 PASS여야 ship.

## 사전

- [ ] `pnpm -r test` — 모든 워크스페이스 PASS
- [ ] `pnpm -r typecheck` — 0 errors
- [ ] `pnpm -F @flotter/bsky-translator-extension build` 정상
- [ ] `pnpm -F @flotter/bsky-translator-host build` 정상

## 설치

- [ ] fresh 머신 (또는 `uninstall.sh` 실행 후) `install.sh` 실행 → 7단계 모두 OK
- [ ] `scripts/doctor.sh` → claude / host dist / extension dist / NMH manifest 모두 ✓
- [ ] Chrome 개발자 모드 unpacked 로드 → 옵션 페이지 자동 오픈
- [ ] 옵션 페이지 Claude CLI 카드에 path / version 표시

## 게시물 번역

- [ ] bsky.app 새로고침 → 외국어 post의 본문 옆 **번역** 링크 보임 (Bluesky 기본 Google Translate 링크 자리)
- [ ] 클릭 → 3초 이내 첫 청크 표시, 스트리밍 진행
- [ ] 같은 post 재클릭 → 번역 박스 접힘, 다시 클릭 → 캐시 hit으로 즉시 표시
- [ ] 옵션에서 `ja`로 변경 → 새 post 번역 시 일본어
- [ ] Thread 상세(`/post/<rkey>`) 페이지 → 본문 아래에 번역 버튼 정상 위치

## 답글 번역

- [ ] 외국어 post의 답글 모달 → compose 박스 아래 **번역** 버튼 보임
- [ ] 한국어 답글 작성 → **번역** 클릭 → 원 포스트 언어로 미리보기
- [ ] **반영하기** 클릭 → compose 텍스트가 번역문으로 교체 (Cmd+Z로 원복 가능)
- [ ] 답글 모달 닫고 다시 열기 → 새 compose에 번역 UI 다시 mount

## 에러 경로

- [ ] `claude logout` 후 번역 시도 → "claude 로그인이 필요합니다" 안내 + 재시도 버튼
- [ ] PATH에서 claude 임시로 가림 → "claude CLI가 설치되어 있지 않습니다" 안내
- [ ] 빈 compose에서 답글 번역 시도 → "내용을 먼저 작성하세요" 안내
- [ ] 사용자 취소 (extension reload 등) → 깨끗하게 abort

## 보안 / 회귀

- [ ] post에 `<img src=x onerror=alert(1)>` 텍스트 포함 → 번역 박스에 텍스트로만 표시, 스크립트 실행 X
- [ ] 번역 버튼 클릭 → 포스트 상세로 navigate 안 됨 (host stopPropagation 동작)
- [ ] extension reload → 정상 복귀, 기존 mount 제거 후 재mount
- [ ] extension 비활성화 → 주입 UI 사라짐

## 정리

- [ ] `uninstall.sh` 실행 → NMH manifest + 설치 디렉토리 깨끗하게 제거. `claude` CLI는 유지됨
- [ ] doctor.sh 재실행 → host dist / extension dist FAIL (정상)
