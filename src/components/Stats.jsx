import { Fragment, useState } from "react";
import { fmtDate, isDay, mostNights, pct, RECENT, scopeLabel } from "../lib/ledger.js";
import Rivalries from "./Rivalries.jsx";

// The stats side of the board: Teams, Players and Records tabs.
// Tables follow the date filter; tapping a row opens that team's or player's all-time profile.

// Streaks and form are day-wise: a night with more wins than losses is a winning day.
const DAYS_NOTE = "Streaks count winning (W) or losing (L) days in a row; even days are skipped. 🏆 Champ = most wins; ★ Most nights = won the most nights (a night is won with more wins than losses).";

const TABS = [["teams", "Teams"], ["players", "Players"], ["records", "Records"], ["rivalries", "Rivalries"]];
const TAB_KEY = "tag-ledger-tab";

function loadTab() {
  try { return localStorage.getItem(TAB_KEY) || "teams"; } catch { return "teams"; }
}

export default function Stats({ session, list, monthWins, teams, players, recs, moves, teamProf, playerProf, breaks, nicks, aliases }) {
  // "Nickname (A & B)" for teams that have one.
  const tn = (name) => (nicks[name] ? `${nicks[name]} (${name})` : name);
  // "Alias (Name)" for players that have one.
  const pn = (name) => (aliases[name] ? `${aliases[name]} (${name})` : name);
  const [tab, setTabState] = useState(loadTab);
  const setTab = (t) => {
    setTabState(t);
    try { localStorage.setItem(TAB_KEY, t); } catch { /* private mode: just don't remember */ }
  };
  const scope = scopeLabel(session);
  // One night selected: streaks become "how did the night go". A month or all dates run night by night.
  const single = isDay(session);
  // Award badges for the period on view: Champ (no. 1 in the standings) and Most nights (won the most nights).
  const awards = (rows) => ({ scope, most: mostNights(rows) });

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
            <StatTable rows={teams} first="Team" moves={session === "all" ? moves : null} leadRow nicks={nicks} single={single} awards={awards(teams)}
              empty="Standings appear after the first counted match."
              profile={(name, row) => <TeamProfile p={teamProf[name]} row={row} tn={tn} months={monthWins.teams[name]} />} />
            <p className="note">
              Tap a team for its all-time profile. Each pairing is its own team, whichever corner they were in.
              {session === "all" && " ▲▼ shows the move since the previous game night."} {DAYS_NOTE}
            </p>
          </>
        )}
        {tab === "players" && (
          <>
            <StatTable rows={players} first="Player" empty="No player records yet." nicks={aliases} single={single} awards={awards(players)}
              profile={(name, row) => <PlayerProfile p={playerProf[name]} row={row} pn={pn} months={monthWins.players[name]} />} />
            <p className="note">Tap a player for their all-time profile. Each tag win counts as a win for both partners. {DAYS_NOTE}</p>
          </>
        )}
        {tab === "records" && <Records recs={recs} breaks={breaks} tn={tn} pn={pn} single={single} />}
        {tab === "rivalries" && (
          <Rivalries list={list} teams={teams} players={players} single={single} tn={tn} pn={pn} />
        )}
      </div>
    </section>
  );
}

const TREND = { up: ["↑", "Improving"], down: ["↓", "Dropping"], flat: ["→", "Steady"] };

function Trend({ t }) {
  if (!t) return null;
  const [icon, word] = TREND[t.dir];
  return (
    <span className={"trend " + t.dir} title={`${word}: last ${RECENT} nights at ${t.recent}%, ${t.overall}% overall`}>
      {icon}
    </span>
  );
}

function Move({ m }) {
  if (m === undefined) return null;
  if (m === "new") return <span className="move new">new</span>;
  if (m === 0) return <span className="move flat" aria-label="No change">–</span>;
  return <span className={"move " + (m > 0 ? "up" : "down")} aria-label={(m > 0 ? "Up " : "Down ") + Math.abs(m)}>{m > 0 ? "▲" : "▼"}{Math.abs(m)}</span>;
}

const DAY = { W: "Won day", L: "Lost day", E: "Even day" };
const fmtNet = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + -n : "0");

// Compact standings table. Rows expand to show a profile underneath.
// With one date selected, Streak shows how that day went; across all dates it counts W/L days in a row.
function StatTable({ rows, first, empty, leadRow, moves, profile, single, awards, nicks = {} }) {
  const [open, setOpen] = useState(null);
  const cols = single ? 6 : 7;
  return (
    <div className="tbl-wrap">
      <table className="stat">
        <thead>
          <tr>
            <th>#</th><th>{first}</th><th>W–L</th>
            <th title="Wins minus losses">Net</th><th>Win %</th>
            <th title={single ? "How the day went" : "Winning (W) or losing (L) days in a row; even days are skipped"}>{single ? "Day" : "Streak"}</th>
            {!single && <th title={`Last ${RECENT} nights: won, lost or even. ↑/↓ appears once there are more than ${RECENT} nights: last-${RECENT}-night win % at least 10 points above/below overall`}>Form</th>}
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
                  {awards && (i === 0 || awards.most.names.has(x.name)) && (
                    <span className="awards">
                      {i === 0 && <span className="award champ" title={`Overall winner · ${awards.scope}: most wins`}>🏆 Champ</span>}
                      {awards.most.names.has(x.name) && (
                        <span className="award nights" title={`Won the most nights · ${awards.scope}: ${awards.most.n}`}>★ Most nights · {awards.most.n}</span>
                      )}
                    </span>
                  )}
                </td>
                <td>{x.w}–{x.l}</td>
                <td className={"net " + (x.net > 0 ? "w" : x.net < 0 ? "l" : "")}>{fmtNet(x.net)}</td>
                <td>{pct(x.w, x.l)}%</td>
                {single ? (
                  <td className={"strk " + { W: "w", L: "l", E: "" }[x.form[0]]}>{x.form[0] === "E" ? "Even" : x.form[0] === "W" ? "Won" : "Lost"}</td>
                ) : (
                  <td className={"strk " + (x.streak[0] === "W" ? "w" : "l")}>{x.streak || "–"}</td>
                )}
                {!single && <td className="formcell"><Form seq={x.form} /><Trend t={x.trend} /></td>}
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

// Last days as dots, oldest first: won, lost or even.
const Form = ({ seq }) => (
  <span className="form" aria-label={"Last " + seq.length + " days: " + seq.map((r) => DAY[r]).join(", ")}>
    {seq.map((r, i) => <i key={i} className={{ W: "w", L: "l", E: "e" }[r]} title={DAY[r]} />)}
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

// These come from the table row, so they follow the date filter; everything else is all-time.
// Streaks are winning / losing days in a row (even days skipped).
const days = (n) => (n ? n + (n === 1 ? " day" : " days") : "–");
const runFacts = (row) => [
  ["Matches played", row.w + row.l],
  ["Best day streak", days(row.best)],
  ["Worst day streak", days(row.worst)],
  [`Last ${RECENT} nights`, <Form seq={row.form} />],
];

// "Oct 2026 · 3" badges, newest month first.
function MonthBadges({ months }) {
  const list = Object.entries(months || {}).sort((a, b) => b[0].localeCompare(a[0]));
  if (!list.length) return "None yet";
  return (
    <span className="mbadges">
      {list.map(([m, n]) => {
        const [y, mo] = m.split("-").map(Number);
        const label = new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
        return <span key={m} className="mbadge" title={`${n} ${n === 1 ? "night" : "nights"} won in ${scopeLabel(m)}`}>{label} · {n}</span>;
      })}
    </span>
  );
}

function TeamProfile({ p, row, tn, months }) {
  if (!p) return null;
  return (
    <div className="profile">
      <Facts items={[
        ...runFacts(row),
        ["Nights won by month", <MonthBadges months={months} />],
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

function PlayerProfile({ p, row, pn, months }) {
  if (!p) return null;
  const who = (x) => x && <>{pn(x.name)} <span className="muted">({x.rec})</span></>;
  return (
    <div className="profile">
      <Facts items={[
        ["Best partner", who(p.bestPartner)],
        ["Most-played partner", who(p.mostPartner)],
        ...runFacts(row),
        ["Nights won by month", <MonthBadges months={months} />],
        ["Nights played", p.nights],
        ["Matches per night", p.perNight],
      ]} />
      <p className="note">Partners and nights are all-time.</p>
    </div>
  );
}

const TILES = [
  ["best", "Best performer"],
  ["teamDay", "Best day · team"],
  ["playerDay", "Best day · player"],
  ["teamWin", "Most winning days in a row · team"],
  ["teamLoss", "Most losing days in a row · team"],
  ["playerWin", "Most winning days in a row · player"],
  ["playerLoss", "Most losing days in a row · player"],
  ["teamNights", "Most nights won · team"],
  ["playerNights", "Most nights won · player"],
  ["busiest", "Most matches · team"],
  ["rivalry", "Biggest rivalry"],
];

// Records about a team get its nickname too.
const TEAM_TILES = new Set(["teamWin", "teamLoss", "busiest", "teamDay"]);

const PLAYER_TILES = new Set(["best", "playerWin", "playerLoss", "playerDay"]);
// Day-streak records need more than one day, so they're hidden when a single date is selected.
const STREAK_TILES = new Set(["teamWin", "teamLoss", "playerWin", "playerLoss", "teamNights", "playerNights"]);

function Records({ recs, breaks, tn, pn, single }) {
  if (!recs.busiest) return <p className="empty">Records appear after the first counted match.</p>;
  return (
    <div className="records">
      <div className="recs">
        {TILES.filter(([k]) => !(single && STREAK_TILES.has(k))).map(([k, label]) => recs[k] && (
          <div key={k} className={"rec-tile " + (k === "best" ? "star" : k.endsWith("Loss") ? "l" : k.endsWith("Win") ? "w" : "")}>
            <span className="eyebrow">{recs[k].consolation ? "Consolation prize · " + label.toLowerCase() : label}</span>
            <span className="v">{recs[k].value}</span>
            <span className="who">
              {k === "teamNights" ? recs[k].name.split(", ").map(tn).join(", ")
                : k === "playerNights" ? recs[k].name.split(", ").map(pn).join(", ")
                : TEAM_TILES.has(k) ? tn(recs[k].name) : PLAYER_TILES.has(k) ? pn(recs[k].name) : recs[k].name}
              {recs[k].sub && <span className="muted"> · {recs[k].sub}</span>}
            </span>
          </div>
        ))}
      </div>
      <div>
        <h3>Streak breakers</h3>
        {!breaks.length ? (
          <p className="note">Nobody has ended a run of 2 or more winning days yet.</p>
        ) : (
          <ul className="breaks">
            {breaks.map((b) => (
              <li key={b.id}>
                <b>{tn(b.breaker)}</b> ended <b>{tn(b.broken)}</b>'s run of <span className="strk w">{b.n} winning days</span>
                <span className="muted"> · {fmtDate(b.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
