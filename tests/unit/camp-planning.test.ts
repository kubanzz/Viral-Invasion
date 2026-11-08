import {describe,expect,it} from 'vitest';
import {GameSession} from '../../src/game/session';
import {advanceCampScene,prepareCampScene} from '../../src/game/campScene';
import {CAMP_DORMITORY_OFFSETS,CAMP_PLANNED_AREAS,campLayout,isCampPositionLegal,moveWithCampCollision} from '../../src/game/campLayout';
import {INTRO_FACILITY_IDS} from '../../src/game/campProgression';
import {campAreaLabels} from '../../src/render/campVisuals';
import {Camera} from '../../src/render/camera';
import {prepareCampCamera} from '../../src/render/campCamera';
import {campFarmPlots} from '../../src/game/campFarm';
import {campPlanningLabels} from '../../src/render/campPlanningVisuals';

function ready(){const session=new GameSession(71,{mode:'endless',territory:true});session.start();prepareCampScene(session.state,true,'ready',[...INTRO_FACILITY_IDS,'farm','house']);return session.state;}
describe('living garden and honest expansion frontiers',()=>{
  it('allows walking inside the dormitory yard while each authored house stays solid',()=>{
    const state=ready(),layout=campLayout(state),house=layout.facilities.find(f=>f.id==='house')!;
    expect(house.additionalFootprints).toHaveLength(CAMP_DORMITORY_OFFSETS.length);
    for(const body of house.additionalFootprints!){expect(isCampPositionLegal({x:(body.left+body.right)/2,y:(body.top+body.bottom)/2},state.player.radius,layout)).toBe(false);}
    expect(isCampPositionLegal(house.interactionPosition,state.player.radius,layout)).toBe(true);
    expect(isCampPositionLegal({x:house.position.x,y:house.position.y+20},state.player.radius,layout)).toBe(true);
    const farm=layout.facilities.find(f=>f.id==='farm')!;expect(farm.blocksMovement).toBe(false);
    for(const plot of campFarmPlots(state))expect(isCampPositionLegal(plot.interactionPosition,state.player.radius,layout)).toBe(true);
  });
  it.each(CAMP_PLANNED_AREAS.map(a=>[a.id] as const))('walks to the %s entrance but cannot walk through its visible closure',(id)=>{
    const state=ready(),layout=campLayout(state),area=layout.plannedAreas.find(a=>a.id===id)!,origin=layout.origin;
    const route=[{x:85,y:270},{x:85,y:-285},{x:id==='research'?-600:id==='healing'?600:85,y:-285},
      ...(id==='breeding'?[{x:85,y:-720}]:[]),{x:area.entrance.x-origin.x,y:area.entrance.y-origin.y}];
    for(const relative of route){const target={x:origin.x+relative.x,y:origin.y+relative.y};for(let tick=0;tick<1600;tick++){
      const dx=target.x-state.player.x,dy=target.y-state.player.y,gap=Math.hypot(dx,dy);if(gap<1)break;
      advanceCampScene(state,{moveX:dx,moveY:dy,fire:false,aim:target},Math.min(1/60,gap/280));
      expect(isCampPositionLegal(state.player,state.player.radius,layout)).toBe(true);
    }expect(Math.hypot(state.player.x-target.x,state.player.y-target.y)).toBeLessThan(2);}
    const center={x:(area.rect.left+area.rect.right)/2,y:(area.rect.top+area.rect.bottom)/2};
    expect(isCampPositionLegal(center,state.player.radius,layout)).toBe(false);
    const attempted=moveWithCampCollision(state.player,{x:center.x-state.player.x,y:center.y-state.player.y},state.player.radius,layout);
    expect(Math.hypot(attempted.x-center.x,attempted.y-center.y)).toBeGreaterThan(70);
    const label=campAreaLabels(state).find(label=>label.id===`camp-planned:${id}`)!;
    expect(label.lines[0].text).toBe(area.name);expect(label.lines[1].text).toContain('尚未开放');
  });
  it('keeps previews out of the first camp lesson and exposes all three in the full overview',()=>{
    const state=ready();state.camp!.overview=true;
    const labels=campPlanningLabels(state);expect(labels).toHaveLength(3);
    for(const area of campLayout(state).plannedAreas){const label=labels.find(label=>label.id===`camp-planned:${area.id}`)!;
      expect(label.anchor).toEqual({x:(area.rect.left+area.rect.right)/2,y:(area.rect.top+area.rect.bottom)/2});expect(label.offset).toEqual({x:0,y:0});}
    for(const [width,height]of [[1366,768],[667,320]]){
      const camera=new Camera(width,height);prepareCampCamera(camera,state,{snap:true},[]);
      for(const area of campLayout(state).plannedAreas)for(const p of [area.entrance,{x:area.rect.left,y:area.rect.top},{x:area.rect.right,y:area.rect.bottom}]){
        const screen=camera.worldToScreen(p);expect(screen.x).toBeGreaterThan(8);expect(screen.x).toBeLessThan(width-8);expect(screen.y).toBeGreaterThan(50);expect(screen.y).toBeLessThan(height-8);
      }
    }
    state.camp!.prologue='building';state.camp!.introComplete=false;state.camp!.builtFacilities=[];
    expect(campLayout(state).plannedAreas).toEqual([]);expect(campAreaLabels(state)).toEqual([]);
  });
  it('only shows a reserved-region sign when the walking player approaches its own gate',()=>{
    const state=ready(),areas=campLayout(state).plannedAreas;
    expect(campPlanningLabels(state)).toEqual([]);
    for(const area of areas){
      Object.assign(state.player,area.entrance);const labels=campPlanningLabels(state);
      expect(labels.map(label=>label.id)).toEqual([`camp-planned:${area.id}`]);expect(labels[0].anchor).toEqual(area.entrance);
      Object.assign(state.player,{x:area.entrance.x+(area.id==='research'?220:area.id==='healing'?-220:0),y:area.entrance.y+(area.id==='breeding'?220:0)});
      expect(campPlanningLabels(state).some(label=>label.id===`camp-planned:${area.id}`)).toBe(false);
    }
  });
  it('follows a nearby crop at readable scale instead of fitting the whole farm',()=>{
    const state=ready(),plot=campFarmPlots(state)[0];Object.assign(state.player,plot.interactionPosition);
    const camera=new Camera(667,320);prepareCampCamera(camera,state,{snap:true},[]);
    expect(camera.scale).toBeGreaterThanOrEqual(.72);const p=camera.worldToScreen(plot.position);expect(p.x).toBeGreaterThan(50);expect(p.x).toBeLessThan(617);expect(p.y).toBeGreaterThan(76);expect(p.y).toBeLessThan(285);
  });
});
