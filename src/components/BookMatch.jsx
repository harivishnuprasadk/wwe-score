import PlayerSelect from "./PlayerSelect.jsx";
import { fmtDate, headToHead, teamKey, todayStr } from "../lib/ledger.js";

function HeadToHead({ matches, slots, date }) {
  const v = ["a1", "a2", "b1", "b2"].map((k) => slots[k].trim());
  if (v.some((x) => !x)) return null;
  const r = headToHead(matches, [v[0], v[1]], [v[2], v[3]], date);
  if (!r.all[0] && !r.all[1]) {
    return <div className="h2h"><span className="eyebrow">Head to head</span><span>First meeting between these teams</span></div>;
  }
  const Score = ([a, b]) => <span className="sc"><span className="r">{a}</span>–<span className="b">{b}</span></span>;
  return (
    <div className="h2h">
      <span className="eyebrow">Head to head</span>
      <span>{date === todayStr() ? "Today" : fmtDate(date)} {Score(r.day)}</span>
      <span>All time {Score(r.all)}</span>
    </div>
  );
}

export default function BookMatch({ matches, teams, wrestlers, slots, setSlot, setTeam, resetKey, noCount, setNoCount, onLog, saving, msg, isAdmin, pastDate, setPastDate }) {
  const today = todayStr();
  const past = isAdmin && pastDate && pastDate !== today;
  // Each corner picks a team, then (optionally) the wrestler each of its two players uses.
  const corner = (side) => {
    const [k1, k2] = side === 1 ? ["a1", "a2"] : ["b1", "b2"];
    const value = slots[k1] && slots[k2] ? teamKey([slots[k1], slots[k2]]) : "";
    return (
      <>
        <div className="slot">
          <select id={"team-" + side} aria-label={`Team ${side}`} value={value}
            onChange={(e) => setTeam(side, teams.find((t) => t.key === e.target.value))}>
            <option value="">Choose team…</option>
            {teams.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        {value && [k1, k2].map((k) => (
          <div key={k} className="pick">
            <span className="who">{slots[k]}</span>
            <PlayerSelect id={"w-" + k} className="wr" value={slots["w" + k]} names={wrestlers} resetKey={resetKey}
              onChange={(v) => setSlot("w" + k, v)} label={`Wrestler for ${slots[k]}`} placeholder="Wrestler (optional)…"
              newLabel="＋ Other wrestler…" typeLabel="Wrestler name" />
          </div>
        ))}
      </>
    );
  };
  return (
    <section className="panel" aria-labelledby="bookH">
      <div className="panel-head">
        <h2 id="bookH">Book a match</h2>
        <span className="eyebrow">{fmtDate(past ? pastDate : today)}</span>
      </div>
      {isAdmin && (
        <div className={"field when" + (past ? " past" : "")}>
          <label className="eyebrow" htmlFor="match-date">Match date · admin</label>
          <input id="match-date" type="date" max={today} value={pastDate || today}
            onChange={(e) => setPastDate(e.target.value === today ? "" : e.target.value)} />
          {past && <button type="button" className="tool sm" onClick={() => setPastDate("")}>Back to today</button>}
          {past && <p className="note">Adding a past result for {fmtDate(pastDate)}.</p>}
        </div>
      )}
      <div className="corners">
        <div className="corner t1">
          <span className="eyebrow">Red corner · Team 1</span>
          {corner(1)}
        </div>
        <div className="vs">VS</div>
        <div className="corner t2">
          <span className="eyebrow">Blue corner · Team 2</span>
          {corner(2)}
        </div>
      </div>
      {!teams.length && <p className="note">No teams yet. Add players and pair them into a team under Players &amp; teams.</p>}
      <HeadToHead matches={matches} slots={slots} date={past ? pastDate : today} />
      <label className="chk">
        <input type="checkbox" id="nocount" checked={noCount} onChange={(e) => setNoCount(e.target.checked)} />
        No count (logged, but left out of the standings)
      </label>
      <div className="winners">
        <button className="win t1" type="button" disabled={saving} onClick={() => onLog(1)}>Team 1 wins</button>
        <button className="win t2" type="button" disabled={saving} onClick={() => onLog(2)}>Team 2 wins</button>
      </div>
      <div className={"msg " + (msg?.kind || "")} role="status">{msg?.text}</div>
    </section>
  );
}
