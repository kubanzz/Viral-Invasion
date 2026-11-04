import{readFile,writeFile}from'node:fs/promises';
import{dirname,join}from'node:path';import{fileURLToPath}from'node:url';
const root=dirname(dirname(fileURLToPath(import.meta.url))),configs=[];
for(const name of['basic','immune-front-right','enemy.thinRay','enemy.carapace','enemy.fission.parent','enemy.fission.child','enemy.mimic']){
 const m=JSON.parse(await readFile(join(root,name+'.v02.fragment.json'),'utf8'));
 for(const[start,end,clip]of(name==='immune-front-right'?[[0,4,'crawl'],[4,8,'bite']]:[[0,4,'walk']])){
  const a=m.assets.slice(start,end);configs.push({label:name+'.'+clip,ids:a.map(x=>x.id),scale:23/Math.max(...a.map(x=>x.qa.bbox.height)),delays:clip==='bite'?[130,110,110,210]:a.map(()=>name==='enemy.fission.child'?110:name==='enemy.mimic'?160:140)});
 }
}
const html=`<!doctype html><meta charset="utf-8"><title>v02 actual PNG playback</title><style>body{background:#252b2c;color:#eee;font:15px system-ui;margin:18px}main{display:flex;gap:18px;flex-wrap:wrap}article{width:290px;text-align:center}canvas{display:block;margin:10px auto;background:#b7c0be}.one{width:64px;height:64px}.big{width:256px;height:256px}small{color:#b9ccc5}button{padding:8px 18px;margin-right:12px}</style><h2>v02 actual PNG playback ·23px mobile1×</h2><button id="play">Pause</button><small>Top canvas is64×64 at native1×, shared scale per clip. Large canvas is256 logical. Actual registered512 PNGs, no frame crop/fit.</small><main id="cards"></main><script>
const configs=${JSON.stringify(configs)};let playing=true;const cards=document.getElementById('cards');
for(const c of configs){const a=document.createElement('article');a.innerHTML='<h3>'+c.label+'</h3><div>frame <b>0</b> /3</div><canvas class=one width=64 height=64></canvas><canvas class=big width=256 height=256></canvas>';cards.append(a);c.small=a.querySelector('.one').getContext('2d');c.big=a.querySelector('.big').getContext('2d');c.labelNode=a.querySelector('b');c.images=c.ids.map(id=>{const i=new Image();i.src='../frames/'+id+'.png';return i;});c.index=0;c.at=0;}
document.getElementById('play').onclick=()=>{playing=!playing;document.getElementById('play').textContent=playing?'Pause':'Play';};
function tick(now){for(const c of configs){if(!c.at)c.at=now;if(playing&&now-c.at>=c.delays[c.index]){c.index=(c.index+1)%4;c.at=now;}if(!playing)c.at=now;const im=c.images[c.index];if(im.complete&&im.naturalWidth){c.small.clearRect(0,0,64,64);const w=512*c.scale;c.small.drawImage(im,(64-w)/2,(64-w)/2,w,w);c.big.clearRect(0,0,256,256);c.big.drawImage(im,0,0,256,256);c.labelNode.textContent=c.index;}}requestAnimationFrame(tick);}requestAnimationFrame(tick);</script>`;
await writeFile(join(root,'v02/qa/actual-png-playback.html'),html);console.log(JSON.stringify({clips:configs.length,page:'production/v02/qa/actual-png-playback.html'}));
