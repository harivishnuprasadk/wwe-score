import { useState } from "react";
import { fmtDate, pct, RECENT } from "../lib/ledger.js";
import { matchups, rivalry } from "../lib/rivalry.js";

// Rivalries tab: pick Team 1 vs Team 2 and see their head-to-head for the selected dates.
// Day-wise like the rest of Stats: nights they met are won, lost or even; streaks skip even nights.

const DOT = { W: "w", L: "l", E: "e" };

export default function Rivalries({ list, teams, players, single, tn, pn }) {
  const all = matchups(list);
  const [pick, setPick] = useState(null);
  const names = teams.map((t) => t.name);
  // Default to the most-played matchup; keep the user's choice while it still exists in this date range.
  const valid = pick && names.includes(pick.a) && names.includes(pick.b);
  const sel = valid ? pick : all[0] ? { a: all[0].a, b: all[0].b } : null;

  if (!sel) return <p className="empty">Rivalries appear once two teams have played each other.</p>;

  const shares = (x, y) => x.split(" & ").some((n) => y.split(" & ").includes(n));
  const r = rivalry(list, sel.a, sel.b);
  const overall = Object.fromEntries(players.map((p) => [p.name, p]));
  const setA = (a) => setPick({ a, b: !shares(a, sel.b) && a !== sel.b ? sel.b : names.find((n) => n !== a && !shares(n, a)) || "" });
  const setB = (b) => setPick({ a: sel.a, b });

  return (
    <div className="rivalry">
      <div className="rv-pick">
        <select aria-label="Team 1" className="t1" value={sel.a} onChange={(e) => setA(e.target.value)}>
          {names.map((n) => <option key={n} value={n}>{tn(n)}</option>)}
        </select>
        <button type="button" className="tool sm" aria-label="Swap teams" title="Swap" onClick={() => setPick({ a: sel.b, b: sel.a })}>⇄</button>
        <select aria-label="Team 2" className="t2" value={sel.b} onChange={(e) => setB(e.target.value)}>
          {names.filter((n) => n !== sel.a && !shares(n, sel.a)).map((n) => <option key={n} value={n}>{tn(n)}</option>)}
        </select>
      </div>

      {!r ? (
        <p className="note">These two teams haven't played each other {single ? "on this date" : "yet"}.</p>
      ) : (
        <>
          <div className="rv-score">
            <div className="side t1"><span className="who">{tn(r.a)}</span><span className="big">{r.w}</span><span className="muted">{r.pct}%</span></div>
            <div className="mid"><span className="eyebrow">{r.n} {r.n === 1 ? "meeting" : "meetings"}</span><span className="vs">VS</span></div>
            <div className="side t2"><span className="who">{tn(r.b)}</span><span className="big">{r.l}</span><span className="muted">{pct(r.l, r.w)}%</span></div>
          </div>

          <dl className="facts">
            <div><dt>Net</dt><dd>{r.net === 0 ? "Level" : `${tn(r.net > 0 ? r.a : r.b)} +${Math.abs(r.net)}`}</dd></div>
            {single ? (
              <div><dt>On the night</dt><dd>{r.net === 0 ? `Even night, ${r.w}–${r.l}` : `${tn(r.net > 0 ? r.a : r.b)} won the night ${Math.max(r.w, r.l)}–${Math.min(r.w, r.l)}`}</dd></div>
            ) : (
              <>
                <div><dt>Nights won</dt><dd><span className="r">{r.daysWon}</span> – <span className="b">{r.daysLost}</span>{r.daysEven > 0 && <span className="muted"> · {r.daysEven} even</span>}</dd></div>
                <div><dt>Day streak</dt><dd>{r.streak ? `${tn(r.streak[0] === "W" ? r.a : r.b)} won the last ${r.streak.slice(1) === "1" ? "night" : r.streak.slice(1) + " nights"} they met` : "–"}</dd></div>
                <div><dt>Last {RECENT} nights</dt><dd>
                  <span className="form" aria-label={"Last nights from " + r.a + "'s side: " + r.form.join(" ")}>
                    {r.form.map((x, i) => <i key={i} className={DOT[x]} />)}
                  </span> <span className="muted">({tn(r.a)})</span>
                </dd></div>
              </>
            )}
            <div><dt>Last meeting</dt><dd>{tn(r.last.winner)} won <span className="muted">· {fmtDate(r.last.date)}</span></dd></div>
          </dl>

          <div>
            <h3>Players</h3>
            <div className="rv-players">
              {r.players.map((p) => {
                const o = overall[p.name];
                return (
                  <div key={p.name} className={"rv-player " + (p.team === r.a ? "t1" : "t2")}>
                    <b>{pn(p.name)}</b>
                    <span>This rivalry: {p.w}–{p.l} · {pct(p.w, p.l)}%</span>
                    {o && <span className="muted">All matches: {o.w}–{o.l} · {pct(o.w, o.l)}% · {o.days.length} {o.days.length === 1 ? "night" : "nights"}</span>}
                    {p.wrestler && <span className="muted">Usually plays {p.wrestler.name}</span>}
                  </div>
                );
              })}
            </div>
            <p className="note">“All matches” covers every match in the selected dates, with any partner.</p>
          </div>
        </>
      )}

      {all.length > 1 && (
        <div>
          <h3>All matchups</h3>
          <ul className="rv-list">
            {all.map((m) => (
              <li key={m.a + "|" + m.b}>
                <button type="button" className={sel.a === m.a && sel.b === m.b || sel.a === m.b && sel.b === m.a ? "on" : ""}
                  onClick={() => setPick({ a: m.a, b: m.b })}>
                  <span>{tn(m.a)} <span className="muted">vs</span> {tn(m.b)}</span>
                  <span className="muted">{m.aw}–{m.n - m.aw} · {m.n} {m.n === 1 ? "meeting" : "meetings"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
