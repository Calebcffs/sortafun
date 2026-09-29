"""Deep Time part 2 sounds: cuts the Freesound CC0 previews in sounds2.txt into
sprites + loops next to part 1's, and writes deeptime/assets/sounds2.json.

    python3 fetch_sounds.py sounds2.txt   # (or the loop in the 2026-09-29 notes) -> ./snd/
    python3 build_sounds2.py

Run from a scratch folder holding snd/<name>.mp3. Clip times come from seg.py
onset lists. Needs ffmpeg and numpy.
"""
import numpy as np, subprocess, json, os
from seg import events
SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'deeptime', 'assets', 'snd') + '/'
MAN = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'deeptime', 'assets', 'sounds2.json')
man = {}
def rd(name, ch=1):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'snd/%s.mp3' % name, '-ac', str(ch), '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, np.float32).copy()
    return x.reshape(-1, ch) if ch > 1 else x
def enc(name, x, ch=1, br='80k'):
    x = np.asarray(x, np.float32)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-', '-c:a', 'libmp3lame', '-b:a', br, OUT + name + '.mp3'], input=x.tobytes())
    return os.path.getsize(OUT + name + '.mp3')
def norm(x, peak=0.89):
    m = np.abs(x).max(); return x * (peak / m) if m > 0 else x
def fade(x, fi=0.005, fo=0.04):
    x = x.copy(); a = int(fi * SR); b = int(fo * SR)
    if a: x[:a] *= np.linspace(0, 1, a)[:, None] if x.ndim > 1 else np.linspace(0, 1, a)
    if b: x[-b:] *= np.linspace(1, 0, b)[:, None] if x.ndim > 1 else np.linspace(1, 0, b)
    return x
def cut(x, a, b): return x[int(a * SR):int(b * SR)]
def sprite(name, clips, slot, br='80k', gains=None):
    buf = np.zeros(int(slot * SR) * len(clips), np.float32)
    for i, c in enumerate(clips):
        c = c[:int(slot * SR) - int(0.01 * SR)]
        c = fade(norm(c) * (gains[i] if gains else 1))
        buf[i * int(slot * SR):i * int(slot * SR) + len(c)] = c
    kb = enc(name, buf, 1, br); man[name] = {'slot': slot, 'n': len(clips)}; print(name, len(clips), 'clips', kb // 1024, 'KB')
def oneshots(src, spans): x = rd(src); return [cut(x, a, b) for a, b in spans]
def onsets(src, thr, n, length, a0=0, a1=1e9, pre=0.02, gap=0.12):
    x = rd(src); ev, _ = events('snd/%s.mp3' % src, thr, gap)
    ev = [e for e in ev if a0 <= e[0] <= a1]
    ev.sort(key=lambda e: -e[2]); ev = sorted(ev[:n])
    return [cut(x, max(0, e[0] - pre), e[0] - pre + length) for e in ev]
def loop(name, src, a, b, xf=2.0, ch=2, br='96k', gain=1.0):
    x = cut(rd(src, ch), a, b); f = int(xf * SR)
    y = x[f:].copy(); t = np.linspace(0, 1, f)
    if ch > 1: t = t[:, None]
    y[-f:] = y[-f:] * np.sqrt(1 - t) + x[:f] * np.sqrt(t)
    y = norm(y, 0.7) * gain
    kb = enc(name, y.reshape(-1), ch, br); man[name] = {'loop': True, 'dur': round(len(y) / SR, 3)}; print(name, 'loop', round(len(y) / SR, 1), 's', kb // 1024, 'KB')

# ---- beds
loop('amb_sewer', 'sewer_stream', 0, 27.9, ch=2)
loop('amb_tunnel', 'tunnel_water', 2, 34, ch=2)
loop('amb_drips', 'cave_drips', 5, 45, ch=1, br='64k')
loop('amb_rain', 'rain_city', 10, 50, ch=2)
loop('fluoro_hum', 'fluoro_hum', 2, 20, ch=1, br='48k')
loop('pump_hum', 'pump_steady', 3, 30, ch=1, br='64k')
# ---- footsteps (0.5s slots)
sprite('step_conc', onsets('steps_concrete', -40, 10, 0.45, gap=0.12), 0.5)
sprite('step_splash', oneshots('steps_splash', [(0.1, 0.55), (0.72, 1.12), (1.24, 1.64), (2.24, 2.7), (2.83, 3.3)]) + oneshots('steps_puddle', [(1.81, 2.2), (2.53, 2.9), (5.23, 5.65), (5.9, 6.3), (10.35, 10.75)]), 0.5)
sprite('step_metal', oneshots('steps_metal', [(0, 0.45), (1.5, 1.9), (3.0, 3.45), (4.52, 4.95), (6.02, 6.45), (7.48, 7.9)]) + onsets('steps_grate_run', -20, 4, 0.4, 1.8, 7.5, gap=0.08), 0.5)
# ---- things
sprite('drip', oneshots('drip_one', [(0.18, 1.2), (2.1, 3.1)]) + onsets('cave_drips', -24, 4, 1.0), 1.2)
sprite('car_pass', oneshots('cars_rain', [(1, 9), (14, 22)]), 8.0, br='64k')
sprite('fluoro_flick', oneshots('fluoro_starter', [(0.2, 1.4), (4, 5.2), (9, 10.2)]), 1.3)
sprite('steam', oneshots('steam_vent', [(1.1, 3.2), (6.9, 9.0), (15.5, 17.7)]), 2.3)
sprite('clank', oneshots('metal_pipes', [(1.3, 2.4), (3.05, 4.3), (7.95, 9.2), (10.7, 12.0), (20.3, 21.5), (24.0, 25.2)]), 1.4)
sprite('pipe_drop', oneshots('pipes_drop', [(0.45, 1.6), (2.63, 3.8), (6.6, 7.8)]), 1.4)
sprite('bin', oneshots('bin_knocked', [(0.15, 1.8)]) + oneshots('cans_knocked', [(0, 1.8)]), 2.0)
sprite('rat', oneshots('rat_squeak', [(0, 1.4)]) + oneshots('rat_squeaks', [(0.18, 0.5), (1.88, 2.15), (3.58, 3.95), (6.38, 6.7), (10.2, 10.55)]), 1.4)
sprite('slam', oneshots('door_slam', [(0.05, 2.5)]), 2.6)
sprite('fence', oneshots('fence_shake', [(0.05, 2.2), (2.5, 4.6)]), 2.3)
sprite('chirp', oneshots('chicks', [(0, 0.9), (0.9, 1.75)]) + oneshots('baby_creature', [(1.4, 1.75), (2.13, 2.5), (4.54, 4.9), (12.25, 12.6), (13.58, 14.5)]), 1.0)
sprite('spark', oneshots('sparks', [(0.67, 1.3), (2.86, 3.7), (9.0, 10.0), (13.5, 14.5)]), 1.0)
sprite('siren', oneshots('siren_far', [(4, 18)]), 14.0, br='64k')
sprite('dogs', onsets('dogs_far', -18, 3, 3.5, gap=0.8), 3.5, br='64k')
sprite('glass', oneshots('glass_tap', [(0.64, 0.95), (1.3, 1.6), (2.39, 2.7)]), 0.4)
json.dump(man, open(MAN, 'w'), indent=0)
print('wrote', MAN)
