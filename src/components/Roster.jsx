import { useState } from "react";
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { byLower, teamKey } from "../lib/ledger.js";

// Add players, then pair them into teams (with an optional nickname). Booking picks from these teams.
// The database rules keep ids unique, so the same player or pair can't be added twice.

const clean = (s) => s.trim().replace(/\s+/g, " ");
const badName = (n) => !n || n.length > 30 || n.includes("/");

// One player in the list: tap Edit to set an alias or delete them.
function PlayerRow({ name, alias, busy, onSave, onDelete }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(alias);
  const [sure, setSure] = useState(false);
  const close = () => { setOpen(false); setSure(false); };
  return (
    <li className={open ? "open" : ""}>
      <div className="line">
        <span className="pname">{name}</span>
        {alias && <span className="alias">“{alias}”</span>}
        <button type="button" className="tool sm" aria-expanded={open} aria-label={"Edit " + name}
          onClick={() => { setDraft(alias); open ? close() : setOpen(true); }}>{open ? "Close" : "Edit"}</button>
      </div>
      {open && (
        <form className="edit" onSubmit={(e) => { e.preventDefault(); onSave(clean(draft)).then((ok) => ok && close()); }}>
          <input type="text" placeholder="Alias (optional)" aria-label={"Alias for " + name} autoComplete="off" maxLength={30}
            value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="tool" type="submit" disabled={busy}>Save</button>
          <button className={"tool danger" + (sure ? " arm" : "")} type="button" disabled={busy}
            onClick={() => (sure ? onDelete().then((ok) => ok && close()) : setSure(true))}>
            {sure ? "Tap again to delete" : "Delete"}
          </button>
          <p className="note">Deleting removes {name} from the team and booking lists. Past matches and stats stay.</p>
        </form>
      )}
    </li>
  );
}

export default function Roster({ db, isAdmin, names, everyone, deleted, playerDocs, teamDocs, teams }) {
  const [player, setPlayer] = useState("");
  const [pick, setPick] = useState({ a: "", b: "", nick: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const say = (text, kind = "ok") => setMsg({ text, kind });

  // Runs a save and reports how it went. Resolves to true when it worked.
  async function run(fn, fail) {
    setBusy(true);
    try { await fn(); return true; } catch (err) {
      say(err?.code === "permission-denied" ? fail : "Couldn't save. Check your connection and try again.", "err");
      return false;
    } finally { setBusy(false); }
  }

  // Players who have only played (never added here) get a record the first time they're edited.
  const docFor = (name) => playerDocs.find((p) => p.id === name.toLowerCase());
  const savePlayer = (name, patch) => (docFor(name)
    ? updateDoc(doc(db, "players", name.toLowerCase()), patch)
    : setDoc(doc(db, "players", name.toLowerCase()), { name, ...patch, createdAt: serverTimestamp() }));

  const setAlias = (name, alias) => run(async () => {
    await savePlayer(name, { alias });
    say(alias ? `${name} is now “${alias}”.` : `Removed ${name}'s alias.`);
  }, "The database refused that change. Sign out and back in, then try again.");

  const setDeleted = (name, hidden) => run(async () => {
    await savePlayer(name, { hidden });
    say(hidden ? `Deleted ${name}. Add the same name again to bring them back.` : `${name} is back.`);
  }, "The database refused that change. Sign out and back in, then try again.");

  function addPlayer(e) {
    e.preventDefault();
    const name = clean(player);
    if (badName(name)) return say("Type a name of up to 30 characters (no “/”).", "err");
    const same = everyone.find((n) => n.toLowerCase() === name.toLowerCase());
    if (same && deleted.has(same.toLowerCase())) return setDeleted(same, false).then((ok) => ok && setPlayer(""));
    if (same) return say(`${same} is already in the list.`, "err");
    return run(async () => {
      await setDoc(doc(db, "players", name.toLowerCase()), { name, createdAt: serverTimestamp() });
      setPlayer("");
      say(`Added ${name}.`);
    }, `${name} is already in the list.`);
  }

  function addTeam(e) {
    e.preventDefault();
    const nick = clean(pick.nick);
    if (!pick.a || !pick.b) return say("Choose both players for the team.", "err");
    if (pick.a === pick.b) return say("A team needs two different players.", "err");
    if (nick.length > 30) return say("Keep the nickname to 30 characters.", "err");
    const players = byLower([pick.a, pick.b]);
    const id = teamKey(players);
    const saved = teamDocs.find((t) => t.id === id);
    const label = players.join(" & ");
    return run(async () => {
      if (saved) {
        if ((saved.nick || "") === nick) return say(`${label} is already a team.`, "err");
        await updateDoc(doc(db, "teams", id), { nick });
        say(nick ? `${label} are now “${nick}”.` : `Removed the nickname for ${label}.`);
      } else {
        await setDoc(doc(db, "teams", id), { players, nick, createdAt: serverTimestamp() });
        say(`Added team ${nick ? `“${nick}” (${label})` : label}.`);
      }
      setPick({ a: "", b: "", nick: "" });
    }, "The database refused that team. Sign out and back in, then try again.");
  }

  const remove = (col, id, label) => run(async () => {
    await deleteDoc(doc(db, col, id));
    say(`Removed ${label}. Past matches keep their scores.`);
  }, "Only the admin can remove players and teams.");

  const savedTeams = new Set(teamDocs.map((t) => t.id));
  const playerSelect = (k, label) => (
    <select aria-label={label} value={pick[k]} onChange={(e) => setPick((s) => ({ ...s, [k]: e.target.value }))}>
      <option value="">{label}…</option>
      {names.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  return (
    <section className="panel" aria-labelledby="rosterH">
      <div className="panel-head"><h2 id="rosterH">Players &amp; teams</h2></div>

      <form className="roster-form" onSubmit={addPlayer}>
        <h3>Add player</h3>
        <div className="row">
          <input type="text" placeholder="Player name" aria-label="Player name" autoComplete="off"
            value={player} onChange={(e) => setPlayer(e.target.value)} />
          <button className="tool" type="submit" disabled={busy}>Add player</button>
        </div>
      </form>
      <ul className="plist">
        {names.map((n) => (
          <PlayerRow key={n} name={n} alias={docFor(n)?.alias || ""} busy={busy}
            onSave={(alias) => setAlias(n, alias)} onDelete={() => setDeleted(n, true)} />
        ))}
        {!names.length && <li className="empty">No players yet.</li>}
      </ul>
      {deleted.size > 0 && (
        <details className="gone">
          <summary>Deleted players ({everyone.filter((n) => deleted.has(n.toLowerCase())).length})</summary>
          <ul className="plist">
            {everyone.filter((n) => deleted.has(n.toLowerCase())).map((n) => (
              <li key={n}><div className="line"><span className="pname muted">{n}</span>
                <button type="button" className="tool sm" disabled={busy} onClick={() => setDeleted(n, false)}>Restore</button>
              </div></li>
            ))}
          </ul>
        </details>
      )}

      <form className="roster-form" onSubmit={addTeam}>
        <h3>Add team</h3>
        <div className="row">
          {playerSelect("a", "Player 1")}
          {playerSelect("b", "Player 2")}
        </div>
        <div className="row">
          <input type="text" placeholder="Nickname (optional)" aria-label="Team nickname" autoComplete="off"
            value={pick.nick} onChange={(e) => setPick((s) => ({ ...s, nick: e.target.value }))} />
          <button className="tool" type="submit" disabled={busy}>Save team</button>
        </div>
        <p className="note">Pick an existing team to change or clear its nickname.</p>
      </form>
      <ul className="teamlist">
        {teams.map((t) => (
          <li key={t.key}>
            {t.nick && <b>{t.nick} </b>}<span className={t.nick ? "muted" : ""}>{t.players.join(" & ")}</span>
            {isAdmin && savedTeams.has(t.key) && (
              <button type="button" className="x" aria-label={"Remove team " + t.label}
                onClick={() => remove("teams", t.key, t.label)}>✕</button>
            )}
          </li>
        ))}
        {!teams.length && <li className="empty">No teams yet. Add two players, then pair them up.</li>}
      </ul>
      <div className={"msg " + (msg?.kind || "")} role="status">{msg?.text}</div>
    </section>
  );
}
