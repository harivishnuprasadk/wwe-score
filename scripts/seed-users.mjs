// Creates the two logins in the local Auth emulator (used by `npm run dev:local`).
const users = [
  ["group@tagledger.app", "group123"],
  ["admin@tagledger.app", "admin123"],
];
for (const [email, password] of users) {
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`Couldn't create ${email}: ${await res.text()}`);
}
console.log("\nLocal logins: group password = group123, admin password = admin123\n");
