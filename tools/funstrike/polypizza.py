import sys,re,json,urllib.request,urllib.parse
def get(u): return urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'}),timeout=30).read().decode('utf8','replace')
def info(mid):
    h=get('https://poly.pizza/m/'+mid)
    m=re.search(r'__SERVER_APP_STATE__ =\s*(\{.*?\})</script>',h,re.S)
    d=json.loads(m.group(1))['initialData']['model']
    return d
def search(q):
    h=get('https://poly.pizza/search/'+urllib.parse.quote(q))
    return list(dict.fromkeys(re.findall(r'href="/m/([A-Za-z0-9_-]+)"',h)))
if __name__=='__main__':
    ids=[]
    for a in sys.argv[1:]:
        ids+= search(a[2:]) if a.startswith('s:') else [a]
    for i in dict.fromkeys(ids):
        try:
            d=info(i)
            if 'CC0' in d.get('Licence',''):
                print(i,d['Title'],'|',d['Creator']['Username'],'|',d['Tris'],'tris','ANIM' if d.get('Animated') else '','|',','.join(d.get('Tags',[])),'|',d['ResourceID'])
        except Exception as e: print(i,'ERR',e)
