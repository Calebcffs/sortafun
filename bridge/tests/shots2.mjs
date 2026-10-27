import { launch, sleep } from "./cdp.mjs";
import { writeFileSync } from "node:fs";
const S = process.argv[2], URL = "http://127.0.0.1:8642/bridge.html";
const c = await launch(9335, S + "/prof3");
// inject a test level with a rock, uneven roads and high cable anchors (agent 3 writes the real ones)
await c.send("Page.addScriptToEvaluateOnNewDocument", { source: `
  Object.defineProperty(window, "TrussLevels", { configurable: true, get() { return this.__tl; }, set(v) {
    v.push({ id: 7, name: "test rock", hint: "probe level", gap: 20, leftY: 0, rightY: 2, floorY: -10, ceilY: 8,
      anchors: [{x:0,y:0},{x:0,y:-3},{x:-1,y:5},{x:20,y:2},{x:20,y:-2},{x:21,y:7},{x:8,y:-5},{x:12,y:-5},{x:10,y:-5}],
      rock: {x0:8,x1:12,top:-5}, materials:["road","beam","cable"], budget: 20000, maxMembers: 80,
      vehicles:[{type:"van",delay:0},{type:"heavy",delay:2}], stars:{two:15000,three:12000},
      ref: { nodes: [{x:2,y:0},{x:4,y:0},{x:6,y:0},{x:8,y:0},{x:10,y:0},{x:12,y:0},{x:13,y:1},{x:15,y:1},{x:17,y:1},{x:18,y:2},{x:9,y:-2},{x:11,y:-2}],
        members: [
          {a:"0,0",b:"2,0",type:"road"},{a:"2,0",b:"4,0",type:"road"},{a:"4,0",b:"6,0",type:"road"},{a:"6,0",b:"8,0",type:"road"},{a:"8,0",b:"10,0",type:"road"},
          {a:"10,0",b:"12,0",type:"road"},{a:"12,0",b:"13,1",type:"road"},{a:"13,1",b:"15,1",type:"road"},{a:"15,1",b:"17,1",type:"road"},{a:"17,1",b:"18,2",type:"road"},{a:"18,2",b:"20,2",type:"road"},
          {a:"-1,5",b:"4,0",type:"cable"},{a:"-1,5",b:"6,0",type:"cable"},{a:"21,7",b:"17,1",type:"cable"},{a:"21,7",b:"15,1",type:"cable",r:true},
          {a:"8,-5",b:"9,-2",type:"beam"},{a:"9,-2",b:"8,0",type:"beam"},{a:"9,-2",b:"10,0",type:"beam"},{a:"10,-5",b:"9,-2",type:"beam"},{a:"10,-5",b:"11,-2",type:"beam"},
          {a:"11,-2",b:"10,0",type:"beam",r:true},{a:"11,-2",b:"12,0",type:"beam"},{a:"12,-5",b:"11,-2",type:"beam"},{a:"9,-2",b:"11,-2",type:"beam"},
          {a:"0,-3",b:"2,0",type:"beam"}
        ] } });
    this.__tl = v; } });` });
await c.nav(URL);
await c.ev(`localStorage.removeItem("sortafun-bridge-v1"); location.reload(); 1`); await sleep(1500);
const clipOf = async (sel) => c.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }; })()`);
const shot = async (file, sel) => { const clip = await clipOf(sel); const r = await c.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { ...clip, scale: 1 } }); writeFileSync(file, Buffer.from(r.data, "base64")); console.log("shot", file); };
console.log(JSON.stringify(await c.ev(`(() => { __bridge.load(7); const r = __bridge.setDesign(TrussLevels[2].ref); __bridge.render(); return r; })()`)));
await shot(S + "/shots/8-rock-build.png", "#stage");
await c.ev(`__bridge.test(); 1`);
const r = await c.ev(`(() => { let st; for (let i = 0; i < 2400; i++) { st = __bridge.step(1); if (st.vehicles[1].x > 9) break; } __bridge.render(); return { t: st.t, broken: st.members.filter(m => m.broken).length, v: st.vehicles.map(v => [v.type, v.x.toFixed(1), v.fell]) }; })()`);
console.log(JSON.stringify(r));
await shot(S + "/shots/9-rock-test.png", "#stage");
// a flat deck on level 2: the truck snaps it. catch it just after the first break
await c.ev(`(() => { __bridge.load(2); const n = [], m = []; for (let x = 0; x < 12; x += 2) { if (x) n.push({x, y: 0}); m.push({a: x + ",0", b: (x + 2) + ",0", type: "road"}); } __bridge.setDesign({nodes: n, members: m}); __bridge.test(); return 1; })()`);
const r2 = await c.ev(`(() => { let st, first = -1; for (let i = 0; i < 2400; i++) { st = __bridge.step(1); const b = st.members.some(m => m.broken); if (b && first < 0) first = i; if (first >= 0 && i - first >= 10) break; } __bridge.render(); return { t: st.t, broken: st.members.filter(m => m.broken).length, v: st.vehicles.map(v => [v.type, v.x.toFixed(1), v.y.toFixed(1), v.fell]) }; })()`);
console.log(JSON.stringify(r2));
await shot(S + "/shots/10-snap-l2.png", "#stage");
const r3 = await c.ev(`(() => { let st; for (let i = 0; i < 70; i++) st = __bridge.step(1); __bridge.render(); return { t: st.t, res: __bridge.state().result, v: st.vehicles.map(v => [v.type, v.x.toFixed(1), v.y.toFixed(1), v.fell]) }; })()`);
console.log(JSON.stringify(r3));
await shot(S + "/shots/11-fall-l2.png", "#stage");
const r4 = await c.ev(`(() => { for (let i = 0; i < 200 && !__bridge.state().result; i++) __bridge.step(1); return __bridge.state().result; })()`);
console.log(JSON.stringify(r4));
await shot(S + "/shots/12-fail-overlay.png", "#stage");
console.log(c.logs.filter((l) => !l.includes("[chat]")).join("\n"));
c.close(); process.exit(0);
