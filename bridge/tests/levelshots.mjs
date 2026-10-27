// every level in build mode with its ref design loaded, then mid-test with the last vehicle on the bridge.
//   node levelshots.mjs <scratch dir> [ids...]   (needs `python -m http.server 8642` in the repo root)
// Writes <scratch>/levels/L<id>-build.png and L<id>-test.png and prints the camera fit check.
import { launch, sleep } from "./cdp.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
const S = process.argv[2], only = process.argv.slice(3).map(Number);
mkdirSync(S + "/levels", { recursive: true });
const c = await launch(9336, S + "/prof-levels");
await c.nav("http://127.0.0.1:8642/bridge.html");
await c.ev(`localStorage.removeItem("sortafun-bridge-v1"); location.reload(); 1`); await sleep(1500);
const shot = async (file) => {
  const clip = await c.ev(`(() => { const r = document.querySelector("#stage").getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
  const r = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } });
  writeFileSync(file, Buffer.from(r.data, "base64"));
};
const ids = await c.ev(`TrussLevels.map(l => l.id)`);
for (const id of ids) {
  if (only.length && !only.includes(id)) continue;
  // every anchor, both road ends and the rock corners must land inside the canvas
  const fit = await c.ev(`(() => {
    __bridge.load(${id}); const L = TrussLevels.find(l => l.id === ${id});
    const r = __bridge.setDesign(L.ref); __bridge.render();
    const b = document.getElementById("cv").getBoundingClientRect();
    const pts = L.anchors.map(a => [a.x, a.y]).concat(L.ref.nodes.map(n => [n.x, n.y]));
    const out = pts.filter(([x, y]) => { const p = __bridge.toScreen(x, y); return !(p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom); });
    return { errors: r.errors.length, w: Math.round(b.width), h: Math.round(b.height), outside: out };
  })()`);
  console.log(`L${id}`, JSON.stringify(fit));
  await shot(`${S}/levels/L${id}-build.png`);
  const mid = await c.ev(`(() => { __bridge.test(); const L = TrussLevels.find(l => l.id === ${id}); const last = L.vehicles.length - 1; let st;
    for (let i = 0; i < 2400; i++) { st = __bridge.step(1); const v = st.vehicles[last]; if (v.started && v.x > L.gap * 0.55) break; }
    __bridge.render(); return { t: +st.t.toFixed(1), broken: st.members.filter(m => m.broken).length, maxStress: Math.max(...st.members.map(m => Math.abs(m.stress))).toFixed(2) }; })()`);
  console.log(`   mid-test`, JSON.stringify(mid));
  await shot(`${S}/levels/L${id}-test.png`);
}
console.log(c.logs.filter((l) => !l.includes("[chat]")).join("\n"));
c.close(); process.exit(0);
