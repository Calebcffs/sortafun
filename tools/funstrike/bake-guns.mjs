import puppeteer from 'puppeteer-core';
import fs from 'fs';
const files=process.argv.slice(2);
const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage(); p.on('pageerror',e=>console.log('PE',e.message)); p.on('console',m=>{const t=m.text(); if(!/favicon|Failed to load/.test(t))console.log(t)});
await p.goto('http://localhost:8745/bake-guns.html'); await p.waitForFunction('window.ready');
fs.mkdirSync('baked',{recursive:true});
for(const f of files){ const r=await p.evaluate(u=>window.bake(u),'/'+f); fs.writeFileSync('baked/'+f.split('/').pop().replace('.glb','.json'),JSON.stringify(r)); 
 let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9]; for(let i=0;i<r.P.length;i+=3)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],r.P[i+k]);mx[k]=Math.max(mx[k],r.P[i+k]);}
 console.log(f.split('/').pop(),'tris',r.I.length/3,'size',mx.map((x,k)=>(x-mn[k]).toFixed(3)).join(' x '),'marks',JSON.stringify(r.marks)); }
await b.close();
