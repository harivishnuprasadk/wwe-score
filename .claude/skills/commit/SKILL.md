---
name: commit
description: Commit the current changes in this repo (WWE 2K23 Scoreboard) safely. Checks what changed, makes sure the app still builds and the Firestore rule tests pass when the rules changed, keeps junk and secrets out, writes a clear commit message, and pushes to GitHub only if asked. Use when the user says "commit", "save to git", "save to github", "push my changes" or runs /commit. Pass "push" to also push, and optionally a hint for the message, e.g. /commit push rivalries tab.
---

# Commit changes

The user isn't a professional developer. Do the work, keep the chat short, and finish with a plain summary.

Arguments (optional, any order):
- `push`: also push to GitHub after committing.
- any other words: a hint for what the commit is about.

## 1. Look before touching anything

Run these and read the output:

```
git status --short
git diff --stat
git log --oneline -5
```

- **Not a git repo, or no `origin` remote:** stop and tell the user (README → "save to GitHub" steps). Don't run `git init` unless they ask.
- **Nothing to commit:** say so and stop. If `push` was asked and the branch is ahead of `origin`, push anyway (step 5).
- **Commit email:** check `git config user.email`. It should be the user's personal address (`harivishnuprasadk@gmail.com` at the time of writing), not a work one. If it looks like a work address, ask before committing.

## 2. Keep junk and secrets out

**Never stage:**
- `node_modules/`, `dist/`, `.emulators/`, `.firebase/`
- `*-debug.log`
- `.env.local` or any other `.env*` except `.env.example`
- anything with passwords, tokens or private keys

**Stage only by path.** Never use `git add -A` blindly: list what you're staging. If an untracked file looks unexpected (a stray clone like `wwe-score/`, a backup `*.json` other than the committed one, screenshots, editor files), ask before adding it. If something that should never be committed keeps appearing, suggest adding it to `.gitignore`.

## 3. Check it works

1. **Build:**
   ```
   npx vite build --outDir "$TMPDIR/scoreboard-build-check"
   ```
   This compiles the app without touching `dist/`. If it fails, show the error, don't commit, and offer to fix it.
2. **If `firestore.rules` or `tests/rules.test.mjs` changed, run the rule tests.**
   - Port 8080 must be free. If `npm run dev:local` is running, either ask the user to stop it, or run a copy of the test against the running emulator with a fresh unique `projectId`, as described in CLAUDE.md.
   - Every line must be `PASS`. If any `FAIL`, don't commit.
3. **README/CLAUDE.md:** if behaviour changed (new feature, new data field, new rule), check they mention it. If not, point out what's missing and offer to update them before committing.

## 4. Commit

Write the message from the actual diff, not from memory:
- **Subject:** imperative, at most about 60 characters, no quotes around it, no trailing full stop, e.g. `Add Rivalries tab with day-wise head-to-head`.
- **Body** (when there's more than one change): a blank line, then short `- ` bullets of what changed and why, in plain words. Mention any database rule change explicitly, because it needs a deploy.
- End with the attribution lines that the session's system reminder asks for, if any.

Use a heredoc so quoting can't break:

```
git commit -F - <<'EOF'
Subject line here

- what changed
- what changed
EOF
```

If the changes are clearly unrelated (e.g. a bug fix plus a new feature), offer to split them into separate commits. Don't split without asking.

Never amend or rewrite commits that are already pushed, never force-push, and never skip hooks (`--no-verify`).

## 5. Push (only when asked)

Push only if the user passed `push` or asked to push in this conversation. Pushing publishes to GitHub.

```
git push
```

- **No upstream yet:** use `git push -u origin <branch>`.
- **Rejected because GitHub has newer commits:** don't force. Explain it, then run `git pull --rebase` only if the user agrees.
- **Asks for a password or says authentication failed:** tell them to create a token at https://github.com/settings/tokens (classic, `repo` scope) and use it as the password. If a stale one is cached, they can delete the github.com entry in Keychain Access.

## 6. Report

Finish with a short summary:
- the commit hash and subject;
- the files committed, grouped if there are many;
- what was checked (build, rule tests) and the result;
- pushed or not;
- whether the **live site** needs `npm run deploy` to match: yes if anything under `src/`, `public-assets/`, `index.html` or `firestore.rules` changed. Deploying is the user's call; don't run it from this skill.
