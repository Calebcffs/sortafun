// Birdie online play: gets the Firebase side ready. Safe to re-run.
//   1. switches on anonymous sign-in (how players get an id) if it can
//   2. checks the Realtime Database exists (made once by hand in the console,
//      see SETUP.md; the service account isn't allowed to create it)
//   3. uploads database.rules.json to it
// Runs in GitHub Actions (.github/workflows/rtdb-deploy.yml) with the same
// service account as the Firestore deploy. No npm packages needed.
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const project = process.env.FIREBASE_PROJECT_ID || sa.project_id;
const cfg = readFileSync(new URL("../firebase-config.js", import.meta.url), "utf8");
const DB = (cfg.match(/databaseURL:\s*"([^"]+)"/) || [])[1];
if (!DB) throw new Error("no databaseURL in firebase-config.js");

function b64url(x) { return Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email",
  }));
  const sig = createSign("RSA-SHA256").update(head + "." + claim).sign(sa.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + head + "." + claim + "." + b64url(sig),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}
const tok = await token();
const H = { authorization: "Bearer " + tok, "content-type": "application/json" };
const short = (x) => JSON.stringify(x).slice(0, 300);
console.log("service account:", sa.client_email, "project:", project, "db:", DB);
let ok = true;

// 1. anonymous sign-in
let res = await fetch("https://identitytoolkit.googleapis.com/admin/v2/projects/" + project + "/config?updateMask=signIn.anonymous.enabled", {
  method: "PATCH", headers: H, body: JSON.stringify({ signIn: { anonymous: { enabled: true } } }),
});
let body = await res.json();
if (res.ok && body.signIn && body.signIn.anonymous && body.signIn.anonymous.enabled) console.log("anonymous sign-in: on");
else { ok = false; console.log("anonymous sign-in: couldn't switch it on (" + res.status + " " + short(body) + ")\n  -> Firebase console > Authentication > Get started > Anonymous > Enable"); }

// 2. does the database exist?
res = await fetch(DB + "/.json?shallow=true", { headers: H });
if (res.status === 404 || res.status === 423) {
  console.log("database: not found at " + DB + "\n  -> Firebase console > Realtime Database > Create database > Singapore (asia-southeast1) > locked mode");
  process.exit(1);
}
console.log("database: there (" + res.status + ")");

// 3. rules
res = await fetch(DB + "/.settings/rules.json", { method: "PUT", headers: H, body: readFileSync(new URL("../database.rules.json", import.meta.url), "utf8") });
body = await res.text();
console.log("rules upload:", res.status, body.slice(0, 300));
if (!res.ok) ok = false;
if (!ok) process.exitCode = 1;
