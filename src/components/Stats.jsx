import { Fragment, useState } from "react";
import { fmtDate, pct } from "../lib/ledger.js";

// The stats side of the board: Teams, Players and Records tabs.
// Tables follow the date filter; tapping a row opens that team's or player's all-time profile.

const TABS = [["teams", "Teams"], ["players", "Players"], ["records", "Records"]];
const TAB_KEY = "tag-ledger-tab";

function loadTab() {
  try { return localStorage.getItem(TAB_KEY) || "teams"; } catch { return "teams"; }
}

export default function Stats({ session, teams, players, recs, moves, teamProf, playerProf, breaks, nicks, aliases }) {
  // "Nickname (A & B)" for teams that have one.
  const tn = (name) => (nicks[name] ? `${nicks[name]} (${name})` : name);
  // "Alias (Name)" for players that have one.
  const pn = (name) => (aliases[name] ? `${aliases[name]} (${name})` : name);
  const [tab, setTabState] = useState(loadTab);
  const setTab = (t) => {
    setTabState(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode: just don't remember */ }
  };
  const scope = session === "all" ? "All dates" : fmtDate(session);

  return (
    <section className="panel stats" aria-labelledby="statsH">
      <div className="panel-head">
        <h2 id="statsH">Stats</h2>
        <span className="eyebrow">{scope}</span>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" id={"tab-" + k} aria-selected={tab === k} aria-controls={"pane-" + k}
            className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <div role="tabpanel" id={"pane-" + tab} aria-labelledby={"tab-" + tab}>
        {tab === "teams" && (
          <>
            <StatTable rows={teams} first="Team" moves={session === "all" ? moves : null} leadRow nicks={nicks}
              empty="Standings appear after the first counted match."
              profile={(name, row) => <TeamProfile p={teamProf[name]} row={row} tn={tn} />} />
            <p className="note">
              Tap a team for its all-time profile. Each pairing is its own team, whichever corner they were in.
              {session === "all" && " ▲▼ shows the move since the previous game night."}
            </p>
          </>
        )}
        {tab === "players" && (
          <>
            <StatTable rows={players} first="Player" empty="No player records yet." nicks={aliases}
              profile={(name, row) => <PlayerProfile p={playerProf[name]} row={row} pn={pn} />} />
            <p className="note">Tap a player for their all-time profile. Each tag win counts as a win for both partners.</p>
          </>
        )}
        {tab === "records" && <Records recs={recs} breaks={breaks} tn={tn} pn={pn} />}
      </div>
    </section>
  );
}

const TREND = { up: ["↑", "Improving"], down: ["↓", "Dropping"], flat: ["→", "Steady"] };

function Trend({ t }) {
  if (!t) return <span className="muted" title="Needs more than 5 matches">–</span>;
  const [icon, word] = TREND[t.dir];
  return (
    <span className={"trend " + t.dir} title={`${word}: last 5 at ${t.recent}%, ${t.overall}% overall`}>
      {icon} <span className="tw">{t.recent}%</span>
    </span>
  );
}

function Move({ m }) {
  if (m === undefined) return null;
  if (m === "new") return <span className="move new">new</span>;
  if (m === 0) return <span className="move flat" aria-label="No change">–</span>;
  return <span className={"move " + (m > 0 ? "up" : "down")} aria-label={(m > 0 ? "Up " : "Down ") + Math.abs(m)}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>;
}

// Compact standings table. Rows expand to show a profile underneath.
function StatTable({ rows, first, empty, leadRow, moves, profile, nicks = {} }) {
  const [open, setOpen] = useState(null);
  const cols = 7;
  return (
    <div className="tbl-wrap">
      <table className="stat">
        <thead>
          <tr>
            <th>#</th><th>{first}</th><th>MP</th><th>W–L</th><th>Win %</th><th>Streak</th>
            <th title="Win % over the last 5 matches compared with overall">Form</th>
          </tr>
        </thead>
        <tbody>
          {!rows.length && <tr><td colSpan={cols} className="empty">{empty}</td></tr>}
          {rows.map((x, i) => (
            <Fragment key={x.name}>
              <tr className={(leadRow && i === 0 ? "lead " : "") + (open === x.name ? "open" : "")}>
                <td className="rk">{i + 1}{moves && <Move m={moves[x.name]} />}</td>
                <td className="name">
                  {nicks[x.name] && <span className="nick">{nicks[x.name]}</span>}
                  <button type="button" className="rowbtn" aria-expanded={open === x.name}
                    onClick={() => setOpen(open === x.name ? null : x.name)}>{x.name}</button>
                </td>
                <td>{x.w + x.l}</td>
                <td>{x.w}–{x.l}</td>
                <td>{pct(x.w, x.l)}%</td>
                <td className={"strk " + (x.streak[0] === "W" ? "w" : "l")}>{x.streak}</td>
                <td><Trend t={x.trend} /></td>
              </tr>
              {open === x.name && (
                <tr className="detail"><td colSpan={cols}>{profile(x.name, x)}</td></tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Last results as dots, oldest first.
const Form = ({ seq }) => (
  <span className="form" aria-label={"Last " + seq.length + ": " + seq.join(" ")}>
    {seq.map((r, i) => <i key={i} className={r === "W" ? "w" : "l"} />)}
  </span>
);

const night = (n) => n && <>{n.w}–{n.l} <span className="muted">· {fmtDate(n.date)}</span></>;

function Facts({ items }) {
  return (
    <dl className="facts">
      {items.filter(([, v]) => v).map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}

// Streaks and last 5 come from the table row (date filter); everything else is all-time.
const runFacts = (row) => [
  ["Longest win streak", row.best ? "W" + row.best : "–"],
  ["Longest losing streak", row.worst ? "L" + row.worst : "–"],
  ["Last 5", <Form seq={row.form} />],
];

function TeamProfile({ p, row, tn }) {
  if (!p) return null;
  return (
    <div className="profile">
      <Facts items={[
        ...runFacts(row),
        ["Nemesis", p.nemesis ? <>{tn(p.nemesis.name)} <span className="muted">({p.nemesis.rec})</span></> : "None yet"],
        ["Nights played", p.nights],
        ["Matches per night", p.perNight],
        ["Best night", night(p.bestNight)],
        ["Worst night", p.worstNight ? night(p.worstNight) : "Needs a second night"],
      ]} />
      <p className="note">Nemesis, nights and best/worst night are all-time.</p>
    </div>
  );
}

function PlayerProfile({ p, row, pn }) {
  if (!p) return null;
  const who = (x) => x && <>{pn(x.name)} <span className="muted">({x.rec})</span></>;
  return (
    <div className="profile">
      <Facts items={[
        ["Best partner", who(p.bestPartner)],
        ["Most-played partner", who(p.mostPartner)],
        ...runFacts(row),
        ["Nights played", p.nights],
        ["Matches per night", p.perNight],
      ]} />
      <p className="note">Partners and nights are all-time.</p>
    </div>
  );
}

const TILES = [
  ["best", "Best performer"],
  ["teamWin", "Longest win streak · team"],
  ["teamLoss", "Longest losing streak · team"],
  ["playerWin", "Longest win streak · player"],
  ["playerLoss", "Longest losing streak · player"],
  ["busiest", "Most matches · team"],
  ["rivalry", "Biggest rivalry"],
];

// Records about a team get its nickname too.
const TEAM_TILES = new Set(["teamWin", "teamLoss", "busiest"]);

const PLAYER_TILES = new Set(["best", "playerWin", "playerLoss"]);

function Records({ recs, breaks, tn, pn }) {
  if (!recs.busiest) return <p className="empty">Records appear after the first counted match.</p>;
  return (
    <div className="records">
      <div className="recs">
        {TILES.map(([k, label]) => recs[k] && (
          <div key={k} className={"rec-tile " + (k === "best" ? "star" : k.endsWith("Loss") ? "l" : k.endsWith("Win") ? "w" : "")}>
            <span className="eyebrow">{label}</span>
            <span className="v">{recs[k].value}</span>
            <span className="who">{TEAM_TILES.has(k) ? tn(recs[k].name) : PLAYER_TILES.has(k) ? pn(recs[k].name) : recs[k].name}</span>
          </div>
        ))}
      </div>
      <div>
        <h3>Streak breakers</h3>
        {!breaks.length ? (
          <p className="note">Nobody has ended a winning streak of 2 or more yet.</p>
        ) : (
          <ul className="breaks">
            {breaks.map((b) => (
              <li key={b.id}>
                <b>{tn(b.breaker)}</b> ended <b>{tn(b.broken)}</b>'s <span className="strk w">W{b.n}</span>
                <span className="muted"> · {fmtDate(b.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
