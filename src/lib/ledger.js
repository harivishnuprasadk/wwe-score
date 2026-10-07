// Pure helpers: dates, matchups and standings.

export function todayStr(d = new Date()) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function fmtDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
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

// Win % over the last five compared with overall. Needs more than five matches to say anything.
const RECENT = 5;
export function trendOf(seq) {
  if (seq.length <= RECENT) return null;
  const wins = (s) => s.filter((r) => r === "W").length;
  const recent = pct(wins(seq.slice(-RECENT)), RECENT - wins(seq.slice(-RECENT)));
  const overall = pct(wins(seq), seq.length - wins(seq));
  const d = recent - overall;
  return { recent, overall, dir: d >= 10 ? "up" : d <= -10 ? "down" : "flat" };
}

// Display name for a pairing, the same whichever order the partners were picked in.
export const teamName = (team) => [...team].sort((a, b) => a.localeCompare(b)).join(" & ");

export function computeStats(list) {
  const ps = {};
  const ts = {};
  list.filter((m) => m.counted).sort(byTime).forEach((m) => {
    [1, 2].forEach((side) => {
      const team = m["team" + side];
      const won = m.winner === side;
      team.forEach((n) => {
        const p = (ps[n] ||= { name: n, w: 0, l: 0, seq: [] });
        won ? p.w++ : p.l++;
        p.seq.push(won ? "W" : "L");
      });
      const key = teamName(team);
      const t = (ts[key] ||= { name: key, w: 0, l: 0, seq: [] });
      won ? t.w++ : t.l++;
      t.seq.push(won ? "W" : "L");
    });
  });
  const rank = (a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l) || b.w - a.w || a.name.localeCompare(b.name);
  // Current run (e.g. "W3"), longest win and losing runs, and the last five results.
  const withStreak = (x) => {
    const last = x.seq[x.seq.length - 1];
    let k = 0;
    for (let i = x.seq.length - 1; i >= 0 && x.seq[i] === last; i--) k++;
    const run = { W: 0, L: 0 };
    let cur = 0;
    x.seq.forEach((r, i) => {
      cur = r === x.seq[i - 1] ? cur + 1 : 1;
      run[r] = Math.max(run[r], cur);
    });
    return { ...x, streak: last ? last + k : "", best: run.W, worst: run.L, form: x.seq.slice(-5), trend: trendOf(x.seq) };
  };
  return {
    players: Object.values(ps).map(withStreak).sort(rank),
    teams: Object.values(ts).map(withStreak).sort(rank),
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

// Highlights for the Records panel. Each is null until there's a counted match to show.
export function records(list, players, teams) {
  const top = (arr, f) => arr.reduce((b, x) => (f(x) > (b ? f(b) : 0) ? x : b), null);
  const pick = (x, value) => (x ? { name: x.name, value } : null);
  const bouts = {};
  list.filter((m) => m.counted).forEach((m) => {
    const [a, b] = [teamName(m.team1), teamName(m.team2)].sort();
    const r = (bouts[a + "|" + b] ||= { a, b, n: 0, aw: 0 });
    r.n++;
    if (teamName(m["team" + m.winner]) === a) r.aw++;
  });
  // A rivalry needs at least two meetings.
  const rival = top(Object.values(bouts).filter((r) => r.n > 1), (r) => r.n);
  const tWin = top(teams, (t) => t.best);
  const tLoss = top(teams, (t) => t.worst);
  const pWin = top(players, (p) => p.best);
  const pLoss = top(players, (p) => p.worst);
  const busy = top(teams, (t) => t.w + t.l);
  // Best win % (then most wins) among players with 3+ matches; anyone counts until someone has 3.
  const MIN = 3;
  const best = players.find((p) => p.w + p.l >= MIN) || players[0];
  return {
    best: best && { name: best.name, value: `${pct(best.w, best.l)}% · ${best.w}–${best.l}` },
    teamWin: pick(tWin, tWin && "W" + tWin.best),
    teamLoss: pick(tLoss, tLoss && "L" + tLoss.worst),
    playerWin: pick(pWin, pWin && "W" + pWin.best),
    playerLoss: pick(pLoss, pLoss && "L" + pLoss.worst),
    busiest: pick(busy, busy && busy.w + busy.l + " matches"),
    rivalry: rival && { name: `${rival.a} vs ${rival.b} · ${rival.n} meetings`, value: `${rival.aw}–${rival.n - rival.aw}` },
  };
}
