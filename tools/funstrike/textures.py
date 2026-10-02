"""Poly Haven textures -> funstrike/assets/tex/*.webp (diffuse 1024, normal 512).
Run from a scratch folder:  python3 ../deeptime/ph.py "name1,name2" ""   (downloads 1k jpgs into ph/tex)
then:                       python3 textures.py name1 name2 ...
"""
import sys, os
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'funstrike', 'assets', 'tex')
for n in sys.argv[1:]:
    for k, sz, q in (('diff', 1024, 80), ('nor', 512, 82)):
        im = Image.open('ph/tex/%s_%s.jpg' % (n, k)).convert('RGB')
        if im.width != sz: im = im.resize((sz, sz), Image.LANCZOS)
        im.save(os.path.join(OUT, '%s_%s.webp' % (n, k)), 'WEBP', quality=q, method=6)
