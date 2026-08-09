# Exit 0 → Vercel skips the build; exit 1 → proceed.
# Dual insurance with commit body `[skip vercel]` on chore(release) commits.
# See .ai/specs/extension-release-ci.md

set -e
msg=$(git log -1 --pretty=%B 2>/dev/null || true)
if printf '%s\n' "$msg" | grep -qiE '\[skip vercel\]|\[vercel skip\]'; then
  echo "vercel-ignore: skip ([skip vercel] in commit message)"
  exit 0
fi
subject=$(printf '%s\n' "$msg" | head -n 1)
if printf '%s\n' "$subject" | grep -qiE '^chore\(release\):[[:space:]]*[0-9]+\.[0-9]+\.[0-9]+[[:space:]]*$'; then
  echo "vercel-ignore: skip (chore(release) subject)"
  exit 0
fi
exit 1
