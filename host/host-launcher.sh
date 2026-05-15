#!/usr/bin/env bash
# Dev launcher: Chrome Native Messaging Host가 stdio로 호출함.
# 절대 경로로 node + host/dist/index.js를 실행.
exec "/opt/homebrew/bin/node" "/Users/bright/Projects/bluesky-mac-translator/host/dist/index.js" "$@"
