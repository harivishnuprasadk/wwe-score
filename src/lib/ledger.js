// Pure helpers: dates, matchups and standings.
import { matchups } from "./rivalry.js";

export function todayStr(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function fmtDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// The "Showing" filter: "all", a month ("2026-10") or a single date ("2026-10-07").
export const isDay = (scope) => scope.length === 10;
export const inScope = (scope, date) => scope === "all" || date.startsWith(scope);
// Months offered in the filter: every month from the app's first season (October 2026) to the current one,
// newest first, plus any other month that has matches (e.g. results backfilled from earlier).
export const FIRST_MONTH = "2026-10";
export function monthList(dates, today = todayStr()) {
  const set = new Set(dates.map((d) => d.slice(0, 7)));
  let [y, m] = FIRST_MONTH.split("-").map(Number);
  const end = today.slice(0, 7);
  for (let k = `${y}-${String(m).padStart(2, "0")}`; k <= end; k = `${y}-${String(m).padStart(2, "0")}`) {
    set.add(k);
    m === 12 ? (y++, (m = 1)) : m++;
  }
  return [...set].sort().reverse();
}

export function scopeLabel(scope) {
  if (scope === "all") return "All dates";
  if (isDay(scope)) return fmtDate(scope);
  const [y, m] = scope.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export const byTime = (a, b) => a.date.localeCompare(b.date) || a.t - b.t;
export const pct = (w, l) => (w + l ? Math.round((100 * w) / (w + l)) : 0);

export const teamKey = (team) => team.map((n) => n.toLowerCase()).sort().join("+");
const boutKey = (m) => [teamKey(m.team1), teamKey(m.team2)].sort().join("|");
export const sameBout = (a, b) => boutKey(a) === boutKey(b);

export function allNames(matches, extra = []) {
  const s = new Set(extra);
  matches.forEach((m) => [...m.team1, ...m.team2].forEach((n) => s.add(n)));
  return [...s].sort((a, b) => a.localeCompare(b));
}

// Two players in lowercase character order, the order the database rules expect for a team.
export const byLower = (players) => [...players].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1));

// Teams you can book: every added team, plus every pairing that has played before.
// Each is { key, players, nick, label } with players in the same order as the team's id.
export function teamOptions(matches, teamDocs) {
  const byKey = {};
  const add = (players, nick = "") => {
    const sorted = byLower(players);
    const key = teamKey(sorted);
    if (!byKey[key] || nick) byKey[key] = { key, players: sorted, nick };
  };
  matches.forEach((m) => { add(m.team1); add(m.team2); });
  teamDocs.forEach((t) => add(t.players, t.nick || ""));
  return Object.values(byKey)
    .map((t) => ({ ...t, label: (t.nick ? t.nick + " · " : "") + t.players.join(" & ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// Team nicknames, keyed by the "A & B" team name used in the standings.
export function nickMap(teamDocs) {
  const out = {};
  teamDocs.forEach((t) => { if (t.nick) out[teamName(t.players)] = t.nick; });
  return out;
}

export function allWrestlers(matches, extra = []) {
  const s = new Set(extra);
  matches.forEach((m) => [...wrestlersOf(m, 1), ...wrestlersOf(m, 2)].forEach((n) => n && s.add(n)));
  return [...s].sort((a, b) => a.localeCompare(b));
}

// Wrestler picked for each player on a side ("" when none). Older matches have no wrestlers.
export const wrestlersOf = (m, side) => m["wrestlers" + side] || ["", ""];

// Day-wise performance. Each night a team or player plays is one "day": a winning day (W) when they
// won more matches than they lost that night, a losing day (L) when they lost more, an even day (E) otherwise.
// Streaks count W or L days in a row; even days are skipped (they neither extend nor break a streak).
const dayResult = (d) => (d.w > d.l ? "W" : d.w < d.l ? "L" : "E");

// Current streak ("W3" = three winning days in a row), plus the longest W and L runs.
export function dayStreaks(days) {
  const res = days.map(dayResult).filter((r) => r !== "E");
  const last = res[res.length - 1];
  let k = 0;
  for (let i = res.length - 1; i >= 0 && res[i] === last; i--) k++;
  const run = { W: 0, L: 0 };
  let cur = 0;
  res.forEach((r, i) => {
    cur = r === res[i - 1] ? cur + 1 : 1;
    run[r] = Math.max(run[r], cur);
  });
  return { streak: last ? last + k : "", best: run.W, worst: run.L };
}

// Form window: the last RECENT nights. Trend compares their win % with overall, so it needs more nights than that.
export const RECENT = 2;
export function trendOf(days) {
  if (days.length <= RECENT) return null;
  const sum = (ds) => ds.reduce((a, d) => ({ w: a.w + d.w, l: a.l + d.l }), { w: 0, l: 0 });
  const r = sum(days.slice(-RECENT));
  const o = sum(days);
  const recent = pct(r.w, r.l);
  const overall = pct(o.w, o.l);
  const d = recent - overall;
  return { recent, overall, dir: d >= 10 ? "up" : d <= -10 ? "down" : "flat" };
}

// Display name for a pairing, the same whichever order the partners were picked in.
export const teamName = (team) => [...team].sort((a, b) => a.localeCompare(b)).join(" & ");

// Standings for a list of matches (one night, or all dates). Streaks, form and trend are day-wise,
// so with one date selected they describe that single day, and across all dates they run night by night.
export function computeStats(list) {
  const ps = {};
  const ts = {};
  const tally = (map, name, date, won) => {
    const x = (map[name] ||= { name, w: 0, l: 0, byDate: {} });
    const d = (x.byDate[date] ||= { date, w: 0, l: 0 });
    won ? (x.w++, d.w++) : (x.l++, d.l++);
  };
  list.filter((m) => m.counted).sort(byTime).forEach((m) => {
    [1, 2].forEach((side) => {
      const team = m["team" + side];
      const won = m.winner === side;
      team.forEach((n) => tally(ps, n, m.date, won));
      tally(ts, teamName(team), m.date, won);
    });
  });
  // Standings order: most wins, then fewest losses, then name. Win % alone would put a 1–0 team above a 9–2 one.
  const rank = (a, b) => b.w - a.w || a.l - b.l || a.name.localeCompare(b.name);
  const finish = ({ byDate, ...x }) => {
    const days = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map((d) => ({ ...d, net: d.w - d.l }));
    // Biggest net; on a tie, more wins, then the later night (same order as the profile's best night).
    const bestDay = days.reduce((b, d) => (!b || d.net > b.net || (d.net === b.net && d.w >= b.w) ? d : b), null);
    return {
      ...x,
      net: x.w - x.l,
      days,
      nightsWon: days.filter((d) => d.net > 0).length,
      ...dayStreaks(days),
      form: days.slice(-RECENT).map(dayResult),
      trend: trendOf(days),
      bestDay,
    };
  };
  return {
    players: Object.values(ps).map(finish).sort(rank),
    teams: Object.values(ts).map(finish).sort(rank),
  };
}

// Rows that won the most nights in this list (ties share it). Needs at least two nights in play,
// otherwise everyone who won the one night would tie.
export function mostNights(rows) {
  const nights = new Set(rows.flatMap((x) => x.days.map((d) => d.date)));
  const top = Math.max(0, ...rows.map((x) => x.nightsWon));
  if (nights.size < 2 || top === 0) return { n: 0, names: new Set() };
  return { n: top, names: new Set(rows.filter((x) => x.nightsWon === top).map((x) => x.name)) };
}

// Nights won per month for each row of computeStats (teams or players): { name: { "2026-10": 3, ... } }.
// A night won = more wins than losses that night, same as the day-wise streaks.
export function monthlyWins(rows) {
  const out = {};
  rows.forEach((x) => {
    const byMonth = (out[x.name] = {});
    x.days.filter((d) => d.net > 0).forEach((d) => {
      const m = d.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
  });
  return out;
}

// Head-to-head between two teams, whichever corner each was in. No-count matches are skipped.
export function headToHead(matches, team1, team2, date) {
  const t1 = teamKey(team1);
  const t2 = teamKey(team2);
  const r = { all: [0, 0], day: [0, 0] };
  matches.forEach((m) => {
    if (!m.counted) return;
    const k1 = teamKey(m.team1);
    const k2 = teamKey(m.team2);
    let win;
    if (k1 === t1 && k2 === t2) win = m.winner;
    else if (k1 === t2 && k2 === t1) win = 3 - m.winner;
    else return;
    r.all[win - 1]++;
    if (m.date === date) r.day[win - 1]++;
  });
  return r;
}

// Highlights for the Records panel. Each is null until there's something to show.
// Streak records count winning / losing days in a row (see dayStreaks); "best day" is the biggest single-night net.
export function records(list, players, teams) {
  const top = (arr, f) => arr.reduce((b, x) => (f(x) > (b ? f(b) : 0) ? x : b), null);
  const pick = (x, value) => (x ? { name: x.name, value } : null);
  // A rivalry needs at least two meetings.
  const rival = matchups(list).find((r) => r.n > 1);
  const tWin = top(teams, (t) => t.best);
  const tLoss = top(teams, (t) => t.worst);
  const pWin = top(players, (p) => p.best);
  const pLoss = top(players, (p) => p.worst);
  const busy = top(teams, (t) => t.w + t.l);
  const tDay = top(teams, (t) => t.bestDay.net);
  const pDay = top(players, (p) => p.bestDay.net);
  const days = (n) => n + (n === 1 ? " day" : " days");
  const nightsTile = (rows) => {
    const m = mostNights(rows);
    if (!m.n) return null;
    const names = [...m.names];
    // A consolation prize, unless the no. 1 in the standings also won the most nights.
    return { name: names.join(", "), value: `${m.n} nights won`, shared: names.length > 1, consolation: !m.names.has(rows[0].name) };
  };
  const dayPick = (x) => x && { name: x.name, value: `+${x.bestDay.net} · ${x.bestDay.w}–${x.bestDay.l}`, sub: fmtDate(x.bestDay.date) };
  // Best win % (then most wins) among players with 3+ matches; anyone counts until someone has 3.
  const MIN = 3;
  const byPct = players.slice().sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l) || b.w - a.w || a.name.localeCompare(b.name));
  const best = byPct.find((p) => p.w + p.l >= MIN) || byPct[0];
  return {
    best: best && { name: best.name, value: `${pct(best.w, best.l)}% · ${best.w}–${best.l}` },
    teamWin: pick(tWin, tWin && days(tWin.best)),
    teamLoss: pick(tLoss, tLoss && days(tLoss.worst)),
    playerWin: pick(pWin, pWin && days(pWin.best)),
    playerLoss: pick(pLoss, pLoss && days(pLoss.worst)),
    teamDay: dayPick(tDay),
    playerDay: dayPick(pDay),
    busiest: pick(busy, busy && busy.w + busy.l + " matches"),
    teamNights: nightsTile(teams),
    playerNights: nightsTile(players),
    rivalry: rival && { name: `${rival.a} vs ${rival.b} · ${rival.n} meetings`, value: `${rival.aw}–${rival.n - rival.aw}` },
  };
}
