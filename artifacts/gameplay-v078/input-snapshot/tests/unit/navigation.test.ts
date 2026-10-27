import {describe,it,expect} from 'vitest';
import {GameSession} from '../../src/game/session';
import {navigationTarget} from '../../src/render/navigation';
function fixture(){const game=new GameSession(1,{campaign:true,milestone:'G3'});game.start();for(const target of game.state.targets)target.hp=0;game.state.campaign!.core.status='cleared';game.state.campaign!.migration.choice='pursue';return game.state;}
describe('large arena objective navigation',()=>{
 it('routes to an activated remote organ needing repair instead of a premature retest',()=>{
  const s=fixture();s.campaign!.arenas.lung.activated=true;s.campaign!.arenas.lung.tissue.hp=40;s.campaign!.arenas.lung.targets=[];
  expect(navigationTarget(s)?.point).toEqual(expect.objectContaining({kind:'exit'}));
 });
 it('routes back for a remote unresolved source even with a cleared local core',()=>{
  const s=fixture();s.campaign!.arenas.lung.activated=true;
  expect(navigationTarget(s)?.label).toContain('另一器官');
 });
 it('uses the current terminal once ready even if the cleared mother was elsewhere',()=>{
  const s=fixture();s.campaign!.core.organId='lung';s.battle!.readyToRetest=true;
  expect(navigationTarget(s)).toEqual({point:s.terminal,label:'主动复测 · E'});
 });
 it('prioritizes a local organ emergency before distant objectives',()=>{
  const s=fixture();s.tissue.hp=30;
  expect(navigationTarget(s)?.point).toBe(s.tissue);
 });
});
