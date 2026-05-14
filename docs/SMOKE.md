# 릴리스 스모크 체크리스트

릴리스 전 5분 체크.

1. [ ] fresh 머신 (또는 uninstall 후) `install.sh` 실행 → 7단계 모두 OK
2. [ ] Chrome unpacked 로드 → 옵션 페이지 자동 오픈
3. [ ] bsky.app 새로고침 → 피드 첫 5개 post 아래 "번역" 링크 보임
4. [ ] 클릭 → 1초 이내 첫 토큰 표시
5. [ ] 재클릭 → 캐시 hit (즉시 표시)
6. [ ] 옵션에서 ja로 변경 → 새 post 번역 시 일본어
7. [ ] post의 ▾로 zh 변경 → 해당 post만 중국어
8. [ ] `pkill apfel` → 다음 번역 시 자동 재시작 후 정상
9. [ ] extension 리로드 → 정상 복귀
10. [ ] extension 비활성화 → 주입 링크 사라짐
11. [ ] XSS 테스트: post 본문에 `<img src=x onerror=alert(1)>` 텍스트 → 번역 박스에 텍스트로만 표시
12. [ ] endpoint를 빈 포트로 변경 → 번역 시 에러 + 재시도 버튼
