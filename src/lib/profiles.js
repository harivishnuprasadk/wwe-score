// All-time stats that span several nights: rank movement, team and player profiles, streak breakers.
// Like the standings, only counted matches are used.
import { byTime, computeStats, pct, teamName } from "./ledger.js";

const counted = (matches) => matches.filter((m) => m.counted).sort(byTime);
const rate = (r) => r.w / (r.w + r.l);
const fmtRec = (r) => `${r.w}–${r.l}`;

// How many places each team moved in the all-time standings since the night before the latest one.
// A positive number is a climb; "new" means the team hadn't played before the latest night.
export function rankMoves(matches) {
  const dates = [...new Set(counted(matches).map((m) => m.date))].sort();
  if (dates.length < 2) return {};
  const latest = dates[dates.length - 1];
  const before = computeStats(matches.filter((m) => m.date < latest)).teams.map((t) => t.name);
  const moves = {};
  computeStats(matches).teams.forEach((t, i) => {
    const was = before.indexOf(t.name);
    moves[t.name] = was < 0 ? "new" : was - i;
  });
  return moves;
}

// Per-night records, plus attendance and best/worst night, for one team or player.
function nightsOf(byDate) {
  const nights = Object.entries(byDate).map(([date, r]) => ({ date, ...r }));
  const played = nights.reduce((n, r) => n + r.w + r.l, 0);
  const sorted = nights.slice().sort((a, b) => rate(b) - rate(a) || b.w - a.w || a.l - b.l || b.date.localeCompare(a.date));
  return {
    nights: nights.length,
    perNight: nights.length ? Math.round((10 * played) / nights.length) / 10 : 0,
    bestNight: sorted[0] || null,
    // A worst night only means something once there's more than one night to compare.
    worstNight: nights.length > 1 ? sorted[sorted.length - 1] : null,
  };
}

const bump = (map, key, won) => {
  const r = (map[key] ||= { name: key, w: 0, l: 0 });
  won ? r.w++ : r.l++;
};

export function teamProfiles(matches) {
  const out = {};
  counted(matches).forEach((m) => {
    [1, 2].forEach((side) => {
      const name = teamName(m["team" + side]);
      const p = (out[name] ||= { byDate: {}, opp: {} });
      const won = m.winner === side;
      bump(p.byDate, m.date, won);
      bump(p.opp, teamName(m["team" + (3 - side)]), won);
    });
  });
  const result = {};
  Object.entries(out).forEach(([name, p]) => {
    // Nemesis: the team that has beaten this one most often (fewest losses to them breaks a tie).
    const nem = Object.values(p.opp).filter((o) => o.l > 0).sort((a, b) => b.l - a.l || a.w - b.w)[0];
    result[name] = { ...nightsOf(p.byDate), nemesis: nem ? { name: nem.name, rec: fmtRec(nem) } : null };
  });
  return result;
}

export function playerProfiles(matches) {
  const out = {};
  counted(matches).forEach((m) => {
    [1, 2].forEach((side) => {
      const team = m["team" + side];
      const won = m.winner === side;
      team.forEach((n, i) => {
        const p = (out[n] ||= { byDate: {}, partners: {} });
        bump(p.byDate, m.date, won);
        bump(p.partners, team[1 - i], won);
      });
    });
  });
  const result = {};
  Object.entries(out).forEach(([name, p]) => {
    const partners = Object.values(p.partners);
    const most = partners.slice().sort((a, b) => b.w + b.l - (a.w + a.l) || b.w - a.w)[0];
    // Best partner: highest win % with at least 2 matches together, if anyone qualifies.
    const pool = partners.some((x) => x.w + x.l >= 2) ? partners.filter((x) => x.w + x.l >= 2) : partners;
    const best = pool.slice().sort((a, b) => rate(b) - rate(a) || b.w - a.w)[0];
    result[name] = {
      ...nightsOf(p.byDate),
      bestPartner: best && { name: best.name, rec: `${fmtRec(best)} · ${pct(best.w, best.l)}%` },
      mostPartner: most && { name: most.name, rec: `${most.w + most.l} matches` },
    };
  });
  return result;
}

// Every time a team on a winning streak of 2+ lost, and who beat them. Newest first.
export function streakBreaks(matches) {
  const run = {};
  const breaks = [];
  counted(matches).forEach((m) => {
    const winner = teamName(m["team" + m.winner]);
    const loser = teamName(m["team" + (3 - m.winner)]);
    if ((run[loser] || 0) >= 2) breaks.push({ id: m.id, date: m.date, breaker: winner, broken: loser, n: run[loser] });
    run[loser] = 0;
    run[winner] = (run[winner] || 0) + 1;
  });
  return breaks.reverse();
}
