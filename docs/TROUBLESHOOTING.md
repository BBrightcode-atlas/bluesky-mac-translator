# 트러블슈팅

## "번역" 링크가 안 보임

1. `chrome://extensions`에서 확장 활성 확인
2. bsky.app DevTools console에 `[bsky-translator]` 로그 확인
3. `no posts detected` 경고면 bsky가 testid를 바꾼 것 — `lib/post-detector.ts` selectors 업데이트 필요

## "Native host 미설치"

```bash
ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.flotter.bsky_translator.json
```

없으면 `install.sh` 재실행. ID 32자 a-z 정확히 입력.

## "apfel이 설치되지 않았습니다"

```bash
brew install apfel
which apfel
```

## "Apple Intelligence 활성화 필요"

시스템 환경설정 → Apple Intelligence & Siri → ON. macOS Tahoe + Apple Silicon만 가능.

## 번역이 끝없이 hang

```bash
tail -f ~/Library/Logs/flotter-bsky-translator/apfel.log
tail -f ~/Library/Logs/flotter-bsky-translator/host.log
```

`pkill -f 'apfel.*--serve'` 후 옵션에서 [재시작].

## 자세한 로그

- Service worker: chrome://extensions → "서비스 워커 검사"
- Content script: bsky DevTools console
- NMH: `~/Library/Logs/flotter-bsky-translator/host.log`
- apfel: `~/Library/Logs/flotter-bsky-translator/apfel.log`
