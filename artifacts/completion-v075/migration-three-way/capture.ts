import { chromium, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { readState } from '../../../tests/e2e/campaignDriver';
import { g3Input, waypoint } from '../../../tests/helpers/g3Driver';
import type { GameState, InputFrame, Vec } from '../../../src/game/types';
import type { MigrationChoice } from '../../../src/game/campaignTypes';
import { parseArgs, freeze, unchanged, hash } from './guards.mjs';

const options=parseArgs(),frozen=freeze(options),output=options.output;
const report:any={schemaVersion:1,status:'running',technicalChecksPassed:false,requirementVerdict:'pending-original-image-review',startedAt:new Date().toISOString(),frozen,
  requirement:{id:'AC-M12-02',text:'固定 seed 分别选择追击、封锁、放任后，下一阶段敌人位置/器官压力确实不同，有日志和画面对照。'},
  method:'Three independent fresh offline browser contexts, fixed seed91/campaign-1/guided/field; g3Input legal route planning, actual keyboard/mouse/DOM only. No simulation/profile/clock/HP/position/DOM-content writes.',
  scope:'Stop after accepted IV source and branch comparison captures, not full victories. Equal checkpoint means actual stage IV, not identical tick/player pose. Every PNG is bracketed by separately read snapshots. Timing is not performance evidence.',
  channel:options.channel,viewport:{width:1366,height:768},quality:'standard',cases:[],failures:[],pageErrors:[],consoleErrors:[],remoteRequests:[],requestFailures:[]};
const save=()=>writeFileSync(`${output}/report.json`,JSON.stringify(report,null,2));save();
const must=(value:unknown,message:string)=>{if(!value)throw Error(message);};
let browser:any,browserClosed=false;
try{
  browser=await chromium.launch({channel:options.channel,headless:true});report.browserVersion=browser.version();
  for(const choice of ['block','pursue','ignore'] as MigrationChoice[]){
    const record:any={choice,seed:91,status:'running',inputs:[],checkpoints:[],captures:[],events:[],failures:[]};report.cases.push(record);
    const context=await browser.newContext({offline:true,viewport:report.viewport,deviceScaleFactor:1});
    const page:Page=await context.newPage(),held=new Set<string>();let fireHeld=false,lastScan=-10,lastInteract=-10,lastOrgan='';
    const seen=new Map<string,any>();
    const observe=(state:GameState)=>{for(const event of state.events)seen.set(JSON.stringify(event),event);};
    const snap=async()=>{const state=await readState(page);observe(state);return state;};
    const inputLog=(data:unknown)=>record.inputs.push({wallAt:new Date().toISOString(),...data as any});
    const key=async(name:string)=>{inputLog({action:'key-press',key:name});await page.keyboard.press(name);};
    const mouse=async(down:boolean)=>{if(down===fireHeld)return;inputLog({action:down?'mouse-down':'mouse-up',button:'left'});if(down)await page.mouse.down();else await page.mouse.up();fireHeld=down;};
    const move=async(x:number,y:number)=>{const length=Math.hypot(x,y)||1,keys=[Math.abs(x/length)>.383?x>0?'KeyD':'KeyA':'',Math.abs(y/length)>.383?y>0?'KeyS':'KeyW':''].filter(Boolean);
      for(const name of held)if(!keys.includes(name)){inputLog({action:'key-up',key:name});await page.keyboard.up(name);held.delete(name);}
      for(const name of keys)if(!held.has(name)){inputLog({action:'key-down',key:name});await page.keyboard.down(name);held.add(name);}};
    const release=async()=>{await mouse(false);await move(0,0);};
    const aim=async(target:Vec)=>{const projected=await page.evaluate(point=>{const target=window.__viral.toScreen(point),player=window.__viral.toScreen(window.__viral.snapshot().player),dx=target.x-player.x,dy=target.y-player.y;
      const ratio=Math.min(1,dx>0?(innerWidth-24-player.x)/dx:dx<0?(24-player.x)/dx:1,dy>0?(innerHeight-108-player.y)/dy:dy<0?(85-player.y)/dy:1);
      return{x:player.x+dx*Math.max(0,ratio),y:player.y+dy*Math.max(0,ratio)};},target);
      inputLog({action:'mouse-move',worldAim:target,css:projected});await page.mouse.move(projected.x,projected.y);};
    const click=async(selector:string)=>{inputLog({action:'dom-click',selector});await page.locator(selector).click();};
    const closeModal=async()=>{for(let i=0;i<8;i++){const s=await snap();if(s.growth?.draft){await release();await click('[data-action="draft-discard"]');continue;}
      if(await page.locator('[data-action="close-migration-guide"]').isVisible()){await release();await click('[data-action="close-migration-guide"]');continue;}
      must(s.phase==='playing','Unexpected modal/phase '+s.phase);return;}throw Error('Public modal dismissal did not settle.');};
    const checkpoint=async(name:string)=>{const state=await snap(),path=`${output}/${choice}-${name}.json`;writeFileSync(path,JSON.stringify({name,state},null,2));record.checkpoints.push({name,path,sha256:hash(path),tick:state.tick,elapsed:state.elapsed});save();};
    const endpoint=async()=>{await snap();return page.evaluate(()=>{const state=window.__viral.snapshot(),canvas=document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
      const origin=window.__viral.toScreen({x:0,y:0}),axes=window.__viral.toScreen({x:1,y:1}),scale=Math.abs(axes.x-origin.x);
      const targets=state.targets.filter(target=>target.hp>0).map(target=>{const screen=window.__viral.toScreen(target),r=target.radius*scale;return{id:target.id,role:target.role,hp:target.hp,x:target.x,y:target.y,screen,body:{left:screen.x-r*1.4,right:screen.x+r*1.4,top:screen.y-r*2,bottom:screen.y+r*.4}};});
      const dom=['#hp-label','#tissue-label','#infection-label','#crisis-label','#vitality-label','.organ-overview','#tactical-map','.battle-objective','.battle-telemetry','.growth-panel','.message','.dock-wrap'].flatMap(selector=>{const node=document.querySelector<HTMLElement>(selector);if(!node)return[];const b=node.getBoundingClientRect(),style=getComputedStyle(node);
        let visible=b.width>0&&b.height>0;for(let ancestor:HTMLElement|null=node;ancestor;ancestor=ancestor.parentElement){const computed=getComputedStyle(ancestor);if(ancestor.hidden||computed.display==='none'||computed.visibility==='hidden'||computed.visibility==='collapse'||computed.opacity==='0')visible=false;}
        return[{selector,text:node.textContent,visible,opacity:style.opacity,rect:{left:b.left-canvas.left,right:b.right-canvas.left,top:b.top-canvas.top,bottom:b.bottom-canvas.top}}];});
      const hudIntersections=targets.map(target=>({id:target.id,selectors:dom.filter(panel=>panel.visible&&target.body.left<panel.rect.right&&target.body.right>panel.rect.left&&target.body.top<panel.rect.bottom&&target.body.bottom>panel.rect.top).map(panel=>panel.selector)}));
      return{state,targets,dom,hudIntersections,overlayCount:document.querySelectorAll('#overlay-host .overlay').length,projection:{origin,axes,scale,yScale:(axes.y-origin.y)/scale,viewport:{width:innerWidth,height:innerHeight},canvas:{left:canvas.left,top:canvas.top,width:canvas.width,height:canvas.height}},diagnostics:window.__viral.diagnostics()};});};
    const capture=async(name:string,ids:string[])=>{await release();await closeModal();const before=await endpoint(),path=`${output}/${choice}-${name}.png`,startedAt=new Date().toISOString();
      await page.screenshot({path});const finishedAt=new Date().toISOString(),after=await endpoint();observe(before.state);observe(after.state);
      const valid=(point:typeof before)=>{const c=point.state.campaign!,crisis=c.encounters!.crisis;return point.state.phase==='playing'&&point.overlayCount===0&&c.encounters!.stage==='IV'&&crisis.startedAt!==null&&['charging','exhausted'].includes(crisis.status)&&ids.every(id=>point.targets.some(t=>t.id===id&&t.hp>0&&t.body.left>=8&&t.body.right<=1366-8&&t.body.top>=8&&t.body.bottom<=768-75));};
      const item={name,path,sha256:hash(path),startedAt,finishedAt,expectedVisibleTargetIds:ids,before,after,bracketValid:valid(before)&&valid(after),scope:'Actual unedited PNG between two snapshots, not exact image tick; body boxes are conservative planning envelopes, actual pixels still require review.'};
      const raw=`${output}/${choice}-${name}.json`;writeFileSync(raw,JSON.stringify(item,null,2));record.captures.push({name,path,sha256:item.sha256,raw,rawSha256:hash(raw),bracketValid:item.bracketValid,ticks:[before.state.tick,after.state.tick]});save();must(item.bracketValid,'Capture endpoints did not preserve stageIV/live targets/viewport: '+name);};
    const step=async(state:GameState,input:InputFrame,plan:string,scan:boolean)=>{inputLog({action:'planned-input-frame',beforeTick:state.tick,beforeElapsed:state.elapsed,plan,input});
      if(state.tool!==input.tool)await key(`Digit${input.tool}`);await aim(input.aim);await mouse(input.fire);
      if(scan&&state.elapsed-lastScan>3.1){await key('KeyQ');lastScan=state.elapsed;}
      if(input.interact&&state.elapsed-lastInteract>.25){await key('KeyE');lastInteract=state.elapsed;}
      await move(input.moveX,input.moveY);await page.waitForTimeout(85);};
    const go=async(target:Vec,name:string)=>{const deadline=Date.now()+24000;while(Date.now()<deadline){await closeModal();const state=await snap();must(state.phase==='playing','Viewpoint walk ended the case');
      if(Math.hypot(state.player.x-target.x,state.player.y-target.y)<24){await release();return;}const next=waypoint(state,target),length=Math.hypot(next.x-state.player.x,next.y-state.player.y)||1;
      await step(state,{moveX:(next.x-state.player.x)/length,moveY:(next.y-state.player.y)/length,aim:target,tool:1,fire:false,interact:false},name,false);}throw Error('Actual view walk timed out '+name);};
    page.on('pageerror',e=>report.pageErrors.push({choice,message:e.message}));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push({choice,message:m.text()});});
    page.on('request',r=>{if(/^https?:/i.test(r.url()))report.remoteRequests.push({choice,url:r.url()});});page.on('requestfailed',r=>report.requestFailures.push({choice,url:r.url(),failure:r.failure()}));
    try{
      record.url=pathToFileURL(resolve('dist/index.html')).href+'?seed=91';await page.goto(record.url);await click('[data-action="start"]');
      let state=await snap();must(state.seed===91&&state.battle?.encounter?.configId==='campaign-1'&&state.battle.encounter.guideVariant==='guided'&&!state.growth?.preparation?.starterProtocolId,'Fresh formal guided field configuration required');
      record.startIdentity={seed:state.seed,configId:state.battle!.encounter!.configId,guideVariant:state.battle!.encounter!.guideVariant,firstTrait:state.battle!.firstTrait,starterProtocolId:state.growth?.preparation?.starterProtocolId??null};
      await checkpoint('start');let warningSaved=false,decisionSaved=false,nextSaved=false;const deadline=Date.now()+150000;
      while(Date.now()<deadline){await closeModal();state=await snap();if(lastOrgan!==state.battle!.organId){await release();lastOrgan=state.battle!.organId;}
        const c=state.campaign!,m=c.migration;
        if(m.status==='warning'&&!warningSaved){warningSaved=true;record.beforeChoice={tick:state.tick,elapsed:state.elapsed,firstTrait:state.battle!.firstTrait,traits:state.battle!.traits,evolutionDecisions:state.battle!.evolutionDecisions,firstCounter:state.battle!.encounter!.firstCounter};await release();await checkpoint('common-migration-warning');}
        if(m.choice&&!decisionSaved){decisionSaved=true;await release();await checkpoint('accepted-decision');}
        if(c.encounters!.stage==='IV'&&c.encounters!.crisis.startedAt!==null){await release();await checkpoint('accepted-next-stage');nextSaved=true;break;}
        let input=g3Input(state,choice),plan='g3Input ordinary source/counter/route';
        if(['warning','blocking'].includes(m.status)){input={...input,fire:input.tool===3&&input.fire};plan='g3Input route, suppress offensive fire after warning to retain branch sources';}
        if(m.status==='pursuing'){input={...input,interact:false};plan='g3Input carrier attack; no airway shortcut, require actual clear interception';}
        if(m.choice==='ignore'&&m.status==='resolved'&&state.battle!.organId==='heart'){
          const exit=state.battle!.graph.nodes.find(n=>n.kind==='exit')!,next=waypoint(state,exit),d=Math.hypot(next.x-state.player.x,next.y-state.player.y)||1;
          input={moveX:(next.x-state.player.x)/d,moveY:(next.y-state.player.y)/d,aim:exit,tool:1,fire:false,interact:Math.hypot(exit.x-state.player.x,exit.y-state.player.y)<80};plan='Actual ignore rescue trip to accepted lung IV, without clearing showcase sources';
        }else if(m.choice&&m.status==='resolved'){input={...input,fire:false,interact:false};plan='Await accepted IV spawn with all showcase sources alive';}
        await step(state,input,plan,!m.choice&&!['warning','blocking'].includes(m.status));
      }
      must(nextSaved,'Formal IV source was not accepted before deadline');
      const view=choice==='block'?{x:1510,y:970}:{x:1320,y:690};await go(view,'actual next-stage comparison viewpoint');
      await capture('next-stage',choice==='block'?['heart-crisis-source','heart-retained-source']:['lung-crisis-source','lung-source-a']);
      if(choice==='ignore'){await go({x:1840,y:980},'actual extra migrated-source detail viewpoint');await capture('extra-migrated-source',['lung-migrated-source']);}
      await release();state=await snap();const events=[...seen.values()],migrationEvents=events.filter(e=>e.type==='MIGRATION_DECIDED');
      must(migrationEvents.length===1&&migrationEvents[0].data.choice===choice,'Exactly one correct accepted decision required');
      must(state.battle!.encounter!.firstCounter.counterHit&&state.battle!.encounter!.firstCounter.counterHit!.damage>0,'Real accepted base counter required');
      must(['heart:source-a','heart:source-b'].every(id=>state.campaign!.clearedSourceIds.includes(id)),'Normal opening sources were not actually cleared');
      const costs=events.filter(e=>['ORGAN_INTEGRITY_CHANGED','INFECTION_CHANGED'].includes(e.type)&&/migration/.test(String(e.data.reason)));
      if(choice==='block'){must(!state.campaign!.arenas.lung.activated,'Block unexpectedly activated lung');must(costs.some(e=>e.data.reason==='migration-block-pressure'&&Math.abs(e.data.before-e.data.after-4)<1e-6),'Actual block4 integrity receipt missing');must(costs.some(e=>e.data.reason==='migration-retained'&&Math.abs(e.data.after-e.data.before-3)<1e-6),'Actual block3 infection receipt missing');}
      if(choice==='pursue'){must(events.some(e=>e.type==='MIGRATION_INTERCEPTED'&&e.data.by==='clear'),'Pursuit did not clear actual three carriers');must(!state.campaign!.requiredSourceIds.lung.includes('lung-migrated-source'),'Pursuit unexpectedly established an extra source');}
      if(choice==='ignore'){must(costs.some(e=>e.type==='ORGAN_INTEGRITY_CHANGED'&&e.data.reason==='migration-established'&&e.data.organId==='lung'&&Math.abs(e.data.before-e.data.after-10)<1e-6),'Actual ignored10 integrity receipt missing');must(costs.some(e=>e.type==='INFECTION_CHANGED'&&e.data.reason==='migration-established'&&Math.abs(e.data.after-e.data.before-8)<1e-6),'Actual ignored8 infection receipt missing');}
      record.costReceipts=costs;record.final=state;record.traits=state.battle!.traits;record.activeSourcePositions=state.targets.filter(t=>t.hp>0&&t.role==='source').map(t=>({id:t.id,x:t.x,y:t.y,hp:t.hp}));record.status='captured';
    }catch(error){record.status='failed';record.failures.push({message:String(error),stack:error instanceof Error?error.stack:undefined});record.failureState=await snap().catch(()=>undefined);await page.screenshot({path:`${output}/${choice}-failed.png`}).catch(()=>undefined);}
    finally{await release().catch(()=>undefined);record.events=[...seen.values()];writeFileSync(`${output}/${choice}-events.json`,JSON.stringify(record.events,null,2));writeFileSync(`${output}/${choice}-inputs.json`,JSON.stringify(record.inputs,null,2));record.eventsFile={path:`${output}/${choice}-events.json`,sha256:hash(`${output}/${choice}-events.json`)};record.inputsFile={path:`${output}/${choice}-inputs.json`,sha256:hash(`${output}/${choice}-inputs.json`)};delete record.events;delete record.inputs;await context.close();record.contextClosed=true;save();}
  }
  must(report.cases.every((c:any)=>c.status==='captured'),'One or more cases incomplete; preserve attempt without relabelling');
  must(new Set(report.cases.map((c:any)=>JSON.stringify(c.startIdentity))).size===1,'Fresh seed/config/guide/firstTrait/preparation differs across branches');
  report.comparison={sameStartIdentity:true,traitsIdenticalAtCapture:new Set(report.cases.map((c:any)=>JSON.stringify(c.traits))).size===1,
    traitsByChoice:report.cases.map((c:any)=>({choice:c.choice,beforeChoice:c.beforeChoice?.traits,atCapture:c.traits})),
    note:'Adaptive evolution after legal branch inputs may differ. Preserve actual predecision/capture traits and evolution decisions; matching every later trait, tick or pose is not a literal AC-M12-02 gate.'};
  report.technicalChecksPassed=true;report.status='captured-pending-original-image-review';
}catch(error){report.status='failed';report.failures.push({message:String(error),stack:error instanceof Error?error.stack:undefined});}
finally{
  if(browser){try{await browser.close();browserClosed=true;}catch(error){report.failures.push({message:'Browser close failed: '+String(error)});}}
  Object.assign(report,unchanged(frozen));report.browserClosed=browserClosed;report.finishedAt=new Date().toISOString();
  const pass=report.technicalChecksPassed&&browserClosed&&report.sourceUnchanged&&report.bundleUnchanged&&![...report.pageErrors,...report.consoleErrors,...report.remoteRequests,...report.requestFailures,...report.failures].length;
  report.pass=pass;save();writeFileSync(`${output}/execution.json`,JSON.stringify({startedAt:report.startedAt,finishedAt:report.finishedAt,exitCode:pass?0:1,status:report.status,browserClosed,sourceUnchanged:report.sourceUnchanged,bundleUnchanged:report.bundleUnchanged,gameSha256:frozen.gameSha256,scope:'Mechanical capture terminal only. Requirement remains pending actual original-image review; not performance/human/full-victory evidence.'},null,2));
  console.log(JSON.stringify({output,pass,status:report.status,browserClosed,cases:report.cases.map((c:any)=>({choice:c.choice,status:c.status,captures:c.captures.length}))}));process.exitCode=pass?0:1;
}
