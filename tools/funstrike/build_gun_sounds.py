"""Fun Strike gunshot builder (v0.9.2). Run from a scratch folder:

    python3 build_gun_sounds.py [old_dir]

One gunshot per kind of gun, and every file STARTS ON THE BANG: the script finds the first sample where the
signal really jumps (not just any noise before it), cuts there with a 1.5 ms run-in, trims the tail with a
fade, and writes 16 bit mono WAV (an mp3 would add a few tens of ms of encoder delay, which is exactly the
kind of thing that makes a shot feel late). The game plays the same file every time for the same gun, so
there are no variants any more. All sources are Freesound CC0 (ids in CREDITS.md).

`old_dir` holds smg_1.mp3 and awp_2.mp3 from the previous build, which were cut from 258198 and 668071.
Output goes to ../../funstrike/assets/snd/gun_<kind>.wav and the "gun_*" lines of sounds.json.
"""
import numpy as np, subprocess, json, os, sys, urllib.request, wave
SR = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'funstrike', 'assets', 'snd') + '/'
OLD = sys.argv[1] if len(sys.argv) > 1 else 'old'
os.makedirs('src', exist_ok=True)

FS = 'https://cdn.freesound.org/previews/%d/%d_%s-hq.mp3'
# kind: (source, seconds to keep, seconds of fade out)
SRC = {
    'ak':           (('fs', 865984, '19132311'), 0.50, 0.25),   # ak74m_fire
    'rifle':        (('fs', 865985, '19132311'), 0.45, 0.22),   # m4carbine_fire
    'rifle_sil':    (('fs', 528262, '11537497'), 0.29, 0.10),   # Silenced Shot
    'pistol':       (('fs', 865987, '19132311'), 0.40, 0.20),   # glock_fire
    'pistol_sil':   (('fs', 627087, '11511262'), 0.50, 0.25),   # silenced pistol shot
    'deagle':       (('fs', 865992, '19132311'), 0.70, 0.40),   # deagle_fire
    'smg':          (('old', 'smg_1.mp3'), 0.23, 0.08),         # 258198
    'shotgun':      (('fs', 865986, '19132311'), 0.85, 0.50),   # 865986
    'shotgun_auto': (('fs', 865991, '19132311'), 0.60, 0.35),   # aa12_fire
    'sniper':       (('fs', 163460, '2263027'), 0.65, 0.35),    # Sniper Shot
    'awp':          (('old', 'awp_2.mp3'), 1.00, 0.60),         # 668071
    'sniper_auto':  (('old', 'awp_2.mp3'), 0.60, 0.35),         # 668071, shorter for the SCAR
}

def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32).copy()

def source(s):
    if s[0] == 'fs':
        p = 'src/%d.mp3' % s[1]
        if not os.path.exists(p): urllib.request.urlretrieve(FS % (s[1] // 1000, s[1], s[2]), p)
        return decode(p)
    return decode(os.path.join(OLD, s[1]))

def bang_start(x):
    """index of the bang: the first 1 ms window within 0.4 s that reaches 12 percent of the loudest 1 ms window
    in that stretch (-18 dB), stepped back to where the rise began"""
    w = SR // 1000
    n = min(len(x), int(0.4 * SR)) // w
    env = np.sqrt((x[:n * w].reshape(n, w) ** 2).mean(axis=1))
    peak = env.max()
    i = int(np.argmax(env >= 0.12 * peak))
    while i > 0 and env[i - 1] > 0.03 * peak: i -= 1
    return max(0, i * w - int(0.0015 * SR))

man = json.load(open(OUT + 'sounds.json'))
for k in [k for k in man if k.startswith('gun_')]: del man[k]
for kind, (src, keep, fade) in SRC.items():
    x = source(src)
    a = bang_start(x)
    y = x[a:a + int(keep * SR)].copy()
    y *= 0.89 / np.abs(y).max()                    # every gun file peaks at the same level, loudness is set in code
    ri = int(0.0015 * SR); y[:ri] *= np.linspace(0, 1, ri)
    fo = min(int(fade * SR), len(y) // 2); y[-fo:] *= np.linspace(1, 0, fo) ** 2
    name = 'gun_' + kind
    with wave.open(OUT + name + '.wav', 'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(SR); f.writeframes((y * 32767).astype('<i2').tobytes())
    man[name] = [name + '.wav']
    w = SR // 1000; env = np.sqrt((y[:60 * w].reshape(60, w) ** 2).mean(axis=1))
    print('%-13s starts %5.1f ms into the source, %.2fs, loudest ms = %d' % (kind, a / SR * 1000, len(y) / SR, int(np.argmax(env))))
json.dump(man, open(OUT + 'sounds.json', 'w'))
