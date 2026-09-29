// Builds <game>/vault.js: a password-protected game's private content, encrypted.
//
//   node tools/build-vault.mjs <game> <password>      e.g.  node tools/build-vault.mjs slack <pw>
//
// Reads <game>/src/ (git-ignored, only on Caleb's machine):
//   data.js            evaluated; whatever it puts on window.<GAME>_DATA becomes content.data
//                      (taka-san's sets window.TAKA_DATA)
//   *.jpg / *.png      images at the top level -> content.tex[name]   (data: URLs)
//   <dir>/*.jpg|png    images in a folder     -> content[dir][name]  (taka-san's faces/)
// packs it as JSON and encrypts it with AES-256-GCM, the key from the password
// via PBKDF2-SHA256 (250k rounds, random salt), into
//   window.<GAME>_VAULT = { v, iter, salt, iv, ct }
// which the game's lock screen decrypts in the browser. The password is never
// written anywhere. Then run tools/stamp.py and commit <game>/vault.js.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import vm from "node:vm";

const [game, pass] = process.argv.slice(2);
if (!game || !pass) { console.error("usage: node tools/build-vault.mjs <game> <password>"); process.exit(1); }
const src = game + "/src", G = game.toUpperCase();
const content = {};
const img = (p) => "data:image/" + (p.endsWith(".png") ? "png" : "jpeg") + ";base64," + readFileSync(p).toString("base64");
const isImg = (f) => /\.(png|jpe?g)$/i.test(f);
const base = (f) => f.replace(/\.(png|jpe?g)$/i, "");

if (existsSync(src + "/data.js")) {
  const win = {};
  vm.runInNewContext(readFileSync(src + "/data.js", "utf8"), { window: win });
  content.data = win[G + "_DATA"];
  if (!content.data) throw new Error(src + "/data.js didn't set window." + G + "_DATA");
}
for (const f of readdirSync(src)) {
  const p = src + "/" + f;
  if (statSync(p).isDirectory()) {
    for (const g of readdirSync(p)) if (isImg(g)) (content[f] = content[f] || {})[base(g)] = img(p + "/" + g);
  } else if (isImg(f)) (content.tex = content.tex || {})[base(f)] = img(p);
}
const plain = new TextEncoder().encode(JSON.stringify(content));

const ITER = 250000;
const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
const k0 = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, k0, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
const b64 = (u) => Buffer.from(u).toString("base64");
writeFileSync(game + "/vault.js",
  "/* " + game + ": private content, encrypted (tools/build-vault.mjs). */\n" +
  "window." + G + "_VAULT = " + JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) }) + ";\n");
const parts = Object.keys(content).map((k) => k + (typeof content[k] === "object" && k !== "data" ? "(" + Object.keys(content[k]).length + ")" : ""));
console.log(game + "/vault.js: " + parts.join(", ") + "; " + plain.length + " bytes in, " + ct.length + " out");
