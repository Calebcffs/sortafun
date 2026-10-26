// Location generator for Globe Guesser.
// random town (GeoNames, weighted by country) + small offset -> OSRM nearest road
// -> load Google's keyless street view embed there -> keep official Google panos only.
// Appends one JSON line per good spot to locs.jsonl. Needs frame.html served on :8765.
// node gen.mjs <target> [tabs]
// Run it from a scratch folder (never the repo) holding: this file, frame.html served with
// `python -m http.server 8765`, geodata/cities1000.txt + countryInfo.txt from download.geonames.org,
// and the locs.jsonl to append to (start from the repo's list to keep the order: it is append-only).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const TARGET = +(process.argv[2] || 2000), TABS = +(process.argv[3] || 4);
const OUT = 'locs.jsonl';
const W = { US: 14, BR: 6, RU: 5, CA: 4, AU: 4, JP: 4, FR: 3, MX: 3, IN: 2, ZA: 2, AR: 2, ES: 2, IT: 2, GB: 2, DE: 1.5, TR: 2, ID: 2, TH: 2, PL: 1.5, CL: 1.5, CO: 1.5, PE: 1.2, PH: 1.2, MY: 1, NZ: 1, KE: 1, NG: 0.6, SE: 1, NO: 1, FI: 1, RO: 1, UA: 0.6, KZ: 0.8, MN: 0.5,
  PT: 0.6, IE: 0.5, NL: 0.5, BE: 0.5, CH: 0.4, AT: 0.5, CZ: 0.5, SK: 0.4, HU: 0.5, HR: 0.4, SI: 0.3, RS: 0.4, BG: 0.5, GR: 0.6, DK: 0.5, IS: 0.3, EE: 0.3, LV: 0.3, LT: 0.3, AL: 0.3, MK: 0.3, ME: 0.2, TW: 0.6, KR: 0.4, HK: 0.2, SG: 0.2, VN: 0.6, KH: 0.5, LA: 0.4, BD: 0.5, LK: 0.5, BT: 0.2, AE: 0.4, IL: 0.5, JO: 0.4, QA: 0.2, OM: 0.3,
  EC: 0.8, BO: 0.6, UY: 0.5, PY: 0.3, GT: 0.6, CR: 0.4, PA: 0.4, DO: 0.4, PR: 0.3, SN: 0.6, GH: 0.7, UG: 0.6, RW: 0.3, TZ: 0.3, BW: 0.5, LS: 0.3, SZ: 0.2, NA: 0.3, MG: 0.3, TN: 0.5, KG: 0.4, LU: 0.2, AD: 0.1, MT: 0.1, GL: 0.15, FO: 0.1, CW: 0.1, NP: 0.2, PK: 0.2, EG: 0.1, NE: 0.1, ML: 0.1, CI: 0.1, ET: 0.1, LB: 0.1 };
const towns = {};
for (const line of fs.readFileSync('geodata/cities1000.txt', 'utf8').split('\n')) {
  const f = line.split('\t'); if (f.length < 9 || !W[f[8]]) continue;
  (towns[f[8]] ||= []).push([+f[4], +f[5]]);
}
const codes = Object.keys(W).filter(c => towns[c]), tot = codes.reduce((s, c) => s + W[c], 0);
const pickCountry = () => { let r = Math.random() * tot; for (const c of codes) if ((r -= W[c]) < 0) return c; return 'US'; };
const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
const near = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.015;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let tried = 0, miss = 0, unofficial = 0, osrmFail = 0;

// OSRM demo server: keep to ~1.5 req/s
let lastOsrm = 0;
async function road(lat, lng) {
  const wait = lastOsrm + 1050 - Date.now(); lastOsrm = Math.max(Date.now(), lastOsrm + 1050); if (wait > 0) await sleep(wait);
  try {
    const j = await (await fetch(`https://router.project-osrm.org/nearest/v1/driving/${lng.toFixed(5)},${lat.toFixed(5)}?number=1`, { signal: AbortSignal.timeout(15000) })).json();
    const w = j.waypoints?.[0]; if (!w || w.distance > 3000) return null;
    return [w.location[1], w.location[0]];
  } catch { return null; }
}

const port = 9300 + Math.floor(Math.random() * 500);
const ch = spawn('C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + port, '--user-data-dir=' + process.env.TEMP + '/gen' + port, '--disable-site-isolation-trials', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=640,360', 'about:blank']);
for (let i = 0; i < 120; i++) { try { await fetch(`http://127.0.0.1:${port}/json`); break; } catch { await sleep(250); } }

async function tab() {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; let ctxs = [];
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m); delete pend[m.id]; }
    if (m.method === 'Runtime.executionContextCreated') ctxs.push(m.params.context);
    if (m.method === 'Runtime.executionContextDestroyed') ctxs = ctxs.filter(c => c.id !== m.params.executionContextId); };
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; setTimeout(() => { if (pend[i]) { delete pend[i]; r({}); } }, 8000); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const EXPR = `JSON.stringify({links:[...document.querySelectorAll('a')].map(a=>a.href).filter(h=>h.includes('/maps/@')).slice(0,1), text:(document.body&&document.body.innerText||'').slice(0,300)})`;
  return async (lat, lng) => {
    ctxs = [];
    const sv = `https://maps.google.com/maps?layer=c&cbll=${lat},${lng}&cbp=12,0,0,0,0&output=svembed`;
    await send('Page.navigate', { url: 'http://localhost:8765/frame.html?' + Math.random() + '#' + encodeURIComponent(sv) });
    for (let i = 0; i < 50; i++) {
      await sleep(250);
      for (const c of ctxs) {
        if (!/google/.test(c.origin)) continue;
        const r = await send('Runtime.evaluate', { expression: EXPR, contextId: c.id, returnByValue: true });
        const v = JSON.parse(r.result?.result?.value || '{}');
        if (/No Street View/i.test(v.text || '')) return { none: true };
        if (v.links?.length) return v;
      }
    }
    return { none: true };
  };
}

async function worker(probe) {
  while (have.length < TARGET) {
    const cc = pickCountry(), ts = towns[cc], t = ts[Math.floor(Math.random() * ts.length)];
    const ang = Math.random() * 2 * Math.PI, km = Math.random() * 4;
    const lat0 = t[0] + Math.sin(ang) * km / 111, lng0 = t[1] + Math.cos(ang) * km / (111 * Math.cos(t[0] * Math.PI / 180));
    const p = await road(lat0, lng0); tried++;
    if (!p) { osrmFail++; continue; }
    if (have.some(h => near([h.lat, h.lng], p))) continue;
    const v = await probe(p[0].toFixed(6), p[1].toFixed(6));
    if (v.none) { miss++; continue; }
    // https://www.google.com/maps/@LAT,LNG,0a,73.7y,HEADh,90t/data=!3m4!1e1!3m2!1s<PANO>!2e<SRC>
    const m = v.links[0].match(/@(-?[\d.]+),(-?[\d.]+),.*?(?:,([\d.]+)h)?,[\d.]+t\/data=.*?!1s([^!]+)!2e(\d+)/);
    if (!m || m[5] !== '0' || !/Google/.test(v.text)) { unofficial++; continue; }
    const rec = { lat: +(+m[1]).toFixed(6), lng: +(+m[2]).toFixed(6), p: decodeURIComponent(m[4]), c: cc };
    if (have.some(h => near([h.lat, h.lng], [rec.lat, rec.lng]))) continue;
    lastGood = Date.now(); have.push(rec); fs.appendFileSync(OUT, JSON.stringify(rec) + '\n');
    if (have.length % 25 === 0) console.log(new Date().toISOString().slice(11, 19), 'have', have.length, 'tried', tried, 'miss', miss, 'unofficial', unofficial, 'osrmFail', osrmFail);
  }
}
let lastGood = Date.now();
setInterval(() => { if (Date.now() - lastGood > 180000) { console.log('stalled, exiting'); ch.kill(); process.exit(2); } }, 10000);
const probes = []; for (let i = 0; i < TABS; i++) probes.push(await tab());
await Promise.all(probes.map(worker));
console.log('done', have.length); ch.kill(); process.exit(0);
