// City Sandbox: the day and night everyone shares.
//
// Worked out from the server clock (net.js knows the offset; offline it's the
// browser's clock), so every player's night starts at the same moment with
// nothing to sync. One cycle is CYCLE seconds:
//
//   day    golden hour, the sun sinking slowly         0 - 660
//   dusk   sunset, sirens                             660 - 780
//   night  dark, and the zombies get serious          780 - 1110
//   dawn   sunrise, then a time-lapse to golden hour 1110 - 1200
//
// sky.js gets the time of day from here (skyTime); npcs.js, sandbox.js and
// the HUD read night / dark / phase.

export const CYCLE = 1200;
const DAY = 660, DUSK = 780, NIGHT = 1110;
const OFFSET = 431; // (so the server's nights don't line up with round wall-clock times)

function smooth(t) { return t * t * (3 - 2 * t); }
function lerp(a, b, t) { return a + (b - a) * t; }

export class WorldClock {
  constructor(now) {
    this.now = now;          // () => ms, the server's idea of the time
    this.override = null;    // tests: force a second of the cycle
    this.update();
  }

  // seconds into the current cycle, and which night number this is
  get t() { return this.override != null ? this.override : ((this.now() / 1000 + OFFSET) % CYCLE + CYCLE) % CYCLE; }
  get nightNo() { return Math.floor((this.now() / 1000 + OFFSET) / CYCLE); }

  update() {
    const t = this.t;
    this.phase = t < DAY ? "day" : t < DUSK ? "dusk" : t < NIGHT ? "night" : "dawn";
    this.night = this.phase === "night";
    // how dark it is for gameplay: 0 day .. 1 full night (ramps through dusk and dawn)
    if (t < DAY) this.dark = 0;
    else if (t < DUSK) this.dark = smooth((t - DAY) / (DUSK - DAY)) * 0.85;
    else if (t < NIGHT) this.dark = Math.min(1, 0.85 + (t - DUSK) / 30 * 0.15);
    else this.dark = 1 - smooth(Math.min(1, (t - NIGHT) / 40));
    // the sky's time of day (sky.js: 0.25 sunrise, 0.5 noon, 0.75 sunset)
    let s;
    if (t < DAY) s = lerp(0.655, 0.715, t / DAY);
    else if (t < DUSK) s = lerp(0.715, 0.775, (t - DAY) / (DUSK - DAY));
    else if (t < NIGHT) s = lerp(0.775, 1.2, (t - DUSK) / (NIGHT - DUSK)) % 1;
    else s = lerp(0.2, 0.655, smooth((t - NIGHT) / (CYCLE - NIGHT)));
    this.skyTime = s;
    return this;
  }

  // seconds until the next nightfall / dawn, for the HUD
  untilNight() { const t = this.t; return t < DUSK ? DUSK - t : CYCLE - t + DUSK; }
  untilDawn() { const t = this.t; return t >= DUSK && t < NIGHT ? NIGHT - t : 0; }
  label() {
    const f = (s) => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
    if (this.phase === "night") return "dawn in " + f(this.untilDawn());
    if (this.phase === "dusk") return "dark in " + f(this.untilNight());
    if (this.phase === "dawn") return "morning";
    return "night in " + f(this.untilNight());
  }
}
