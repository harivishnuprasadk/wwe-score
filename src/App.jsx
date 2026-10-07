import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseReady } from "./lib/firebase.js";
import Login from "./components/Login.jsx";
import Board from "./components/Board.jsx";

export default function App() {
  const [fb, setFb] = useState(null);
  const [configError, setConfigError] = useState(false);
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    firebaseReady.then(setFb).catch(() => setConfigError(true));
  }, []);

  useEffect(() => {
    if (!fb) return;
    return onAuthStateChanged(fb.auth, setUser);
  }, [fb]);

  if (configError) {
    return <Login error="Couldn't load the app settings. Open the site from its web.app link, or add .env.local when running it on your computer." />;
  }
  if (!fb || user === undefined) return <div className="splash">Loading…</div>;
  if (!user) return <Login auth={fb.auth} />;
  return <Board fb={fb} user={user} />;
}
