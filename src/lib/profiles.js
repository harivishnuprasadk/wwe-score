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
  // Best night = biggest net (wins minus losses), then most wins; worst night is the other end.
  const sorted = nights.slice().sort((a, b) => b.w - b.l - (a.w - a.l) || b.w - a.w || b.date.localeCompare(a.date));
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

// Every time a team on a run of 2+ winning days had a losing day, and who ended it:
// the team that beat them most that night. Even days don't count either way. Newest first.
export function streakBreaks(matches) {
  // Per date, per team: wins, losses, and which opponents beat them.
  const nights = {};
  counted(matches).forEach((m) => {
    const n = (nights[m.date] ||= {});
    [1, 2].forEach((side) => {
      const name = teamName(m["team" + side]);
      const t = (n[name] ||= { w: 0, l: 0, beatenBy: {} });
      if (m.winner === side) t.w++;
      else {
        t.l++;
        const opp = teamName(m["team" + (3 - side)]);
        t.beatenBy[opp] = (t.beatenBy[opp] || 0) + 1;
      }
    });
  });
  const run = {};
  const breaks = [];
  Object.keys(nights).sort().forEach((date) => {
    Object.entries(nights[date]).forEach(([name, t]) => {
      if (t.w > t.l) run[name] = (run[name] || 0) + 1;
      else if (t.w < t.l) {
        if ((run[name] || 0) >= 2) {
          const [breaker] = Object.entries(t.beatenBy).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
          breaks.push({ id: date + "|" + name, date, breaker, broken: name, n: run[name] });
        }
        run[name] = 0;
      }
    });
  });
  return breaks.reverse();
}
