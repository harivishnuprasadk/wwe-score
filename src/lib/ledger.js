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
// Each is { key, players, nick, label, played } with players in the same order as the team's id;
// played counts every match the pairing was in (no-count ones too), for "most played first" pickers.
export function teamOptions(matches, teamDocs) {
  const byKey = {};
  const played = {};
  const add = (players, nick = "") => {
    const sorted = byLower(players);
    const key = teamKey(sorted);
    if (!byKey[key] || nick) byKey[key] = { key, players: sorted, nick };
    return key;
  };
  matches.forEach((m) => [m.team1, m.team2].forEach((t) => { const k = add(t); played[k] = (played[k] || 0) + 1; }));
  teamDocs.forEach((t) => add(t.players, t.nick || ""));
  return Object.values(byKey)
    .map((t) => ({ ...t, label: (t.nick ? t.nick + " · " : "") + t.players.join(" & "), played: played[t.key] || 0 }))
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
// A night is won by whoever had the most wins that night (ties share it): teams against teams, players
// against players. Teams are ranked by nights won, then most wins, then fewest losses (user's choice,
// 2026-11-18); players stay ranked by wins. Streaks and form still use each row's own W/L/E day.
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
  // Most wins, then fewest losses, then name. Win % alone would put a 1–0 team above a 9–2 one.
  const byWins = (a, b) => b.w - a.w || a.l - b.l || a.name.localeCompare(b.name);
  const byNights = (a, b) => b.nightsWon - a.nightsWon || byWins(a, b);
  const finish = (rows) => {
    // Top wins on each night across these rows; anyone who matched it won that night.
    const top = {};
    rows.forEach((x) => Object.values(x.byDate).forEach((d) => { top[d.date] = Math.max(top[d.date] || 0, d.w); }));
    return rows.map(({ byDate, ...x }) => {
      const days = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
        .map((d) => ({ ...d, net: d.w - d.l, top: d.w > 0 && d.w === top[d.date] }));
      // Biggest net; on a tie, more wins, then the later night (same order as the profile's best night).
      const bestDay = days.reduce((b, d) => (!b || d.net > b.net || (d.net === b.net && d.w >= b.w) ? d : b), null);
      return {
        ...x,
        net: x.w - x.l,
        days,
        nightsWon: days.filter((d) => d.top).length,
        ...dayStreaks(days),
        form: days.slice(-RECENT).map(dayResult),
        trend: trendOf(days),
        bestDay,
      };
    });
  };
  return {
    players: finish(Object.values(ps)).sort(byWins),
    teams: finish(Object.values(ts)).sort(byNights),
  };
}

// The tag team champions: every team with the most nights won (ties share the belt). On a single
// night that's whoever had the most wins. Empty until someone has won a night.
export function champions(teams) {
  const n = teams[0]?.nightsWon || 0;
  return n ? teams.filter((t) => t.nightsWon === n) : [];
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
// A night won = most wins that night, same as the standings.
export function monthlyWins(rows) {
  const out = {};
  rows.forEach((x) => {
    const byMonth = (out[x.name] = {});
    x.days.filter((d) => d.top).forEach((d) => {
      const m = d.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
  });
  return out;
}

// The two awards under the belt, for the selected dates.
// MVP: best win % among players with at least MVP_MIN matches (ties share it); none until someone qualifies.
// Biggest night: the most wins any team had in one night (ties share it); only when more than one night is on view.
export const MVP_MIN = 10;
export function honours(players, teams, single) {
  const ok = players.filter((p) => p.w + p.l >= MVP_MIN);
  // Compare win % exactly (cross-multiplied) so equal records really tie.
  const better = (a, b) => a.w * (b.w + b.l) - b.w * (a.w + a.l);
  const best = ok.reduce((b, p) => (!b || better(p, b) > 0 ? p : b), null);
  const mvp = best ? ok.filter((p) => better(p, best) === 0).sort((a, b) => b.w - a.w || a.name.localeCompare(b.name)) : [];
  let big = [];
  if (!single) {
    const nights = teams.flatMap((t) => t.days.map((d) => ({ name: t.name, ...d })));
    const most = Math.max(0, ...nights.map((d) => d.w));
    if (most) big = nights.filter((d) => d.w === most).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  }
  return {
    mvp: mvp.map((p) => ({ name: p.name, value: `${pct(p.w, p.l)}% · ${p.w}–${p.l}` })),
    bigNight: big.map((d) => ({ name: d.name, value: `${d.w} wins`, sub: fmtDate(d.date) })),
  };
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
// Counted matches by month, for the month records: how many per month, and each player's and team's
// W–L in each month. Follows the date filter because it's given the filtered list.
export function monthCounts(list) {
  const perMonth = {};
  const players = {};
  const teams = {};
  const add = (bucket, name, month, won) => {
    const r = ((bucket[name] ||= {})[month] ||= { w: 0, l: 0 });
    won ? r.w++ : r.l++;
  };
  list.filter((m) => m.counted).forEach((m) => {
    const month = m.date.slice(0, 7);
    perMonth[month] = (perMonth[month] || 0) + 1;
    [m.team1, m.team2].forEach((team, i) => {
      const won = m.winner === i + 1;
      add(teams, teamName(team), month, won);
      team.forEach((n) => add(players, n, month, won));
    });
  });
  return {
    perMonth: Object.entries(perMonth).map(([month, n]) => ({ month, n })).sort((a, b) => b.month.localeCompare(a.month)),
    players,
    teams,
  };
}

// Flattens { name: { month: {w, l} } } into one row per name and month.
const monthRows = (byName) =>
  Object.entries(byName).flatMap(([name, months]) => Object.entries(months).map(([month, r]) => ({ name, month, ...r })));

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
    return { name: names.join(", "), value: `${m.n} nights won`, shared: names.length > 1 };
  };
  const dayPick = (x) => x && { name: x.name, value: `+${x.bestDay.net} · ${x.bestDay.w}–${x.bestDay.l}`, sub: fmtDate(x.bestDay.date) };
  // Best win % (then most wins) among players with 3+ matches; anyone counts until someone has 3.
  const MIN = 3;
  const byPct = players.slice().sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l) || b.w - a.w || a.name.localeCompare(b.name));
  const best = byPct.find((p) => p.w + p.l >= MIN) || byPct[0];
  // Month records. Best month uses the Best performer rule: best win %, then most wins, at least 3 matches.
  const mc = monthCounts(list);
  const total = mc.perMonth.reduce((s, x) => s + x.n, 0);
  const busyMonth = mc.perMonth.length > 1 ? mc.perMonth.reduce((b, x) => (x.n > b.n ? x : b)) : null;
  const pMonths = monthRows(mc.players);
  const pBusyMonth = top(pMonths, (r) => r.w + r.l);
  const bestMonth = (rows) => {
    const sorted = rows.slice().sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l) || b.w - a.w || a.month.localeCompare(b.month) || a.name.localeCompare(b.name));
    const x = sorted.find((r) => r.w + r.l >= MIN) || sorted[0];
    return x && { name: x.name, value: `${x.w}–${x.l} · ${pct(x.w, x.l)}%`, sub: scopeLabel(x.month) };
  };
  const pBusy = top(players, (p) => p.w + p.l);
  const matches = (n) => n + (n === 1 ? " match" : " matches");
  return {
    perMonth: mc.perMonth,
    total: total ? { name: "", value: matches(total) } : null,
    playerBusy: pick(pBusy, pBusy && matches(pBusy.w + pBusy.l)),
    busiestMonth: busyMonth && { name: scopeLabel(busyMonth.month), value: matches(busyMonth.n) },
    playerMonth: pBusyMonth && { name: pBusyMonth.name, value: matches(pBusyMonth.w + pBusyMonth.l), sub: scopeLabel(pBusyMonth.month) },
    teamBestMonth: bestMonth(monthRows(mc.teams)),
    playerBestMonth: bestMonth(pMonths),
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
