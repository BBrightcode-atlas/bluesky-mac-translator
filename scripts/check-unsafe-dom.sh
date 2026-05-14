#!/usr/bin/env bash
set -euo pipefail

# spec §7.6에서 금지한 패턴 목록. 정규식만 사용 — 실제 호출은 grep 결과로 검출됨.
PATTERNS_FILE="$(dirname "$0")/unsafe-dom-patterns.txt"

found=0
while IFS= read -r pat; do
  [ -z "$pat" ] && continue
  # git grep exits 1 when no matches; grep -v on empty input also exits 1.
  # Under set -euo pipefail this would kill the script even on a clean repo.
  # Fix: capture the filtered output with "|| true" so a no-match (non-zero
  # pipeline exit) is treated as empty output, not a script error.
  # We only set found=1 when the captured output is actually non-empty.
  hits=$(
    git grep -nE -- "$pat" 'extension/**/*.ts' 'extension/**/*.tsx' 'host/**/*.ts' 2>/dev/null \
      | grep -v '\.test\.ts:' \
      | grep -v 'scripts/check-unsafe-dom\.sh' \
      | grep -v 'unsafe-dom-patterns\.txt' \
    || true
  )
  if [ -n "$hits" ]; then
    printf "%s\n" "$hits"
    printf "❌ 금지된 패턴 발견: %s\n" "$pat"
    found=1
  fi
done < "$PATTERNS_FILE"

if [ "$found" -eq 1 ]; then
  printf "\nspec §7.6 위반. createElement + textContent로 교체하세요.\n"
  exit 1
fi
printf "✓ unsafe DOM 패턴 없음\n"
