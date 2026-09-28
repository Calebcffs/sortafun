"""Download the Freesound CC0 previews listed in sounds.txt ("<id>_<user> <name>") into ./snd/.
Previews are public, no login or API key. Every one is CC0 (checked on its page)."""
import os, urllib.request
os.makedirs("snd", exist_ok=True)
here = os.path.dirname(os.path.abspath(__file__))
for line in open(os.path.join(here, "sounds.txt")):
    if not line.strip(): continue
    sid, name = line.split()
    d = sid.split("_")[0][:-3]
    url = "https://cdn.freesound.org/previews/%s/%s-hq.mp3" % (d, sid)
    out = "snd/%s.mp3" % name
    if not os.path.exists(out):
        urllib.request.urlretrieve(url, out); print("got", name)
