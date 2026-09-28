"""Deep Time sound builder: cuts the Freesound CC0 previews into sprites + loops.

    python3 fetch_sounds.py      # downloads every id in sounds.txt into ./snd/
    python3 build_sounds.py      # writes ../../deeptime/assets/snd/*.mp3 and sounds.json

Slot times below were picked from spectrograms (sox ... spectrogram) and onset
lists (seg.py). Needs ffmpeg and numpy.
"""
import numpy as np, subprocess, json, os
from seg import load, events
SR=44100
# run from a scratch folder holding snd/<name>.mp3 (fetch_sounds.py puts them there)
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'deeptime', 'assets', 'snd') + '/'
man={}
def rd(name, ch=1):
    raw=subprocess.run(['ffmpeg','-v','error','-i','snd/%s.mp3'%name,'-ac',str(ch),'-ar',str(SR),'-f','f32le','-'],capture_output=True).stdout
    x=np.frombuffer(raw,np.float32).copy()
    return x.reshape(-1,ch) if ch>1 else x
def enc(name, x, ch=1, br='80k'):
    x=np.asarray(x,np.float32)
    p=subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac',str(ch),'-i','-','-c:a','libmp3lame','-b:a',br,OUT+name+'.mp3'],input=x.tobytes())
    return os.path.getsize(OUT+name+'.mp3')
def norm(x, peak=0.89):
    m=np.abs(x).max(); return x*(peak/m) if m>0 else x
def fade(x, fi=0.005, fo=0.04):
    x=x.copy(); a=int(fi*SR); b=int(fo*SR)
    if a: x[:a]*=np.linspace(0,1,a)[:,None] if x.ndim>1 else np.linspace(0,1,a)
    if b: x[-b:]*=np.linspace(1,0,b)[:,None] if x.ndim>1 else np.linspace(1,0,b)
    return x
def cut(x,a,b): return x[int(a*SR):int(b*SR)]
def sprite(name, clips, slot, br='80k', each_norm=True):
    buf=np.zeros(int(slot*SR)*len(clips),np.float32)
    for i,c in enumerate(clips):
        c=c[:int(slot*SR)-int(0.01*SR)]
        if each_norm: c=norm(c)
        c=fade(c)
        buf[i*int(slot*SR):i*int(slot*SR)+len(c)]=c
    kb=enc(name,buf,1,br); man[name]={'slot':slot,'n':len(clips)}; print(name,len(clips),'clips',kb//1024,'KB')
def steps(src, a0=0, a1=1e9, thr=-24, n=10, maxlen=0.5, minpeak=-12):
    x=rd(src); ev,_=events('snd/%s.mp3'%src,thr,0.12)
    ev=[e for e in ev if a0<=e[0]<=a1 and e[1]-e[0]<0.9]
    top=max(e[2] for e in ev); ev=[e for e in ev if e[2]>=top+minpeak]
    pick=ev[:: max(1,len(ev)//n)][:n]
    return [cut(x,max(0,e[0]-0.02),e[0]-0.02+maxlen) for e in pick]
def oneshots(src, spans): x=rd(src); return [cut(x,a,b) for a,b in spans]
def loop(name, src, a, b, xf=2.0, ch=2, br='112k', gain=1.0):
    x=cut(rd(src,ch),a,b); f=int(xf*SR)
    y=x[f:].copy(); t=np.linspace(0,1,f)
    if ch>1: t=t[:,None]
    y[-f:]=y[-f:]*np.sqrt(1-t)+x[:f]*np.sqrt(t)
    y=norm(y,0.7)*gain
    kb=enc(name,y.reshape(-1),ch,br); man[name]={'loop':True,'dur':round(len(y)/SR,3)}; print(name,'loop',round(len(y)/SR,1),'s',kb//1024,'KB')
# ---- footsteps (one sprite per surface, 0.5s slots)
sprite('step_leaves', steps('steps_leaves_twigs',0,40,-26,6,0.48,-14)+steps('steps_woodland',0,20,-24,6,0.48,-12), 0.5)
sprite('step_soft', steps('steps_moss_run',0,15,-40,10,0.4,-14), 0.5)
sprite('step_gravel', steps('steps_gravel',0,12,-40,10,0.45,-10), 0.5)
sprite('step_wood', steps('steps_wood',0,20,-26,10,0.4,-8), 0.5)
sprite('step_dirt', steps('steps_dirtgravel',0,30,-24,10,0.45,-14), 0.5)
# ---- forest one-shots
sprite('twig', oneshots('twig_multi',[(0.45,0.8),(1.9,2.3),(3.05,3.4),(4.84,5.2),(6.06,6.45),(7.97,8.35),(10.97,11.35),(13.0,13.4)])+oneshots('twig_snap',[(1.18,1.6)]), 0.5)
sprite('branch', oneshots('branch_crack',[(0.42,1.6),(1.9,2.9),(2.92,3.5),(3.59,4.3)])+oneshots('branches_snap',[(3.36,3.9),(10.47,10.9),(31.17,31.7)]), 1.2)
ev,_=events('snd/owl.mp3',-24,0.5); sprite('owl', oneshots('owl',[(max(0,e[0]-0.05),min(e[1]+0.3,e[0]+2.4)) for e in ev[:6]]), 2.5)
ev,_=events('snd/tree_creak.mp3',-22,0.4); sprite('creak', oneshots('tree_creak',[(max(0,e[0]-0.05),min(e[1]+0.2,e[0]+2.9)) for e in ev if e[1]-e[0]>0.3][:6]), 3.0)
sprite('rustle', oneshots('bush_rustle',[(0,3.4)])+oneshots('wind_leaves',[(0,3.0),(5,8)]), 3.5)
sprite('thunder', oneshots('thunder_dry',[(0,9),(40,49),(90,99)]), 9.2, '64k', False)
# ---- the queen (t rex)
Q='dino_roars_v2'
sprite('rex_roar', oneshots(Q,[(0.0,5.8),(84.0,90.1),(67.0,72.3),(117.2,120.9),(28.8,32.7),(124.0,127.4)]), 6.2, '96k')
sprite('rex_growl', oneshots(Q,[(141.3,145.4),(10.4,14.4),(39.6,44.2),(179.5,184.7)]), 5.3, '96k')
sprite('rex_huff', oneshots(Q,[(174.0,175.2),(188.2,189.3),(191.8,193.4),(151.1,151.8),(198.1,198.9),(207.0,207.6)]), 1.7, '96k')
# ---- the watcher + pack (raptors)
sprite('rap_hiss', oneshots('utah_hiss',[(0.35,3.6)])+oneshots('gator_hiss',[(0,3.2)]), 3.7)
sprite('rap_call', oneshots('raptor_shriek',[(0,1.6)])+oneshots('dino_snarl',[(0,2.3)])+oneshots('dino5',[(0.2,1.9)])+oneshots('dragon_roars',[(8.2,10.4),(34.2,36.5)]), 2.4, '96k')
sprite('rap_growl', oneshots('growl_roar',[(0.1,2.8)])+oneshots('monster_growls',[(7.0,9.3),(19.5,21.2),(32.1,34.4)]), 2.8)
sprite('scare', oneshots('jumpscare_intense',[(0,3.0)])+oneshots('jumpscare1',[(0,2.3)]), 3.1, '112k')
ev,_=events('snd/stinger_impacts.mp3',-24,0.5); sprite('sting', oneshots('stinger_impacts',[(max(0,e[0]-0.02),min(e[1]+0.8,e[0]+3.4)) for e in ev[:4]]), 3.5, '96k')
sprite('claws', oneshots('claws',[(0.5,3.5),(6,9),(11,14)]), 3.1)
# ---- player + objects
sprite('click', oneshots('torch_click',[(0,0.35)])+oneshots('torch_click',[(0.25,0.56)]), 0.4)
ev,_=events('snd/toolbox_pickup.mp3',-22,0.4); sprite('pickup', oneshots('toolbox_pickup',[(max(0,e[0]-0.02),min(e[1]+0.3,e[0]+1.6)) for e in ev[:3]])+oneshots('metal_pickup',[(0,1.6)]), 1.7)
# ---- loops
loop('amb_crickets','amb_crickets',20,80)
loop('amb_wind','amb_nightwind',40,100)
loop('amb_gusts','wind_waves',30,90)
loop('tape_hiss','vhs_noise',0.2,8.6,1.0,1,'48k')
loop('static','tv_static',1,11,1.0,1,'64k')
loop('breath_calm','breath_frozen',0,7.0,1.2,1,'64k')
loop('breath_scared','breath_scared',2,34,1.5,1,'64k')
loop('breath_run','breath_run',1,30,1.5,1,'64k')
loop('rap_breath','raptor_breath',0.5,29.5,1.5,1,'64k')
loop('rumble','quake_rumble',0.5,14.5,2.0,1,'64k')
loop('hum','hum_fuzz',5,35,2.0,1,'48k')
json.dump(man,open(OUT+'../sounds.json','w'),indent=0)
print('TOTAL', sum(os.path.getsize(OUT+f) for f in os.listdir(OUT))//1024,'KB')
