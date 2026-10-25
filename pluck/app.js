'use strict';

// ---------- Constants ----------

const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Index 0 is string 6 (low E), index 5 is string 1 (high E).
const CENTRES = [40, 45, 50, 55, 59, 64];
const THICKNESS = [5, 4, 3.5, 2.5, 2, 1.5];
const isWound = i => i < 4;
const AUTO = 'auto';
const AUTO6 = () => Array(6).fill(AUTO);

const parseNotes = s => s.match(/[A-G]#?/g);

// [id, name, notes low to high, octaves where auto would pick the wrong one]
const PRESET_GROUPS = [
  ['Standard', [
    ['standard', 'Standard', 'EADGBE'],
    ['half-down', 'Half Step Down', 'D#G#C#F#A#D#'],
    ['full-down', 'Full Step Down', 'DGCFAD'],
    ['c-sharp-std', 'C# Standard', 'C#F#BEG#C#'],
    ['c-std', 'C Standard', 'CFA#D#GC'],
    ['b-std', 'B Standard', 'BEADF#B'],
  ]],
  ['Drop', [
    ['drop-d', 'Drop D', 'DADGBE'],
    ['double-drop-d', 'Double Drop D', 'DADGBD'],
    ['drop-c-sharp', 'Drop C#', 'C#G#C#F#A#D#'],
    ['drop-c', 'Drop C', 'CGCFAD'],
    ['drop-b', 'Drop B', 'BF#BEG#C#'],
    ['drop-a', 'Drop A', 'AEADF#B', [1, AUTO, AUTO, AUTO, AUTO, AUTO]],
  ]],
  ['Open', [
    ['open-a', 'Open A', 'EAEAC#E'],
    ['open-b', 'Open B', 'BF#BF#BD#'],
    ['open-c', 'Open C', 'CGCGCE'],
    ['open-d', 'Open D', 'DADF#AD'],
    ['open-dm', 'Open D Minor', 'DADFAD'],
    ['open-e', 'Open E', 'EBEG#BE'],
    ['open-g', 'Open G', 'DGDGBD'],
    ['open-gm', 'Open G Minor', 'DGDGA#D'],
  ]],
  ['Other', [
    ['dadgad', 'DADGAD', 'DADGAD'],
    ['c6', 'C6', 'CACGCE'],
    ['all-fourths', 'All Fourths', 'EADGCF'],
    ['nst', 'New Standard', 'CGDAEG'],
    ['nashville', 'Nashville (high strung)', 'EADGBE', [3, 3, 4, 4, 3, 4]],
  ]],
].map(([label, list]) => [label, list.map(([id, name, notes, octaves]) => ({
  id, name, notes: parseNotes(notes), octaves: octaves || AUTO6(),
}))]);
const PRESETS = PRESET_GROUPS.flatMap(([, list]) => list);

const BUFFER_SECONDS = 4;
const STRUM_GAP = 0.055;
const VOICE_GAIN = 0.5;
const RETRIGGER_FADE = 0.04;
const LOOKAHEAD = 0.1;   // seconds of audio scheduled ahead
const TICK_MS = 25;      // how often the scheduler wakes up
const INTERVALS = [1.5, 2.5, 4];

// ---------- State ----------

const state = {
  notes: [...PRESETS[0].notes],
  octaves: AUTO6(),
  selected: 'b:standard',
  loop: true,          // tapping a string keeps it going until you stop it
  loopInterval: 2.5,
};
let saved = [];

// ---------- Pitch ----------

const midiOf = (note, octave) => (octave + 1) * 12 + NOTES.indexOf(note);
const freqOfMidi = midi => 440 * Math.pow(2, (midi - 69) / 12);

function autoOctave(i, note) {
  let best = 1, bestDist = Infinity;
  for (let oct = 1; oct <= 5; oct++) {
    const dist = Math.abs(midiOf(note, oct) - CENTRES[i]);
    if (dist < bestDist) { best = oct; bestDist = dist; }
  }
  return best;
}

function octaveOf(i) {
  const o = state.octaves[i];
  return o === AUTO ? autoOctave(i, state.notes[i]) : o;
}

const freqOf = i => freqOfMidi(midiOf(state.notes[i], octaveOf(i)));

// ---------- Storage (IndexedDB, localStorage fallback) ----------

const store = (() => {
  const LS_PREFIX = 'pluck:';
  let dbPromise = null;

  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
        const req = indexedDB.open('pluck', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(new Error('IndexedDB blocked'));
      });
    }
    return dbPromise;
  }

  async function run(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }

  async function get(key) {
    try {
      return await run('readonly', s => s.get(key));
    } catch {
      try {
        const raw = localStorage.getItem(LS_PREFIX + key);
        return raw == null ? undefined : JSON.parse(raw);
      } catch { return undefined; }
    }
  }

  async function set(key, value) {
    // Round-trip through JSON so we only ever store plain data.
    const plain = JSON.parse(JSON.stringify(value));
    try {
      await run('readwrite', s => s.put(plain, key));
    } catch {
      try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(plain)); } catch { /* nowhere to save */ }
    }
  }

  return { get, set };
})();

function saveState() {
  store.set('state', state);
}

function saveTunings() {
  store.set('tunings', saved);
}

// Accepts loose input (from storage or an imported file) and returns a clean tuning or null.
function cleanTuning(t) {
  if (!t || typeof t !== 'object') return null;
  let notes = t.notes;
  if (typeof notes === 'string') notes = parseNotes(notes.toUpperCase());
  if (!Array.isArray(notes) || notes.length !== 6) return null;
  notes = notes.map(n => String(n).trim().toUpperCase().replace('♯', '#'));
  if (!notes.every(n => NOTES.includes(n))) return null;

  let octaves = Array.isArray(t.octaves) && t.octaves.length === 6 ? t.octaves : AUTO6();
  octaves = octaves.map(o => {
    const n = Number(o);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : AUTO;
  });

  const name = String(t.name || '').trim().slice(0, 40) || notes.join('');
  const id = typeof t.id === 'string' && t.id ? t.id : newId();
  return { id, name, notes, octaves };
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Tuning matching ----------

function sameTuning(t, notes = state.notes, octaves = state.octaves) {
  return t.notes.every((n, k) => n === notes[k]) &&
    t.octaves.every((o, k) => String(o) === String(octaves[k]));
}

function lookup(key) {
  if (key.startsWith('b:')) return PRESETS.find(p => 'b:' + p.id === key);
  if (key.startsWith('u:')) return saved.find(t => 'u:' + t.id === key);
  return null;
}

function matchSelection() {
  const current = lookup(state.selected);
  if (current && sameTuning(current)) return state.selected;
  const preset = PRESETS.find(p => sameTuning(p));
  if (preset) return 'b:' + preset.id;
  const mine = saved.find(t => sameTuning(t));
  if (mine) return 'u:' + mine.id;
  return 'custom';
}

// ---------- Audio ----------

let ctx = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    // iOS 17+: play through the silent switch, like a music app would.
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* not supported */ }
  }
  if (ctx.state !== 'running') ctx.resume();
  return ctx;
}

// Karplus-Strong, pre-rendered into a buffer.
function renderString(ac, freq, wound) {
  const sr = ac.sampleRate;
  const len = Math.floor(sr * BUFFER_SECONDS);
  const buf = ac.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  const period = Math.round(sr / freq);

  for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;

  if (wound) {
    for (let i = 1; i < period; i++) d[i] = 0.48 * d[i] + 0.52 * d[i - 1];
  }

  const attack = Math.min(Math.round(sr * 0.002), period);
  for (let i = 0; i < attack; i++) d[i] *= 1.3;

  const damp = freq < 150 ? 0.996 : freq < 260 ? 0.995 : 0.994;
  for (let i = period; i < len; i++) {
    d[i] = damp * 0.5 * (d[i - period] + d[i - period + 1]);
  }

  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  if (peak > 0) for (let i = 0; i < len; i++) d[i] /= peak;

  const fade = Math.floor(sr * 0.08);
  for (let i = 0; i < fade; i++) d[len - fade + i] *= 1 - i / fade;

  return buf;
}

// Every source per string that hasn't ended yet, including ones scheduled in the future.
const voices = [[], [], [], [], [], []];
const pendingVisuals = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];

function fadeOut(v, t, dur) {
  const g = v.gain.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(VOICE_GAIN, t);
  g.linearRampToValueAtTime(0, t + dur);
  try { v.src.stop(t + dur); } catch { /* already stopped */ }
}

function pluck(i, when) {
  const ac = audio();
  const t = Math.max(when ?? ac.currentTime, ac.currentTime);
  const freq = freqOf(i);
  const wound = isWound(i);

  const src = ac.createBufferSource();
  src.buffer = renderString(ac, freq, wound);

  const eq = ac.createBiquadFilter();
  eq.type = 'peaking';
  eq.frequency.value = wound ? 160 : 2400;
  eq.Q.value = wound ? 1.4 : 0.6;
  eq.gain.value = wound ? 4 : 2;

  const gain = ac.createGain();
  gain.gain.value = VOICE_GAIN;

  src.connect(eq);
  eq.connect(gain);
  gain.connect(ac.destination);

  const v = { src, gain, start: t, replaced: null };

  // Retrigger: anything already sounding on this string fades out as the new one starts.
  for (const old of voices[i]) {
    if (old.start < t && !old.replaced) {
      old.replaced = v;
      fadeOut(old, t, RETRIGGER_FADE);
    }
  }

  src.start(t);
  voices[i].push(v);
  src.onended = () => {
    const list = voices[i];
    const k = list.indexOf(v);
    if (k >= 0) list.splice(k, 1);
    gain.disconnect();
  };

  showPluck(i, t);
}

function strum() {
  const now = audio().currentTime;
  for (let k = 0; k < 6; k++) pluck(k, now + k * STRUM_GAP);
}

// Drop plucks on string i that haven't started yet. If those were going to cut off
// the note that's ringing now, let that note ring out instead.
function cancelFuture(i) {
  if (!ctx) return;
  const now = ctx.currentTime;
  const future = voices[i].filter(v => v.start > now);
  for (const v of future) {
    try { v.src.stop(now); } catch { /* ignore */ }
    for (const old of voices[i]) {
      if (old.replaced === v) {
        old.replaced = null;
        const g = old.gain.gain;
        g.cancelScheduledValues(now);
        g.setValueAtTime(VOICE_GAIN, now);
        try { old.src.stop(old.start + BUFFER_SECONDS); } catch { /* older Safari: note ends early */ }
      }
    }
  }
  clearVisuals(i);
}

function silence(i) {
  if (!ctx) return;
  const now = ctx.currentTime;
  for (const v of voices[i]) {
    if (v.start > now) {
      try { v.src.stop(now); } catch { /* ignore */ }
    } else {
      fadeOut(v, now, 0.02);
    }
    v.replaced = true; // so a new pluck doesn't bring it back up
  }
  clearVisuals(i);
}

// ---------- Loop (one string at a time, look-ahead scheduler on AudioContext time) ----------

let looping = -1;    // string index, or -1
let loopNext = 0;    // AudioContext time of the next pluck
let loopTimer = 0;

function tick() {
  if (looping < 0 || !ctx) {
    clearInterval(loopTimer);
    loopTimer = 0;
    return;
  }
  const now = ctx.currentTime;
  // If the clock jumped (context was suspended, tab stalled), restart the phase.
  if (loopNext < now - 0.05) loopNext = now + 0.02;
  while (loopNext < now + LOOKAHEAD) {
    pluck(looping, loopNext);
    loopNext += state.loopInterval;
  }
}

function startLoop(i) {
  if (looping >= 0 && looping !== i) silence(looping);
  looping = i;
  loopNext = audio().currentTime + 0.02;
  tick();
  if (!loopTimer) loopTimer = setInterval(tick, TICK_MS);
  renderLoop();
}

// hard: cut the sound now. Otherwise just stop re-plucking and let the last one ring out.
function stopLoop(hard) {
  if (looping < 0) return;
  if (hard) silence(looping);
  else cancelFuture(looping);
  looping = -1;
  clearInterval(loopTimer);
  loopTimer = 0;
  renderLoop();
}

// What a tap on a string (or its number key) does.
function playString(i) {
  if (!state.loop) return pluck(i);
  if (looping === i) return stopLoop(false);
  startLoop(i);
}

function setLoopMode(on) {
  state.loop = on;
  if (!on) stopLoop(false);
  renderLoop();
  saveState();
}

function setLoopInterval(sec) {
  if (!INTERVALS.includes(sec)) return;
  const old = state.loopInterval;
  state.loopInterval = sec;
  if (ctx && looping >= 0) loopNext = Math.max(loopNext - old + sec, ctx.currentTime + 0.02);
  renderLoop();
  saveState();
}

// ---------- Visuals ----------

const rows = [];

function showPluck(i, t) {
  const delay = Math.max(0, (t - ctx.currentTime) * 1000);
  if (delay < 4) return vibrate(i);
  const id = setTimeout(() => {
    pendingVisuals[i].delete(id);
    vibrate(i);
  }, delay);
  pendingVisuals[i].add(id);
}

function clearVisuals(i) {
  for (const id of pendingVisuals[i]) clearTimeout(id);
  pendingVisuals[i].clear();
}

function vibrate(i) {
  const line = rows[i].line;
  line.classList.remove('vib');
  void line.offsetWidth; // restart the animation
  line.classList.add('vib');
}

// ---------- UI ----------

const $ = sel => document.querySelector(sel);
const stringsEl = $('#strings');
const tuningSel = $('#tuning');
const mineEl = $('.mine');
const saveBtn = $('#save');
const editBtn = $('#edit');
const saveForm = $('#save-form');
const saveName = $('#save-name');
const savedList = $('#saved-list');
const savedEmpty = $('#saved-empty');
const manageStatus = $('#manage-status');
const loopModeBtn = $('#loop-mode');
const stopBtn = $('#stop');

function buildRows() {
  for (let i = 0; i < 6; i++) {
    const n = 6 - i;
    const row = document.createElement('div');
    row.className = 'row' + (isWound(i) ? ' wound' : '');
    row.style.setProperty('--th', THICKNESS[i] + 'px');
    row.innerHTML = `
      <span class="num">${n}</span>
      <select class="note" aria-label="String ${n} note">
        ${NOTES.map(note => `<option value="${note}">${note}</option>`).join('')}
      </select>
      <span class="oct">
        <select aria-label="String ${n} octave">
          <option value="${AUTO}">auto</option>
          ${[1, 2, 3, 4, 5].map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>
        <span class="oct-val" aria-hidden="true"></span>
      </span>
      <button type="button" class="string"><span class="line"></span></button>`;

    const r = {
      el: row,
      note: row.querySelector('.note'),
      oct: row.querySelector('.oct'),
      octSel: row.querySelector('.oct select'),
      octVal: row.querySelector('.oct-val'),
      string: row.querySelector('.string'),
      line: row.querySelector('.line'),
    };
    rows.push(r);

    row.addEventListener('click', e => {
      if (e.target.closest('select')) return;
      playString(i);
    });
    r.line.addEventListener('animationend', () => r.line.classList.remove('vib'));

    r.note.addEventListener('change', () => {
      state.notes[i] = r.note.value;
      afterStringEdit(i);
    });
    r.octSel.addEventListener('change', () => {
      state.octaves[i] = r.octSel.value === AUTO ? AUTO : Number(r.octSel.value);
      afterStringEdit(i);
    });

    stringsEl.appendChild(row);
  }
}

function afterStringEdit(i) {
  state.selected = matchSelection();
  renderAll();
  saveState();
  // A looping string just picks up the new pitch on its next pluck.
  if (looping !== i) pluck(i);
}

function renderRows() {
  rows.forEach((r, i) => {
    const note = state.notes[i];
    const auto = autoOctave(i, note);
    const fixed = state.octaves[i] !== AUTO;
    const oct = fixed ? state.octaves[i] : auto;
    r.note.value = note;
    r.octSel.value = String(state.octaves[i]);
    r.octSel.options[0].textContent = `auto (${auto})`;
    r.octVal.textContent = oct;
    r.oct.classList.toggle('fixed', fixed);
    r.oct.title = fixed ? `Octave fixed at ${oct}` : `Octave ${oct} (auto)`;
    r.string.setAttribute('aria-label', `Play string ${6 - i}, ${note}${oct}`);
  });
}

function renderTuningSelect() {
  tuningSel.textContent = '';
  if (state.selected === 'custom') tuningSel.add(new Option('Custom', 'custom'));
  const group = (label, list, prefix) => {
    const g = document.createElement('optgroup');
    g.label = label;
    for (const t of list) g.appendChild(new Option(t.name, prefix + t.id));
    tuningSel.appendChild(g);
  };
  for (const [label, list] of PRESET_GROUPS) group(label, list, 'b:');
  if (saved.length) group('My tunings', saved, 'u:');
  tuningSel.value = state.selected;
  saveBtn.disabled = state.selected !== 'custom';
}

function selectTuning(key) {
  const t = lookup(key);
  if (!t) return;
  applyTuning(t);
  state.selected = key;
  renderAll();
  saveState();
}

function renderSavedList() {
  savedList.textContent = '';
  savedEmpty.hidden = saved.length > 0;
  editBtn.hidden = saved.length === 0;
  if (!saved.length) setEditing(false);

  for (const t of saved) {
    const li = document.createElement('li');
    li.classList.toggle('current', state.selected === 'u:' + t.id);
    li.addEventListener('click', e => {
      if (mineEl.classList.contains('editing') || e.target.closest('button, input')) return;
      selectTuning('u:' + t.id);
    });

    const name = document.createElement('span');
    name.className = 'saved-name';
    name.textContent = t.name;
    const notes = document.createElement('span');
    notes.className = 'saved-notes';
    notes.textContent = t.notes.join(' ');

    const rename = document.createElement('button');
    rename.type = 'button';
    rename.className = 'btn small';
    rename.textContent = 'Rename';
    rename.addEventListener('click', () => startRename(li, t));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn small';
    del.textContent = 'Delete';
    let armed = 0;
    del.addEventListener('click', () => {
      if (!armed) {
        del.textContent = 'Sure?';
        del.classList.add('danger');
        armed = setTimeout(() => { armed = 0; del.textContent = 'Delete'; del.classList.remove('danger'); }, 3000);
        return;
      }
      clearTimeout(armed);
      deleteTuning(t.id);
    });

    li.append(name, notes, rename, del);
    savedList.appendChild(li);
  }
}

function setEditing(on) {
  mineEl.classList.toggle('editing', on);
  editBtn.setAttribute('aria-pressed', String(on));
  editBtn.textContent = on ? 'Done' : 'Edit';
}

function startRename(li, t) {
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 40;
  input.value = t.name;
  input.setAttribute('aria-label', 'New name');
  li.textContent = '';
  li.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  const finish = commit => {
    if (done) return;
    done = true;
    const name = input.value.trim();
    if (commit && name) {
      t.name = name;
      saveTunings();
    }
    renderAll();
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  input.addEventListener('blur', () => finish(true));
}

function deleteTuning(id) {
  saved = saved.filter(t => t.id !== id);
  if (state.selected === 'u:' + id) state.selected = 'custom';
  state.selected = matchSelection();
  saveTunings();
  saveState();
  renderAll();
}

function renderLoop() {
  rows.forEach((r, i) => r.el.classList.toggle('looping', looping === i));
  loopModeBtn.setAttribute('aria-pressed', String(state.loop));
  loopModeBtn.setAttribute('aria-label', state.loop ? 'Looping on' : 'Looping off');
  stopBtn.hidden = looping < 0;
  document.querySelectorAll('.seg').forEach(b => {
    b.setAttribute('aria-pressed', String(Number(b.dataset.interval) === state.loopInterval));
  });
}

function renderAll() {
  renderRows();
  renderTuningSelect();
  renderSavedList();
  renderLoop();
}

function applyTuning(t) {
  state.notes = [...t.notes];
  state.octaves = [...t.octaves];
}

// ---------- Events ----------

tuningSel.addEventListener('change', () => selectTuning(tuningSel.value));

saveBtn.addEventListener('click', () => {
  saveForm.hidden = false;
  saveName.value = '';
  saveName.placeholder = state.notes.join('');
  saveName.focus();
});

$('#save-cancel').addEventListener('click', () => { saveForm.hidden = true; });

saveName.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); saveForm.hidden = true; }
});

saveForm.addEventListener('submit', e => {
  e.preventDefault();
  const t = cleanTuning({ name: saveName.value, notes: state.notes, octaves: state.octaves });
  saved.push(t);
  state.selected = 'u:' + t.id;
  saveForm.hidden = true;
  saveTunings();
  saveState();
  renderAll();
});

editBtn.addEventListener('click', () => setEditing(!mineEl.classList.contains('editing')));

$('#export').addEventListener('click', () => {
  const data = { app: 'pluck', version: 1, exported: new Date().toISOString(), tunings: saved };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pluck-tunings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  manageStatus.textContent = `Exported ${saved.length} tuning${saved.length === 1 ? '' : 's'}.`;
});

const importFile = $('#import-file');
$('#import').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data && data.tunings;
    if (!Array.isArray(list)) throw new Error('no tunings');
    let added = 0, skipped = 0;
    for (const raw of list) {
      const t = cleanTuning(raw);
      if (!t) { skipped++; continue; }
      const dup = saved.find(s => s.name === t.name && sameTuning(s, t.notes, t.octaves));
      if (dup) { skipped++; continue; }
      if (saved.some(s => s.id === t.id)) t.id = newId();
      saved.push(t);
      added++;
    }
    state.selected = matchSelection();
    saveTunings();
    saveState();
    renderAll();
    manageStatus.textContent = `Imported ${added}` + (skipped ? `, skipped ${skipped}.` : '.');
  } catch {
    manageStatus.textContent = "Couldn't read that file.";
  }
});

$('#strum').addEventListener('click', () => {
  stopLoop(true);
  strum();
});
stopBtn.addEventListener('click', () => stopLoop(true));
loopModeBtn.addEventListener('click', () => setLoopMode(!state.loop));

document.querySelectorAll('.seg').forEach(b => {
  b.addEventListener('click', () => setLoopInterval(Number(b.dataset.interval)));
});

document.addEventListener('keydown', e => {
  const active = document.activeElement;
  if (active && active.matches('select, input, textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

  const digit = /^(?:Digit|Numpad)([1-6])$/.exec(e.code);
  const key = e.key.toLowerCase();
  if (digit) {
    e.preventDefault();
    playString(6 - Number(digit[1]));
  } else if (key === 's') {
    e.preventDefault();
    stopLoop(true);
    strum();
  } else if (key === 'l') {
    e.preventDefault();
    setLoopMode(!state.loop);
  } else if (e.key === 'Escape') {
    stopLoop(true);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop(true);
});

// ---------- Start ----------

buildRows();
renderAll();

(async () => {
  const storedTunings = await store.get('tunings');
  if (Array.isArray(storedTunings)) saved = storedTunings.map(cleanTuning).filter(Boolean);

  const s = await store.get('state');
  if (s && typeof s === 'object') {
    const t = cleanTuning({ notes: s.notes, octaves: s.octaves });
    if (t) applyTuning(t);
    if (typeof s.selected === 'string') state.selected = s.selected;
    if (typeof s.loop === 'boolean') state.loop = s.loop;
    if (INTERVALS.includes(s.loopInterval)) state.loopInterval = s.loopInterval;
  }
  state.selected = matchSelection();
  renderAll();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline support just won't be there */ });
  });
}
