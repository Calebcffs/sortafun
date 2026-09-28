import sys,re,urllib.request,urllib.parse,html
def get(u):
    r=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
    return urllib.request.urlopen(r,timeout=30).read().decode('utf8','replace')
q=sys.argv[1]; n=int(sys.argv[2]) if len(sys.argv)>2 else 12
u='https://freesound.org/search/?q='+urllib.parse.quote(q)+'&f=license%3A%22Creative+Commons+0%22&s=Rating+highest+first'
h=get(u)
# each result block contains sound id link and preview mp3 and duration
ids=[]
for m in re.finditer(r'data-mp3="([^"]+)"',h): pass
blocks=re.split(r'<div class="bw-player',h)[1:]
for b in blocks[:n]:
    mp3=re.search(r'data-mp3="([^"]+)"',b); title=re.search(r'data-title="([^"]*)"',b); dur=re.search(r'data-duration="([^"]+)"',b); sid=re.search(r'data-sound-id="(\d+)"',b)
    if mp3: print(sid.group(1) if sid else '?', dur.group(1)[:5] if dur else '?', html.unescape(title.group(1)) if title else '?', mp3.group(1))
