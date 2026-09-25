// One-off (safe to re-run): make sure the Firebase project has its default
// Realtime Database (Birdie multiplayer lives there) and print its URL.
// Runs in GitHub Actions with the same service account as the Firestore
// deploy (GOOGLE_APPLICATION_CREDENTIALS). No npm packages needed.
import { readFileSync } from "node:fs";
import { createSign } from "node:crypto";

const sa = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"));
const project = process.env.FIREBASE_PROJECT_ID || sa.project_id;
const LOCATION = "asia-southeast1";

function b64url(x) { return Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }

async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
    scope: "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase",
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
const api = "https://firebasedatabase.googleapis.com/v1beta/projects/" + project + "/locations/";
const H = { authorization: "Bearer " + tok, "content-type": "application/json" };
console.log("service account:", sa.client_email, "project:", project);

let res = await fetch(api + "-/instances", { headers: H });
let body = await res.json();
console.log("list:", res.status, JSON.stringify(body));
let inst = (body.instances || []).find((i) => i.type === "DEFAULT_DATABASE");
if (!inst) {
  res = await fetch(api + LOCATION + "/instances?databaseId=" + project + "-default-rtdb", {
    method: "POST", headers: H, body: JSON.stringify({ type: "DEFAULT_DATABASE" }),
  });
  body = await res.json();
  console.log("create:", res.status, JSON.stringify(body));
  inst = body;
}
if (inst && inst.databaseUrl) console.log("DATABASE_URL=" + inst.databaseUrl);
else process.exitCode = 1;
