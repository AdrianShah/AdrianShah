#!/usr/bin/env bash
# Usage: scripts/commit_and_push.sh "<commit message>" <paths...>
#
# Commits the given paths and pushes, surviving races with the app (picks
# arrive seconds apart) and other workflows. After each rebase the picks block
# is re-rendered, so whichever run pushes last leaves README.md matching the
# newest picks.json, even when an older render run was skipped or cancelled.
set -euo pipefail

msg=$1
shift

git config user.name  "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

for path in "$@"; do
  [ -e "$path" ] && git add "$path"
done
if git diff --cached --quiet; then
  echo "No changes to commit."
  exit 0
fi
git commit -q -m "$msg"

for attempt in 1 2 3 4 5; do
  # -X theirs: on a conflict keep this run's generated files (during a rebase,
  # "theirs" is the commit being replayed).
  if ! git pull -q --rebase -X theirs origin main; then
    git rebase --abort 2>/dev/null || true
    echo "Rebase failed (attempt $attempt), retrying."
    sleep $((attempt * 3))
    continue
  fi

  node scripts/render_readme.js
  if ! git diff --quiet README.md; then
    git add README.md
    git commit -q --amend --no-edit
  fi

  if git push -q origin HEAD:main; then
    echo "Pushed on attempt $attempt."
    exit 0
  fi
  echo "Push rejected (attempt $attempt), retrying."
  sleep $((attempt * 3))
done

echo "Gave up after 5 attempts." >&2
exit 1
