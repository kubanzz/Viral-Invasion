import {build} from 'esbuild';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const result=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
import {GameSession} from './src/game/session';
import {BattleDirector} from './src/game/battle';
import {WORLD} from './src/game/types';
const session=new GameSession(13,{campaign:true,milestone:'G1'});session.start();
const target={id:'clamped-unit-fixture',kind:'single' as const,role:'virus' as const,x:WORLD.bounds.right-22,y:230,radius:22,hp:68,maxHp:68,scanned:false,hitUntil:0,traits:[]};
session.state.targets=[target];session.state.battle!.pulse.direction=0;
const before={x:target.x,y:target.y};new BattleDirector(session).pulse();
export const observation={before,after:{x:target.x,y:target.y},distance:Math.hypot(target.x-before.x,target.y-before.y),event:session.state.events.find(e=>e.type==='PULSE_TRIGGERED'),message:session.state.message};
`},bundle:true,write:false,format:'esm',platform:'node'});
const {observation}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
const folder='artifacts/completion-v072/pulse-fixture';mkdirSync(folder,{recursive:true});
writeFileSync(folder+'/before-fix.json',JSON.stringify({method:'Isolated deterministic unit fixture invoking BattleDirector.pulse directly. Deliberate fixture target at world boundary. No live browser or gameplay diagnostics written; not a legal-input victory or player observation.',sourceSha256:createHash('sha256').update(readFileSync('src/game/battle.ts')).digest('hex'),...observation},null,2));
console.log(JSON.stringify(observation));
