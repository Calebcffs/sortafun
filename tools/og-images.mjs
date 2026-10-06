// Link-preview images (1200x630) for every page in tools/seo.py, drawn from the homepage's own
// THUMB pictures, so a shared link shows the game in WhatsApp / Discord / iMessage / X.
//
//   python -m http.server 8765          (in the repo, in another terminal)
//   node tools/og-images.mjs [id ...]   (no ids = all of them)
//
// Writes assets/og/<id>.png. Uses headless Chrome over the DevTools protocol (no npm packages).
// Keep each file well under 200 KB (WhatsApp drops big previews): each PNG is cut to 256 colours (Pillow).
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME || "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const BASE = process.env.BASE || "http://localhost:8765/";
// og id -> [name on the card, line under it]
const CARDS = {
  sudoku: ["Daily Sudoku", "3 new puzzles every day"], hive: ["Word Hive", "7 letters. how many words?"],
  five: ["Five Letters", "guess today's word in 6 tries"], ladder: ["Word Ladder", "one letter at a time"],
  sides: ["Four Sides", "use all 12 letters"], slider: ["Tile Slider", "today's scramble"],
  grab: ["Word Grab", "2 minutes, 16 letters"], typing: ["Typing Test", "how fast do you type?"],
  crossword: ["Crossword", "a 15x15 themeless grid"], mines: ["Minesweeper", "first click is always safe"],
  maze: ["Cursor Maze", "don't touch the walls"], reaction: ["Reaction Time", "how fast are you?"],
  aim: ["Aim Trainer", "30 seconds. count the hits"], stopbar: ["Stop the Bar", "hit the green"],
  race: ["Circuit Race", "3D racing in your browser"], sushi: ["Sushi Goes Round", "run the conveyor belt"],
  deeptime: ["Deep Time", "headphones on. lights off."], funstrike: ["Fun Strike", "free browser shooter"],
  draw: ["Draw and Guess", "play with friends"], studio: ["Animation Studio", "make a flipbook"],
  gallery: ["Animation Gallery", "flipbooks by players"], boards: ["Leaderboards", "today's top scores"],
  forum: ["The Forum", "arguing since 2003"], guest: ["Guestbook", "sign it!"], passport: ["Passport", "collect the stamps"],
  home: ["Sortafun", "daily puzzles, word games and more"],
};
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CARDS);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const prof = join(tmpdir(), "og-" + Date.now());
const ch = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9399", "--user-data-dir=" + prof, "--hide-scrollbars", "about:blank"]);
let tabs; for (let i = 0; i < 40; i++) { try { tabs = await (await fetch("http://127.0.0.1:9399/json")).json(); break; } catch (e) { await sleep(250); } }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pend = {};
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result.result.value; };

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
// the homepage, for its thumb() drawings and the Lilita One font; stop the hit counter counting us
await send("Page.navigate", { url: BASE + "index.html?og" }); await sleep(600);
await ev(`sessionStorage.setItem("sortafun-visited", "1"); 1`);
await send("Page.navigate", { url: BASE + "index.html?og" });
for (let i = 0; i < 60 && !(await ev(`typeof thumb === "function" && document.fonts.status === "loaded"`)); i++) await sleep(200);
await ev(`document.fonts.load("64px 'Lilita One'").then(() => 1)`);

mkdirSync("assets/og", { recursive: true });
for (const og of want) {
  const [name, line] = CARDS[og] || (() => { throw new Error("no card for " + og); })();
  await ev(`(() => {
    const ink = "#1d1b2e";
    const svg = (id, w) => thumb(id).replace("<svg ", '<svg width="' + w + '" height="' + (w * .75) + '" ');
    const pic = ${JSON.stringify(og)} === "home"
      ? '<div style="display:grid;grid-template-columns:repeat(3,180px);gap:14px">' + ["sudoku","hive","five","typing","mines","reaction"].map(t => '<div style="border:5px solid ' + ink + ';border-radius:16px;overflow:hidden;background:#fff;line-height:0;box-shadow:0 6px 0 ' + ink + '">' + svg(t, 180) + '</div>').join("") + '</div>'
      : '<div style="border:7px solid ' + ink + ';border-radius:26px;overflow:hidden;background:#fff;box-shadow:0 10px 0 ' + ink + ';line-height:0">' + svg(${JSON.stringify(og === "home" ? "sudoku" : og)}, 520) + '</div>';
    document.documentElement.className = "";
    document.body.innerHTML = '<div id="card" style="position:fixed;inset:0;width:1200px;height:630px;display:flex;align-items:center;gap:56px;padding:0 64px;box-sizing:border-box;'
      + 'background:radial-gradient(circle at 20% 15%,#9fd8ff,#4dabf7 55%,#1c7ed6);font-family:Lilita One,Arial Black,sans-serif;color:' + ink + ';z-index:99999">'
      + pic
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:inline-block;background:#ffd43b;border:5px solid ' + ink + ';border-radius:14px;padding:4px 18px;font-size:30px;transform:rotate(-2deg);box-shadow:0 5px 0 ' + ink + '">sortafun.org</div>'
      + '<div style="font-size:' + (${JSON.stringify(name)}.length > 12 ? 74 : 92) + 'px;line-height:1.02;margin:22px 0 14px;color:#fff;-webkit-text-stroke:5px ' + ink + ';paint-order:stroke fill;text-shadow:0 7px 0 ' + ink + '">' + ${JSON.stringify(name)} + '</div>'
      + '<div style="font:700 34px Verdana,sans-serif;color:#fff;text-shadow:0 3px 0 rgba(0,0,0,.35)">' + ${JSON.stringify(line)} + '</div>'
      + '<div style="margin-top:26px;font:700 24px Verdana,sans-serif;color:' + ink + ';background:#fff;display:inline-block;padding:8px 16px;border:4px solid ' + ink + ';border-radius:999px;white-space:nowrap">free &middot; no download &middot; no sign-up</div>'
      + '</div></div>';
    document.body.style.cssText = "margin:0;overflow:hidden";
    return 1;
  })()`);
  await sleep(150);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
  const file = "assets/og/" + og + ".png";
  writeFileSync(file, Buffer.from(shot.result.data, "base64"));
  // 256 colours, dithered: ~1/3 the size, looks the same (Python + Pillow)
  const q = spawnSync("python", ["-c", "import sys;from PIL import Image;f=sys.argv[1];Image.open(f).convert('RGB').quantize(256,dither=Image.Dither.FLOYDSTEINBERG).save(f,optimize=True)", file]);
  if (q.status) console.warn("quantize failed (is Pillow installed?)", String(q.stderr).slice(0, 200));
  console.log(file, Math.round(statSync(file).size / 1024) + " KB");
}
ws.close(); ch.kill();
