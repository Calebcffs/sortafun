// Every map Fun Strike has, and how to build one by id.
//
// Right now that is just Dust II (dust2.js, our own rebuild of its layout, with bomb sites, so it is the only map that
// plays Defuse). The nine deathmatch maps written for v0.9.2 were removed again: Caleb wants real maps made by people,
// not generated ones. When real ones turn up, a map is one row in MAPS plus a builder that returns a GridMap (map.js),
// see CLAUDE.md "Maps". Everything downstream (menus, server rows, client.setMap, bots) already works for any number of maps.

import { findPath } from "./map.js";
import { buildDust2 } from "./dust2.js";

// ---------------------------------------------------------------------------------------------------------------
export const MAPS = {
  dust2: { name: "Dust II", build: buildDust2, modes: ["defuse", "tdm", "dm"], blurb: "The classic desert layout: long A, mid, B tunnels. The only map with bomb sites." },
};
export const MAP_IDS = Object.keys(MAPS);

// Build a map by id (an unknown id gives Dust II). Anything the bots need and a map did not write by hand is filled in:
// roaming points come from the deathmatch spawns, and there are no routes, holds or bomb sites.
export function buildMap(id) {
  const info = MAPS[id] || MAPS.dust2, key = MAPS[id] ? id : "dust2";
  const m = info.build();
  m.id = key; m.name = info.name;
  const me = m.meta;
  if (key !== "dust2") { // a deathmatch spawn nobody can walk to (boxed in by a prop, on a cut off ledge) is no use
    const t0 = me.spawnsT[0];
    me.spawnsDM = me.spawnsDM.filter((s) => findPath(m, t0.x, t0.z, s.x, s.z));
  }
  if (!me.points || !Object.keys(me.points).length) { me.points = {}; me.spawnsDM.slice(0, 14).forEach((s, i) => (me.points["p" + i] = [s.x, s.z])); }
  me.routes = me.routes || {}; me.holds = me.holds || {}; me.sites = me.sites || [];
  return m;
}
