#!/usr/bin/env bash
# Fails if tracked files (working-tree content) or dist/ contain the forbidden word or a /home/ path.
cd "$(git rev-parse --show-toplevel)" || exit 1
bad=0
word="zal""ando"
files=$(git ls-files --cached --others --exclude-standard | while read -r f; do [ -f "$f" ] && echo "$f"; done)
[ -d dist ] && files="$files
$(find dist -type f)"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if echo "$f" | grep -qi "$word"; then echo "forbidden word in path: $f"; bad=1; fi
  # -I skips binary files
  if grep -IqiE "$word" "$f" 2>/dev/null; then echo "forbidden word in: $f"; bad=1; fi
  # emscripten's virtual home dir inside the onnx runtime is not a real path
  [ "$f" = scripts/check-clean.sh ] && continue
  if grep -IE "(^|[^A-Za-z0-9_.-])/ho""me/" "$f" 2>/dev/null | grep -qv 'web_user'; then echo "absolute /home/ path in: $f"; bad=1; fi
done <<< "$files"
[ $bad -eq 0 ] && echo "check-clean: ok"
exit $bad
