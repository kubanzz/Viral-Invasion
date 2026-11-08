import { describe, expect, it } from 'vitest';
import { CAMP_PROFILE_STORAGE_KEY, CAMP_PROFILE_SCHEMA_VERSION, CampProfileStore, emptyCampProfile, parseCampProfile } from '../../src/meta/campProfile';
import { INTRO_FACILITY_IDS } from '../../src/game/campProgression';
import { FARM_BALANCE, legionDeployment, type CampMissionProgress } from '../../src/game/legionCatalog';
import { emptyMissionHaul, type MissionOutcome } from '../../src/game/microfront';
import { campOverlay } from '../../src/ui/campHud';
import { campSummonMarkup, summonPrizeName } from '../../src/ui/campSummonHud';
import { GameSession } from '../../src/game/session';
import { advanceCampScene, campStationDistance, prepareCampScene } from '../../src/game/campScene';
import { campLayout, isCampPositionLegal } from '../../src/game/campLayout';

class Storage {
  values = new Map<string,string>(); blocked = false;
  getItem(key:string) { return this.values.get(key) ?? null; }
  setItem(key:string,value:string) { if(this.blocked) throw Error('quota'); this.values.set(key,value); }
  removeItem(key:string) {this.values.delete(key);}
}
function ready(overrides: Partial<ReturnType<typeof emptyCampProfile>> = {}) {
  const storage = new Storage(), data = {...emptyCampProfile(), campUnlocked:true, campIntroSeen:true, legacyMigrationChecked:true, prologue:'ready' as const,
    builtFacilities:[...INTRO_FACILITY_IDS,'farm','house'] as ReturnType<typeof emptyCampProfile>['builtFacilities'], ...overrides};
  storage.setItem(CAMP_PROFILE_STORAGE_KEY, JSON.stringify(data));
  return {storage,store:new CampProfileStore(storage)};
}
function expedition(store:CampProfileStore,id:string,outcome:MissionOutcome='success',progress?:CampMissionProgress) {
  store.beginExpedition(id,7,'membrane');
  return store.settleMission(id,outcome,emptyMissionHaul(),undefined,progress);
}
describe('permanent legions and independent summon pool',()=>{
  it('migrates schema 4 once, preserving wallet, weapon pity and all owned equipment',()=>{
    const {storage,store}=ready({coins:1234,pity:17}); const legacy:any={...store.data,schemaVersion:4};
    for(const key of ['ownedLegions','legionLoadout','legionPity','legionDrawSeed','food','farmPlots','starterFoodGrantVersion']) delete legacy[key];
    storage.setItem(CAMP_PROFILE_STORAGE_KEY,JSON.stringify(legacy));
    const restored=new CampProfileStore(storage);
    expect(restored.data).toMatchObject({schemaVersion:CAMP_PROFILE_SCHEMA_VERSION,coins:1234,pity:17,food:6,ownedLegions:['phagocyte'],legionLoadout:['phagocyte','phagocyte']});
    expedition(restored,'paid'); expect(restored.data.food).toBe(4);
    expect(new CampProfileStore(storage).data.food).toBe(4);
  });
  it('guarantees the legendary legion on the fiftieth legion draw without changing equipment pity',()=>{
    const {store,storage}=ready({legionPity:49,pity:31});
    const result=store.drawLegions(1,'gold');
    expect(result.receipt).toMatchObject({pool:'legion',pityBefore:49,pityAfter:0,results:[{kind:'legion',legionId:'seraph',rarity:'gold'}]});
    expect(store.data.pity).toBe(31);expect(store.data.ownedLegions).toContain('seraph');
    const balance=store.data.coins;
    expect(store.drawLegions(1,'gold').code).toBe('duplicate');expect(store.data.coins).toBe(balance);
    expect(new CampProfileStore(storage).drawLegions(1,'gold').receipt).toEqual(result.receipt);
  });
  it('converts a repeated legendary into materials and retains it through failed persistence',()=>{
    const {store,storage}=ready({ownedLegions:['phagocyte','seraph'],legionPity:49,materials:3}); storage.blocked=true;
    const result=store.drawLegions(1,'duplicate');
    expect(result).toMatchObject({accepted:true,persisted:false});expect(store.data.materials).toBe(53);
    expect(result.receipt?.results[0]).toMatchObject({duplicateMaterials:50});
    store.drawLegions(1,'duplicate');expect(store.data.materials).toBe(53);
    storage.blocked=false;store.save();expect(new CampProfileStore(storage).data.ownedLegions).toEqual(['phagocyte','seraph']);
  });
  it('freezes food and roster for a departure and forbids two legendary slots',()=>{
    const {store}=ready({ownedLegions:['phagocyte','seraph'],food:1});
    expect(store.assignLegion(0,'seraph').accepted).toBe(true);expect(store.assignLegion(1,'seraph').code).toBe('unique-legion');
    const departure=store.beginExpedition('snapshot',7,'membrane');
    expect(departure.legions).toEqual([{slot:0,legionId:'seraph',fed:true},{slot:1,legionId:'phagocyte',fed:false}]);
    store.assignLegion(0,null);expect(store.beginExpedition('snapshot',7,'membrane').legions).toEqual(departure.legions);
    expect(store.data.food).toBe(1);
  });
  it('rejects corrupted new fields without overwriting saved bytes',()=>{
    const {store}=ready(), data=store.data;
    expect(parseCampProfile({...data,food:-1})).toBeNull();
    expect(parseCampProfile({...data,legionLoadout:['seraph','seraph']})).toBeNull();
    expect(parseCampProfile({...data,farmPlots:[{planted:false,growth:1},{planted:false,growth:0},{planted:false,growth:0}]})).toBeNull();
  });
});
describe('two-expedition crop and supply cycle',()=>{
  it('supports free expansion after the original five facilities are ready',()=>{
    const {store,storage}=ready({builtFacilities:[...INTRO_FACILITY_IDS]});
    const balance=store.data.coins;
    expect(store.beginBuild('farm').accepted).toBe(true);expect(store.data.prologue).toBe('ready');
    expect(parseCampProfile(store.data)?.activeConstruction).toBe('farm');
    const restored=new CampProfileStore(storage);expect(restored.completeBuild('farm').accepted).toBe(true);
    expect(restored.beginBuild('house').accepted).toBe(true);expect(restored.completeBuild('house').accepted).toBe(true);
    expect(restored.data.builtFacilities).toEqual([...INTRO_FACILITY_IDS,'farm','house']);expect(restored.data.coins).toBe(balance);
  });
  it('advances once and charges per supplied squad only on an effective settlement',()=>{
    const {store}=ready();for(let i=0;i<3;i++) expect(store.plantCrop(i).accepted).toBe(true);
    expedition(store,'quick','withdrawn',{combatSeconds:59,kills:20});
    expect(store.data.food).toBe(6);expect(store.data.farmPlots.map(p=>p.growth)).toEqual([0,0,0]);
    const first=expedition(store,'played','failure',{combatSeconds:60,kills:5});
    expect(first.receipt?.campCycle).toEqual({effective:true,foodConsumed:2,cropsAdvanced:3});expect(store.data.food).toBe(4);
    expect(store.settleMission('played','failure',emptyMissionHaul(),undefined,{combatSeconds:60,kills:5}).code).toBe('duplicate');
    expect(store.data.food).toBe(4);expedition(store,'won');
    expect(store.data.farmPlots.map(p=>p.growth)).toEqual([2,2,2]);
    for(let i=0;i<3;i++) expect(store.harvestCrop(i).accepted).toBe(true);
    expect(store.data.food).toBe(8);expect(store.harvestCrop(0).accepted).toBe(false);expect(store.data.farmPlots.every(p=>!p.planted)).toBe(true);
  });
  it('keeps free troops deployable at zero food and permits recovery without a gacha draw',()=>{
    const {store}=ready({food:0}); for(let i=0;i<3;i++)store.plantCrop(i);
    expect(legionDeployment(store.data.legionLoadout,0).every(unit=>!unit.fed)).toBe(true);
    expedition(store,'hungry1');expedition(store,'hungry2');expect(store.data.food).toBe(0);
    store.harvestCrop(0);expect(store.data.food).toBe(FARM_BALANCE.harvest);
    expect(store.data.ownedLegions).toEqual(['phagocyte']);expect(store.data.legionLoadout).toEqual(['phagocyte','phagocyte']);
    expect(store.beginExpedition('fed',7,'membrane').legions?.every(unit=>unit.fed)).toBe(true);
  });
  it('does not complete crops or spend rations on reload of an unfinished battle',()=>{
    const {store,storage}=ready();store.plantCrop(0);store.beginExpedition('interrupted',7,'membrane');
    const restored=new CampProfileStore(storage);expect(restored.data.food).toBe(6);expect(restored.data.farmPlots[0].growth).toBe(0);
    expect(restored.data.activeExpedition).toBeUndefined();
  });
  it('renders independent pool rules, three crop controls and hungry quarters',()=>{
    const {store}=ready({food:0});
    const farm=campOverlay(store.load(),'farm');expect(farm.match(/data-farm-plot=/g)).toHaveLength(3);expect(farm).toContain('返回田间');
    expect(campOverlay(store.load(),'house')).toContain('可虚弱出征');
    expect(campSummonMarkup(store.load(),undefined,'legion')).toContain('军团接引十次');
    expect(summonPrizeName({kind:'legion',rarity:'gold',quantity:1,legionId:'seraph',duplicateMaterials:50})).toContain('重复转50生质');
  });
  it('connects both northern life buildings to the spawn without crossing a wall',()=>{
    const game=new GameSession(71,{campaign:true,milestone:'G3',mode:'endless',territory:true});game.start();
    prepareCampScene(game.state,true,'ready',[...INTRO_FACILITY_IDS,'farm','house']);
    const layout=campLayout(game.state), origin=layout.origin;
    for(const id of ['farm','house'] as const) {
      game.state.player.x=layout.spawn.x;game.state.player.y=layout.spawn.y;
      const site=layout.facilities.find(s=>s.id===id)!;
      for(const point of [{x:85,y:270},{x:85,y:-285},{x:site.interactionPosition.x-origin.x,y:-285},{x:site.interactionPosition.x-origin.x,y:site.interactionPosition.y-origin.y}]) {
        const target={x:origin.x+point.x,y:origin.y+point.y};
        for(let step=0;step<900;step++) {
          const dx=target.x-game.state.player.x,dy=target.y-game.state.player.y,gap=Math.hypot(dx,dy);if(gap<1)break;
          advanceCampScene(game.state,{moveX:dx,moveY:dy,aim:target,fire:false},Math.min(1/60,gap/280));
          expect(isCampPositionLegal(game.state.player,game.state.player.radius,layout)).toBe(true);
        }
        expect(Math.hypot(target.x-game.state.player.x,target.y-game.state.player.y)).toBeLessThan(2);
      }
      expect(campStationDistance(game.state.player,site)).toBeLessThan(64);
    }
  });
});
