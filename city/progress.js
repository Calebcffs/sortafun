// City Sandbox: getting stronger (ROADMAP.md section 5). XP for nearly
// everything, levels, a perk to pick at certain levels, and three contracts
// on the go. All saved with the rest of your stuff (shop.js save: xp, perks,
// perkOffer, contracts).
//
// Everything that happens in the game that's worth something calls
// sandbox.event(kind, data), which lands in event() here.

export const PERKS = {
  tough: { name: "tough", blurb: "+30 max health" },
  lungs: { name: "iron lungs", blurb: "sprint 15% faster" },
  hands: { name: "quick hands", blurb: "reload 40% faster" },
  deadeye: { name: "deadeye", blurb: "+25% gun damage, and brute headshots kill too" },
  quiet: { name: "quiet feet", blurb: "zombies notice you from 35% less far" },
  medic: { name: "medic", blurb: "pick people up in 1.5s, medkits heal to full" },
  scav: { name: "scavenger", blurb: "+60% cash from containers, fuel turns up more" },
  engineer: { name: "engineer", blurb: "defences have double hp, turrets last 20 minutes" },
  wind: { name: "second wind", blurb: "bleed out over 60s, and get yourself up once a night for free" },
  owl: { name: "night owl", blurb: "see further at night, and your torch doesn't give you away" },
  brawler: { name: "brawler", blurb: "melee does 2.5x damage and knocks zombies back" },
  mule: { name: "pack mule", blurb: "carry 8 fuel, +50% ammo from loot" },
};
// (sandbox.perk() takes these names, the short keys above are what's saved)
export const PERK_NAMES = Object.fromEntries(Object.entries(PERKS).map(([k, v]) => [v.name, k]));
export const PERK_LEVELS = [2, 3, 5, 7, 9, 12, 15, 18, 21, 25];

// total XP to reach a level
export const xpFor = (L) => 75 * (L - 1) * L;
export function levelOf(xp) { let L = 1; while (xp >= xpFor(L + 1)) L++; return L; }

const XP = { zombie: 10, headshot: 5, brute: 30, screamer: 15, runner: 5, loot: 3, vault: 60, revive: 50, night: 200, drop: 100, fuel: 60, signal: 5, escape: 800, lift: 15, station: 25 };

// contracts: [id, text, goal range, reward cash, reward xp, which events count]
const JOBS = [
  ["heads", (n) => "headshot " + n + " zombies", [10, 25], 1500, 250, (k, d) => k === "zombie" && d.head],
  ["kills", (n) => "take down " + n + " zombies", [25, 60], 1200, 200, (k) => k === "zombie"],
  ["brute", () => "kill a brute", [1, 1], 2500, 350, (k, d) => k === "zombie" && d.type === "brute"],
  ["runners", (n) => "kill " + n + " runners", [5, 12], 1500, 250, (k, d) => k === "zombie" && d.type === "runner"],
  ["screamer", (n) => "shut up " + n + " screamers", [2, 4], 1500, 250, (k, d) => k === "zombie" && d.type === "screamer"],
  ["vault", () => "open a strongbox", [1, 1], 1000, 200, (k) => k === "vault"],
  ["indoors", (n) => "loot " + n + " containers indoors", [8, 16], 1200, 200, (k, d) => k === "loot" && d.tier === "in"],
  ["drop", () => "crack a supply drop", [1, 1], 2000, 300, (k) => k === "drop"],
  ["fuel", (n) => "deliver " + n + " fuel to the mast", [2, 4], 2500, 350, (k, d) => k === "fuel", (d) => d.n],
  ["night", () => "survive a night", [1, 1], 2000, 300, (k) => k === "night"],
  ["revive", () => "pick someone up", [1, 1], 1500, 250, (k) => k === "revive"],
  ["roof", () => "ride a lift to a roof", [1, 1], 500, 100, (k) => k === "lift"],
  ["metro", (n) => "go down into " + n + " metro stations", [2, 3], 1000, 200, (k) => k === "station"],
  ["defence", (n) => "kill " + n + " zombies with defences", [5, 10], 1500, 250, (k) => k === "defence-kill"],
  ["earn", (n) => "earn $" + n.toLocaleString("en-US"), [5000, 15000], 1000, 200, (k) => k === "earn", (d) => d.n],
];

export class Progress {
  constructor(game, sandbox) {
    this.g = game;
    this.sb = sandbox;
    const inv = this.inv;
    if (typeof inv.xp !== "number") inv.xp = 0;
    if (!Array.isArray(inv.perks)) inv.perks = [];
    if (!Array.isArray(inv.contracts)) inv.contracts = [];
    while (inv.contracts.length < 3) inv.contracts.push(this.roll());
    this.level = levelOf(inv.xp);
  }

  get inv() { return this.sb.inv; }
  has(key) { return this.inv.perks.includes(key); }
  pendingPerks() { return PERK_LEVELS.filter((L) => L <= this.level).length - this.inv.perks.length; }

  // three perks to pick from (kept until one's picked, so reopening the
  // menu doesn't reroll them)
  offer() {
    if (this.pendingPerks() <= 0) return [];
    const inv = this.inv;
    if (!Array.isArray(inv.perkOffer) || inv.perkOffer.some((k) => inv.perks.includes(k) || !PERKS[k])) {
      const free = Object.keys(PERKS).filter((k) => !inv.perks.includes(k));
      free.sort(() => Math.random() - 0.5);
      inv.perkOffer = free.slice(0, 3);
    }
    return inv.perkOffer;
  }

  pick(key) {
    if (this.pendingPerks() <= 0 || !PERKS[key] || this.has(key)) return;
    this.inv.perks.push(key);
    this.inv.perkOffer = null;
    this.sb.hud.big(PERKS[key].name.toUpperCase() + "!", "good");
    this.g.sound.ding && this.g.sound.ding(3);
    if (key === "tough") { this.sb.player.health = Math.min(this.sb.maxHealth(), this.sb.player.health + 30); this.sb.hud.health(); }
    this.sb.save();
    this.sb.hub.render();
    this.sb.hud.badge(this.pendingPerks() > 0);
  }

  xp(n, quiet) {
    if (!n) return;
    const inv = this.inv;
    inv.xp += Math.round(n);
    const L = levelOf(inv.xp);
    if (L > this.level) {
      this.level = L;
      this.sb.hud.big("LEVEL " + L + "!", "good");
      this.g.sound.ding && this.g.sound.ding(2);
      if (PERK_LEVELS.includes(L)) { this.sb.hud.toast("new perk to pick. open the menu (E).", "good"); this.sb.hud.badge(true); }
      if (this.g.net) this.g.net.sendT = 99;
    }
    this.sb.hud.xp();
    if (!quiet) this.sb.hud.xpPop(n);
  }

  // something happened
  event(kind, d = {}) {
    let xp = 0;
    if (kind === "zombie") xp = XP.zombie + (d.head ? XP.headshot : 0) + (XP[d.type] || 0);
    else if (XP[kind]) xp = XP[kind] * (kind === "fuel" ? d.n || 1 : kind === "signal" ? d.sec || 1 : 1);
    if (kind === "loot" && d.tier !== "in") xp = 1;
    if (xp) this.xp(xp, kind === "signal" || kind === "loot");
    // contracts
    for (const c of this.inv.contracts) {
      const J = JOBS.find((j) => j[0] === c.id);
      if (!J || c.done || !J[5](kind, d)) continue;
      c.n = Math.min(c.goal, c.n + (J[6] ? J[6](d) || 0 : 1));
      if (c.n >= c.goal) this.complete(c);
    }
  }

  complete(c) {
    c.done = true;
    this.sb.hud.big("JOB DONE: " + c.text.toUpperCase(), "good");
    this.sb.earn(c.cash, "job done: " + c.text);
    this.xp(c.xp);
    // a new one in its place
    const i = this.inv.contracts.indexOf(c);
    this.inv.contracts[i] = this.roll();
    this.sb.save();
    this.sb.hub.render();
  }

  roll() {
    const have = new Set(this.inv.contracts.map((c) => c.id));
    const pool = JOBS.filter((j) => !have.has(j[0]));
    const J = pool[Math.floor(Math.random() * pool.length)];
    let goal = J[2][0] + Math.floor(Math.random() * (J[2][1] - J[2][0] + 1));
    if (J[0] === "earn") goal = Math.round(goal / 1000) * 1000;
    const scale = goal / Math.max(1, J[2][0]);
    return { id: J[0], text: J[1](goal), goal, n: 0, cash: Math.round(J[3] * Math.min(2, scale) / 100) * 100, xp: J[4] };
  }
}
