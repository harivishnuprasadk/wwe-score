# CLAUDE.md

Guidance for Claude working in this repo. The user-facing guide is README.md; keep it in sync when behaviour changes.

## What this is

WWE 2K23 Scoreboard (repo and internal ids still say "tag-ledger"; keep `app: "tag-ledger"` in backups for compatibility): a score tracker for a friends' WWE 2K23 tag-team night. React 18 + Vite, single page, no router. Backend is Firebase on the free Spark plan: Hosting, Firestore and Email/Password Auth. Two shared logins: `group@tagledger.app` (everyone) and `admin@tagledger.app` (owner). The owner isn't a professional developer: explain in plain words, give exact commands, and never paste shell commands with trailing `# comments` (zsh passes them to the command as arguments).

## Commands

| Command | Use |
|---|---|
| `npm run dev:local` | App + Auth/Firestore emulators (project `demo-tag-ledger`), seeds logins `group123` / `admin123`. Data is wiped on exit. Vite on :5173, Firestore on :8080, Auth on :9099 |
| `npm run test:rules` | Firestore rule tests (`tests/rules.test.mjs`). Needs port 8080 free, so stop `dev:local` first |
| `npm run deploy` | Build and deploy hosting **and** rules to the real project (`.firebaserc` → `wwe-tag-ledger`). Outward-facing: only run when the user asks |
| `npx vite build --outDir <scratch>` | Quick compile check without touching `dist/` |

- Emulators live in `.emulators/` via `FIREBASE_EMULATORS_PATH`, because `~/.cache` isn't writable here.
- To run rule tests while `dev:local` is up, copy the test with a **fresh unique `projectId`** (e.g. `demo-check-$RANDOM`) and an absolute rules path. Then run it with node and delete the copy. Reusing a project id means leftover docs make "create" tests fail.

## Architecture

- `src/components/Board.jsx`: owns all state and data wiring. It derives:
  - `names` / `teamOpts`: added players and teams, plus everyone from match history, minus hidden players.
  - `scored`: matches with voided ones turned into `counted: false`.
  - `list`: the date filter applied to `scored`.
  - Stats via `computeStats`, `records` and `profiles.js`.
- `src/lib/ledger.js`: pure stats helpers (standings, streaks, trend, records, team options). `src/lib/profiles.js`: all-time, cross-night stats (rank moves, profiles, streak breakers). Both take match arrays and have no React or Firebase imports, so they can be tested with `node --input-type=module -e`.
- Components:
  - `BookMatch`: team pickers, wrestler pickers, head-to-head.
  - `MatchCard`: list, delete window, flag button, flagged-results box.
  - `Roster`: add/edit/delete players, add teams with nicknames, admin-only team rename/remove (`TeamRow`).
  - `Stats`: Teams / Players / Records tabs, expandable profiles.
  - `Login`: Group/Admin switch.
  - `PlayerSelect`: now only the wrestler dropdown.
- Stats are computed client-side from all matches on each load; nothing derived is stored.

## Data model and invariants (enforced in `firestore.rules`)

- **matches** (random id)
  - Fields: `date, t, team1[2], team2[2], wrestlers1[2]?, wrestlers2[2]?, winner (1|2), counted, createdAt, flag? {reason, at}, voided?, late?`.
  - Never edited. Create requires `createdAt == request.time` and a date that isn't in the future. A date other than today (±1 day) requires `late: true`, shown as "Added later" (the user chose to let everyone backfill; keep it visible). Delete only within 1 h of `createdAt`.
  - Updates allowed: a member adds `flag` once, to an unflagged, unvoided match. The admin sets `voided` and/or removes `flag`.
  - Admin may also create with a past `createdAt` (restore only, so restored matches arrive locked), but only into ids that don't exist yet.
- **players** (id = `name.lower()`)
  - Fields: `name, alias?, hidden?, createdAt`.
  - Only `alias` and `hidden` can change, because names are baked into immutable matches. "Delete" in the UI means `hidden: true`.
- **teams** (id = `p0.lower() + '+' + p1.lower()`, with `p0.lower() < p1.lower()`)
  - Fields: `players[2], nick, createdAt`. Anyone can create (nick included); only the **admin** can change `nick` or delete.
  - Sort with `byLower()` (plain `<` on lowercase), **not** `localeCompare`, or ids won't match the rule.
- Names: 1–30 chars, no `/` (it's used as a doc id). Aliases and nicknames: ≤ 30 chars.

**When adding a field or collection, update all of:**
- the rule;
- the tests in `tests/rules.test.mjs`;
- backup export and import in `Board.jsx` (backups must stay restorable, and older backup formats must still import);
- the README data table.

The live rules must be deployed with the app, or writes get refused.

## Verifying changes

- Logic: run the helpers with node against `tag-ledger-backup-2026-10-06.json` and check the numbers by hand.
- UI: `playwright-core` with the system Chrome (`/Applications/Google Chrome.app/...`), installed in the session scratchpad, **not** the repo. Check at 390 px and 1280 px. `document.documentElement.scrollWidth` must equal the viewport width (no sideways scroll on phones).
- The user's local emulator data is theirs. Use clearly named test data ("Zz Test …") and clean it up afterwards. Locked matches can't be deleted, so avoid creating them unless necessary, and say so if you do.
- Report honestly what was and wasn't verified.

## Conventions

- Plain JS + JSX, function components, hooks. No TypeScript, no CSS framework, no new dependencies without asking.
- Styles live in `src/styles.css`, using the colour tokens on `:root` (light and dark). Phone breakpoint is `max-width:560px`; the board stacks at 860px.
- Comments explain *why*, briefly, in the existing tone. User-facing copy is plain, friendly English; error messages say what to do next.
- Keep the anti-cheat guarantees: don't add a way to change a score, hide that a match was backdated, or bypass the 1-hour lock, even for the admin, unless the user explicitly asks and understands the trade-off.
- Free-tier awareness: each app open reads every match (50k reads/day limit). Avoid adding reads per render or per row.
