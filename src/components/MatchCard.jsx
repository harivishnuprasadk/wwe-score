import { useEffect, useMemo, useRef, useState } from "react";
import { LOCK_MS } from "../lib/firebase.js";
import { champions, computeStats, fmtDate, isDay, sameBout, scopeLabel, wrestlersOf } from "../lib/ledger.js";

const LockIcon = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 4.5V3a3 3 0 0 1 6 0v1.5h.5v5.5h-7V4.5zm1.5 0h3V3a1.5 1.5 0 0 0-3 0z" /></svg>
);

// "Hari (Roman Reigns) & Chottu", with the wrestler in lighter text.
const Team = ({ m, side }) => m["team" + side].map((n, i) => {
  const w = wrestlersOf(m, side)[i];
  return <span key={i}>{i > 0 && " & "}{n}{w && <span className="as"> ({w})</span>}</span>;
});

const label = (m) => `${m.team1.join(" & ")} vs ${m.team2.join(" & ")}`;

// Results someone has flagged as wrong, from any date. Only the admin can resolve them.
function Flagged({ flagged, isAdmin, onVoid, onDismiss }) {
  if (!flagged.length) return null;
  return (
    <div className="flagged" role="region" aria-label="Flagged results">
      <span className="eyebrow">⚑ Flagged results · {isAdmin ? "your call" : "waiting for the admin"}</span>
      <ul>
        {flagged.map((m) => (
          <li key={m.id}>
            <div>
              <b>{m["team" + m.winner].join(" & ")}</b> beat {m["team" + (3 - m.winner)].join(" & ")}
              <span className="muted"> · {fmtDate(m.date)}</span>
            </div>
            <div className="reason">“{m.flag.reason}”</div>
            {isAdmin && (
              <div className="acts">
                <button className="tool" type="button" onClick={() => onVoid(m)}>Void result</button>
                <button className="tool" type="button" onClick={() => onDismiss(m)}>Result stands</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// What each row shows besides the teams. Chosen in the "Show" dropdown, all off by default,
// remembered per browser. ↻ Rematch (user's choice, 2026-11-19) and the ✕ delete button (first hour only)
// are always shown.
const SHOW = [
  ["lock", "Lock status (time left / Locked)"],
  ["flag", "Flag button ⚑"],
  ["tags", "Tags (Rematch, No count, Flagged, Voided, date)"],
];
const SHOW_KEY = "matchcard-show";
function loadShow() {
  try { return { ...JSON.parse(localStorage.getItem(SHOW_KEY) || "{}") }; } catch { return {}; }
}

function ShowMenu({ show, setShow }) {
  const ref = useRef(null);
  // Close when tapping outside the menu.
  useEffect(() => {
    const off = (e) => { if (ref.current?.open && !ref.current.contains(e.target)) ref.current.open = false; };
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, []);
  const on = SHOW.filter(([k]) => show[k]).length;
  return (
    <details className="showmenu" ref={ref}>
      <summary className="tool sm">Show{on ? ` (${on})` : ""} ▾</summary>
      <div className="menu" role="group" aria-label="Show in each match row">
        {SHOW.map(([k, label]) => (
          <label key={k} className="chk">
            <input type="checkbox" checked={!!show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </div>
    </details>
  );
}

// A month or all dates: one row per night (newest first) with who won it. Tapping a night opens its match card.
function Nights({ list, nicks, onPickDate }) {
  const nights = useMemo(() => {
    const by = {};
    list.forEach((m) => (by[m.date] ||= []).push(m));
    return Object.keys(by).sort().reverse().map((date) => {
      const champs = champions(computeStats(by[date]).teams);
      return { date, n: by[date].length, champs, wins: champs[0]?.w || 0 };
    });
  }, [list]);
  return (
    <ul className="nights">
      {nights.map((x) => {
        const [y, mo, d] = x.date.split("-").map(Number);
        const dm = [d, new Date(y, mo - 1, d).toLocaleDateString(undefined, { month: "short" })];
        return (
          <li key={x.date}>
            <button type="button" className="night" onClick={() => onPickDate(x.date)} aria-label={`Open ${fmtDate(x.date)}`}>
              <span className="date"><span className="d">{dm[0]}</span><span className="m">{dm[1]}</span></span>
              <span className="nw">
                {x.champs.length ? (
                  <span className="win-by"><span className="crown" aria-hidden="true">♛</span>
                    <span className="champ-name">{x.champs.map((c) => nicks[c.name] || c.name).join(" + ")}</span></span>
                ) : <span className="muted">No counted matches</span>}
                <span className="sub">{x.champs.length ? `Won the night · ${x.wins} ${x.wins === 1 ? "win" : "wins"}` : "\u00a0"}</span>
              </span>
              <span className="sub cnt">{x.n} {x.n === 1 ? "match" : "matches"}</span>
              <span className="go" aria-hidden="true">›</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function MatchCard({ list, session, now, onRematch, onDelete, flagged, isAdmin, onFlag, onVoid, onDismiss, onPickDate, nicks = {} }) {
  const single = isDay(session);
  const [armed, setArmed] = useState(null);
  const [show, setShowState] = useState(loadShow);
  const setShow = (next) => {
    setShowState(next);
    try { localStorage.setItem(SHOW_KEY, JSON.stringify(next)); } catch { /* private mode: just don't remember */ }
  };

  // Switching dates cancels a pending delete.
  useEffect(() => setArmed(null), [session]);

  // Tapping anywhere else cancels a pending delete.
  useEffect(() => {
    if (!armed) return;
    const off = (e) => { if (!e.target.closest(".del")) setArmed(null); };
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, [armed]);

  return (
    <section className="panel matchcard" aria-labelledby="cardH">
      <div className="panel-head">
        <h2 id="cardH">Match card</h2>
        <div className="head-right">
          <span className="eyebrow">{scopeLabel(session)} · {list.length} {list.length === 1 ? "match" : "matches"}{single && list.length > 1 ? " · newest first" : ""}</span>
          {single && <ShowMenu show={show} setShow={setShow} />}
        </div>
      </div>
      <Flagged flagged={flagged} isAdmin={isAdmin} onVoid={onVoid} onDismiss={onDismiss} />
      <div className="mbox">
      {!single && list.length > 0 ? <Nights list={list} nicks={nicks} onPickDate={onPickDate} /> : (
      <ol className="matches">
        {!list.length && (
          <li className="empty">
            {session.length === 7 ? `No matches in ${scopeLabel(session)}.`
              : "No matches logged yet. Pick two teams above and tap the winning side to log the first one."}
          </li>
        )}
        {list.map((m, i) => [m, i]).reverse().map(([m, i]) => {
          const left = m.ca == null ? LOCK_MS : LOCK_MS - (now - m.ca);
          const t1 = m.team1.join(" & ");
          const t2 = m.team2.join(" & ");
          return (
            <li key={m.id} className={"match" + (m.counted ? "" : " nc")}>
              <span className="n">{i + 1}</span>
              <span className={"team t1" + (m.winner === 1 ? " won" : "")}><span className="tn"><Team m={m} side={1} /></span>{m.winner === 1 && <span className="wtag">Win</span>}</span>
              <span className="v">VS</span>
              <span className={"team t2" + (m.winner === 2 ? " won" : "")}>{m.winner === 2 && <span className="wtag">Win</span>}<span className="tn"><Team m={m} side={2} /></span></span>
              <span className="tail">
                {show.tags && (
                  <>
                    {i > 0 && sameBout(m, list[i - 1]) && <span className="chip re">Rematch</span>}
                    {m.voided ? <span className="chip void" title={m.flag?.reason}>Voided</span>
                      : !m.counted && <span className="chip">No count</span>}
                    {m.flag && !m.voided && <span className="chip flag" title={m.flag.reason}>⚑ Flagged</span>}
                    {!isDay(session) && <span className="chip">{m.date.slice(5)}</span>}
                  </>
                )}
                <button className="rm" type="button" title="Rematch: book the same teams again" aria-label={`Rematch: ${t1} vs ${t2}`} onClick={() => onRematch(m)}>↻<span className="rm-l"> Rematch</span></button>
                {left <= 0 ? (
                  <>
                    {show.lock && <span className="chip lk" title="Locked. Matches can't be changed after 1 hour."><LockIcon />Locked</span>}
                    {show.flag && !m.flag && !m.voided && (
                      <button className="fl" type="button" title="Flag this result as wrong"
                        aria-label={`Flag match ${i + 1}: ${label(m)}`} onClick={() => onFlag(m)}>⚑</button>
                    )}
                  </>
                ) : (
                  <>
                    {show.lock && <span className="lock" title="Can be deleted until it locks">{Math.min(60, Math.max(1, Math.ceil(left / 60000)))}m</span>}
                    <button className={"del" + (armed === m.id ? " arm" : "")} type="button" aria-label={`Delete match ${i + 1}`}
                      title="Delete (only in the first hour)"
                      onClick={() => { if (armed !== m.id) setArmed(m.id); else { setArmed(null); onDelete(m.id); } }}>
                      {armed === m.id ? "Delete?" : "✕"}
                    </button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      )}
      </div>
    </section>
  );
}
