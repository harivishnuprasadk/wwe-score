#!/usr/bin/env bash
# Build, test, commit, deploy and push in one go.
#
#   npm run ship -- "What changed"            do everything
#   npm run ship -- --dry-run "What changed"  run the checks only; nothing is committed, deployed or pushed
#
# Stops at the first problem, so a broken build or failing rule test never goes live,
# and GitHub is only updated after the deploy worked.
set -euo pipefail
cd "$(dirname "$0")/.."

dry=0
if [ "${1:-}" = "--dry-run" ]; then dry=1; shift; fi
msg="${1:-}"
if [ -z "$msg" ]; then
  echo 'Usage: npm run ship -- "What changed"   (add --dry-run before the message to only run the checks)'
  exit 1
fi

step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

step "Checking the repo"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "This folder isn't a git repo."
branch="$(git branch --show-current)"
[ -n "$branch" ] || fail "Not on a branch (detached HEAD)."
echo "Branch: $branch · committing as $(git config user.email)"

# Never commit secrets or generated junk, even if .gitignore misses something.
forbidden='(^|/)\.env($|\.)|(^|/)node_modules/|(^|/)\.emulators/|(^|/)dist/|-debug\.log$'
bad="$(git status --porcelain --untracked-files=all | awk '{print $NF}' | grep -E "$forbidden" | grep -v '\.env\.example$' || true)"
[ -z "$bad" ] || fail "These files must not be committed; add them to .gitignore first:
$bad"

step "Building the app"
npx vite build --outDir "${TMPDIR:-/tmp}/scoreboard-ship-check" --emptyOutDir --logLevel error || fail "Build failed. Nothing was committed or deployed."
echo "Build OK"

if git status --porcelain -- firestore.rules tests/ | grep -q .; then
  step "Database rules changed: running the rule tests"
  if lsof -iTCP:8080 -sTCP:LISTEN >/dev/null 2>&1; then
    fail "Port 8080 is in use (probably npm run dev:local). Stop it with Ctrl+C, then run ship again."
  fi
  npm run test:rules || fail "Rule tests failed. Nothing was committed or deployed."
else
  echo "(rules unchanged, skipping rule tests)"
fi

if [ "$dry" = 1 ]; then
  step "Dry run: would commit these changes as \"$msg\", deploy, and push to origin/$branch"
  git status --short
  exit 0
fi

step "Committing"
git add -A
if git diff --cached --quiet; then
  echo "Nothing new to commit; deploying and pushing what's already committed."
else
  git commit -m "$msg"
fi

step "Deploying to Firebase (website + database rules)"
npx firebase deploy || fail "Deploy failed. Your commit is saved locally but NOT pushed.
If it says your login expired, run:  npx firebase login --reauth   then run ship again."

step "Pushing to GitHub"
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push || fail "Push failed. The site IS deployed; run  git push  again once it's sorted."
else
  git push -u origin "$branch" || fail "Push failed. The site IS deployed; run  git push  again once it's sorted."
fi

printf '\n\033[32m✓ Shipped: committed, deployed and pushed.\033[0m\n'
