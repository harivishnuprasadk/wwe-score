import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

// Live list of every match. `ca` is when the server logged it (ms), used for the 1-hour lock.
export function useMatches(db) {
  const [matches, setMatches] = useState([]);
  const [status, setStatus] = useState("connecting");
  useEffect(() => {
    return onSnapshot(
      collection(db, "matches"),
      (snap) => {
        setMatches(snap.docs.map((d) => {
          const { createdAt, ...rest } = d.data({ serverTimestamps: "estimate" });
          return { id: d.id, ...rest, ca: createdAt ? createdAt.toMillis() : null };
        }));
        setStatus("live");
      },
      () => setStatus("error"),
    );
  }, [db]);
  return { matches, status };
}

// Live list of a small collection (players, teams), each doc as { id, ...data }.
export function useDocs(db, name) {
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    return onSnapshot(collection(db, name), (snap) => setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
  }, [db, name]);
  return docs;
}

// Current time, refreshed on an interval so lock countdowns tick.
export function useNow(ms) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
