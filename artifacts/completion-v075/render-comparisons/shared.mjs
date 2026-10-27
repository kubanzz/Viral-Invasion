import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
export const BASE='artifacts/completion-v075/render-comparisons';
export const GAME='971313934fc806144ceb3c2dc89eda76ce142ea1aac2bdee54ff0a52003ce342';
export const PLAN='artifacts/completion-v075/danger-coverage-plan.json';
export const SCRIPT='scripts/check-render-invariance.mjs';
export const BASE_COVERAGE=['ordinary-windup','pending-split','active-source-crisis','scan','heal','ordinary-exposure'];
export const CORE_COVERAGE=['core-crystal-sweep','core-fission-burst','core-corrosion','core-brood','core-recovery'];
export const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
export const jsonHash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
export const read=p=>JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));
export const label=p=>relative(resolve('.'),resolve(p)).replaceAll('\\','/');
export const write=(p,value)=>writeFileSync(p,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
export const pointer=(o,p)=>p===''?o:p.split('/').slice(1).reduce((a,k)=>a?.[k.replaceAll('~1','/').replaceAll('~0','~')],o);
export function newChild(path){const inside=relative(resolve(BASE),resolve(path));if(!inside||inside.startsWith('..')||isAbsolute(inside)||existsSync(path))throw Error('Use a new child of '+BASE+'; refuse overwrite: '+path);return resolve(path);}
export function stateFacts(s){
 if(s?.game!=='viral-invasion'||!Number.isSafeInteger(s.tick)||!Number.isFinite(s.elapsed)||!s.player||!s.tissue||!Array.isArray(s.events)||!Array.isArray(s.targets))throw Error('Expected a full actual GameState');
 const live=s.targets.filter(t=>t.hp>0),ordinary=live.filter(t=>!['source','core'].includes(t.role)&&t.attackAt>s.elapsed),split=s.targets.filter(t=>t.splitAt>s.elapsed&&t.splitPositions?.length),exposed=live.filter(t=>t.role!=='core'&&t.exposedUntil>s.elapsed);
 const effects=s.effects.filter(e=>e.born<=s.elapsed&&e.born+e.duration>s.elapsed),crisis=s.campaign?.encounters?.crisis,core=s.campaign?.core?.combat;
 const coverage=[];if(ordinary.length)coverage.push('ordinary-windup');if(split.length)coverage.push('pending-split');if(exposed.length)coverage.push('ordinary-exposure');
 if(crisis?.status==='charging'&&crisis.organId===s.battle?.organId&&crisis.startedAt!==null&&live.some(t=>t.id===crisis.sourceId))coverage.push('active-source-crisis');
 for(const kind of ['scan','heal'])if(effects.some(e=>e.kind===kind))coverage.push(kind);
 if(core&&live.some(t=>t.id===core.coreId)){
  if(core.attack&&core.attack.resolveAt>s.elapsed&&['crystal-sweep','fission-burst','corrosion','brood'].includes(core.attack.kind))coverage.push('core-'+core.attack.kind);
  if(core.phase==='recovery'&&core.exposedUntil>s.elapsed)coverage.push('core-recovery');
 }
 return{tick:s.tick,elapsed:s.elapsed,seed:s.seed,phase:s.phase,organ:s.battle?.organId,alive:live.length,coverage,ordinary:ordinary.map(t=>({id:t.id,attackAt:t.attackAt,attackAim:t.attackAim,attackRadius:t.attackRadius})),pendingSplit:split.map(t=>({id:t.id,hp:t.hp,splitAt:t.splitAt,splitPositions:t.splitPositions})),ordinaryExposed:exposed.map(t=>({id:t.id,exposedUntil:t.exposedUntil})),effects:effects.map(e=>({id:e.id,kind:e.kind,born:e.born,duration:e.duration,from:e.from,to:e.to,radius:e.radius})),crisis,core};
}
