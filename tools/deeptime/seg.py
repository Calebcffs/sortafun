import numpy as np, subprocess, sys
def load(f, sr=22050):
    raw = subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar',str(sr),'-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw, np.float32), sr
def events(f, thr_db=-30, min_gap=0.25, min_len=0.05, hop=0.01):
    x, sr = load(f); h = int(sr*hop)
    n = len(x)//h; e = np.sqrt(np.mean(x[:n*h].reshape(n,h)**2, axis=1)+1e-12); db = 20*np.log10(e)
    peak = db.max(); on = db > peak + thr_db
    ev=[]; i=0
    while i<n:
        if on[i]:
            j=i
            while j<n and (on[j] or (j+int(min_gap/hop)<n and on[j:j+int(min_gap/hop)].any())): j+=1
            if (j-i)*hop>=min_len: ev.append((round(i*hop,2), round(j*hop,2), round(float(db[i:j].max()),1)))
            i=j
        else: i+=1
    return ev, peak
if __name__=='__main__':
    f=sys.argv[1]; thr=float(sys.argv[2]) if len(sys.argv)>2 else -30; gap=float(sys.argv[3]) if len(sys.argv)>3 else 0.25
    ev,p=events(f,thr,gap); print(f.split('/')[-1],'peak',round(float(p),1),'n',len(ev)); print(ev[:80])
