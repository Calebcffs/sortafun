// tiny CDP helper: launch headless chrome, open a page, evaluate, screenshot
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
const CHROME = "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function launch(port = 9333, prof) {
  mkdirSync(prof, { recursive: true });
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--window-size=1280,900", "--no-first-run", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
  let list;
  for (let i = 0; i < 50; i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); if (list.length) break; } catch (e) {} await sleep(200); }
  const pg = list.find((t) => t.type === "page");
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  let id = 0; const pend = {}; const handlers = [];
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend[m.id]) { const p = pend[m.id]; delete pend[m.id]; m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
    else if (m.method) handlers.forEach((h) => h(m));
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend[i] = { res, rej }; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 800)); return r.result.value; };
  const shot = async (file, clip) => { const r = await send("Page.captureScreenshot", clip ? { format: "png", clip: { ...clip, scale: 1 } } : { format: "png" }); writeFileSync(file, Buffer.from(r.data, "base64")); };
  const logs = [];
  handlers.push((m) => { if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + JSON.stringify(m.params.exceptionDetails).slice(0, 400)); if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) logs.push(m.params.type + " " + m.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300)); });
  await send("Runtime.enable"); await send("Page.enable");
  const nav = async (url) => { await send("Page.navigate", { url }); await sleep(1500); };
  const close = () => { try { ws.close(); } catch (e) {} proc.kill(); };
  return { send, ev, shot, nav, close, logs, handlers };
}
