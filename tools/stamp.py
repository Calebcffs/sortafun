#!/usr/bin/env python3
"""Cache-busting: stamp every local script / stylesheet link with ?v=<hash>.

sortafun.org sits behind Cloudflare, which tells browsers to keep .js and .css
for 4 hours (and caches them at its edge too). HTML pages only keep for 10
minutes. So after a push people would get the new page but the OLD scripts.
Stamping each link with a hash of the file's content gives a changed file a
new URL, which both Cloudflare and the browser fetch fresh.

City Sandbox's ES modules (city/, once called Birdie) import each other
("./flight.js"), which can't carry a stamp, so city.html gets an import map
entry per module that points the plain URL at the stamped one.

Run before every commit that changes a .js or .css file:

    python3 tools/stamp.py

It only rewrites what changed and is safe to run any number of times.
"""
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


def digest(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


# src="x.js" / href="/game.css" / src="birdie/main.js?v=old" ... local files only
REF = re.compile(rb'((?:src|href)=")(/?)([A-Za-z0-9_\-./]+\.(?:js|css))(?:\?v=[0-9a-f]*)?(")')


def stamp_refs(html):
    def sub(m):
        path = m.group(3).decode()
        if path.startswith("//") or not os.path.isfile(path):
            return m.group(0)
        return m.group(1) + m.group(2) + m.group(3) + b"?v=" + digest(path).encode() + m.group(4)
    return REF.sub(sub, html)


IMPORTMAP = re.compile(rb'(<script type="importmap">\s*)(\{.*?\})(\s*</script>)', re.S)


def stamp_birdie_modules(html):
    m = IMPORTMAP.search(html)
    if not m:
        return html
    data = json.loads(m.group(2))
    imports = {k: v for k, v in data["imports"].items() if not k.startswith("./birdie/") and not k.startswith("./city/")}
    for path in sorted(glob.glob("city/*.js")):
        imports["./" + path] = "./" + path + "?v=" + digest(path)
    data["imports"] = imports
    body = "{ \"imports\": {\n" + ",\n".join("  %s: %s" % (json.dumps(k), json.dumps(v)) for k, v in imports.items()) + "\n} }"
    return html[:m.start(2)] + body.encode() + html[m.end(2):]


changed = []
for page in sorted(glob.glob("*.html")):
    with open(page, "rb") as f:
        old = f.read()
    new = stamp_refs(old)
    if page == "city.html":
        new = stamp_birdie_modules(new)
    if new != old:
        with open(page, "wb") as f:
            f.write(new)
        changed.append(page)

print("stamped: " + (", ".join(changed) if changed else "nothing changed"))
sys.exit(0)
