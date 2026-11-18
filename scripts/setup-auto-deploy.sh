#!/usr/bin/env bash
# One-time setup so every push to GitHub deploys to Firebase automatically
# (.github/workflows/deploy.yml).
#
#   npm run setup:autodeploy
#
# It creates a deploy-only Google service account for the wwe-tag-ledger project and stores its key
# as the FIREBASE_SERVICE_ACCOUNT secret in the GitHub repo. The key never stays on this computer.
# Safe to run again: it reuses the account and replaces the secret with a fresh key.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="wwe-tag-ledger"
SA_NAME="github-deploy"
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
REPO="$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"

step() { printf '\n\033[1m→ %s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$1"; exit 1; }

step "Checking the tools"
if ! command -v gcloud >/dev/null; then
  command -v brew >/dev/null || fail "Install Homebrew first (https://brew.sh), then run this again."
  brew install --cask google-cloud-sdk
  source "$(brew --prefix)/share/google-cloud-sdk/path.bash.inc" 2>/dev/null || true
fi
if ! command -v gh >/dev/null; then
  command -v brew >/dev/null || fail "Install Homebrew first (https://brew.sh), then run this again."
  brew install gh
fi

step "Signing in (a browser window opens the first time only)"
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . || gcloud auth login
gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https

step "Creating the deploy account in $PROJECT"
gcloud services enable iam.googleapis.com --project "$PROJECT" >/dev/null
if ! gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" --display-name "GitHub deploy (WWE scoreboard)"
fi
# Firebase Admin covers Hosting and Firestore rules; Service Usage Consumer lets the CLI call those APIs.
for role in roles/firebase.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" --condition=None >/dev/null
done
echo "Account ready: $SA"

step "Saving the key as a GitHub secret in $REPO"
key="$(mktemp)"
trap 'rm -f "$key"' EXIT
gcloud iam service-accounts keys create "$key" --iam-account "$SA" --project "$PROJECT"
gh secret set FIREBASE_SERVICE_ACCOUNT --repo "$REPO" < "$key" \
  || fail "GitHub refused the secret. Only the repo owner or an admin can add secrets: ask them to run this script, or to make you an admin of $REPO."
rm -f "$key"

step "Deploying what's on GitHub now"
gh workflow run deploy.yml --repo "$REPO" --ref main \
  && echo "Started. It takes about 3 minutes." \
  || echo "Couldn't start it (is the latest code pushed to GitHub?). The next push deploys anyway."

step "Done"
echo "From now on every push to main builds, tests and deploys automatically."
echo "Watch a run: gh run watch --repo $REPO"
