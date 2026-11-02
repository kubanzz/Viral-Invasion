import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildIdentity } from './build-identity.mjs';

const out=resolve('artifacts/competition-polish-20261102');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const entry=pathToFileURL(resolve('dist/index.html')).href;
const reports=[];
const identity=await buildIdentity();
const read=page=>page.evaluate(()=>window.__viral.snapshot());
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function visible(a,b,r,geometry) {
  const dx=b.x-a.x,dy=b.y-a.y,gap=Math.hypot(dx,dy),ux=dx/(gap||1),uy=dy/(gap||1);
  return geometry.obstacles.every(o=>{
    const along=(o.x-a.x)*ux+(o.y-a.y)*uy;
    return along<0||along>gap-r||Math.hypot(o.x-a.x-along*ux,o.y-a.y-along*uy)>o.radius;
  });
}
class Movement {
  held=new Set();
  constructor(page){this.page=page;}
  async move(x,y){
    const length=Math.hypot(x,y)||1;
    const keys=[Math.abs(x/length)>.383?(x>0?'KeyD':'KeyA'):'',Math.abs(y/length)>.383?(y>0?'KeyS':'KeyW'):''].filter(Boolean);
    for(const key of this.held)if(!keys.includes(key)){await this.page.keyboard.up(key);this.held.delete(key);}
    for(const key of keys)if(!this.held.has(key)){await this.page.keyboard.down(key);this.held.add(key);}
  }
  async release(){for(const key of this.held)await this.page.keyboard.up(key);this.held.clear();}
}
async function aim(page,target){
  const p=await page.evaluate(point=>{
    const p=window.__viral.toScreen(window.__viral.snapshot().player),t=window.__viral.toScreen(point),dx=t.x-p.x,dy=t.y-p.y;
    const fit=Math.min(1,dx>0?(innerWidth-240-p.x)/dx:dx<0?(255-p.x)/dx:1,dy>0?(innerHeight-130-p.y)/dy:dy<0?(85-p.y)/dy:1);
    return{x:p.x+dx*Math.max(.08,fit),y:p.y+dy*Math.max(.08,fit)};
  },target);
  await page.mouse.move(p.x,p.y);
}
async function tap(page,cdp,locator){
  await locator.scrollIntoViewIfNeeded();
  const box=await locator.boundingBox();expect(box).not.toBeNull();
  const point={x:box.x+box.width/2,y:box.y+box.height/2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1,radiusX:4,radiusY:4,force:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function layout(page,cdp,name,width,height){
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:width<1000,maxTouchPoints:5});
  await page.setViewportSize({width,height});
  await page.waitForTimeout(120);
  const result=await page.evaluate(()=>{
    const modal=document.querySelector('#overlay-host [role="dialog"]'),r=modal.getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,touch:document.body.classList.contains('touch-mode'),documentWidth:document.documentElement.scrollWidth,documentHeight:document.documentElement.scrollHeight,
      modal:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,client:modal.clientHeight,scroll:modal.scrollHeight}};
  });
  expect(result.documentWidth).toBeLessThanOrEqual(width);expect(result.documentHeight).toBeLessThanOrEqual(height);
  expect(result.modal.left).toBeGreaterThanOrEqual(0);expect(result.modal.right).toBeLessThanOrEqual(width+1);
  await page.screenshot({path:resolve(out,`${name}.png`)});
  for(const action of ['endless-stage-continue','endless-stage-finish']){
    const button=page.locator(`[data-action="${action}"]`);await button.scrollIntoViewIfNeeded();
    const b=await button.boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual(height+1);
  }
  return result;
}
async function naturalStage(page,report){
  const movement=new Movement(page),deadline=Date.now()+450000;
  let lastWave=0,lastSample=0,firstUpgrade=true,firing=false;
  const releaseFire=async()=>{await page.mouse.move(10,10);await page.mouse.up();firing=false;};
  try{
    while(Date.now()<deadline){
      const state=await read(page),e=state.endless;
      if(state.phase==='result')throw new Error(`Natural run ended: ${state.result?.reason}`);
      if(e.stageCheckpoint==='pending'&&e.reward?.step==='complete'&&!state.growth?.draft&&!state.endlessGrowth?.draft){
        await movement.release();await releaseFire();
        report.checkpoint={tick:state.tick,elapsed:state.elapsed,score:e.score,kills:e.kills,bestCombo:e.bestCombo,hp:state.player.hp,tissue:state.tissue.hp,runId:state.growth.runId,phase:state.phase};
        return state;
      }
      if(state.growth?.draft){
        await movement.release();await releaseFire();
        const d=state.growth.draft;
        if(d.status==='replacing')await page.locator('[data-action="draft-replace"]').first().click();
        else{
          const pick=d.options.find(x=>x.protocolId==='PURIFY_CHAIN')??d.options[0];
          await page.locator(`[data-action="draft-option"][data-option="${pick.id}"]`).click();
        }
        continue;
      }
      if(state.endlessGrowth?.draft){
        await movement.release();await releaseFire();
        const d=state.endlessGrowth.draft,priorities=['multishot','pierce','nova','power','haste','dash','scan','immune','vitality','catalysis'];
        const choice=[...d.options].sort((a,b)=>priorities.indexOf(a.id)-priorities.indexOf(b.id))[0];
        if(firstUpgrade){await page.screenshot({path:resolve(out,'natural-first-reward.png')});firstUpgrade=false;}
        report.choices.push({wave:d.wave,id:choice.id,from:choice.currentRank,to:choice.nextRank});
        await page.locator(`[data-action="endless-upgrade"][data-upgrade="${choice.id}"]`).click();continue;
      }
      if(state.phase==='paused'){await page.locator('[data-action="continue"]').click();continue;}
      const alive=state.targets.filter(t=>t.hp>0&&t.role!=='event');
      report.maxAlive=Math.max(report.maxAlive,alive.length);
      if(e.wave!==lastWave){lastWave=e.wave;report.waves.push({wave:e.wave,elapsed:state.elapsed,hp:state.player.hp,tissue:state.tissue.hp,budget:e.totalToSpawn});}
      if(state.elapsed-lastSample>1){
        lastSample=state.elapsed;
        const visibleCount=await page.evaluate(()=>{const s=window.__viral.snapshot();return s.targets.filter(t=>{if(t.hp<=0)return false;const p=window.__viral.toScreen(t);return p.x>=0&&p.x<=innerWidth&&p.y>=0&&p.y<=innerHeight;}).length;});
        report.maxVisible=Math.max(report.maxVisible,visibleCount);
        if((e.wave===2||e.wave===4)&&visibleCount>=25&&!(report.hordeShots??[]).includes(e.wave)){
          (report.hordeShots??=[]).push(e.wave);await page.screenshot({path:resolve(out,`${report.name}-horde-wave${e.wave}.png`)});
        }
      }
      const sorted=alive.filter(t=>t.role!=='source').sort((a,b)=>distance(a,state.player)-distance(b,state.player));
      const target=sorted.find(t=>visible(state.player,t,t.radius,state.world))??sorted[0];
      if(target){
        const gap=distance(target,state.player);
        await aim(page,target);await page.keyboard.press('Digit1');if(!firing){await page.mouse.down();firing=true;}
        if(state.scanReady<=state.elapsed)await page.keyboard.press('KeyQ');
        const nearby=sorted.filter(t=>distance(t,state.player)<330);
        if(nearby.length>=3&&state.cooldowns[2]<=state.elapsed){
          await page.keyboard.press('Digit2');await page.waitForTimeout(20);await page.keyboard.press('Digit1');
        }
        let dx=0,dy=0;
        if(gap<165){dx=state.player.x-target.x;dy=state.player.y-target.y;}
        else if(gap>425){dx=target.x-state.player.x;dy=target.y-state.player.y;}
        const plans=sorted.filter(t=>t.attackPlan||t.charge||t.attackAt!==undefined&&t.attackAt>state.elapsed);
        if(plans.length&&gap<300){dx+=-(target.y-state.player.y)*.8;dy+=(target.x-state.player.x)*.8;}
        if(dx||dy){
          const future={x:state.player.x+dx/(Math.hypot(dx,dy)||1)*60,y:state.player.y+dy/(Math.hypot(dx,dy)||1)*60};
          const blocked=state.world.obstacles.some(o=>distance(o,future)<o.radius+state.player.radius+10);
          if(blocked){const old=dx;dx=-dy;dy=old;}
          const b=state.world.bounds;if(future.x<b.left+65||future.x>b.right-65)dx=-dx;if(future.y<b.top+65||future.y>b.bottom-65)dy=-dy;
        }
        await movement.move(dx,dy);
        if(gap<95&&state.player.dashReady<=state.elapsed)await page.keyboard.press('Space');
      }else{await releaseFire();await movement.release();}
      await page.waitForTimeout(80);
    }
    throw new Error('Natural five-wave run exceeded 450s wall time');
  }finally{await movement.release();await releaseFire();}
}
try{
  const context=await browser.newContext({viewport:{width:1366,height:768}});await context.setOffline(true);
  const page=await context.newPage(),cdp=await context.newCDPSession(page);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const endAction of ['finish','continue']){
    const report={name:`natural-desktop-${endAction}`,method:'Read-only snapshot/toScreen observations; real mouse, held keyboard and CDP touch only. No state/time/equipment injection.',choices:[],waves:[],maxAlive:0,maxVisible:0,errors};reports.push(report);
    const wallStart=Date.now();
    try{
      await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await page.setViewportSize({width:1366,height:768});
      await page.goto(`${entry}?seed=71`);await expect(page.locator('#app')).not.toHaveAttribute('aria-busy','true');
      await page.locator('[data-action="endless-start"]').click();
      const checkpoint=await naturalStage(page,report);report.wallSeconds=(Date.now()-wallStart)/1000;
      await expect(page.getByRole('dialog',{name:'第一阶段完成'})).toBeVisible();
      await page.waitForTimeout(350);expect((await read(page)).tick).toBe(checkpoint.tick);
      await page.keyboard.press('Escape');expect((await read(page)).phase).toBe('paused');
      if(endAction==='finish'){
        report.layouts=[];
        for(const [name,w,h]of [['stage-desktop-1366x768',1366,768],['stage-compact-1100x560',1100,560],['stage-touch-844x390',844,390],['stage-touch-667x320',667,320]])report.layouts.push(await layout(page,cdp,name,w,h));
        await tap(page,cdp,page.locator('[data-action="endless-stage-finish"]'));
        await expect.poll(async()=>(await read(page)).phase).toBe('result');
        report.saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('viral-invasion:1:endless-profile')));
        expect(report.saved.runs).toBe(1);expect(report.saved.recentRuns[0].clearedWaves).toBe(5);
      }else{
        await page.locator('[data-action="endless-stage-continue"]').click();
        await expect.poll(async()=>(await read(page)).endless.wave).toBe(6);
        const next=await read(page);expect(next.growth.runId).toBe(checkpoint.growth.runId);expect(next.endless.score).toBe(checkpoint.endless.score);
        report.continued={wave:next.endless.wave,runId:next.growth.runId,hp:next.player.hp,tissue:next.tissue.hp};
        const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('viral-invasion:1:endless-profile')));expect(saved.runs).toBe(1);
        await page.screenshot({path:resolve(out,'natural-continued-wave6.png')});
      }
      expect(errors).toEqual([]);report.pass=true;
      await writeFile(resolve(out,'browser-report.json'),JSON.stringify({identity,reports},null,2));
      console.log(JSON.stringify({name:report.name,pass:report.pass,wallSeconds:report.wallSeconds,checkpoint:report.checkpoint,maxAlive:report.maxAlive,maxVisible:report.maxVisible}));
    }catch(error){report.pass=false;report.failure=error.stack??String(error);await page.screenshot({path:resolve(out,`${report.name}-failure.png`)}).catch(()=>{});await writeFile(resolve(out,'browser-report.json'),JSON.stringify({identity,reports},null,2));throw error;}
  }
  await context.close();
}finally{await browser.close();const finalIdentity=await buildIdentity();expect(finalIdentity).toEqual(identity);await writeFile(resolve(out,'browser-report.json'),JSON.stringify({identity,finalIdentity,reports},null,2));}
