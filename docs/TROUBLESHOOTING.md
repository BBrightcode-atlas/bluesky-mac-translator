# 트러블슈팅

## "번역" 버튼이 안 보임

1. `chrome://extensions`에서 확장 활성 + 권한 확인.
2. Bluesky **탭을 닫고 새로 열기** (개발자 모드 reload 후 기존 탭은 stale content script가 남아 있을 수 있음).
3. DevTools Console 우상단 필터에 `[bsky-translator]` 입력 → 빨간 에러 있는지 확인.
4. 콘솔에서 한 줄 실행 → `0`이면 detector가 post를 못 잡는 것:

   ```js
   document.querySelectorAll('.flotter-translator-host').length
   ```

5. Bluesky가 DOM testid를 바꾸면 `extension/lib/post-detector.ts`의 `POST_SELECTORS` 배열에 새 후보를 추가해야 합니다.

## "claude CLI가 설치되어 있지 않습니다"

```bash
which claude
claude --version
```

위 명령이 정상 출력하는데도 확장에서 같은 에러가 나면 — **Chrome NMH가 spawn하는 자식 프로세스의 PATH에 claude 디렉토리가 없는 케이스**. `host-launcher.sh`가 PATH를 명시적으로 확장합니다. install.sh가 자동으로 설정하지만, 수동 변경이 필요하면:

```bash
$EDITOR ~/Library/Application\ Support/flotter-bsky-translator/host-launcher.sh
```

`export PATH="..."` 라인에 claude 위치의 디렉토리를 추가.

## "claude 로그인이 필요합니다"

```bash
claude login
```

OAuth 흐름이 끝나면 자격증명이 keychain에 저장됩니다. 그 후 다시 번역 시도.

## "Native host has exited"

가장 흔한 원인:
1. `host/dist/index.js` 파일이 빌드되지 않았음 → `~/Library/Application Support/flotter-bsky-translator/host/index.js` 존재 확인. 없으면 `install.sh` 재실행.
2. `host-launcher.sh`가 실행 권한 없음 → `chmod +x ~/Library/Application\ Support/flotter-bsky-translator/host-launcher.sh`.
3. node 자체가 launcher의 절대 경로에 없음 — launcher 첫 줄의 `node` 경로를 확인.

## "Specified native messaging host not found"

NMH manifest 파일이 없거나 잘못된 위치:

```bash
ls ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.flotter.bsky_translator.json
```

없으면 `install.sh` 재실행. 다른 브라우저(Brave/Arc/Edge)를 쓴다면 해당 브라우저의 NativeMessagingHosts 디렉토리에도 manifest를 복사해야 합니다.

## "Specified native messaging host is forbidden"

NMH manifest의 `allowed_origins`에 박힌 extension ID와 Chrome이 표시하는 ID가 일치하지 않음.

```bash
cat ~/Library/Application\ Support/Google/Chrome/NativeMessagingHosts/com.flotter.bsky_translator.json
```

`allowed_origins` 값을 `chrome://extensions`의 실제 ID로 수정하거나 `install.sh` 재실행 후 새 ID 입력.

## 번역이 늦게 시작됨 ("응답 지연 중...")

확장은 첫 청크가 15초 안에 안 오면 안내 메시지를 표시합니다. 정상 cold start는 보통 2–4초입니다. 자주 15초 넘으면:

- 사용자의 글로벌 `~/.claude/` hook들이 무거울 수 있음. `--bare` flag로 hooks를 skip하지만, plugin 동기화 등 여전히 영향을 줄 수 있습니다.
- 네트워크 느림 또는 Anthropic API 부하.

직접 측정:
```bash
time claude -p "Translate to Korean: hello" --bare --output-format stream-json --verbose | grep -m1 assistant
```

## 답글 작성 모달에서 번역 UI 안 뜸

답글 모달의 selector는 `extension/lib/compose-detector.ts`. Bluesky가 DOM을 바꾸면 새 selector 추가가 필요합니다.

진단:
```js
JSON.stringify({
  composeView: !!document.querySelector('[data-testid=composePostView]'),
  contentEditable: !!document.querySelector('[data-testid=composePostView] [contenteditable=true]'),
})
```

## 자세한 로그

| 위치 | 무엇 |
|---|---|
| `chrome://extensions` → 확장 카드 → "서비스 워커 검사" | Background script 로그 (port dispatch, 캐시 hit/miss) |
| bsky.app DevTools Console | Content script 로그 (`[bsky-translator]`, `[bmt-debug]`) |
| `~/Library/Logs/flotter-bsky-translator/host.log` | NMH host stderr |

## 처음부터 다시

```bash
~/Library/Application\ Support/flotter-bsky-translator/src/uninstall.sh
curl -fsSL https://raw.githubusercontent.com/bbrightcode-atlas/bluesky-mac-translator/main/install.sh | bash
```
