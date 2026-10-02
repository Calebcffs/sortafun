// Every weapon and piece of gear, with Counter-Strike: Global Offensive's
// numbers where I know them: damage, armor penetration, range falloff,
// rate of fire, magazine / reserve, run speed, price and kill reward.
// DOM-free: the host, the bots and the HUD all read this one table.
//
// Distances in the game are metres. CS measures falloff per 500 units; one
// unit = 2.54 cm, so 500u = 12.7 m.

const U = 0.0254;
export const FALLOFF_M = 500 * U;

// kind: pistol | smg | rifle | sniper | shotgun | knife | grenade
// speed = run speed (units/s in CS, converted to m/s below)
// recoil: how the spray climbs. climb = degrees of total vertical kick the first ~10 shots,
//   tau = how fast it climbs, sway = sideways degrees, omega = how fast it wanders
// ads: field of view when scoped (0 = no scope); two numbers = two zoom levels
const raw = {
  // ---- pistols
  glock:  { name: "Glock-18", kind: "pistol", team: "T", price: 200, kill: 300, dmg: 30, ap: 0.47, range: 0.85, cycle: 0.15, mag: 20, reserve: 120, speed: 240, reload: 2.2, draw: 0.75, auto: false, burst: 0, recoil: { climb: 3.2, tau: 4, sway: 0.5, omega: 0.9 }, inacc: { stand: 0.25, move: 3.4, air: 5.5, crouch: 0.18 }, snd: "pistol", icon: "glock" },
  usp:    { name: "USP-S", kind: "pistol", team: "CT", price: 200, kill: 300, dmg: 35, ap: 0.505, range: 0.79, cycle: 0.15, mag: 12, reserve: 24, speed: 240, reload: 2.2, draw: 0.75, auto: false, recoil: { climb: 3.6, tau: 4, sway: 0.45, omega: 0.9 }, inacc: { stand: 0.2, move: 3.4, air: 5.5, crouch: 0.14 }, snd: "pistol_sil", icon: "usp" },
  p250:   { name: "P250", kind: "pistol", price: 300, kill: 300, dmg: 38, ap: 0.64, range: 0.77, cycle: 0.15, mag: 13, reserve: 26, speed: 240, reload: 2.2, draw: 0.75, auto: false, recoil: { climb: 4.0, tau: 4, sway: 0.5, omega: 1 }, inacc: { stand: 0.3, move: 3.6, air: 5.5, crouch: 0.2 }, snd: "pistol", icon: "p250" },
  deagle: { name: "Desert Eagle", kind: "pistol", price: 700, kill: 300, dmg: 63, ap: 0.93, range: 0.81, cycle: 0.225, mag: 7, reserve: 35, speed: 230, reload: 2.2, draw: 0.9, auto: false, recoil: { climb: 6.5, tau: 3, sway: 0.7, omega: 1 }, inacc: { stand: 0.35, move: 4.2, air: 6, crouch: 0.22 }, snd: "deagle", icon: "deagle" },
  // ---- SMGs
  mac10:  { name: "MAC-10", kind: "smg", team: "T", price: 1050, kill: 600, dmg: 29, ap: 0.575, range: 0.8, cycle: 0.075, mag: 30, reserve: 100, speed: 240, reload: 2.6, draw: 0.9, auto: true, recoil: { climb: 6, tau: 9, sway: 1.8, omega: 1.3 }, inacc: { stand: 0.45, move: 2.2, air: 4.5, crouch: 0.3 }, snd: "smg", icon: "mac10" },
  mp9:    { name: "MP9", kind: "smg", team: "CT", price: 1250, kill: 600, dmg: 26, ap: 0.6, range: 0.87, cycle: 0.07, mag: 30, reserve: 120, speed: 240, reload: 2.1, draw: 0.9, auto: true, recoil: { climb: 5.5, tau: 9, sway: 1.5, omega: 1.2 }, inacc: { stand: 0.4, move: 2.0, air: 4.5, crouch: 0.28 }, snd: "smg", icon: "mp9" },
  mp7:    { name: "MP7", kind: "smg", price: 1500, kill: 600, dmg: 29, ap: 0.625, range: 0.85, cycle: 0.08, mag: 30, reserve: 120, speed: 220, reload: 3.1, draw: 0.9, auto: true, recoil: { climb: 5.2, tau: 9, sway: 1.4, omega: 1.2 }, inacc: { stand: 0.4, move: 2.2, air: 4.5, crouch: 0.28 }, snd: "smg", icon: "mp7" },
  p90:    { name: "P90", kind: "smg", price: 2350, kill: 300, dmg: 26, ap: 0.69, range: 0.86, cycle: 0.07, mag: 50, reserve: 100, speed: 230, reload: 3.3, draw: 1.0, auto: true, recoil: { climb: 6.5, tau: 12, sway: 2.0, omega: 1.4 }, inacc: { stand: 0.45, move: 2.0, air: 4.5, crouch: 0.32 }, snd: "smg", icon: "p90" },
  // ---- rifles
  galil:  { name: "Galil AR", kind: "rifle", team: "T", price: 2000, kill: 300, dmg: 30, ap: 0.775, range: 0.98, cycle: 0.09, mag: 35, reserve: 90, speed: 215, reload: 2.9, draw: 1.0, auto: true, recoil: { climb: 12, tau: 11, sway: 2.4, omega: 0.9 }, inacc: { stand: 0.3, move: 5.5, air: 7, crouch: 0.2 }, snd: "rifle", icon: "galil" },
  famas:  { name: "FAMAS", kind: "rifle", team: "CT", price: 2050, kill: 300, dmg: 30, ap: 0.7, range: 0.96, cycle: 0.09, mag: 25, reserve: 90, speed: 220, reload: 3.3, draw: 1.0, auto: true, recoil: { climb: 11, tau: 10, sway: 2.2, omega: 0.9 }, inacc: { stand: 0.3, move: 5.5, air: 7, crouch: 0.2 }, snd: "rifle", icon: "famas" },
  ak47:   { name: "AK-47", kind: "rifle", team: "T", price: 2700, kill: 300, dmg: 36, ap: 0.775, range: 0.98, cycle: 0.1, mag: 30, reserve: 90, speed: 215, reload: 2.43, draw: 1.0, auto: true, recoil: { climb: 14.5, tau: 9, sway: 3.2, omega: 0.8 }, inacc: { stand: 0.3, move: 6, air: 7.5, crouch: 0.2 }, snd: "ak", icon: "ak47" },
  m4a4:   { name: "M4A4", kind: "rifle", team: "CT", price: 3100, kill: 300, dmg: 33, ap: 0.7, range: 0.97, cycle: 0.09, mag: 30, reserve: 90, speed: 225, reload: 3.07, draw: 1.0, auto: true, recoil: { climb: 10.5, tau: 9, sway: 2.0, omega: 0.9 }, inacc: { stand: 0.28, move: 5.5, air: 7, crouch: 0.18 }, snd: "rifle", icon: "m4a4" },
  m4a1s:  { name: "M4A1-S", kind: "rifle", team: "CT", price: 2900, kill: 300, dmg: 38, ap: 0.7, range: 0.97, cycle: 0.09, mag: 20, reserve: 40, speed: 225, reload: 3.07, draw: 1.0, auto: true, recoil: { climb: 9.5, tau: 9, sway: 1.8, omega: 0.9 }, inacc: { stand: 0.25, move: 5.5, air: 7, crouch: 0.16 }, snd: "rifle_sil", icon: "m4a1s", silenced: true },
  // ---- snipers
  ssg08:  { name: "SSG 08", kind: "sniper", price: 1700, kill: 300, dmg: 88, ap: 0.85, range: 0.99, cycle: 1.25, mag: 10, reserve: 90, speed: 230, reload: 3.7, draw: 1.1, auto: false, bolt: true, recoil: { climb: 2, tau: 2, sway: 0.2, omega: 1 }, inacc: { stand: 0.1, move: 7.5, air: 9, crouch: 0.05 }, scope: [40], snd: "sniper", icon: "ssg08" },
  awp:    { name: "AWP", kind: "sniper", price: 4750, kill: 100, dmg: 115, ap: 0.975, range: 0.99, cycle: 1.455, mag: 10, reserve: 30, speed: 200, reload: 3.65, draw: 1.45, auto: false, bolt: true, recoil: { climb: 2.5, tau: 2, sway: 0.2, omega: 1 }, inacc: { stand: 0.05, move: 9, air: 11, crouch: 0.03 }, scope: [25], snd: "awp", icon: "awp" },
  scar20: { name: "SCAR-20", kind: "sniper", team: "CT", price: 5000, kill: 300, dmg: 80, ap: 0.825, range: 0.98, cycle: 0.25, mag: 20, reserve: 90, speed: 215, reload: 3.1, draw: 1.1, auto: true, recoil: { climb: 5, tau: 6, sway: 1, omega: 1 }, inacc: { stand: 0.15, move: 7.5, air: 9, crouch: 0.1 }, scope: [35], snd: "sniper_auto", icon: "scar20" },
  // ---- shotguns
  nova:   { name: "Nova", kind: "shotgun", price: 1050, kill: 900, dmg: 26, pellets: 9, ap: 0.5, range: 0.7, cycle: 0.88, mag: 8, reserve: 32, speed: 220, reload: 0.5, draw: 1.0, auto: false, shell: true, recoil: { climb: 3, tau: 2, sway: 0.4, omega: 1 }, inacc: { stand: 2.6, move: 3.2, air: 4.5, crouch: 2.4 }, snd: "shotgun", icon: "nova" },
  xm1014: { name: "XM1014", kind: "shotgun", price: 2000, kill: 900, dmg: 20, pellets: 6, ap: 0.8, range: 0.7, cycle: 0.35, mag: 7, reserve: 32, speed: 215, reload: 0.5, draw: 1.0, auto: true, shell: true, recoil: { climb: 4, tau: 2, sway: 0.6, omega: 1 }, inacc: { stand: 2.8, move: 3.4, air: 4.8, crouch: 2.5 }, snd: "shotgun_auto", icon: "xm1014" },
  // ---- melee
  knife:  { name: "Knife", kind: "knife", price: 0, kill: 1500, dmg: 40, backstab: 180, stab: 65, ap: 0.85, range: 1, cycle: 0.5, mag: 0, reserve: 0, speed: 250, reload: 0, draw: 0.7, auto: false, reach: 1.7, snd: "knife", icon: "knife" },
  // ---- grenades (thrown by the host's physics)
  he:       { name: "HE Grenade", kind: "grenade", price: 300, kill: 300, speed: 245, draw: 0.8, fuse: 1.6, max: 1, dmg: 98, radius: 9.1, icon: "he" },
  flash:    { name: "Flashbang", kind: "grenade", price: 200, kill: 0, speed: 245, draw: 0.8, fuse: 1.6, max: 2, icon: "flash" },
  smoke:    { name: "Smoke Grenade", kind: "grenade", price: 300, kill: 0, speed: 245, draw: 0.8, fuse: 2.2, max: 1, icon: "smoke" },
  molotov:  { name: "Molotov", kind: "grenade", team: "T", price: 400, kill: 300, speed: 245, draw: 0.8, fuse: 2.0, max: 1, icon: "molotov" },
  incgrenade: { name: "Incendiary Grenade", kind: "grenade", team: "CT", price: 600, kill: 300, speed: 245, draw: 0.8, fuse: 2.0, max: 1, icon: "incgrenade" },
  c4:       { name: "C4", kind: "bomb", price: 0, speed: 250, draw: 1.0, icon: "c4" },
};

export const WEAPONS = {};
for (const [id, w] of Object.entries(raw)) {
  WEAPONS[id] = { id, ...w, speedMs: w.speed * U, slot: w.kind === "pistol" ? 2 : w.kind === "knife" ? 3 : w.kind === "grenade" ? 4 : w.kind === "bomb" ? 5 : 1 };
}
// the id numbers go over the network, so this order must never change
export const WEAPON_IDS = Object.keys(WEAPONS);
export const widOf = (id) => WEAPON_IDS.indexOf(id);
export const byWid = (n) => WEAPONS[WEAPON_IDS[n]];

export const GEAR = {
  kevlar: { name: "Kevlar Vest", price: 650, icon: "kevlar" },
  helmet: { name: "Kevlar + Helmet", price: 1000, icon: "helmet" },
  kit: { name: "Defuse Kit", price: 400, team: "CT", icon: "kit" },
};

// the buy menu, as categories of ids (a weapon with a team can only be bought by that team)
export const BUY_MENU = [
  { name: "Pistols", items: ["glock", "usp", "p250", "deagle"] },
  { name: "SMGs", items: ["mac10", "mp9", "mp7", "p90"] },
  { name: "Rifles", items: ["galil", "famas", "ak47", "m4a4", "m4a1s", "ssg08", "awp", "scar20"] },
  { name: "Heavy", items: ["nova", "xm1014"] },
  { name: "Gear", items: ["kevlar", "helmet", "kit"] },
  { name: "Grenades", items: ["he", "flash", "smoke", "molotov", "incgrenade"] },
];

export const HIT = { head: 4, chest: 1, stomach: 1.25, legs: 0.75, arms: 1 };

export const DEFAULT_PISTOL = { T: "glock", CT: "usp" };

// total damage a bullet does: base x hitbox x falloff, then armour takes its share.
// armour: {armor, helmet} of the victim. Returns {health, armor}: what comes off each.
export function bulletDamage(w, hitbox, dist, victim) {
  let d = w.dmg * (HIT[hitbox] || 1) * Math.pow(w.range, dist / FALLOFF_M);
  const protectedHit = victim.armor > 0 && (hitbox !== "head" || victim.helmet) && hitbox !== "legs";
  if (w.kind === "knife") d = hitbox === "back" ? w.backstab : hitbox === "stab" ? w.stab : w.dmg;
  if (!protectedHit) return { health: Math.max(1, Math.round(d)), armor: 0 };
  const toHealth = d * w.ap, toArmor = (d - toHealth) * 0.5;
  let a = Math.round(toArmor), h = toHealth;
  if (a > victim.armor) { h += (a - victim.armor) * 2; a = victim.armor; } // armour ran out
  return { health: Math.max(1, Math.round(h)), armor: Math.round(a) };
}

// view kick of shot number n (0 based) in a spray: returns [pitchUp, yawRight] in degrees, accumulated.
// Gentle but felt: every shot of a spray lifts the view a little more, the climb tops out low.
export function sprayAt(w, n) {
  const r = w.recoil;
  if (!r) return [0, 0];
  const pitch = r.climb * 0.62 * (1 - Math.exp(-(n + 1) / r.tau));
  const ramp = 1 - Math.exp(-n / 7);
  const yaw = 0.6 * (r.sway * Math.sin(n * 0.55 * r.omega + 0.6) * ramp + r.sway * 0.25 * Math.sin(n * 1.3));
  return [pitch, yaw];
}

// cone half-angle in degrees for a shot. `n` is how many shots of the CURRENT automatic burst came before it
// (the client passes 0 for semi-autos and resets it the moment you let go of the trigger).
// The rule Caleb asked for: whatever you are pointing at is what you hit. The first two shots of a burst, and
// any single shot, are dead on; running and jumping add only a sliver; a long full-auto burst opens up a little
// and closes again as soon as you stop. Aiming down sights tightens it more. Shotguns keep their pellet cone.
// Unscoped snipers are a bit loose until you scope.
export function spreadDeg(w, speedFrac, onGround, crouching, n, scoped, ads = 0) {
  const a = w.inacc;
  if (!a) return 0;
  if (w.kind === "shotgun") return a.stand * (1 - 0.35 * ads);
  const moving = Math.min(1, speedFrac);
  let s = 0;
  if (!onGround) s += a.air * 0.08;
  else if (moving > 0.06) s += a.move * 0.02 * moving;
  s += Math.min(Math.max(0, n - 1), 14) * (w.kind === "pistol" ? 0.045 : w.kind === "smg" ? 0.035 : 0.032);
  if (crouching) s *= 0.6;
  s *= 1 - 0.7 * ads;
  if (w.kind === "sniper" && !scoped) s += 1 + moving * 2;
  return s;
}
