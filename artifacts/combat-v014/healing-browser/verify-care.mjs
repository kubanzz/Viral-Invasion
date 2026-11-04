import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const output = resolve('artifacts/combat-v014/healing-browser');
await mkdir(output, { recursive: true });
const files = ['src/game/territory.ts','src/game/territoryTypes.ts','src/game/session.ts','src/game/types.ts',
  'src/game/battle.ts','src/game/growth.ts','src/game/smartViruses.ts','src/game/territoryCannon.ts',
  'src/render/phaserRenderer.ts','src/render/fantasyTerritory.ts','src/render/playerDamageFeedback.ts','src/ui/territoryHud.ts','src/main.ts'];
const hashes = async () => Object.fromEntries(await Promise.all(files.map(async file => [file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const read = page => page.evaluate(() => window.__viral.snapshot());
const gap = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function clear(a,b,world,margin=25) {
  const dx=b.x-a.x,dy=b.y-a.y,square=dx*dx+dy*dy;
  return world.obstacles.every(o=>{const t=Math.max(0,Math.min(1,((o.x-a.x)*dx+(o.y-a.y)*dy)/(square||1)));
    return Math.hypot(a.x+dx*t-o.x,a.y+dy*t-o.y)>=o.radius+margin;});
}
function route(from,goal,world) {
  const startMargin=Math.max(18.5,Math.min(25,...world.obstacles.map(o=>gap(from,o)-o.radius-.05)));
  if(clear(from,goal,world,startMargin))return goal;
  const nodes=[from,...world.obstacles.flatMap(o=>Array.from({length:16},(_,i)=>({x:o.x+Math.cos(i*Math.PI/8)*(o.radius+50),y:o.y+Math.sin(i*Math.PI/8)*(o.radius+50)})))
    .filter(p=>p.x>world.bounds.left+30&&p.x<world.bounds.right-30&&p.y>world.bounds.top+30&&p.y<world.bounds.bottom-30&&world.obstacles.every(o=>gap(p,o)>=o.radius+25)),goal];
  const costs=new Map([[0,0]]),previous=new Map(),visited=new Set(),end=nodes.length-1;
  for(;;){const at=[...costs.keys()].filter(i=>!visited.has(i)).sort((a,b)=>costs.get(a)-costs.get(b))[0];
    if(at===undefined)throw Error('Natural care route has no legal path');if(at===end)break;visited.add(at);
    for(let i=1;i<nodes.length;i++){if(visited.has(i)||!clear(nodes[at],nodes[i],world,at===0?startMargin:25))continue;
      const cost=costs.get(at)+gap(nodes[at],nodes[i]);if(cost>=(costs.get(i)??Infinity))continue;costs.set(i,cost);previous.set(i,at);}}
  const path=[end];while(path[0]!==0)path.unshift(previous.get(path[0]));
  return nodes[path.slice(1).find(i=>gap(from,nodes[i])>22)??end];
}
class Movement {
  held=new Set();constructor(page){this.page=page;}
  async move(x,y){const length=Math.hypot(x,y)||1,keys=[Math.abs(x/length)>.383?(x>0?'KeyD':'KeyA'):'',Math.abs(y/length)>.383?(y>0?'KeyS':'KeyW'):''].filter(Boolean);
    for(const key of this.held)if(!keys.includes(key)){await this.page.keyboard.up(key);this.held.delete(key);}
    for(const key of keys)if(!this.held.has(key)){await this.page.keyboard.down(key);this.held.add(key);}}
  async release(){for(const key of this.held)await this.page.keyboard.up(key);this.held.clear();}
}
const browser=await chromium.launch({channel:'chrome',headless:true});
const report={method:'Real mouse/keyboard only; evaluate reads snapshot/projection/diagnostics. No world, actor, HP, clocks or storage injection. Initial stages accept a natural body touch, sustain until damage occurs, then shoot/kite inside a healthy spring for treatment.',
  scope:'Development HTTP candidate on Windows Chrome, desktop input. Standard and low effects screenshots. Not phone hardware or a full rescue, and live source changes are recorded.',startedAt:new Date().toISOString(),cases:[]};
try {
  for(const low of [false,true]) {
    const tag=low?'low':'standard',result={tag,sourceBefore:await hashes(),errors:[],events:[],samples:[],screenshots:[],pass:false};report.cases.push(result);
    const context=await browser.newContext({viewport:{width:1366,height:768},deviceScaleFactor:1}),page=await context.newPage(),movement=new Movement(page);
    let firing=false,contactAt,healingCaptured=false,cureCaptured=false,identity;
    const seen=new Set();
    page.on('pageerror',error=>result.errors.push(error.message));
    const shot=async(name,state)=>{const path=resolve(output,`${tag}-${name}.png`);await page.screenshot({path});result.screenshots.push({name,path,tick:state.tick,hp:state.player.hp,infection:state.playerInfection,contact:state.territory?.healingContact});};
    const fire=async(target)=>{const p=await page.evaluate(t=>window.__viral.toScreen(t),target);await page.mouse.move(Math.max(20,Math.min(1340,p.x)),Math.max(150,Math.min(670,p.y)));if(!firing){await page.mouse.down();firing=true;}};
    const stop=async()=>{if(firing)await page.mouse.up();firing=false;};
    async function navigate(state,goal,tolerance=25){goal={...goal};for(let pass=0;pass<3;pass++)for(const o of state.world.obstacles){const d=gap(goal,o),safe=o.radius+35;if(d<safe){const dx=goal.x-o.x,dy=goal.y-o.y,len=Math.hypot(dx,dy)||1;goal.x=o.x+dx/len*safe;goal.y=o.y+dy/len*safe;}}
      goal.x=Math.max(state.world.bounds.left+30,Math.min(state.world.bounds.right-30,goal.x));goal.y=Math.max(state.world.bounds.top+30,Math.min(state.world.bounds.bottom-30,goal.y));
      if(gap(state.player,goal)<=tolerance){await movement.release();return;}const p=route(state.player,goal,state.world);await movement.move(p.x-state.player.x,p.y-state.player.y);}
    try {
      await page.goto('http://127.0.0.1:4190/?seed=71');await page.waitForFunction(()=>!!window.__viral&&!document.querySelector('#app[aria-busy=true]'));
      await page.locator('[data-action=endless-start]').click();
      await page.waitForFunction(()=>window.__viral.snapshot().phase==='playing');
      result.version=await page.evaluate(()=>window.__viral.version);
      if(low){await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__viral.snapshot().phase==='paused');
        const toggle=page.locator('[data-action=effects]').first();result.effectsBefore=await toggle.textContent();await toggle.click();result.effectsAfter=await toggle.textContent();await page.keyboard.press('Escape');}
      const first=await read(page);identity=first.growth.runId;
      const begin=Date.now();let lastSample=-Infinity;
      while(Date.now()-begin<100000) {
        const s=await read(page);if(s.growth?.runId!==identity)throw Error('Development reload changed the live run during verification');
        for(const event of s.events){if(!/^(PLAYER_INFECTED|PLAYER_HURT|PLAYER_INFECTION_CLEARED|TERRITORY_PLAYER_HEALED|TERRITORY_CAPTURED|TERRITORY_CONTESTED)$/.test(event.type))continue;
          const key=JSON.stringify(event);if(!seen.has(key)){seen.add(key);result.events.push(event);}}
        const spring=s.territory.nodes.find(n=>n.id==='heart-healing-1');
        if(s.elapsed-lastSample>=.4){lastSample=s.elapsed;result.samples.push({elapsed:s.elapsed,tick:s.tick,hp:s.player.hp,player:{x:s.player.x,y:s.player.y},infected:!!s.playerInfection,heal:s.territory.healingContact,springOwner:spring.owner,springInfection:spring.infectionProgress});}
        if(s.phase==='result')throw Error('Care run ended: '+s.result?.reason);
        if(s.phase==='paused'){
          await stop();await movement.release();const d=s.endlessGrowth?.draft;
          if(d){const option=d.options.find(o=>o.id==='power')??d.options[0];await page.locator(`[data-action=endless-upgrade][data-upgrade="${option.id}"]`).click();continue;}
          await page.locator('[data-action=continue]').click();continue;
        }
        const infected=result.events.find(e=>e.type==='PLAYER_INFECTED');
        if(infected&&contactAt===undefined){contactAt=s.elapsed;const actor=s.targets.find(t=>t.id===infected.data.sourceId);
          result.firstContact={event:infected,tick:s.tick,hp:s.player.hp,actor:actor?{id:actor.id,role:actor.role,x:actor.x,y:actor.y,radius:actor.radius}:null,
            bodyGap:actor?gap(actor,s.player):null,radiusSum:actor?actor.radius+s.player.radius:null,
            hurtBeforeInfection:result.events.filter(e=>e.type==='PLAYER_HURT'&&e.tick<=infected.tick)};
          await shot('infected-contact',s);}
        const enemies=s.targets.filter(t=>t.hp>0&&(t.role==='virus'||t.role==='elite')).sort((a,b)=>gap(a,s.player)-gap(b,s.player));
        if(contactAt===undefined){await stop();if(gap(s.player,spring)>105)await navigate(s,spring,95);
          else {const near=enemies.find(t=>!t.territoryTask&&gap(t,s.player)<170);if(near)await navigate(s,near,8);else await movement.release();}}
        else if(s.elapsed-contactAt<1.25&&s.player.hp>60){await stop();await movement.release();}
        else {
          const angle=Math.atan2(s.player.y-spring.y,s.player.x-spring.x),goal={x:spring.x+Math.cos(angle+.7)*90,y:spring.y+Math.sin(angle+.7)*90};
          if(spring.owner!=='healthy'){await navigate(s,spring,100);await page.keyboard.press('Digit3');}
          else await navigate(s,goal,16);
          if(enemies[0])await fire(enemies[0]);else await stop();
          const healed=result.events.filter(e=>e.type==='TERRITORY_PLAYER_HEALED'&&e.tick>=infected.tick).reduce((sum,e)=>sum+Number(e.data.amount),0);
          result.healedAmount=healed;
          if(!healingCaptured&&healed>.75&&s.territory.healingContact.nodeId){healingCaptured=true;await shot('healing',s);}
          const cure=result.events.find(e=>e.type==='PLAYER_INFECTION_CLEARED'&&e.data.reason==='healing'&&e.tick>=infected.tick);
          if(cure&&!s.playerInfection&&!cureCaptured){cureCaptured=true;result.cure=cure;await shot('cleansed',s);}
          if(healingCaptured&&cureCaptured){result.end={tick:s.tick,elapsed:s.elapsed,hp:s.player.hp,contact:s.territory.healingContact};
            result.pass=result.firstContact.hurtBeforeInfection.length===0&&result.healedAmount>0&&result.errors.length===0;break;}
        }
        await page.waitForTimeout(70);
      }
      if(!result.end)throw Error('Natural contact/healing/cure case exceeded its real-time budget');
    } catch(error){result.failure=error.stack??String(error);result.final=await read(page).catch(()=>null);await page.screenshot({path:resolve(output,`${tag}-failure.png`)}).catch(()=>{});}
    finally{await stop().catch(()=>{});await movement.release().catch(()=>{});result.sourceAfter=await hashes();result.changedFiles=files.filter(file=>result.sourceBefore[file]!==result.sourceAfter[file]);result.sourceStable=result.changedFiles.length===0;
      await writeFile(resolve(output,`${tag}-report.json`),JSON.stringify(result,null,2));await context.close();}
    console.log(JSON.stringify({tag:result.tag,pass:result.pass,sourceStable:result.sourceStable,changedFiles:result.changedFiles,contact:result.firstContact,healed:result.healedAmount,cure:result.cure,end:result.end,failure:result.failure}));
  }
} finally {report.finishedAt=new Date().toISOString();await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
