import { useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, deleteField, doc, serverTimestamp, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
import { ADMIN_EMAIL, LOCK_MS } from "../lib/firebase.js";
import { useDocs, useMatches, useNow } from "../lib/hooks.js";
import { allNames, allWrestlers, byTime, computeStats, fmtDate, byLower, nickMap, pct, records, teamKey, teamOptions, todayStr, wrestlersOf } from "../lib/ledger.js";
import { playerProfiles, rankMoves, streakBreaks, teamProfiles } from "../lib/profiles.js";
import { ROSTER } from "../lib/roster.js";
import BookMatch from "./BookMatch.jsx";
import MatchCard from "./MatchCard.jsx";
import Roster from "./Roster.jsx";
import Stats from "./Stats.jsx";

const PLAYERS = ["a1", "a2", "b1", "b2"];
// Player slots, plus "w"-prefixed slots for the wrestler each one plays as.
const EMPTY = { a1: "", a2: "", b1: "", b2: "", wa1: "", wa2: "", wb1: "", wb2: "" };
const clean = (s) => s.trim().replace(/\s+/g, " ");

export default function Board({ fb, user }) {
  const { db, auth } = fb;
  const isAdmin = user.email === ADMIN_EMAIL;
  const { matches, status } = useMatches(db);
  const playerDocs = useDocs(db, "players");
  const teamDocs = useDocs(db, "teams");
  const now = useNow(30000);

  const [slots, setSlots] = useState(EMPTY);
  const [resetKey, setResetKey] = useState(0);
  const [noCount, setNoCount] = useState(false);
  // The date to log a result under. Empty means today; a past date is saved as "added later".
  const [pastDate, setPastDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sessionSel, setSessionSel] = useState(null);
  const fileRef = useRef(null);

  // Players and teams: everyone added, plus everyone who has played before, minus deleted players.
  const deleted = useMemo(() => new Set(playerDocs.filter((p) => p.hidden).map((p) => p.id)), [playerDocs]);
  const aliases = useMemo(() => Object.fromEntries(playerDocs.filter((p) => p.alias).map((p) => [p.name, p.alias])), [playerDocs]);
  const everyone = useMemo(() => allNames(matches, playerDocs.map((p) => p.name)), [matches, playerDocs]);
  const names = useMemo(() => everyone.filter((n) => !deleted.has(n.toLowerCase())), [everyone, deleted]);
  const teamOpts = useMemo(
    () => teamOptions(matches, teamDocs).filter((t) => t.players.every((n) => !deleted.has(n.toLowerCase()))),
    [matches, teamDocs, deleted],
  );
  // Voided results stay on the match card but stop counting everywhere, like no-count matches.
  const scored = useMemo(() => matches.map((m) => (m.voided ? { ...m, counted: false } : m)), [matches]);
  const flagged = useMemo(() => matches.filter((m) => m.flag && !m.voided).sort(byTime), [matches]);
  const nicks = useMemo(() => nickMap(teamDocs), [teamDocs]);
  const wrestlers = useMemo(() => allWrestlers(matches, ROSTER), [matches]);
  const dates = useMemo(() => [...new Set(matches.map((m) => m.date))].sort().reverse(), [matches]);
  const session = sessionSel === "all" || dates.includes(sessionSel) ? sessionSel : dates[0] || "all";
  const list = useMemo(
    () => (session === "all" ? scored : scored.filter((m) => m.date === session)).slice().sort(byTime),
    [scored, session],
  );
  const { players, teams } = useMemo(() => computeStats(list), [list]);
  const recs = useMemo(() => records(list, players, teams), [list, players, teams]);
  // All-time views that span nights; streak breakers are then narrowed to the selected date.
  const moves = useMemo(() => rankMoves(scored), [scored]);
  const teamProf = useMemo(() => teamProfiles(scored), [scored]);
  const playerProf = useMemo(() => playerProfiles(scored), [scored]);
  const allBreaks = useMemo(() => streakBreaks(scored), [scored]);
  const breaks = session === "all" ? allBreaks : allBreaks.filter((b) => b.date === session);
  const lead = teams[0];

  const say = (text, kind = "ok") => setMsg({ text, kind });
  const fillSlots = (m) => {
    const [w1, w2] = [wrestlersOf(m, 1), wrestlersOf(m, 2)];
    setSlots({ a1: m.team1[0], a2: m.team1[1], b1: m.team2[0], b2: m.team2[1], wa1: w1[0], wa2: w1[1], wb1: w2[0], wb2: w2[1] });
    setResetKey((k) => k + 1);
  };
  // Picking a team for a corner fills its two players and clears that corner's wrestlers.
  const setTeam = (side, team) => {
    const [p, w] = side === 1 ? [["a1", "a2"], ["wa1", "wa2"]] : [["b1", "b2"], ["wb1", "wb2"]];
    const players = team ? team.players : ["", ""];
    setSlots((s) => ({ ...s, [p[0]]: players[0], [p[1]]: players[1], [w[0]]: "", [w[1]]: "" }));
  };

  async function logResult(winner) {
    const v = Object.fromEntries(Object.entries(slots).map(([k, x]) => [k, clean(x)]));
    if (PLAYERS.some((k) => !v[k])) return say("Choose a team for both corners before logging the result.", "err");
    if (new Set(PLAYERS.map((k) => v[k].toLowerCase())).size < 4) {
      return say("A player can't be on both teams. Choose a different team for one corner.", "err");
    }
    // Reuse the existing spelling when a typed wrestler matches a known one.
    const canonW = (n) => wrestlers.find((k) => k.toLowerCase() === n.toLowerCase()) || n;
    const today = todayStr();
    const date = pastDate || today;
    if (date > today) return say("That date is in the future. Pick today or an earlier date.", "err");
    const past = date !== today;
    const rec = {
      date,
      t: Date.now(),
      team1: [v.a1, v.a2],
      team2: [v.b1, v.b2],
      wrestlers1: [canonW(v.wa1), canonW(v.wa2)],
      wrestlers2: [canonW(v.wb1), canonW(v.wb2)],
      winner,
      counted: !noCount,
      ...(past && { late: true }),
    };
    setSaving(true);
    try {
      await addDoc(collection(db, "matches"), { ...rec, createdAt: serverTimestamp() });
      fillSlots(rec);
      setNoCount(false);
      setSessionSel(rec.date);
      say(`Logged${past ? " for " + fmtDate(date) : ""}: ${rec["team" + winner].join(" & ")} win${rec.counted ? "" : " (no count)"}. You can delete it for the next hour.`);
    } catch (err) {
      say(err?.code === "permission-denied"
        ? "The database refused that match. Sign out and back in, then try again."
        : "Couldn't save that match. Check your connection and try again.", "err");
    } finally {
      setSaving(false);
    }
  }

  function rematch(m) {
    fillSlots(m);
    setNoCount(false);
    say(`Rematch set: ${m.team1.join(" & ")} vs ${m.team2.join(" & ")}. Tap the winning side.`);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("bookH")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  async function remove(id) {
    try {
      await deleteDoc(doc(db, "matches", id));
      say("Match deleted.");
    } catch (err) {
      say(err?.code === "permission-denied"
        ? "That match is locked. Matches can only be deleted within 1 hour of being logged."
        : "Couldn't delete that match. Check your connection and try again.", "err");
    }
  }

  // Anyone can flag a locked result they think is wrong; the admin then voids it or lets it stand.
  async function flagResult(m) {
    const reason = window.prompt(
      `What's wrong with this result?\n${m["team" + m.winner].join(" & ")} beat ${m["team" + (3 - m.winner)].join(" & ")}`,
    )?.trim();
    if (!reason) return;
    try {
      await updateDoc(doc(db, "matches", m.id), { flag: { reason: reason.slice(0, 140), at: serverTimestamp() } });
      say("Result flagged. The admin will void it or let it stand.");
    } catch {
      say("Couldn't flag that result. It may already be flagged; reload and check.", "err");
    }
  }

  async function resolveFlag(m, voidIt) {
    try {
      await updateDoc(doc(db, "matches", m.id), voidIt ? { voided: true } : { flag: deleteField() });
      say(voidIt ? "Result voided. It no longer counts." : "Flag removed. The result stands.");
    } catch {
      say("Couldn't update that result. Check your connection and try again.", "err");
    }
  }

  function exportBackup() {
    const data = {
      app: "tag-ledger", // backup format id; kept so older backups and this one stay compatible
      exportedAt: new Date().toISOString(),
      matches: matches.slice().sort(byTime).map(({ ca, flag, ...m }) => ({
        ...m, createdAt: ca, ...(flag && { flag: { reason: flag.reason, at: flag.at?.toMillis?.() ?? null } }),
      })),
      players: playerDocs.map((p) => ({ name: p.name, alias: p.alias || "", hidden: !!p.hidden })),
      teams: teamDocs.map((t) => ({ players: t.players, nick: t.nick || "" })),
    };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    a.download = `wwe2k23-scoreboard-backup-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    say(`Backup downloaded (${matches.length} matches, ${playerDocs.length} players, ${teamDocs.length} teams).`);
  }

  // Admin only: adds matches missing from the database, never changes existing ones.
  // Restored matches come back already locked.
  async function importBackup(file) {
    let list, j;
    try {
      j = JSON.parse(await file.text());
      list = Array.isArray(j) ? j : j.matches;
      if (!Array.isArray(list)) throw new Error();
    } catch {
      return say("That file isn't a Scoreboard backup. Pick a file you downloaded with Download backup.", "err");
    }
    const have = new Set(matches.map((m) => m.id));
    const missing = list.filter((m) => m && !(m.id && have.has(String(m.id))) && m.date
      && Array.isArray(m.team1) && Array.isArray(m.team2) && (m.winner === 1 || m.winner === 2));
    // Players and teams from newer backups: add the ones that aren't here yet.
    const havePlayers = new Set(playerDocs.map((p) => p.id));
    // Older backups list players as plain names; newer ones as { name, alias, hidden }.
    const newPlayers = (Array.isArray(j.players) ? j.players : [])
      .map((p) => (typeof p === "string" ? { name: p } : p))
      .filter((p) => p && typeof p.name === "string")
      .map((p) => ({ name: p.name, alias: String(p.alias || "").slice(0, 30), hidden: p.hidden === true }))
      .filter((p) => p.name && !p.name.includes("/") && p.name.length <= 30 && !havePlayers.has(p.name.toLowerCase()));
    const haveTeams = new Set(teamDocs.map((t) => t.id));
    const newTeams = (Array.isArray(j.teams) ? j.teams : [])
      .filter((t) => Array.isArray(t?.players) && t.players.length === 2)
      .map((t) => ({ players: byLower(t.players.map(String)), nick: String(t.nick || "").slice(0, 30) }))
      .filter((t) => t.players[0].toLowerCase() !== t.players[1].toLowerCase() && !haveTeams.has(teamKey(t.players)));
    if (!missing.length && !newPlayers.length && !newTeams.length) {
      return say("Nothing to restore. Everything in that backup is already here.");
    }
    if (newPlayers.length || newTeams.length) {
      try {
        const b = writeBatch(db);
        newPlayers.forEach((p) => b.set(doc(db, "players", p.name.toLowerCase()), { ...p, createdAt: serverTimestamp() }));
        newTeams.forEach((t) => b.set(doc(db, "teams", teamKey(t.players)), { ...t, createdAt: serverTimestamp() }));
        await b.commit();
      } catch {
        return say("Couldn't restore the players and teams. Check your connection and try again.", "err");
      }
    }
    const lockedAt = Date.now() - LOCK_MS - 60000;
    try {
      for (let k = 0; k < missing.length; k += 400) {
        const b = writeBatch(db);
        missing.slice(k, k + 400).forEach((m) => {
          const ref = m.id ? doc(db, "matches", String(m.id)) : doc(collection(db, "matches"));
          b.set(ref, {
            date: String(m.date),
            t: Number(m.t) || Date.now(),
            team1: m.team1.slice(0, 2).map(String),
            team2: m.team2.slice(0, 2).map(String),
            ...[1, 2].reduce((o, side) => {
              const w = m["wrestlers" + side];
              return Array.isArray(w) && w.length === 2 ? { ...o, ["wrestlers" + side]: w.map(String) } : o;
            }, {}),
            winner: m.winner,
            // A voided match comes back as no-count, so it still doesn't count.
            counted: m.counted !== false && !m.voided,
            ...(m.late === true && { late: true }),
            createdAt: Timestamp.fromMillis(Math.min(Number(m.createdAt) || lockedAt, lockedAt)),
          });
        });
        await b.commit();
      }
      say(`Restored ${missing.length} matches, ${newPlayers.length} players and ${newTeams.length} teams from the backup.`);
    } catch {
      say("Couldn't restore the backup. Check your connection and try again.", "err");
    }
  }

  const statusText = {
    connecting: "Connecting to the scorebook…",
    live: "Shared scorebook · updates live for everyone",
    error: "Lost the connection to the scorebook. Reload the page to reconnect.",
  }[status];

  return (
    <div className="wrap">
      <header>
        <div className="brand">
          <img className="logo" src="/logo.webp" alt="" width="88" height="111" />
          <div className="title">
            <span className="eyebrow">PS5 · Tag team night</span>
            <h1><span className="r">WWE 2K23</span> <span className="b">Scoreboard</span></h1>
            <span className="status">{statusText}{isAdmin && <span className="badge-admin">Admin</span>}</span>
            <div className="tools">
              <button className="tool" type="button" onClick={exportBackup}>Download backup</button>
              {isAdmin && (
                <>
                  <button className="tool" type="button" onClick={() => fileRef.current?.click()}>Restore backup</button>
                  <input ref={fileRef} type="file" accept="application/json,.json" hidden
                    onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) importBackup(f); }} />
                </>
              )}
              <button className="tool" type="button" onClick={() => signOut(auth)}>Sign out</button>
            </div>
          </div>
        </div>
        {lead && (
          <div className="plate">
            <div>
              <div className="lbl">{session === "all" ? "All-time top tag team" : "Top tag team · " + fmtDate(session)}</div>
              <div className="nm">{nicks[lead.name] || lead.name}</div>
              {nicks[lead.name] && <div className="lbl">{lead.name}</div>}
            </div>
            <div className="rec">{lead.w}–{lead.l} · {pct(lead.w, lead.l)}%</div>
          </div>
        )}
      </header>

      <div className="scope">
        <label className="eyebrow" htmlFor="session">Showing</label>
        <select id="session" value={session} onChange={(e) => setSessionSel(e.target.value)}>
          {dates.map((d) => <option key={d} value={d}>{fmtDate(d)}</option>)}
          <option value="all">All dates</option>
        </select>
        <span className="note">Applies to the match card, standings and records.</span>
      </div>

      <div className="board">
        <div className="col">
          <BookMatch matches={scored} teams={teamOpts} wrestlers={wrestlers} slots={slots} resetKey={resetKey}
            setSlot={(k, v) => setSlots((s) => ({ ...s, [k]: v }))} setTeam={setTeam}
            noCount={noCount} setNoCount={setNoCount} onLog={logResult} saving={saving} msg={msg}
            pastDate={pastDate} setPastDate={setPastDate} />
          <MatchCard list={list} session={session} now={now} onRematch={rematch} onDelete={remove}
            flagged={flagged} isAdmin={isAdmin} onFlag={flagResult}
            onVoid={(m) => resolveFlag(m, true)} onDismiss={(m) => resolveFlag(m, false)} />
          <Roster db={db} isAdmin={isAdmin} names={names} everyone={everyone} deleted={deleted}
            playerDocs={playerDocs} teamDocs={teamDocs} teams={teamOpts} />
        </div>
        <div className="col">
          <Stats session={session} teams={teams} players={players} recs={recs} moves={moves}
            teamProf={teamProf} playerProf={playerProf} breaks={breaks} nicks={nicks} aliases={aliases} />
        </div>
      </div>
    </div>
  );
}
