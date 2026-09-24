// The shape of Birdie's endless world: which region you're in, how high the
// ground is, and what colour it is. Pure functions of (x, z), no three.js.
//
// The world is split into big regions ("scapes") on a jittered grid, like
// Fly Like a Bird 3's five landscapes, but stitched together into one
// endless map:
//
//   city      street grid, skyscrapers downtown, houses at the edges
//   hills     rolling woodland, winding rivers, corn fields, cabins
//   snow      mountains, pine forest, frozen lakes, barns and snowmen
//   island    open ocean with sandy islands, palms and the odd volcano
//   industry  warehouses, silos, smokestacks, cooling towers, containers
//
// Regions blend smoothly into each other over ~80m so there are no seams.

import { Noise2D, hash3, clamp, lerp, smoothstep } from "./noise.js";

export const BIOMES = ["city", "hills", "snow", "island", "industry"];
export const SEA = 0;               // water surface height
export const REGION = 820;          // average size of one region, metres
export const BLEND = 70;            // how wide the soft border between regions is
export const CITY_PERIOD = 84;      // road-to-road spacing in the city
export const ROAD_W = 14;           // city road width (kerb to kerb)
export const IND_PERIOD = 124;      // bigger blocks in the industrial zones
export const CITY_H = 1.0;          // ground height of flat city / industry land

export class Terrain {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.n1 = new Noise2D(seed + 11);
    this.n2 = new Noise2D(seed + 23);
    this.n3 = new Noise2D(seed + 37);
    this.n4 = new Noise2D(seed + 53);
    this.nRiver = new Noise2D(seed + 71);
    this.nLake = new Noise2D(seed + 89);
    this.cache = new Map(); // region cell -> {cx, cz, biome}
    // a small scratch object reused by sample() so hot loops don't allocate
    this._s = { h: 0, biome: "city", w: null, water: false, ice: false, river: 0, lake: 0, beach: 0 };
  }

  // ---------------- regions ----------------
  cell(ix, iz) {
    const key = ix * 100003 + iz;
    let c = this.cache.get(key);
    if (c) return c;
    const h = hash3(ix, iz, this.seed);
    const r1 = (h & 0xffff) / 65535, r2 = ((h >>> 16) & 0xffff) / 65535;
    const h2 = hash3(iz + 7, ix - 3, this.seed ^ 0x9e3779b9);
    let pick = (h2 % 1000) / 1000;
    let biome;
    // the region you start in is always the city, like the original
    if (ix === 0 && iz === 0) biome = "city";
    else if (pick < 0.3) biome = "city";
    else if (pick < 0.54) biome = "hills";
    else if (pick < 0.7) biome = "snow";
    else if (pick < 0.86) biome = "island";
    else biome = "industry";
    c = {
      ix, iz, biome,
      cx: (ix + 0.2 + r1 * 0.6) * REGION,
      cz: (iz + 0.2 + r2 * 0.6) * REGION,
    };
    if (ix === 0 && iz === 0) { c.cx = REGION * 0.5; c.cz = REGION * 0.5; }
    this.cache.set(key, c);
    if (this.cache.size > 4000) this.cache.clear();
    return c;
  }

  // Soft region weights at (x, z): up to the three nearest region centres,
  // weighted by how close they are compared with the nearest.
  regions(x, z, out) {
    const ix = Math.floor(x / REGION), iz = Math.floor(z / REGION);
    let near = out || [];
    near.length = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.cell(ix + dx, iz + dz);
        // stretch the distances a little with noise so borders wiggle
        const wob = this.n4.get(x / 260, z / 260) * 40;
        const d = Math.hypot(x - c.cx, z - c.cz) + wob * (c.biome === "city" ? 0.3 : 1);
        near.push({ c, d });
      }
    }
    near.sort((a, b) => a.d - b.d);
    near.length = 3;
    const d0 = near[0].d;
    let sum = 0;
    for (const n of near) { n.w = Math.exp(-((n.d - d0) / BLEND) * 3); sum += n.w; }
    for (const n of near) n.w /= sum;
    return near;
  }

  // Region weights folded into a per-biome map, e.g. {city: 0.8, hills: 0.2}
  weights(x, z) {
    const near = this.regions(x, z);
    const w = { city: 0, hills: 0, snow: 0, island: 0, industry: 0 };
    for (const n of near) w[n.c.biome] += n.w;
    return { w, near };
  }

  // ---------------- per-biome height ----------------
  hCity(x, z) { return CITY_H; }
  hIndustry(x, z) { return CITY_H; }

  hHills(x, z) {
    const base = this.n1.fbm(x / 420, z / 420, 4) * 0.5 + 0.5;
    let h = 2.5 + 34 * Math.pow(base, 1.35) + this.n3.fbm(x / 90, z / 90, 2) * 2.5;
    // rivers: follow the zero line of a noise field, carved below sea level
    const r = Math.abs(this.nRiver.fbm(x / 700, z / 700, 3));
    const bank = smoothstep(0.018, 0.06, r);
    h = lerp(-2.4, h, bank);
    return h;
  }

  hSnow(x, z) {
    const ridge = this.n2.ridged(x / 520, z / 520, 4);
    const roll = this.n1.fbm(x / 300, z / 300, 3) * 0.5 + 0.5;
    let h = 3 + 22 * roll + 85 * Math.pow(ridge, 2.2) * smoothstep(0.15, 0.6, roll);
    // frozen lakes: flat patches at ice level
    const l = this.nLake.fbm(x / 380, z / 380, 2);
    const lake = smoothstep(0.32, 0.42, l);
    h = lerp(h, 0.35, lake);
    return h;
  }

  hIsland(x, z, cellInfo) {
    // mostly ocean; islands where a noise field is high
    const n = this.n3.fbm(x / 300, z / 300, 4);
    let h = -16 + 22 * smoothstep(-0.2, 0.25, n) + 30 * Math.max(0, n - 0.25);
    // gentle sandy shelf around each island
    if (h > -1 && h < 2.5) h = lerp(h, 1.2, 0.35);
    // a volcano near the middle of some island regions
    if (cellInfo && cellInfo.volcano) {
      const d = Math.hypot(x - cellInfo.vx, z - cellInfo.vz);
      const R = 210;
      if (d < R) {
        const t = 1 - d / R;
        let cone = 78 * Math.pow(t, 1.4) + 2;
        // crater at the top
        if (d < 32) cone -= (1 - d / 32) * 26;
        h = Math.max(h, cone);
      }
    }
    return h;
  }

  volcanoFor(c) {
    if (c.biome !== "island") return null;
    if (c._v !== undefined) return c._v;
    const h = hash3(c.ix * 3 + 1, c.iz * 5 - 2, this.seed + 404);
    c._v = (h % 100) < 55 ? { volcano: true, vx: c.cx + ((h >>> 8) % 120) - 60, vz: c.cz + ((h >>> 16) % 120) - 60 } : { volcano: false };
    return c._v;
  }

  // ---------------- the main query ----------------
  // Returns a (reused!) object: {h, biome, w, water, ice, beach, river, lake}
  sample(x, z) {
    const near = this.regions(x, z);
    let h = 0;
    const w = { city: 0, hills: 0, snow: 0, island: 0, industry: 0 };
    for (const n of near) {
      const b = n.c.biome;
      let bh;
      if (b === "city") bh = this.hCity(x, z);
      else if (b === "industry") bh = this.hIndustry(x, z);
      else if (b === "hills") bh = this.hHills(x, z);
      else if (b === "snow") bh = this.hSnow(x, z);
      else bh = this.hIsland(x, z, this.volcanoFor(n.c));
      h += bh * n.w;
      w[b] += n.w;
    }
    // flat built-up land stays exactly flat where it's fully city/industry
    const built = w.city + w.industry;
    if (built > 0.985) h = CITY_H;
    const s = this._s;
    s.h = h;
    s.w = w;
    s.biome = near[0].c.biome;
    s.region = near[0].c;
    s.built = built;
    s.water = h < SEA;
    // lake ice in the snow: flat and at ice level
    s.ice = w.snow > 0.6 && h < 0.6 && smoothstep(0.32, 0.42, this.nLake.fbm(x / 380, z / 380, 2)) > 0.5;
    s.beach = (w.island + w.hills * 0.4) * smoothstep(3.2, 0.6, h) * smoothstep(-1.5, 0.3, h);
    return s;
  }

  height(x, z) { return this.sample(x, z).h; }

  // surface normal by central differences
  normal(x, z, out) {
    const e = 1.5;
    const hl = this.height(x - e, z), hr = this.height(x + e, z);
    const hd = this.height(x, z - e), hu = this.height(x, z + e);
    const nx = hl - hr, nz = hd - hu, ny = 2 * e;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }

  // ---------------- ground colour ----------------
  // Vertex colour for the terrain mesh. slope: 0 flat .. 1 cliff.
  color(x, z, s, slope, out) {
    const w = s.w, h = s.h;
    const n = this.n4.get(x / 23, z / 23) * 0.5 + this.n3.get(x / 7, z / 7) * 0.25;
    let r = 0, g = 0, b = 0;
    // each biome's palette, blended by weight
    if (w.city > 0) {
      // city ground is road; parks/lots are drawn on top as separate meshes
      const c = [0.27 + n * 0.02, 0.27 + n * 0.02, 0.29 + n * 0.02];
      r += c[0] * w.city; g += c[1] * w.city; b += c[2] * w.city;
    }
    if (w.industry > 0) {
      const c = [0.36 + n * 0.04, 0.34 + n * 0.035, 0.31 + n * 0.03];
      r += c[0] * w.industry; g += c[1] * w.industry; b += c[2] * w.industry;
    }
    if (w.hills > 0) {
      let c = [0.3 + n * 0.06, 0.48 + n * 0.08, 0.2 + n * 0.03];
      const dry = this.n2.get(x / 160, z / 160);
      c = [lerp(c[0], 0.46, dry * 0.3), lerp(c[1], 0.5, dry * 0.2), c[2]];
      if (slope > 0.45) c = mixc(c, [0.42, 0.36, 0.27], smoothstep(0.45, 0.75, slope));
      if (h < 1.6) c = mixc(c, [0.62, 0.56, 0.4], smoothstep(1.6, 0.2, h)); // river banks
      r += c[0] * w.hills; g += c[1] * w.hills; b += c[2] * w.hills;
    }
    if (w.snow > 0) {
      let c = [0.9 + n * 0.03, 0.93 + n * 0.03, 0.97];
      if (slope > 0.55) c = mixc(c, [0.45, 0.46, 0.5], smoothstep(0.55, 0.85, slope));
      if (s.ice) c = [0.72, 0.84, 0.92];
      r += c[0] * w.snow; g += c[1] * w.snow; b += c[2] * w.snow;
    }
    if (w.island > 0) {
      let c;
      if (h < 3.2) c = [0.86 + n * 0.03, 0.78 + n * 0.03, 0.56]; // sand
      else c = [0.28 + n * 0.05, 0.52 + n * 0.08, 0.18];
      if (h > 22) c = mixc(c, [0.3, 0.26, 0.24], smoothstep(22, 40, h)); // volcano rock
      if (slope > 0.6) c = mixc(c, [0.38, 0.33, 0.28], 0.6);
      r += c[0] * w.island; g += c[1] * w.island; b += c[2] * w.island;
    }
    // underwater: darker, sandier
    if (h < 0) {
      const t = smoothstep(0, -6, h);
      r = lerp(r, 0.55, t * 0.6); g = lerp(g, 0.52, t * 0.6); b = lerp(b, 0.38, t * 0.6);
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }
}

function mixc(a, b, t) {
  t = clamp(t, 0, 1);
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
