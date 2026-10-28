import { GameSession } from '../../../src/game/session';
import { g3Input } from '../../../tests/helpers/g3Driver';
import { distance, normalized, wallHit } from '../../../src/actors/collision';
import { activeWorld } from '../../../src/game/types';
import { TRACTION_BALANCE } from '../../../src/game/traction';
const counters = {CARAPACE:['PULSE_BREAK'],FISSION:['PURIFY_CHAIN','IMMUNE_BEACON'],MIMIC:['EXPOSE_TRACE','IMMUNE_BEACON']};
for (const firstTrait of ['CARAPACE','FISSION','MIMIC'] as const) {
 const game=new GameSession(91,{campaign:true,milestone:'G3',counterGuide:'adaptive',firstTrait});game.start();
 let tool2Pressed=0, tool2HeldFrames=0, previous=false; const counts:Record<string,number>={};
 for(let action=0;action<300*60 && game.state.phase!=='result';action++){
  const s=game.state, draft=s.growth!.draft;
  if(!draft){const f=g3Input(s,'pursue');if(f.tool===2 && f.fire) {const gap=distance(s.player,f.aim), dir=normalized(f.aim.x-s.player.x,f.aim.y-s.player.y), wall=wallHit(s.player,dir,gap,activeWorld(s)); if(gap>TRACTION_BALANCE.range || (wall!==null&&wall<gap-1)) f.tool=1; else if(s.tick % 12 !== 0) f.fire=false;}const down=f.tool===2&&!!f.fire;if(down){tool2HeldFrames++;if(!previous)tool2Pressed++;}previous=down;game.step(f);for(const e of game.state.events.filter(e=>e.tick===game.state.tick&&(e.type==='TOOL_FIRED'||e.type==='TOOL_REJECTED')&&e.data.tool===2)){const k=e.type+':'+(e.data.reason??'accepted');counts[k]=(counts[k]??0)+1;}continue;}
  const known=[...new Set([firstTrait,...s.battle!.traits,...s.battle!.warning?[s.battle!.warning.trait]:[]])];const excluded=[...new Set(known.flatMap(t=>counters[t]))];
  const option=draft.options.find(c=>!excluded.includes(c.protocolId));if(!option){game.discardDraft(draft.id);continue;}
  const intent={runId:s.growth!.runId,draftId:draft.id,optionId:option.id};const result=game.chooseDraft(intent);
  if(result.kind==='replace-required'){const i=s.growth!.equipped.findIndex(slot=>excluded.includes(slot.id)), index=i>=0?i:0;game.chooseDraft({...intent,slotIndex:index,expectedPreviousProtocolId:s.growth!.equipped[index].id});}
 }
 const s=game.snapshot();console.log(JSON.stringify({firstTrait, result:s.result,elapsed:s.elapsed,player:s.player.hp,organ:s.battle!.organId,core:s.campaign!.core.status,stage:s.campaign!.encounters.stage,tool2HeldFrames,tool2Pressed, counts}));
}



