// City Sandbox's voices: every line of the story spoken aloud, each
// character with their own voice.
//
// It uses the browser's own speech (the Web Speech API: free, nothing to
// download), which means the actual voices depend on the machine: Chrome
// has its Google voices, Windows its Microsoft ones, a Mac a long list.
// Each character is cast from whatever's there by accent and sex, then made
// their own with pitch and pace (Kofi low and slow, Teo quick and high,
// Nana older and slower, Rhys smooth, Varga clipped). The captions get a
// narrator.
//
// A line is spoken at a pace that fits the time it has on screen, the one
// before is cut off if it's still going, and the music ducks while anyone
// talks. Radio voices get a crackle of static under them. Stage directions
// in brackets ("(radio)") aren't read out.

const CAST = {
  // who: [sex, preferred accents (lang codes, in order), pitch, rate]
  mari: ["f", ["en-GB", "en-US", "en-AU"], 1.12, 1.08],
  teo: ["m", ["en-GB", "en-IE", "en-US"], 1.3, 1.1],
  nana: ["f", ["en-GB", "en-IN", "en-US"], 0.78, 0.86],
  kofi: ["m", ["en-ZA", "en-NG", "en-GB", "en-US"], 0.62, 0.84],
  varga: ["f", ["en-US", "en-GB"], 0.88, 1.06],
  rhys: ["m", ["en-GB", "en-US"], 0.82, 0.9],
  dee: ["f", ["en-US", "en-GB"], 1.3, 1.05],
  efua: ["f", ["en-GB"], 0.7, 0.8],
  luka: ["m", ["en-US"], 0.9, 0.9],
  listener: ["m", ["en-US", "en-GB"], 0.7, 0.95],
  warden: ["m", ["en-US", "en-GB"], 0.95, 1.08],
  survivor: ["f", ["en-US", "en-AU", "en-GB"], 1.05, 1.08],
  receptionist: ["f", ["en-US", "en-GB"], 1.18, 1.02],
  radio: ["m", ["en-US"], 0.8, 1.05],
  narrator: ["m", ["en-GB", "en-US"], 0.72, 0.88],
};
// characters whose lines come over a radio / speaker get static under them
const CRACKLE = new Set(["rhys", "radio", "warden", "listener"]);

// the words to say: no stage directions, no shouting in capitals
export function speakable(text) {
  return String(text || "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
    .replace(/\b([A-Z]{2,})\b/g, (w) => (w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w));
}

export class Voice {
  constructor(sound, music) {
    this.sound = sound;
    this.music = music;
    this.synth = window.speechSynthesis || null;
    this.enabled = readFlag("city-voices", true);
    this.cast = new Map();
    this.cur = null;
    if (this.synth) {
      this.load();
      if (this.synth.addEventListener) this.synth.addEventListener("voiceschanged", () => { this.cast.clear(); this.load(); });
    }
  }

  get available() { return !!(this.synth && this.voices && this.voices.length); }
  load() { try { this.voices = this.synth.getVoices().filter((v) => /^en/i.test(v.lang)); } catch (e) { this.voices = []; } }

  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem("city-voices", on ? "1" : "0"); } catch (e) {}
    if (!on) this.stop();
  }

  // pick a voice for someone, trying not to give two people the same one
  castFor(who) {
    if (this.cast.has(who)) return this.cast.get(who);
    const spec = CAST[who] || CAST.survivor;
    const [sex, langs] = spec;
    const vs = this.voices || [];
    if (!vs.length) return { voice: null, pitch: spec[2], rate: spec[3] }; // (not loaded yet: don't remember this)
    const isF = (v) => /female|woman|zira|susan|hazel|samantha|karen|moira|tessa|fiona|victoria|serena|kate|libby|sonia|natasha|aria|jenny|michelle|emma|olivia|amy|salli|joanna|kendra|kimberly|ivy|google uk english female|google us english/i.test(v.name);
    const isM = (v) => /male|man|david|mark|george|daniel|alex|fred|oliver|thomas|ryan|guy|christopher|eric|brian|matthew|joey|justin|arthur|rishi|google uk english male/i.test(v.name) && !/female/i.test(v.name);
    const used = new Set([...this.cast.values()].map((c) => c.voice && c.voice.name));
    let best = null, bs = -1;
    for (const v of vs) {
      let sc = 0;
      const li = langs.findIndex((l) => v.lang.replace("_", "-").toLowerCase().startsWith(l.toLowerCase()));
      if (li >= 0) sc += 6 - li;
      if (sex === "f" ? isF(v) : isM(v)) sc += 5;
      else if (sex === "f" ? isM(v) : isF(v)) sc -= 4;
      if (!used.has(v.name)) sc += 2;
      if (v.localService) sc += 0.5;
      if (/google|natural|neural|premium|enhanced/i.test(v.name)) sc += 1;
      if (sc > bs) { bs = sc; best = v; }
    }
    const c = { voice: best, pitch: spec[2], rate: spec[3] };
    this.cast.set(who, c);
    return c;
  }

  // say a line; `secs` is roughly how long it has before the next one
  speak(who, text, secs) {
    if (!this.enabled || !this.synth || this.sound.muted) return;
    const words = speakable(text);
    if (!words || who === "phone") return;
    if (!this.voices || !this.voices.length) this.load();
    const c = this.castFor(who);
    const u = new SpeechSynthesisUtterance(words);
    if (c.voice) u.voice = c.voice;
    u.lang = c.voice ? c.voice.lang : "en-GB";
    u.pitch = c.pitch;
    // (about 2.6 words a second at rate 1: speed up to fit the time there is)
    const n = words.split(" ").length;
    const natural = n / 2.6 / c.rate;
    const fit = secs ? Math.min(1.6, Math.max(1, natural / Math.max(0.8, secs - 0.2))) : 1;
    u.rate = c.rate * fit;
    u.volume = 1;
    try { this.synth.cancel(); } catch (e) {}
    const crackle = CRACKLE.has(who);
    u.onstart = () => { this.music && this.music.duck(true); if (crackle) this.sound.radioBed && this.sound.radioBed(true); };
    const end = () => { if (this.cur === u) { this.cur = null; this.music && this.music.duck(false); if (crackle) this.sound.radioBed && this.sound.radioBed(false); } };
    u.onend = end; u.onerror = end;
    this.cur = u;
    if (crackle && this.sound.radioClick) this.sound.radioClick();
    try { this.synth.speak(u); } catch (e) { end(); }
  }

  stop() {
    this.cur = null;
    try { if (this.synth) this.synth.cancel(); } catch (e) {}
    this.music && this.music.duck(false);
    this.sound.radioBed && this.sound.radioBed(false);
  }
}

function readFlag(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : v === "1"; } catch (e) { return def; } }
