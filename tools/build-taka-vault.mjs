// Builds taka/vault.js: the taka-san dinner simulator's content, encrypted.
//
// The faces (taka/src/faces/*.png) and every line of dialogue
// (taka/src/data.js) live only in taka/src/, which is git-ignored. This packs
// them into one JSON blob and encrypts it with AES-256-GCM, the key derived
// from the game's password with PBKDF2-SHA256 (250k rounds, random salt).
// The page asks for the password and decrypts in the browser (taka/lock.js).
// The password is never written anywhere: pass it on the command line.
//
//   node tools/build-taka-vault.mjs <password>
//
// then run tools/stamp.py (vault.js changed) and commit taka/vault.js.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import vm from "node:vm";

const pass = process.argv[2];
if (!pass) { console.error("usage: node tools/build-taka-vault.mjs <password>"); process.exit(1); }

const win = {};
vm.runInNewContext(readFileSync("taka/src/data.js", "utf8"), { window: win });
if (!win.TAKA_DATA) throw new Error("taka/src/data.js didn't set window.TAKA_DATA");
const faces = {};
for (const f of readdirSync("taka/src/faces")) {
  if (!f.endsWith(".png")) continue;
  faces[f.replace(/\.png$/, "")] = "data:image/png;base64," + readFileSync("taka/src/faces/" + f).toString("base64");
}
const plain = new TextEncoder().encode(JSON.stringify({ data: win.TAKA_DATA, faces }));

const ITER = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
const b64 = (u) => Buffer.from(u).toString("base64");

writeFileSync("taka/vault.js",
  "/* taka-san dinner simulator: the game's content, encrypted (tools/build-taka-vault.mjs). */\n" +
  "window.TAKA_VAULT = " + JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }) + ";\n");
console.log("taka/vault.js: " + Object.keys(faces).length + " faces, " + plain.length + " bytes in, " + ct.length + " out");
