#!/usr/bin/env bash
# Dev launcher: Chrome Native Messaging Host가 stdio로 호출함.
# Chrome NMH는 자식 프로세스에 minimal PATH만 넘기므로(/usr/bin:/bin 정도),
# claude CLI가 있는 디렉토리들을 명시적으로 추가한다.
export PATH="/Users/bright/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
exec "/opt/homebrew/bin/node" "/Users/bright/Projects/bluesky-mac-translator/host/dist/index.js" "$@"
