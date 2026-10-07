import { useEffect, useState } from "react";

const NEW = "__new__";

// Dropdown of known names, with "New…" switching to a text box. Used for players and wrestlers.
export default function PlayerSelect({
  id, value, names, onChange, resetKey, className = "",
  label = "Player", placeholder = "Choose player…", newLabel = "＋ New player…", typeLabel = "New player name",
}) {
  const [typing, setTyping] = useState(false);

  // A rematch or a saved match fills slots from outside: go back to the dropdown.
  useEffect(() => setTyping(false), [resetKey]);

  if (typing) {
    return (
      <div className={"slot " + className}>
        <input id={id} type="text" placeholder="Type a name" autoComplete="off" autoFocus
          aria-label={typeLabel} value={value} onChange={(e) => onChange(e.target.value)} />
        <button className="back" type="button" title="Back to the list"
          onClick={() => { setTyping(false); onChange(""); }}>↩</button>
      </div>
    );
  }

  const options = value && !names.includes(value) ? [...names, value] : names;
  return (
    <div className={"slot " + className}>
      <select id={id} aria-label={label} value={value}
        onChange={(e) => {
          if (e.target.value === NEW) { setTyping(true); onChange(""); }
          else onChange(e.target.value);
        }}>
        <option value="">{placeholder}</option>
        <option value={NEW}>{newLabel}</option>
        {options.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </div>
  );
}
