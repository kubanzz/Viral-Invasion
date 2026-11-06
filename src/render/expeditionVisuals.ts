import { BUILDING_DEFINITIONS, constructionPlacementView, type BlueprintId } from '../game/construction';
import { campStations } from '../game/campScene';
import { HEART_BOSS_BALANCE } from '../game/motherCore';
import { RARITY_NAMES, WEAPONS } from '../game/expedition';
import type { GameState,Vec } from '../game/types';
import type { SceneLabelSink } from './sceneLabels';
const TAU=Math.PI*2;
export function drawExpeditionFacilityFallback(ctx:CanvasRenderingContext2D,state:GameState,kind:string,index=0):void {
  const station=kind==='camp-station'?campStations(state)[index]:undefined;
  const p=station?.position??(kind==='player-construction'?state.territory?.construction?.task:state.expedition?.lootPosition);if(!p)return;
  ctx.save();ctx.translate(p.x,p.y);ctx.scale(1,1/.72);
  if(kind==='boss-loot'){ctx.fillStyle='#e4d2a1';ctx.strokeStyle='#825c7c';ctx.lineWidth=3;ctx.fillRect(-17,-18,34,24);ctx.strokeRect(-17,-18,34,24);}
  else{ctx.fillStyle=kind==='player-construction'?'#91b3a488':'#91b3a4';ctx.strokeStyle='#355d4d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-38,0);ctx.lineTo(-30,-36);ctx.lineTo(0,-65);ctx.lineTo(30,-36);ctx.lineTo(38,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#e7e8c6';ctx.fillRect(-19,-29,38,25);}
  ctx.restore();
}
function ring(ctx:CanvasRenderingContext2D,p:Vec,r:number,color:string,width=2){ctx.beginPath();ctx.arc(p.x,p.y,r,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
export function drawExpeditionSignals(ctx:CanvasRenderingContext2D,state:GameState,labels?:SceneLabelSink,drawCampBodies=true):void{
  const task=state.territory?.construction?.task;
  if(task){ctx.save();ctx.fillStyle='#a9cfa52c';ctx.beginPath();ctx.arc(task.x,task.y,40,0,TAU);ctx.fill();ring(ctx,task,43,'#e5ddae',3);
    ctx.setLineDash([7,6]);ring(ctx,task,70,'#a7ccb1');ctx.setLineDash([]);ctx.strokeStyle='#e9efba';ctx.lineWidth=6;ctx.beginPath();ctx.arc(task.x,task.y,46,-Math.PI/2,-Math.PI/2+TAU*task.seconds/6);ctx.stroke();
    for(const x of [-25,25]){ctx.fillStyle='#6a947d';ctx.fillRect(task.x+x-3,task.y-45,6,46);}
    ctx.restore();const reason={marching:'军团正在赶来',members:'需要两名存活细胞',infected:'夺回地块后继续',command:'军团已改派 · B继续建设',inactive:'施工暂停'};
    if(!task.pauseReason)for(const cell of state.growth?.cells??[])if(cell.beaconId===task.beaconId&&(cell.hp??1)>0&&Math.hypot(cell.x-task.x,cell.y-task.y)<=70){
      const t=(state.elapsed*2+cell.x*.01)%1,p={x:cell.x+(task.x-cell.x)*t,y:cell.y+(task.y-cell.y)*t};ctx.save();ctx.fillStyle='#e4efbe';ctx.beginPath();ctx.arc(p.x,p.y,2+Math.sin(t*Math.PI)*2,0,TAU);ctx.fill();ctx.restore();
    }
    labels?.add({id:task.id,anchor:task,offset:{x:0,y:-75},priority:92,essential:true,lines:[{text:`${BUILDING_DEFINITIONS[task.blueprintId].name} · ${Math.round(task.seconds/6*100)}%`,color:'#e5efc5',size:12},{text:task.pauseReason?reason[task.pauseReason]:'军团施工中',color:'#bcd7c2',size:11}]});}
  const ritual=state.smartViruses?.ritual;
  for(const plan of state.endless?.smartSupport?.plans??[])if(plan.kind==='ritual'&&plan.status==='warning'&&plan.ritualPositions){
    for(const [index,p]of plan.ritualPositions.entries()){ctx.save();ctx.setLineDash([8,5]);ring(ctx,p,index?30:48,'#c38cae',3);ctx.restore();}
    const p=plan.ritualPositions[0];labels?.add({id:`${plan.id}:warning`,anchor:p,offset:{x:0,y:-72},priority:97,essential:true,lines:[{text:'精英祭团降临 · 先击杀三名祭司',color:'#f2d3dd',size:12}]});
  }
  for(const e of ritual?.encounters??[]){const mother=state.targets.find(t=>t.id===e.motherId&&t.hp>0);if(!mother)continue;
    if(!e.shieldBroken){ring(ctx,mother,mother.radius+16,'#dabcdb',4);for(const id of e.priestIds){const p=state.targets.find(t=>t.id===id&&t.hp>0);if(!p)continue;ctx.save();ctx.strokeStyle='#a26d9d77';ctx.lineWidth=4;ctx.setLineDash([6,8]);ctx.beginPath();ctx.moveTo(mother.x,mother.y);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();}}
    if(!e.shieldBroken&&Math.hypot(mother.x-state.player.x,mother.y-state.player.y)<650)labels?.add({id:`${e.id}:order`,anchor:mother,offset:{x:0,y:-90},priority:84,essential:false,lines:[{text:`祭司供膜 ${e.priestIds.filter(id=>state.targets.some(t=>t.id===id&&t.hp>0)).length}/3`,color:'#f0cddd',size:12}]});}
  const core=state.territory?.bossCombat,pulse=core?.pulse;
  if(core?.attack?.kind==='heart-pulse'){const a=core.attack;labels?.add({id:a.id,anchor:a.origin,offset:{x:0,y:-96},priority:100,essential:true,lines:[{text:'噬心脉冲 · 朝缺口闪避',color:'#f4d5ca',size:13}]});ctx.save();ctx.fillStyle='#bd71831c';ctx.beginPath();ctx.moveTo(a.origin.x,a.origin.y);ctx.arc(a.origin.x,a.origin.y,HEART_BOSS_BALANCE.pulseOuter,a.angle+HEART_BOSS_BALANCE.pulseGapHalfAngle,a.angle+TAU-HEART_BOSS_BALANCE.pulseGapHalfAngle);ctx.closePath();ctx.fill();ctx.beginPath();ctx.arc(a.origin.x,a.origin.y,a.range,a.angle+a.halfAngle,a.angle+TAU-a.halfAngle);ctx.strokeStyle='#bc7085';ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle='#b6e4bc';ctx.beginPath();for(const side of [-1,1]){const angle=a.angle+side*a.halfAngle;ctx.moveTo(a.origin.x+Math.cos(angle)*80,a.origin.y+Math.sin(angle)*80);ctx.lineTo(a.origin.x+Math.cos(angle)*a.range,a.origin.y+Math.sin(angle)*a.range);}ctx.stroke();ctx.restore();}
  if(pulse){const t=Math.max(0,Math.min(1,(state.elapsed-pulse.startedAt)/HEART_BOSS_BALANCE.pulseSeconds)),r=HEART_BOSS_BALANCE.pulseInner+(HEART_BOSS_BALANCE.pulseOuter-HEART_BOSS_BALANCE.pulseInner)*t;ctx.save();ctx.strokeStyle='#f4b0b6';ctx.lineWidth=2*HEART_BOSS_BALANCE.pulseThickness;ctx.beginPath();ctx.arc(pulse.attack.origin.x,pulse.attack.origin.y,r,pulse.attack.angle+HEART_BOSS_BALANCE.pulseGapHalfAngle,pulse.attack.angle+TAU-HEART_BOSS_BALANCE.pulseGapHalfAngle);ctx.stroke();ctx.restore();}
  const exp=state.expedition;if(exp?.pendingLoot&&exp.lootPosition&&!state.camp){const p=exp.lootPosition;ctx.save();ctx.strokeStyle=({white:'#e9edce',blue:'#8ccee9',purple:'#c9a1e9',gold:'#f5d16e'})[exp.pendingLoot.rarity];ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x,p.y-85);ctx.stroke();if(drawCampBodies){ctx.fillStyle='#f3e2ba';ctx.fillRect(p.x-17,p.y-18,34,23);ctx.strokeRect(p.x-17,p.y-18,34,23);}ctx.restore();labels?.add({id:'boss-loot',anchor:p,offset:{x:0,y:-98},priority:96,essential:true,lines:[{text:RARITY_NAMES[exp.pendingLoot.rarity]+' · 破损'+WEAPONS[exp.pendingLoot.weaponId].name,color:({white:'#e9edce',blue:'#8ccee9',purple:'#c9a1e9',gold:'#f5d16e'})[exp.pendingLoot.rarity],size:12},{text:exp.lootCollected?'已暂存 · 完成最后净化':'靠近拾取 · 通关带回',color:'#f2dfaa',size:11}]});}
  if(state.camp)for(const station of campStations(state)){const p=station.position,progress=state.camp.introComplete?1:Math.min(1,state.camp.introSeconds/6);if(drawCampBodies){ctx.save();ctx.globalAlpha=.45+.55*progress;ctx.translate(p.x,p.y);ctx.scale(1,1/.72);ctx.fillStyle='#729985';ctx.strokeStyle='#d6e2bd';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-48,0);ctx.lineTo(-36,-45);ctx.lineTo(0,-80);ctx.lineTo(36,-45);ctx.lineTo(48,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle=station.id==='forge'?'#ebcaa1':station.id==='shop'?'#d4e9b7':'#f0edcf';ctx.fillRect(-24,-35,48,30);ctx.fillStyle='#37614f';ctx.font='bold 22px sans-serif';ctx.textAlign='center';ctx.fillText(({warehouse:'▣',forge:'⚒',shop:'+',departure:'➜',summon:'Y'})[station.id],0,-9);ctx.restore();}labels?.add({id:`camp:${station.id}`,anchor:p,offset:{x:0,y:30},priority:78,essential:true,lines:[{text:station.name,color:'#e5e9c7',size:12},{text:progress<1?`营地搭建 ${Math.round(progress*100)}%`:'靠近按E / 上方菜单',color:'#bdd6bd',size:10}]});}
}
export function drawConstructionPreview(ctx:CanvasRenderingContext2D,state:GameState,preview?:{blueprintId:BlueprintId;position:Vec}){if(!preview)return;const valid=constructionPlacementView(state,preview.position,preview.blueprintId).valid;ctx.save();ctx.fillStyle=valid?'#bfe5b333':'#d895a433';ctx.beginPath();ctx.arc(preview.position.x,preview.position.y,40,0,TAU);ctx.fill();ring(ctx,preview.position,40,valid?'#d5f3bd':'#ef98ab',3);ctx.setLineDash([5,5]);ring(ctx,state.player,180,'#d3dfba77');ctx.restore();}

export function drawExpeditionProjectiles(ctx:CanvasRenderingContext2D,state:GameState,labels?:SceneLabelSink):void {
  for(const p of state.smartViruses?.ritual?.projectiles??[]){ctx.save();if(p.phase==='charging'){ring(ctx,p,26,'#f3d1a4',3);ring(ctx,p,34,'#9c4d7d',2);}else{const pulse=1+Math.sin(state.elapsed*18)*.12;ctx.translate(p.x,p.y);ctx.rotate(p.angle);ctx.fillStyle='#47314d';ctx.beginPath();ctx.ellipse(0,0,18*pulse,14*pulse,0,0,TAU);ctx.fill();ctx.strokeStyle='#edc49a';ctx.lineWidth=3;ctx.stroke();ctx.fillStyle='#f5deb2';ctx.beginPath();ctx.arc(5,0,6,0,TAU);ctx.fill();ctx.fillStyle='#805079';ctx.beginPath();ctx.moveTo(-12,-8);ctx.lineTo(-28,0);ctx.lineTo(-12,8);ctx.fill();}
    ctx.restore();labels?.add({id:p.id,anchor:p,offset:{x:0,y:-30},priority:98,essential:p.phase!=='charging',lines:[{text:p.phase==='charging'?'追踪弹充能':'击落追踪弹',color:'#f7dcc0',size:11}]});}
}
