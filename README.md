# 2K23 Tag Ledger

Score tracker for WWE 2K23 tag team nights on PS5. Log who beat whom, and everyone's phone shows live standings, streaks, records and player and team profiles.

- **App:** React + Vite, a single page that works on phones and laptops.
- **Backend:** Firebase, on the free Spark plan (no credit card). Hosting serves the site, Firestore stores the matches, and Authentication handles the two logins.
- **Anti-cheat:** Firestore security rules enforce it on Google's servers, so nobody can get around it by changing the app.

---

## Contents

1. [What's in the app](#1-whats-in-the-app)
2. [What you need](#2-what-you-need)
3. [Run it on your computer](#3-run-it-on-your-computer)
4. [Deploy from scratch](#4-deploy-from-scratch)
5. [Deploy new changes](#5-deploy-new-changes)
6. [Using the app](#6-using-the-app)
7. [Maintenance](#7-maintenance)
8. [Troubleshooting](#8-troubleshooting)
9. [How it works](#9-how-it-works)

---

## 1. What's in the app

**Logging matches**
- **Book a match:** choose a team for the Red corner and the Blue corner, optionally pick each player's wrestler, then tap the winning side.
- **Head to head:** shows today's and all-time record between the two teams before you log.
- **No count:** log a match that's left out of the standings, e.g. a warm-up.
- **Rematch:** one tap sets up the same teams again.
- **1-hour delete window:** fix a mistake by deleting and re-logging. After an hour the match is locked for good.
- **Flag a result:** tap ⚑ on a locked match with a reason. The admin then voids it or lets it stand.

**Players & teams**
- Add players by name; duplicates are blocked, ignoring capitals.
- **Edit** a player: set an **alias** ("The Viper") or **delete** them (hidden from lists, history kept, can be restored).
- Add a **team** from two players, with an optional **nickname** ("The Bloodline").
- Every pairing that has played before is bookable automatically.
- Optional **wrestler** per player, from a 2K23 roster list or typed in.

**Stats** (the **Showing** filter switches between one night and all dates)
- **Top tag team** plate in the header.
- **Teams tab:** standings with rank, **▲▼ movement** since the previous night, W–L, win %, current streak and **form trend** (last 5 compared with overall). Tap a team for its profile: longest win and losing streaks, last 5, **nemesis**, nights played, matches per night, **best night** and **worst night**.
- **Players tab:** the same table for individual players. Tap a player for their profile: **best partner**, **most-played partner**, streaks, last 5 and attendance.
- **Records tab:** **best performer**, longest win and losing streaks (team and player), most matches, **biggest rivalry**, and the **streak breakers** log (who ended whose 2+ win streak).

**Accounts and safety**
- **Two logins:** Group (everyone) and Admin (you). Choose on the sign-in screen.
- **Admin only:** void or keep flagged results, restore backups, remove saved teams.
- **Anti-cheat enforced by the database:** scores can never be edited, matches lock after an hour, new matches must carry today's date, and only the admin can resolve flags. See [How it works](#9-how-it-works).
- **Live updates:** every phone sees new results instantly.
- **Backups:** download all matches, players and teams as one file; restore adds back anything missing.
- **Works like an app** when added to a phone's home screen, with light and dark mode.

---

## 2. What you need

| Tool | Version | Check with | Get it from |
|---|---|---|---|
| Node.js | 18 or newer | `node -v` | https://nodejs.org (LTS) |
| Java | 11 or newer | `java -version` | https://adoptium.net (needed only for local runs and the rule tests) |
| A Google account | | | For the Firebase console |

Then install the project's packages once, from the project folder:

```
cd ~/Projects/wwe-tag-ledger
npm install
```

> **Copying commands on a Mac:** run each line on its own. Don't paste anything after a `#` on the same line. The Mac terminal (zsh) passes it to the command, and the command fails.

---

## 3. Run it on your computer

This runs the whole app on your Mac against a fake local database, so you don't need a Firebase project or the internet (except the very first time, to download the emulator).

```
npm run dev:local
```

When you see `Local: http://localhost:5173/`, open that link.

| Login | Password (local only) |
|---|---|
| Group | `group123` |
| Admin | `admin123` |

- Everything you add locally is wiped when you stop it.
- To load real data, sign in as admin and use **Restore backup**.
- Press **Ctrl+C** to stop.
- The first run downloads the Firebase emulator into `.emulators/` in the project folder. That folder is ignored by git.

---

## 4. Deploy from scratch

You only do this once. It takes about 15 minutes.

### 4.1 Create the Firebase project (in the browser)

1. Open https://console.firebase.google.com and click **Create a project**.
   - Name: `wwe-tag-ledger` (or anything you like).
   - Google Analytics: off.
2. **Build → Firestore Database → Create database**
   - Location: the one closest to you (India: `asia-south1` Mumbai). You can't change this later.
   - Start in **production mode**.
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save.**
4. **Authentication → Users → Add user**, twice:

   | Email (type exactly) | Password |
   |---|---|
   | `group@tagledger.app` | The password you'll share with the group (6+ characters) |
   | `admin@tagledger.app` | A different password that only you know |

   These email addresses never receive mail. They're just login names the app uses behind the scenes.

### 4.2 Publish (in Terminal)

Run these one at a time:

```
cd ~/Projects/wwe-tag-ledger
npx firebase login
npx firebase projects:list
```

The list shows your **Project ID**, which is sometimes different from the name, e.g. `wwe-tag-ledger-4f2a1`. Use it here:

```
npx firebase use wwe-tag-ledger --alias default
npm run deploy
```

`npm run deploy` builds the app and uploads **both** the website and the database rules. At the end it prints your link:

```
Hosting URL: https://wwe-tag-ledger.web.app
```

### 4.3 Load the scores and share

1. Open the link, tap **Admin** on the sign-in screen and enter the admin password.
2. Tap **Restore backup** and pick your latest backup file, e.g. `tag-ledger-backup-2026-10-06.json`. Restored matches come back locked.
3. Under **Players & teams**, add any players and teams who aren't there yet.
4. Tap **Sign out**, then send the group the **link and the group password**.
5. Tell everyone to add it to their home screen so it opens like an app:
   - iPhone (Safari): Share → **Add to Home Screen**
   - Android (Chrome): ⋮ → **Add to Home screen**

You're live.

---

## 5. Deploy new changes

Do this every time you change the code, e.g. after asking Claude for a new feature.

1. **Check it locally:**
   ```
   npm run dev:local
   ```
   Open http://localhost:5173, try the change as **Group** and **Admin**, then press **Ctrl+C** to stop.
2. **If `firestore.rules` changed, run the rule tests.** The local app must be stopped first, because both use port 8080.
   ```
   npm run test:rules
   ```
   Every line must say `PASS`. Don't deploy if any say `FAIL`.
3. **Back up the live data first.** Open the live site and tap **Download backup**.
4. **Publish:**
   ```
   npm run deploy
   ```
   It builds the app and uploads the website **and** the database rules. Wait for `Deploy complete!` and the `Hosting URL`.
5. **Check the live site.** Open your `web.app` link, refresh, and log or check something that uses the change.

Phones pick up the new version the next time the page is opened or refreshed. On a home-screen app, close it fully and reopen it.

> **Always deploy the rules and the app together** (`npm run deploy` does both). If the app saves a new kind of data that the live rules don't allow yet, the database refuses it and people see "The database refused…".

**Something went wrong after a deploy?**
- **Website broken:** in the Firebase console, go to **Hosting → Release history**, click ⋮ on the previous release and choose **Rollback**. This takes about a minute and doesn't touch any data.
- **Rules broken:** fix `firestore.rules` and run `npm run deploy` again. Rules can't be rolled back from the Hosting page, so keep the rule tests passing before you deploy.
- **Only want to publish part of it:**
  ```
  npx firebase deploy --only hosting
  npx firebase deploy --only firestore:rules
  ```
  Use these carefully, because of the warning above about deploying rules and app together.

---

## 6. Using the app

**Before the first match:**
- **Players & teams → Add player** for each person.
- **Add team:** pick two players and give them an optional nickname, e.g. "The Bloodline".

**Each match:**
1. **Book a match:** choose a team for the Red corner and one for the Blue corner.
2. Optionally pick the wrestler each player is using.
3. Tap **Team 1 wins** or **Team 2 wins**.
4. If you got it wrong, tap ✕ on the match within **1 hour** to delete it, then log it again. After an hour it's locked. Tap **⚑** on it to flag it for the admin instead.
5. **↻ Rematch** sets up the same teams again.
6. **No count** logs the match but leaves it out of the standings.

**Stats panel:**
- **Showing** (at the top) picks one night or **All dates**. It controls the match card, standings and records.
- **Teams tab:** standings, ▲▼ rank movement (with All dates selected) and form. Tap a team to see its nemesis, nights played, and best and worst nights.
- **Players tab:** player standings. Tap a player to see their best partner, most-played partner and attendance.
- **Records tab:** best performer, longest streaks, biggest rivalry and streak breakers.

**Players & teams → Edit** (any login): set a player's **alias** (shown as "Alias (Name)" in stats), or **Delete** them. A deleted player disappears from the team and booking lists, but their past matches and stats stay. Bring them back from **Deleted players**, or by adding the same name again.

**Flagged results:** anyone can flag a locked result with ⚑ and a reason. It then appears in the red **Flagged results** box on the Match card for everyone. Flagging alone changes nothing.

**Admin login only** (Sign out → tap **Admin** on the sign-in screen → admin password; the header then shows an ADMIN badge):
- **Restore backup**
- Resolving flags: **Void result** (the match stays on the card, marked VOIDED, but no longer counts anywhere) or **Result stands** (removes the flag)
- Removing a team (✕ in Players & teams). Past scores aren't affected.

---

## 7. Maintenance

### After every game night: download a backup

Tap **Download backup** and keep the file somewhere safe, such as Google Drive. It contains every match, player and team.
**The free plan has no automatic backups**, so this file is your only copy if something goes wrong.

### Common changes

| To change | Edit |
|---|---|
| Wrestler names in the picker | `src/lib/roster.js` |
| Delete window (1 hour) | `LOCK_MS` in `src/lib/firebase.js` **and** `duration.value(1, 'h')` in `firestore.rules` |
| Login email addresses | `GROUP_EMAIL` / `ADMIN_EMAIL` in `src/lib/firebase.js` **and** `firestore.rules` **and** the users in Firebase Authentication |
| Minimum matches for Best performer (3) | `MIN` in `records()` in `src/lib/ledger.js` |
| Form window (last 5) | `RECENT` in `src/lib/ledger.js` |
| Colors and fonts | `src/styles.css` (top of the file) |

### Changing a password

The login emails aren't real, so "forgot password" emails can't arrive. Instead:

1. Open the Firebase console and go to **Authentication → Users**.
2. Delete the user, e.g. `group@tagledger.app`.
3. Click **Add user** with the **same email** and the new password.
4. Send the group the new password. Scores, players and teams are untouched.

Phones signed in with the old password are signed out within about an hour and need the new one. This is also how to lock someone out.

### Fixing a mistake

| Problem | Fix |
|---|---|
| Wrong result, less than 1 hour ago | Tap ✕ on the match, then log it again |
| Wrong result, more than 1 hour ago | Tap ⚑ to flag it with a reason. The admin then voids it (it stops counting) or lets it stand. Nobody can change the score itself |
| Typo in a player's name | Edit → Delete the misspelled player, then add the correct name. Past matches keep the old spelling; an alias can tidy up how it's shown |
| Wrong nickname | Add team: pick the same two players and type the new nickname, or leave it empty to remove it |

### Staying within the free plan

| Limit (per day) | What uses it |
|---|---|
| 50,000 database reads | Every time someone opens the app, it reads **every** match |
| 20,000 writes | One per match, player or team added |
| 360 MB hosting transfer | About 0.5 MB per app load |

The read limit is the only one to watch. At around 1,000 matches, each app open reads 1,000 documents, which still allows about 50 opens a day. If you ever hit a limit, the app stops loading until the daily reset (midnight US Pacific time, about 1:30 pm IST). **Nothing is lost and you're never charged.**

Check usage in the Firebase console under **Firestore Database → Usage**. If you get close, ask for the app to load only new matches instead of all of them.

### Updating packages (every few months, optional)

```
npm outdated
npm update
npm run dev:local
npm run deploy
```

Check the app locally before deploying. Don't jump major versions (e.g. React 18 → 19) without testing properly.

---

## 8. Troubleshooting

| Message or problem | Cause and fix |
|---|---|
| `Error: No currently active project` | The folder isn't linked to your Firebase project. Run `npx firebase use <project-id> --alias default`, using the ID from `npx firebase projects:list` |
| `Failed to authenticate` / `not logged in` | Run `npx firebase login` |
| `EACCES: permission denied, mkdir ~/.cache/firebase` | Use `npm run dev:local` / `npm run test:rules`, which store the emulator in the project folder. Or fix the folder's owner: `sudo chown -R $(whoami) ~/.cache` |
| Emulator says port 8080 is already in use | The local app is already running. Stop it with Ctrl+C before running `npm run test:rules` |
| "Couldn't load the app settings" | You opened the built files directly. Use the `web.app` link, or `npm run dev:local` on your computer |
| "The database refused that match" | Sign out and back in. If it keeps happening, the live rules are older than the app: run `npm run deploy` |
| "Wrong password" for everyone | Check the user exists in Firebase **Authentication → Users** with exactly `group@tagledger.app` |
| Scores stop loading, no error | Probably the daily free read limit. It resets about 1:30 pm IST. See *Staying within the free plan* |
| Java not found when running locally | Install Java 11+ from https://adoptium.net |

---

## 9. How it works

### Anti-cheat rules (`firestore.rules`)

- **Matches**
  - Can be **deleted only within 1 hour** of being logged, measured by Google's clock. After that they're locked for everyone, admin included.
  - Scores can **never be edited**.
  - Anyone signed in can **flag** a result once, with a reason. The flag can't be overwritten and can't carry any other change.
  - Only the **admin** can resolve a flag: **void** the match (it stops counting) and/or remove the flag. Even the admin can't change a score.
  - New matches must carry **today's date**. There's a day of slack for time zones, so yesterday is accepted but nothing older.
  - **Restore** (admin only) can add matches with older dates, but only into empty slots: it can't overwrite or remove anything.
- **Players and teams**
  - Anyone signed in can add them. Duplicates are blocked, ignoring capitals.
  - Editing a player can only change the alias and the deleted (hidden) flag. The name itself never changes, because past matches are locked with it.
  - A team's two players can't be changed; only its nickname can.
  - Only the admin can remove a team or permanently remove a player record. In the app, "Delete" just hides a player.
- **Strangers and signed-out visitors** can't read or write anything.

`tests/rules.test.mjs` has 45 tests covering all of this. Run them with `npm run test:rules`.

### Data (Firestore collections)

| Collection | Document id | Fields |
|---|---|---|
| `matches` | random | `date`, `t`, `team1[2]`, `team2[2]`, `wrestlers1[2]`, `wrestlers2[2]` (optional), `winner` (1/2), `counted`, `createdAt`, `flag` `{reason, at}` (optional), `voided` (optional) |
| `players` | lowercase name | `name`, `alias` (optional), `hidden` (optional, true = deleted), `createdAt` |
| `teams` | `player1+player2` in lowercase | `players[2]`, `nick`, `createdAt` |

Stats are worked out on each phone from the matches; nothing extra is stored. Every pairing that has played before is bookable even if it was never added under Players & teams.

### Project layout

```
src/
  App.jsx                 password screen or scoreboard
  components/
    Login.jsx             group / admin password
    Board.jsx             page layout, logging, delete, backup, restore
    BookMatch.jsx         team pickers, wrestler pickers, head-to-head, winner buttons
    PlayerSelect.jsx      wrestler dropdown, or type a new name
    Roster.jsx            add, edit and delete players; add teams with optional nicknames
    MatchCard.jsx         match list, rematch, 1-hour lock countdown, flags
    Stats.jsx             Teams / Players / Records tabs, profiles, streak breakers
  lib/
    firebase.js           Firebase setup, login emails, lock length, local emulator switch
    ledger.js             dates, standings, streaks, records, team options
    profiles.js           all-time stats: rank moves, profiles, streak breakers
    hooks.js              live data from the database, ticking clock
    roster.js             wrestler names offered in the picker
  styles.css
scripts/seed-users.mjs    creates the two local logins for dev:local
firestore.rules           anti-cheat rules (the real enforcement)
tests/rules.test.mjs      45 tests for those rules
firebase.json             hosting, rules and emulator settings
.firebaserc               which Firebase project this folder deploys to
CLAUDE.md                 notes for Claude (AI assistant) when it works on this code
tag-ledger-backup-2026-10-06.json   matches from 6 Oct 2026
```

### Commands

| Command | What it does |
|---|---|
| `npm run dev:local` | Run the app locally with a fake database (no Firebase project needed) |
| `npm run dev` | Run locally against the **real** database. Needs `.env.local` (copy `.env.example`; values are in Firebase console → Project settings → Your apps → Web app). Anything you log here is real |
| `npm run test:rules` | Run the 45 anti-cheat rule tests |
| `npm run build` | Build the site into `dist/` (deploy does this for you) |
| `npm run deploy` | Build and publish the website and the database rules |
