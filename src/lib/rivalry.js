// Rivalries: head-to-head between two exact teams, for whatever matches are passed in
// (one night, or all dates). Day-wise like the rest of the stats: a night they met is won by
// whichever side won more of that night's meetings, and even nights are skipped in streaks.
import { byTime, dayStreaks, pct, RECENT, teamName, trendOf, wrestlersOf } from "./ledger.js";

// Every pairing of teams that met at least once, most meetings first. Names are the "A & B" team names.
export function matchups(list) {
  const bouts = {};
  list.filter((m) => m.counted).forEach((m) => {
    const [a, b] = [teamName(m.team1), teamName(m.team2)].sort();
    const r = (bouts[a + "|" + b] ||= { a, b, n: 0, aw: 0, last: "" });
    r.n++;
    if (teamName(m["team" + m.winner]) === a) r.aw++;
    if (m.date > r.last) r.last = m.date;
  });
  return Object.values(bouts).sort((x, y) => y.n - x.n || y.last.localeCompare(x.last) || x.a.localeCompare(y.a));
}

// Head-to-head between team A and team B ("A & B" names), from A's point of view.
export function rivalry(list, a, b) {
  const meetings = list
    .filter((m) => m.counted)
    .filter((m) => {
      const t = [teamName(m.team1), teamName(m.team2)];
      return (t[0] === a && t[1] === b) || (t[0] === b && t[1] === a);
    })
    .sort(byTime);
  if (!meetings.length) return null;

  const sideOf = (m, name) => (teamName(m.team1) === name ? 1 : 2);
  const aWon = (m) => m.winner === sideOf(m, a);

  // Nights they met: A's wins (w) and losses (l) against B that night.
  const byDate = {};
  meetings.forEach((m) => {
    const d = (byDate[m.date] ||= { date: m.date, w: 0, l: 0 });
    aWon(m) ? d.w++ : d.l++;
  });
  const days = Object.values(byDate).sort((x, y) => x.date.localeCompare(y.date)).map((d) => ({ ...d, net: d.w - d.l }));
  const w = meetings.filter(aWon).length;
  const l = meetings.length - w;

  // Each player's record in this rivalry, and the wrestler they used most in it.
  const players = [a, b].map((team) => {
    const names = team.split(" & ");
    return names.map((name) => {
      const used = {};
      let pw = 0;
      meetings.forEach((m) => {
        const side = sideOf(m, team);
        if (m.winner === side) pw++;
        const wr = wrestlersOf(m, side)[m["team" + side].indexOf(name)];
        if (wr) used[wr] = (used[wr] || 0) + 1;
      });
      const fav = Object.entries(used).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0];
      return { name, team, w: pw, l: meetings.length - pw, wrestler: fav ? { name: fav[0], n: fav[1] } : null };
    });
  }).flat();

  const last = meetings[meetings.length - 1];
  return {
    a, b,
    n: meetings.length, w, l, pct: pct(w, l), net: w - l,
    days,
    daysWon: days.filter((d) => d.net > 0).length,
    daysLost: days.filter((d) => d.net < 0).length,
    daysEven: days.filter((d) => d.net === 0).length,
    ...dayStreaks(days), // streak from A's side: "W2" = A won the last 2 nights they met
    form: days.slice(-RECENT).map((d) => (d.net > 0 ? "W" : d.net < 0 ? "L" : "E")),
    trend: trendOf(days),
    last: { date: last.date, winner: aWon(last) ? a : b },
    players,
  };
}
