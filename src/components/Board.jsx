import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { addDoc, collection, deleteDoc, deleteField, doc, serverTimestamp, Timestamp, updateDoc, writeBatch } from "firebase/firestore";
import { ADMIN_EMAIL, LOCK_MS } from "../lib/firebase.js";
import { useDocs, useMatches, useNow } from "../lib/hooks.js";
import { allNames, allWrestlers, byTime, computeStats, fmtDate, byLower, nickMap, records, teamKey, teamOptions, todayStr, wrestlersOf, inScope, monthList, monthlyWins, champions, honours, isDay, scopeLabel, chipLabel } from "../lib/ledger.js";
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

// Phones and small tablets show one section at a time, picked in the bottom tab bar (remembered per browser).
// Wider screens show everything as a two-column dashboard and ignore this.
const SECTIONS = [
  ["play", "Play", <><rect x="2" y="6" width="20" height="12" rx="6" /><path d="M7 10v4M5 12h4" /><circle cx="16" cy="11" r="1" /><circle cx="18" cy="13" r="1" /></>],
  ["matches", "Matches", <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />],
  ["stats", "Stats", <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />],
  ["roster", "Roster", <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.5a5 5 0 0 1 6 5" /></>],
];
const SECTION_KEY = "tag-ledger-section";
function loadSection() {
  try { const v = localStorage.getItem(SECTION_KEY); return SECTIONS.some(([k]) => k === v) ? v : "play"; } catch { return "play"; }
}

// Celebration on the gold plate: confetti drifting behind the champion's name. Fixed positions and
// timings (not random) so it doesn't jump on every re-render. Pure CSS; hidden for reduced motion.
const CONFETTI = [
  [6, 0, 3.6, "r"], [14, 1.4, 4.2, "b"], [22, 0.6, 3.2, "w"], [30, 2.2, 4.6, "i"], [38, 0.9, 3.8, "r"],
  [46, 2.8, 3.4, "b"], [54, 0.3, 4.4, "w"], [62, 1.8, 3.6, "r"], [70, 3.1, 4.0, "i"], [78, 1.1, 3.3, "b"],
  [86, 2.5, 4.3, "w"], [94, 0.5, 3.9, "r"],
];
function Confetti() {
  return (
    <span className="confetti" aria-hidden="true">
      {CONFETTI.map(([x, d, t, c], i) => (
        <i key={i} className={"c" + c + (i % 3 === 0 ? " strip" : "")}
          style={{ left: x + "%", animationDelay: d + "s", animationDuration: t + "s" }} />
      ))}
      <b className="shine" />
    </span>
  );
}

// Two gold championship belts, one per tag partner, laid along one diagonal on the champ plate.
// Styled after a modern big-plate title belt, drawn here with an original star emblem (no real logos).
const r1 = (n) => +n.toFixed(1);
// Centre plate outline: flat top, angled shoulders, straight sides, a curved point at the bottom.
const PLATE = "M-33 -48 L33 -48 Q40 -48 45 -44.5 L52 -39.5 Q56 -36.5 56 -30 L56 20 Q56 37 0 51 Q-56 37 -56 20 L-56 -30 Q-56 -36.5 -52 -39.5 L-45 -44.5 Q-40 -48 -33 -48 Z";
// Five-pointed star, outer radius R, inner radius r, centred on (0, cy).
const star = (R, r, cy) => Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const k = i % 2 ? r : R;
  return `${i ? "L" : "M"}${r1(Math.cos(a) * k)} ${r1(cy + Math.sin(a) * k)}`;
}).join(" ") + "Z";
const STAR_OUT = star(22, 9.2, -10);
const STAR_IN = star(16.5, 7, -10);
const STAR_SM = star(6.5, 2.8, 0);

// Stones: diamonds are cut as a rhombus; emeralds (green) and rubies (red) as an emerald-cut octagon.
// Each has a lighter top facet, glints in turn (delay d) and throws a little four-point star of light.
const STONES = {
  diamond: { body: "#d9f4ff", edge: "#5fb8e6", face: "#fff" },
  emerald: { body: "#13a356", edge: "#065c2c", face: "#7cf0ab" },
  ruby: { body: "#d8142a", edge: "#6e0510", face: "#ff8a96" },
};
const Gem = ({ x, y, r, d = 0, kind = "diamond" }) => {
  const c = STONES[kind];
  const w = r * 0.85;
  const body = kind === "diamond"
    ? `M${x} ${y - r}L${x + w} ${y}L${x} ${y + r}L${x - w} ${y}Z`
    : `M${x - w / 2} ${y - r}L${x + w / 2} ${y - r}L${x + w} ${y - r / 2}L${x + w} ${y + r / 2}L${x + w / 2} ${y + r}L${x - w / 2} ${y + r}L${x - w} ${y + r / 2}L${x - w} ${y - r / 2}Z`;
  const face = kind === "diamond"
    ? `M${x} ${y - r}L${x + w} ${y}L${x} ${y - r * 0.15}L${x - w} ${y}Z`
    : `M${x - w / 2} ${y - r}L${x + w / 2} ${y - r}L${x + w * 0.45} ${y - r * 0.2}L${x - w * 0.45} ${y - r * 0.2}Z`;
  const f = r * 4.2;
  return (
    <g className="gem" style={{ "--d": d + "s" }}>
      <path d={body} fill={c.body} stroke={c.edge} strokeWidth=".45" />
      <path d={face} fill={c.face} opacity=".9" />
      <circle cx={x - w * 0.3} cy={y - r * 0.45} r={r * 0.18} fill="#fff" />
      <path className="flare" d={`M${x} ${y - f}L${x + r * 0.22} ${y - r * 0.22}L${x + f} ${y}L${x + r * 0.22} ${y + r * 0.22}L${x} ${y + f}L${x - r * 0.22} ${y + r * 0.22}L${x - f} ${y}L${x - r * 0.22} ${y - r * 0.22}Z`} fill="#fff" />
    </g>
  );
};

// Side plate: gold square with a diamond-studded border and a round red medallion holding a small star.
const SidePlate = ({ x, d }) => (
  <g transform={`translate(${x} 0)`}>
    <rect x="-23" y="-27" width="46" height="54" rx="9" fill="url(#belt-gold)" stroke="#5a3d00" strokeWidth="1" />
    <rect x="-19.5" y="-23.5" width="39" height="47" rx="7" fill="none" stroke="url(#belt-band)" strokeWidth="3.6" />
    <rect x="-19.5" y="-23.5" width="39" height="47" rx="7" fill="none" stroke="#f2fbff" strokeWidth="1.6" strokeDasharray="1.4 1.3" />
    <circle r="15.5" fill="url(#belt-band)" />
    <circle r="13.5" fill="none" stroke="#f2cf68" strokeWidth="1.6" strokeDasharray="1.2 1.1" />
    <circle r="11" fill="#b3151d" stroke="#e8bf4e" strokeWidth="1.2" />
    <path d={STAR_SM} fill="url(#belt-silver)" stroke="#55606a" strokeWidth=".5" />
    <Gem x={0} y={-21.5} r={3.2} d={d} kind="emerald" />
    <Gem x={0} y={21.5} r={3.2} d={d + 0.9} kind="ruby" />
    <Gem x={-16} y={0} r={2} d={d + 0.45} />
    <Gem x={16} y={0} r={2} d={d + 1.3} />
  </g>
);

function OneBelt({ id, delay }) {
  return (
    <g className="one-belt">
      {/* black leather strap with rounded ends and gold piping */}
      <path d="M-110 -34 L-64 -40 L64 -40 L110 -34 Q124 -32 124 -18 L124 18 Q124 32 110 34 L64 40 L-64 40 L-110 34 Q-124 32 -124 18 L-124 -18 Q-124 -32 -110 -34 Z"
        fill="url(#belt-strap)" stroke="#c9972a" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M-108 -30 L-64 -35.5 L64 -35.5 L108 -30 Q119.5 -28 119.5 -16 L119.5 16 Q119.5 28 108 30 L64 35.5 L-64 35.5 L-108 30 Q-119.5 28 -119.5 16 L-119.5 -16 Q-119.5 -28 -108 -30 Z"
        fill="none" stroke="#e6bf5a" strokeWidth=".6" strokeDasharray="2 1.6" opacity=".7" />
      <SidePlate x={-92} d={delay + 0.5} />
      <SidePlate x={92} d={delay + 1.4} />
      {/* gold bars between the side plates and the centre */}
      {[-64, 64].map((x) => <rect key={x} x={x - 2.5} y="-33" width="5" height="66" rx="2.5" fill="url(#belt-gold)" stroke="#5a3d00" strokeWidth=".6" />)}
      {/* centre plate: gold, a deep-gold band set with two rows of diamonds, textured gold field */}
      <path d={PLATE} fill="url(#belt-gold)" stroke="#4a3200" strokeWidth="1.4" strokeLinejoin="round" />
      <path d={PLATE} transform="scale(.9)" fill="url(#belt-band)" />
      <path d={PLATE} transform="scale(.93)" fill="none" stroke="#f2fbff" strokeWidth="1.5" strokeDasharray="1.4 1.2" />
      <path d={PLATE} transform="scale(.87)" fill="none" stroke="#f2fbff" strokeWidth="1.3" strokeDasharray="1.2 1.2" />
      <path d={PLATE} transform="scale(.82)" fill="url(#belt-field)" stroke="#f6dd8a" strokeWidth=".8" />
      <path d={PLATE} transform="scale(.82)" fill="url(#belt-hammer)" opacity=".5" />
      {/* emblem: a big silver star outlined in diamonds over a red swoosh */}
      <path d="M-36 20 Q-4 10 38 8 L35 14 Q-2 15 -33 24 Z" fill="#c1121c" stroke="#6d0a10" strokeWidth=".6" />
      <path d={STAR_OUT} fill="url(#belt-band)" stroke="#5a3d00" strokeWidth=".8" strokeLinejoin="round" />
      <path d={STAR_OUT} fill="none" stroke="#e9f8ff" strokeWidth="1.5" strokeDasharray="1.3 1.1" strokeLinejoin="round" transform="translate(0 -10) scale(.92) translate(0 10)" />
      <path d={STAR_IN} fill="url(#belt-silver)" stroke="#55606a" strokeWidth=".6" strokeLinejoin="round" />
      <Gem x={0} y={-10} r={4.4} d={delay + 0.2} />
      {/* banner across the bottom */}
      <path d="M-30 26 Q0 32 30 26 L28 34 Q0 40 -28 34 Z" fill="#1a1715" stroke="#c9972a" strokeWidth=".6" />
      <text x="0" y="33.6" textAnchor="middle" fontSize="5.4" fontWeight="700" letterSpacing=".6" fill="#f2cf68" fontFamily="Arial, sans-serif">TAG CHAMPIONS</text>
      {/* stones on the plate: emeralds on the shoulders, rubies beside the star, diamonds top and bottom */}
      <Gem x={-44} y={-39} r={4} d={delay + 0.8} kind="emerald" />
      <Gem x={44} y={-39} r={4} d={delay + 1.7} kind="emerald" />
      <Gem x={-31} y={-14} r={3.8} d={delay + 0.5} kind="ruby" />
      <Gem x={31} y={-14} r={3.8} d={delay + 1.4} kind="ruby" />
      <Gem x={0} y={-43} r={3.6} d={delay + 2.0} />
      <Gem x={0} y={44} r={3.6} d={delay + 1.1} />
      {/* a shine sweeping across the centre plate */}
      <g clipPath={`url(#${id})`}>
        <rect className="belt-shine" x="-80" y="-60" width="16" height="120" fill="#fff" opacity=".35" transform="skewX(-20)" />
      </g>
      <clipPath id={id}><path d={PLATE} /></clipPath>
    </g>
  );
}

// Both belts share one angle and sit on a single diagonal, the front one overlapping the back one's strap.
const TILT = -16;
function Belt() {
  return (
    <svg className="belt" viewBox="-176 -122 352 244" role="img" aria-label="Two championship belts">
      <defs>
        <linearGradient id="belt-gold" x1="0" y1="0" x2=".6" y2="1">
          <stop offset="0" stopColor="#fff2b8" /><stop offset=".35" stopColor="#e8bd4a" /><stop offset=".7" stopColor="#bf8a1a" /><stop offset="1" stopColor="#7d5400" />
        </linearGradient>
        <radialGradient id="belt-field" cx=".45" cy=".35" r=".8">
          <stop offset="0" stopColor="#f7dc8c" /><stop offset=".6" stopColor="#d9a93a" /><stop offset="1" stopColor="#a87612" />
        </radialGradient>
        <pattern id="belt-hammer" width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".55" fill="#7d5400" /><circle cx="2.4" cy="2.2" r=".4" fill="#fff4c4" />
        </pattern>
        <linearGradient id="belt-silver" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".5" stopColor="#c9d3da" /><stop offset="1" stopColor="#8b98a3" />
        </linearGradient>
        <linearGradient id="belt-band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a8771a" /><stop offset="1" stopColor="#6a4600" />
        </linearGradient>
        <linearGradient id="belt-strap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3431" /><stop offset=".4" stopColor="#151210" /><stop offset="1" stopColor="#050404" />
        </linearGradient>
      </defs>
      <g transform={`translate(-40 -36) rotate(${TILT})`}><OneBelt id="belt-clip-a" delay={0} /></g>
      <g transform={`translate(40 36) rotate(${TILT})`}><OneBelt id="belt-clip-b" delay={1.1} /></g>
    </svg>
  );
}

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
  const [section, setSectionState] = useState(loadSection);
  const setSection = (k) => {
    setSectionState(k);
    try { localStorage.setItem(SECTION_KEY, k); } catch { /* private mode: just don't remember */ }
    window.scrollTo(0, 0);
  };
  const fileRef = useRef(null);
  const chipsRef = useRef(null);

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
  const months = useMemo(() => monthList(dates), [dates]);
  // The "Showing" filter: all dates, a month, or one date. Defaults to the latest date.
  const session = sessionSel === "all" || dates.includes(sessionSel) || months.includes(sessionSel) ? sessionSel : dates[0] || "all";
  const list = useMemo(
    () => scored.filter((m) => inScope(session, m.date)).sort(byTime),
    [scored, session],
  );
  const { players, teams } = useMemo(() => computeStats(list), [list]);
  const recs = useMemo(() => records(list, players, teams), [list, players, teams]);
  // Nights won per month (all matches), for the "Nights won by month" row in profiles.
  const monthWins = useMemo(() => {
    const all = computeStats(scored);
    return { teams: monthlyWins(all.teams), players: monthlyWins(all.players) };
  }, [scored]);
  // All-time views that span nights; streak breakers are then narrowed to the selected date.
  const moves = useMemo(() => rankMoves(scored), [scored]);
  const teamProf = useMemo(() => teamProfiles(scored), [scored]);
  const playerProf = useMemo(() => playerProfiles(scored), [scored]);
  const allBreaks = useMemo(() => streakBreaks(scored), [scored]);
  const breaks = allBreaks.filter((b) => inScope(session, b.date));
  // The belt: the team(s) that won the most nights (on a single night, the most wins). Ties share it.
  const champs = useMemo(() => champions(teams), [teams]);
  const single = isDay(session);
  // MVP and Biggest night, in the smaller box under the belt.
  const awards = useMemo(() => honours(players, teams, single), [players, teams, single]);
  // Date chips: all dates, then months, then nights (newest first).
  const scopes = useMemo(() => ["all", ...months, ...dates], [months, dates]);
  // Keep the selected chip in view inside its scrolling row (sideways only, so the page doesn't jump).
  useEffect(() => {
    const row = chipsRef.current;
    const on = row?.querySelector(".on");
    if (row && on) row.scrollLeft = on.offsetLeft - row.clientWidth / 2 + on.clientWidth / 2;
  }, [session, scopes.length]);

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
    setSection("play");
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

  const hero = champs.length > 0 && (
    <section className="honours" aria-label="Champions and awards">
      <div className={"plate" + (champs.length > 1 ? " joint" : "")}>
        <Confetti />
        <Belt />
        <div className="who">
          <div className="lbl">{champs.length > 1 ? "Joint tag team champions" : "Tag team champions"} · {chipLabel(session)}</div>
          <div className="names">
            {champs.map((c, i) => (
              <div key={c.name} className="champ">
                {i > 0 && <span className="amp" aria-hidden="true">✦</span>}
                <div>
                  <div className="nm">{nicks[c.name] || c.name}</div>
                  {nicks[c.name] && <div className="lbl">{c.name}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rec">
          {single ? `${champs[0].w} ${champs[0].w === 1 ? "win" : "wins"}` : `${champs[0].nightsWon} ${champs[0].nightsWon === 1 ? "night" : "nights"} won`}
          {champs.length > 1 && <span className="each"> each</span>}
        </div>
      </div>
      {(awards.mvp.length > 0 || awards.bigNight.length > 0) && (
        <div className="prizes">
          {awards.mvp.length > 0 && (
            <div className="prize mvp" title={`Best win % with at least 10 matches · ${scopeLabel(session)}`}>
              <span className="emblem" aria-hidden="true">★</span>
              <div className="txt">
                <span className="lbl">MVP</span>
                <span className="who">{awards.mvp.map((p) => p.name).join(", ")}</span>
                <span className="n">{awards.mvp[0].value}</span>
              </div>
            </div>
          )}
          {awards.bigNight.length > 0 && (
            <div className="prize fire" title={`Most wins by a team in one night · ${scopeLabel(session)}`}>
              <span className="emblem" aria-hidden="true">🔥</span>
              <div className="txt">
                <span className="lbl">Biggest night</span>
                <span className="who">{awards.bigNight.map((d) => nicks[d.name] || d.name).join(", ")}</span>
                <span className="n">{awards.bigNight[0].value} · {awards.bigNight.map((d) => d.sub).filter((x, i, a) => a.indexOf(x) === i).join(", ")}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="app" data-section={section}>
      {/* Ring ropes across the top of the page: red, white, blue. */}
      <div className="ropes" aria-hidden="true"><i /><i /><i /></div>
      <div className="wrap">
        <header>
          <div className="brand">
            <img className="logo" src="/logo.webp" alt="" width="88" height="111" />
            <div className="title">
              <span className="eyebrow">PS5 · Tag team night</span>
              <h1><span className="r">WWE 2K23</span> <span className="b">Scoreboard</span></h1>
              <span className="status">{statusText}{isAdmin && <span className="badge-admin">Admin</span>}</span>
            </div>
          </div>
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
        </header>

        <nav className="scope" aria-label="Showing: applies to the match card, standings, records and rivalries">
          <span className="eyebrow">Showing</span>
          <div className="chips" ref={chipsRef}>
            {scopes.map((k) => (
              <button key={k} type="button" className={"chip-btn" + (k === session ? " on" : "")} aria-pressed={k === session}
                title={scopeLabel(k)} onClick={() => setSessionSel(k)}>{chipLabel(k)}</button>
            ))}
          </div>
        </nav>

        {hero}

        <div className="board">
          <div className="col">
            <div className="sec sec-play">
              <BookMatch matches={scored} teams={teamOpts} wrestlers={wrestlers} slots={slots} resetKey={resetKey}
                setSlot={(k, v) => setSlots((s) => ({ ...s, [k]: v }))} setTeam={setTeam}
                noCount={noCount} setNoCount={setNoCount} onLog={logResult} saving={saving} msg={msg}
                pastDate={pastDate} setPastDate={setPastDate} />
            </div>
            <div className="sec sec-matches">
              <MatchCard list={list} session={session} now={now} onRematch={rematch} onDelete={remove}
                flagged={flagged} isAdmin={isAdmin} onFlag={flagResult} onPickDate={setSessionSel} nicks={nicks}
                onVoid={(m) => resolveFlag(m, true)} onDismiss={(m) => resolveFlag(m, false)} />
            </div>
          </div>
          <div className="col">
            <div className="sec sec-stats">
              <Stats session={session} list={list} monthWins={monthWins} teams={teams} players={players} recs={recs} moves={moves}
                teamProf={teamProf} playerProf={playerProf} breaks={breaks} nicks={nicks} aliases={aliases} />
            </div>
            <div className="sec sec-roster">
              <Roster db={db} isAdmin={isAdmin} names={names} everyone={everyone} deleted={deleted}
                playerDocs={playerDocs} teamDocs={teamDocs} teams={teamOpts} />
            </div>
          </div>
        </div>
      </div>

      <nav className="tabbar" aria-label="Sections">
        {SECTIONS.map(([k, label, icon]) => (
          <button key={k} type="button" className={section === k ? "on" : ""} aria-current={section === k ? "page" : undefined}
            onClick={() => setSection(k)}>
            <span className="ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icon}</svg></span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
