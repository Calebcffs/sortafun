import sys,re,json,urllib.request,urllib.parse,html
def get(u):
    r=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}); return urllib.request.urlopen(r,timeout=30).read().decode('utf8','replace')
db=json.load(open('fsdb.json')) if __import__('os').path.exists('fsdb.json') else {}
for q in sys.argv[1:]:
    u='https://freesound.org/search/?q='+urllib.parse.quote(q)+'&f=license%3A%22Creative+Commons+0%22&s=Rating+highest+first'
    h=get(u)
    for b in re.split(r'<div class="bw-player',h)[1:14]:
        mp3=re.search(r'data-mp3="([^"]+)"',b); title=re.search(r'data-title="([^"]*)"',b); dur=re.search(r'data-duration="([^"]+)"',b); sid=re.search(r'data-sound-id="(\d+)"',b)
        if mp3 and sid: db[sid.group(1)]={'url':mp3.group(1),'title':html.unescape(title.group(1)) if title else '','dur':float(dur.group(1)) if dur else 0,'q':q}
json.dump(db,open('fsdb.json','w'))
print(len(db))
