"""Fun Strike sound builder. Run from a scratch folder:

    python3 build_sounds.py <fsdb.json>     # downloads the Freesound CC0 previews it needs into ./snd, cuts them
                                              and writes ../../funstrike/assets/snd/*.mp3 + sounds.json

fsdb.json maps a Freesound id to {"url": the lq preview url, ...} (see CREDITS.md). Everything here is CC0.
Cuts are found by onset detection (seg.py) since nobody listened to them while building: the first
transient is the start, then a fixed length with a fade. Needs ffmpeg and numpy.
"""
import numpy as np, subprocess, json, os, sys, urllib.request
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'funstrike', 'assets', 'snd') + '/'
os.makedirs('snd', exist_ok=True); os.makedirs(OUT, exist_ok=True)
db = json.load(open(sys.argv[1]))

def fetch(sid):
    p = 'snd/%s.mp3' % sid
    if not os.path.exists(p):
        url = db[str(sid)]['url'].replace('-lq.mp3', '-hq.mp3')
        urllib.request.urlretrieve(url, p)
    return p

def rd(sid):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', fetch(sid), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def env(x, hop=0.005):
    h = int(SR * hop); n = len(x) // h
    return 20 * np.log10(np.sqrt(np.mean(x[:n * h].reshape(n, h) ** 2, axis=1)) + 1e-9), hop

def onsets(x, thr=-28, gap=0.18, lo=0.0, hi=1e9):
    e, hop = env(x); peak = e[int(lo / hop):int(min(hi, len(x) / SR) / hop)].max()
    out = []; last = -9
    for i in range(int(lo / hop), min(len(e), int(hi / hop))):
        if e[i] > peak + thr and (i * hop - last) > gap and (i == 0 or e[i - 1] <= peak + thr):
            out.append(i * hop)
        if e[i] > peak + thr: last = i * hop
    return out

def cut(x, a, dur, pre=0.012):
    a = max(0, a - pre); return x[int(a * SR):int((a + dur) * SR)]

def finish(x, peak=0.9, fi=0.002, fo=0.06):
    x = x.copy(); m = np.abs(x).max()
    if m > 0: x *= peak / m
    a = int(fi * SR); b = min(int(fo * SR), len(x) // 2)
    x[:a] *= np.linspace(0, 1, a); x[-b:] *= np.linspace(1, 0, b)
    return x

man = {}
def save(name, variants, br='64k'):
    files = []
    for i, x in enumerate(variants):
        f = '%s_%d' % (name, i + 1)
        p = subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', br, OUT + f + '.mp3'], input=finish(x).astype(np.float32).tobytes())
        files.append(f)
    man[name] = files
    print(name, [round(len(v) / SR, 2) for v in variants])

def shot(sid, dur=1.0, thr=-30, nth=0):
    x = rd(sid); o = onsets(x, thr, 0.1); return cut(x, o[min(nth, len(o) - 1)] if o else 0, dur)

def piece(sid, start, dur): return cut(rd(sid), start, dur, 0)

def steps(sid, n=6, thr=-22, length=0.34, lo=0, hi=1e9, minpeak=-9):
    x = rd(sid); e, hop = env(x)
    ons = onsets(x, thr, 0.2, lo, hi)
    # keep the loud ones, spread out
    scored = sorted(ons, key=lambda t: -e[int(t / hop):int(t / hop) + 8].max())[:n * 2]
    pick = sorted(scored)[:: max(1, len(scored) // n)][:n]
    return [cut(x, t, length) for t in pick]

# ------------------------------------------------------------------ weapons
save('ak', [shot(855842, 1.1), shot(812210, 1.1), shot(812211, 1.1)])
save('rifle', [shot(865985, 0.7), shot(737569, 1.0), shot(404816, 0.9)])
save('rifle_sil', [shot(855656, 0.6), shot(528262, 0.5)])
save('pistol', [shot(826162, 0.8), shot(392229, 0.8), shot(385811, 0.8)])
save('pistol_sil', [shot(627087, 0.7), shot(855656, 0.6)])
save('deagle', [shot(865992, 1.3), shot(151071, 1.2), shot(712310, 1.2)])
save('smg', [shot(258198, 0.3), shot(418431, 0.35), shot(855653, 0.4)])
save('shotgun', [shot(318973, 1.0), shot(773873, 1.0), shot(865986, 1.1)])
save('shotgun_auto', [shot(865991, 0.9)])
save('sniper', [shot(163460, 0.8), shot(855597, 1.6)])
save('awp', [shot(855597, 1.8), shot(668071, 1.5)])
save('sniper_auto', [shot(668071, 1.2)])
save('reload_rifle', [piece(725397, 0.0, 3.0)])
save('reload_pistol', [piece(693124, 0.0, 2.2)])
save('reload_smg', [piece(677160, 0.0, 2.4)])
save('bolt', [shot(263459, 0.9), shot(267895, 0.8)])
save('shell', [shot(673320, 0.6, -24, 1)])
save('empty', [shot(674568, 0.25), shot(842748, 0.25)])
save('draw', [shot(686661, 0.4)])
save('knife', [shot(344403, 0.5, -26)])
save('knife_hit', [shot(344404, 0.5), shot(411742, 0.5)])
save('knife_wall', [shot(504618, 0.5)])
# ------------------------------------------------------------------ impacts
save('hit_flesh', [shot(276600, 0.4), shot(483999, 0.35), shot(411693, 0.3)])
save('hit_head', [shot(660769, 0.45), shot(511194, 0.6)])
save('hit_metal', [shot(406562, 0.5), shot(650701, 0.45)])
save('hit_wall', [shot(319229, 0.5), shot(778028, 0.3), shot(319222, 0.5)])
save('hit_wood', [shot(667654, 0.4)])
save('ricochet', [shot(345413, 0.6), shot(392975, 0.6), shot(394187, 0.6)])
# ------------------------------------------------------------------ movement
save('step_sand', steps(383490, 8, -22, 0.32, 2, 60))
save('step_stone', steps(459964, 8, -22, 0.3, 1, 18))
save('step_gravel', steps(401346, 8, -22, 0.34, 0.5, 10))
save('land', [shot(364690, 0.5), shot(646664, 0.6)])
# ------------------------------------------------------------------ grenades & bomb
save('nade_bounce', [shot(650701, 0.3, -24), shot(406562, 0.3, -24)])
save('explode', [piece(609587, 0.0, 3.6), piece(516914, 0.0, 3.6)])
save('bomb_explode', [piece(165910, 0.0, 5.0)])
save('flash', [piece(737326, 0.0, 3.0), piece(734095, 0.0, 3.0)])
save('smoke', [piece(739070, 0.0, 2.2)])
save('fire', [piece(581078, 0.5, 5.0)])
save('beep', [shot(138108, 0.14, -20), shot(826729, 0.14, -20)])
save('plant', [piece(566192, 0.0, 1.5)])
save('cash', [piece(794903, 0.0, 1.2)])
save('ding', [shot(715597, 0.8, -24)])
json.dump(man, open(OUT + 'sounds.json', 'w'))
print('total', sum(os.path.getsize(OUT + f) for f in os.listdir(OUT)) // 1024, 'KB')
