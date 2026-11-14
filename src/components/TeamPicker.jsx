import { useEffect, useMemo, useRef, useState } from "react";

// Searchable team dropdown for Book a match. A plain <select> can't be searched, and with many
// teams scrolling A–Z was slow, so this lists the most played teams first and filters as you type.
export default function TeamPicker({ id, label, teams, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const listRef = useRef(null);

  const sorted = useMemo(
    () => [...teams].sort((a, b) => b.played - a.played || a.label.localeCompare(b.label)),
    [teams],
  );
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = words.length ? sorted.filter((t) => words.every((w) => t.label.toLowerCase().includes(w))) : sorted;
  const chosen = teams.find((t) => t.key === value);

  const close = () => { setOpen(false); setQ(""); };
  const pick = (t) => { onChange(t); close(); box.current?.querySelector("button.tp-btn")?.focus(); };

  // Close when tapping anywhere outside the picker.
  useEffect(() => {
    if (!open) return;
    const off = (e) => { if (!box.current?.contains(e.target)) close(); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);

  useEffect(() => setActive(0), [q, open]);
  // Keep the highlighted row in view when moving with the arrow keys.
  useEffect(() => { listRef.current?.children[active]?.scrollIntoView?.({ block: "nearest" }); }, [active]);

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) pick(shown[active]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); box.current?.querySelector("button.tp-btn")?.focus(); }
  };

  return (
    <div className="slot tp" ref={box}>
      <button id={id} type="button" className={"tp-btn" + (chosen ? "" : " empty")} aria-label={label}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        {chosen ? chosen.label : "Choose team…"}
      </button>
      {open && (
        <div className="tp-pop">
          <input type="search" autoFocus autoComplete="off" placeholder="Search teams or players"
            aria-label={`Search ${label}`} aria-controls={id + "-list"} value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          {chosen && <button type="button" className="tool sm tp-clear" onClick={() => pick(undefined)}>Clear</button>}
          <ul id={id + "-list"} role="listbox" aria-label={label} ref={listRef}>
            {shown.map((t, i) => (
              <li key={t.key} role="option" aria-selected={t.key === value}
                className={(i === active ? "on" : "") + (t.key === value ? " sel" : "")}
                onPointerEnter={() => setActive(i)} onClick={() => pick(t)}>
                <span className="tp-name">{t.label}</span>
                <span className="tp-n">{t.played ? `${t.played} played` : "new"}</span>
              </li>
            ))}
            {!shown.length && <li className="tp-none">{teams.length ? "No team matches. Add it under Players & teams." : "No teams yet."}</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
