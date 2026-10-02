import sys,urllib.request,os
from polypizza import info
for mid in sys.argv[1:]:
    d=info(mid); rid=d['ResourceID']; name=d['Title'].lower().replace(' ','_').replace('(','').replace(')','')
    out='dl/guns/%s_%s.glb'%(name,mid)
    if not os.path.exists(out):
        open(out,'wb').write(urllib.request.urlopen(urllib.request.Request('https://static.poly.pizza/%s.glb'%rid,headers={'User-Agent':'Mozilla/5.0'}),timeout=60).read())
    print(out,os.path.getsize(out),d['Licence'],d['Creator']['Username'])
