"""Radiance .hdr -> tone mapped 8 bit JPEG panorama for Fun Strike's sky (v0.9.5), plus the sun's direction.
   python3 hdr2jpg.py in.hdr out.jpg [exposure]"""
import sys, numpy as np
from PIL import Image
def read_hdr(path):
    f = open(path, 'rb'); w = h = 0
    while True:
        line = f.readline()
        if line.startswith(b'-Y') or line.startswith(b'+Y'):
            p = line.split(); h = int(p[1]); w = int(p[3]); break
    data = np.zeros((h, w, 4), np.uint8)
    for y in range(h):
        a = f.read(4)
        assert a[0] == 2 and a[1] == 2, "not RLE"
        for c in range(4):
            x = 0
            while x < w:
                n = f.read(1)[0]
                if n > 128:
                    n -= 128; v = f.read(1)[0]; data[y, x:x + n, c] = v
                else:
                    data[y, x:x + n, c] = np.frombuffer(f.read(n), np.uint8)
                x += n
    e = data[..., 3].astype(np.float32)
    scale = np.where(e > 0, np.ldexp(1.0, (e - 136).astype(np.int32)), 0)[..., None]
    return data[..., :3].astype(np.float32) * scale
img = read_hdr(sys.argv[1]); H, W, _ = img.shape
lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
# sun: centroid of the brightest 0.01 percent of pixels in the upper half
up = lum.copy(); up[H // 2:] = 0
thr = np.quantile(up, 0.9999); ys, xs = np.nonzero(up >= thr)
phi = (xs.mean() / W - 0.5) * 2 * np.pi; el = (0.5 - ys.mean() / H) * np.pi
print("sun azimuth(rad) %.3f elevation(deg) %.1f peak %.1f" % (phi, np.degrees(el), up.max()))
exp = float(sys.argv[3]) if len(sys.argv) > 3 else 0.35
x = img * exp
x = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)   # a filmic curve
x = np.clip(x, 0, 1) ** (1 / 2.2)
Image.fromarray((x * 255).astype(np.uint8)).save(sys.argv[2], quality=84, optimize=True)
