import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { ADMIN_EMAIL, GROUP_EMAIL } from "../lib/firebase.js";

// Two logins: the group's shared one, and the owner's admin one (resolves flags, restores backups).
const ROLES = {
  group: { email: GROUP_EMAIL, label: "Group", field: "Group password", wrong: "Wrong password. Ask the group for the current one." },
  admin: { email: ADMIN_EMAIL, label: "Admin", field: "Admin password", wrong: "Wrong admin password." },
};

export default function Login({ auth, error }) {
  const [role, setRole] = useState("group");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(error || "");
  const r = ROLES[role];

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      await signInWithEmailAndPassword(auth, r.email, pw);
    } catch (err) {
      const code = err?.code;
      setMsg(
        code === "auth/too-many-requests" ? "Too many wrong tries. Wait a few minutes, then try again."
        : ["auth/invalid-credential", "auth/wrong-password", "auth/invalid-login-credentials", "auth/user-not-found"].includes(code)
          ? r.wrong
          : "Couldn't sign in. Check your internet connection and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <form onSubmit={submit}>
        <span className="eyebrow">WWE 2K23 · PS5 · Tag team night</span>
        <h1><span className="r">Tag</span> <span className="b">Ledger</span></h1>
        <div className="roles" role="radiogroup" aria-label="Sign in as">
          {Object.entries(ROLES).map(([k, x]) => (
            <button key={k} type="button" role="radio" aria-checked={role === k} className={role === k ? "on" : ""}
              onClick={() => { setRole(k); setPw(""); setMsg(""); }}>{x.label}</button>
          ))}
        </div>
        <label className="eyebrow" htmlFor="pw">{r.field}</label>
        <input id="pw" type="password" autoComplete="current-password" required value={pw}
          onChange={(e) => setPw(e.target.value)} disabled={!auth} />
        <button type="submit" disabled={busy || !auth}>{busy ? "Checking…" : role === "admin" ? "Sign in as admin" : "Enter"}</button>
        {role === "admin" && <p className="note">Admin can resolve flagged results and restore backups.</p>}
        <div className="msg err" role="status">{msg}</div>
      </form>
    </div>
  );
}
