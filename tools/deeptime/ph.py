import json,urllib.request,os,sys
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'sortafun-builder'}),timeout=60).read()
TEX=sys.argv[1].split(',') if sys.argv[1] else []
MOD=sys.argv[2].split(',') if len(sys.argv)>2 and sys.argv[2] else []
for t in TEX:
    f=json.loads(get('https://api.polyhaven.com/files/'+t))
    for key,name in [('Diffuse','diff'),('nor_gl','nor'),('Rough','rough'),('AO','ao'),('arm','arm')]:
        if key in f and '1k' in f[key]:
            d=f[key]['1k'].get('jpg') or f[key]['1k'].get('png')
            p='ph/tex/%s_%s.jpg'%(t,name)
            if not os.path.exists(p): open(p,'wb').write(get(d['url']))
    print('tex',t)
for m in MOD:
    f=json.loads(get('https://api.polyhaven.com/files/'+m))
    g=f['gltf']['1k']['gltf']; d='ph/mod/'+m; os.makedirs(d,exist_ok=True)
    open(d+'/'+m+'.gltf','wb').write(get(g['url']))
    for rel,info in g.get('include',{}).items():
        p=os.path.join(d,rel); os.makedirs(os.path.dirname(p),exist_ok=True)
        if not os.path.exists(p): open(p,'wb').write(get(info['url']))
    print('mod',m, g.get('size'))
