import type { GameEvent, GameState } from './game/types';
import { PlayerDangerFeedback } from './render/playerDamageFeedback';

type AudioContextFactory = () => AudioContext | undefined;
const defaultContext: AudioContextFactory = () => typeof AudioContext === 'undefined' ? undefined : new AudioContext();

export class Soundscape {
  enabled = true;
  private context?: AudioContext;
  private lastEvent?: GameEvent;
  private lastTick = -1;
  private run = '';
  private readonly cueTicks = new Map<string, number>();
  private readonly activeTones = new Set<{ oscillator: OscillatorNode; cleanup: () => void }>();
  private readonly dangerFeedback = new PlayerDangerFeedback();
  private nextHeartbeat = 0;
  private lastPhase?: GameState['phase'];

  constructor(private readonly createContext: AudioContextFactory = defaultContext) {}

  unlock() {
    try {
      this.context ??= this.createContext();
      // Audio is optional: unsupported browsers and autoplay refusal never block play.
      void this.context?.resume().catch(() => {});
    } catch { /* AudioContext may be unavailable or disabled by the browser. */ }
  }
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      // Disconnect immediately, including notes scheduled for the future.
      // Re-enabling must not make an old sound audible again.
      for (const tone of this.activeTones) {
        try { tone.oscillator.stop(this.context?.currentTime ?? 0); } catch { /* Already ended. */ }
        tone.cleanup();
      }
    }
    return this.enabled;
  }
  update(state: GameState) {
    const run = `${state.seed}:${state.growth?.runId ?? 'training'}`;
    if (run !== this.run || state.tick < this.lastTick) {
      this.lastEvent = undefined; this.cueTicks.clear(); this.run = run;
      this.dangerFeedback.reset(); this.nextHeartbeat=state.tick;
    }
    if(state.phase==='paused'||state.phase==='menu'||state.phase==='result'){
      if(this.lastPhase!==state.phase)for(const tone of [...this.activeTones]){try{tone.oscillator.stop(this.context?.currentTime??0);}catch{/* Already ended. */}tone.cleanup();}
      this.lastPhase=state.phase;
      if(state.phase!=='result'){this.lastEvent=state.events.at(-1);this.lastTick=state.tick;return;}
    }
    this.lastPhase=state.phase;
    if(state.player){
      const danger=this.dangerFeedback.update(state);
      if(state.phase==='playing'&&danger!=='healthy'&&state.tick>=this.nextHeartbeat){
        this.nextHeartbeat=state.tick+(danger==='critical'?43:69);
        this.tone(83,.12,danger==='critical'?.037:.025,49);
        this.tone(65,.13,danger==='critical'?.029:.018,40,.14);
      }else if(danger==='healthy')this.nextHeartbeat=state.tick;
    }
    const index = this.lastEvent ? state.events.indexOf(this.lastEvent) : -1;
    const projectileLaunches = new Set(state.events.filter(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED')
      .map(event => `${event.tick}:${event.data.kind === 'primary' ? 1 : event.data.kind === 'cannon' ? 2 : 'sword'}`));
    for (const event of state.events.slice(index + 1)) {
      const type = event.type;
      if (type === 'ENDLESS_OPENING_EVOLUTION_WARNING') this.cue('opening-evolution-warning', event.tick, 1, () => {
        this.tone(390, .1, .018, 520); this.tone(520, .16, .018, 430, .13);
      });
      if (type === 'ENDLESS_OPENING_VARIANT_BORN') this.cue(`opening-evolution-born:${event.data.wave}`, event.tick, 1, () => {
        this.tone(event.data.trait === 'FISSION' ? 470 : 590, .12, .02, 760);
        if (event.data.elite === true) this.tone(300, .18, .018, 430, .1);
      });
      if (type === 'TOOL_FIRED' && !projectileLaunches.has(`${event.tick}:${event.data.tool}`) && (event.data.tool === 1 || event.data.tool === 2 || event.data.tool === 3)) this.cue(`fire:${event.data.tool}`, event.tick, 4, () => {
        // One short, distinguishable launch cue per accepted action. Impact and
        // successful repair have separate, rate-limited cues below.
        if (event.data.tool === 1) this.tone(820, .06, .022, 390);
        else if (event.data.tool === 2) this.tone(230, .09, .018, 430);
        else if (event.data.tool === 3) this.tone(560, .09, .018, 830);
      });
      if (type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.kind !== 'sword') this.cue(`fire:${event.data.kind === 'primary' ? 1 : 2}`, event.tick, 4, () => {
        if (event.data.kind === 'primary') this.tone(1180, .055, .028, 540);
        else { this.tone(210, .16, .027, 520); this.tone(680, .07, .013, 330, .025); }
      });
      if (type === 'PLAYER_PROJECTILE_HIT' && event.data.kind === 'primary')
        this.cue('hit:tool1', event.tick, 4, () => this.tone(620, .045, .022, 330));
      if (type === 'PLAYER_CANNON_EXPLODED') this.cue('cannon-blast', event.tick, 6, () => {
        this.tone(170, .22, .035, 58); this.tone(1040, .1, .019, 360);
      });
      if (type === 'PLAYER_CANNON_AFTERSHOCK') this.cue('cannon-aftershock', event.tick, 6, () => this.tone(380, .14, .018, 110));
      if(type==='TERRITORY_CANNON_FIRED')this.cue('territory-cannon-fire',event.tick,1,()=>{this.tone(125,.22,.045,54);this.tone(710,.09,.025,210,.025);});
      if(type==='TERRITORY_CANNON_EXPLODED')this.cue('territory-cannon-impact',event.tick,1,()=>{this.tone(95,.32,.045,32);this.tone(610,.14,.025,150);});
      if (type === 'PLAYER_CHARGE_STARTED') this.cue('charge-start', event.tick, 1, () => this.tone(340, .2, .014, 720));
      if (type === 'PLAYER_CHARGE_FULL') this.cue('charge-full', event.tick, 1, () => {
        this.tone(880, .09, .021, 1100); this.tone(1320, .13, .016, 1540, .07);
      });
      if (type === 'PLAYER_CHARGE_RELEASED') this.cue('charge-release', event.tick, 1, () => {
        this.tone(1520, .2, .032, 170); this.tone(180, .13, .022, 60, .025);
      });
      if (event.data.id === 'EXERCISE') {
        if (type === 'HOST_EVENT_WARNING') this.cue('exercise-warning', event.tick, 1, () => {
          this.tone(520, .1, .018, 660); this.tone(520, .1, .018, 660, .16);
        });
        if (type === 'HOST_EVENT_STARTED') this.cue('exercise-started', event.tick, 1, () => {
          this.tone(660, .14, .022, 990); this.tone(990, .13, .017, 1220, .12);
        });
        if (type === 'HOST_EVENT_ENDED' || type === 'HOST_EVENT_CANCELLED' && event.data.triggered !== false)
          this.cue('exercise-ended', event.tick, 1, () => this.tone(660, .18, .014, 440));
      }
      if (type === 'TARGET_HIT') {
        // `tool` can be the currently selected tool for autonomous damage.
        // Only explicit basicTool provenance identifies a player's tool hit.
        const data = event.data;
        if (data.cause === 'basic' && data.basicTool === 1)
          this.cue('hit:tool1', event.tick, 4, () => this.tone(620, .045, .022, 330));
        else if (data.cause === 'basic' && data.basicTool === 2)
          this.cue('hit:tool2', event.tick, 4, () => this.tone(340, .075, .022, 180));
        else if (data.cause === 'protocol' && (data.protocolId === 'IMMUNE_BEACON'
          || typeof data.immuneCellId === 'string' && data.immuneCellId))
          this.cue('hit:cell', event.tick, 4, () => this.tone(450, .04, .012, 320));
        else if (data.cause === 'ability')
          this.cue('hit:ability', event.tick, 4, () => this.tone(700, .055, .014, 460));
        else this.cue('hit:other', event.tick, 4, () => this.tone(520, .045, .018, 270));
      }
      if (/CLEARED|DESTROYED/.test(type)) this.cue('clear', event.tick, 10, () => { this.tone(660, .13, .045, 990); this.tone(990, .18, .02, 1320); });
      if (/SCAN/.test(type)) this.cue('scan', event.tick, 12, () => this.tone(180, .25, .025, 720));
      if (type === 'ORGAN_INTEGRITY_CHANGED') {
        const before = Number(event.data.before), after = Number(event.data.after);
        if (Number.isFinite(before) && Number.isFinite(after)) {
          if (event.data.reason === 'repair' && after > before) this.cue('repair', event.tick, 12, () => this.tone(580, .18, .025, 800));
          else if (after < before && event.data.reason === 'protocol-pressure') this.cue('protocol-pressure', event.tick, 30, () => this.tone(320, .09, .012, 270));
          else if (after < before) this.cue('organ-damage', event.tick, 20, () => this.tone(250, .14, .025, 130));
        }
      }
      if (type === 'PROTOCOL_EQUIPPED' || type === 'COMBAT_UPGRADE_COMMITTED') this.cue('evolution', event.tick, 18, () => {
        this.tone(660, .07, .025, 720);
        this.tone(880, .07, .025, 990, .07);
        this.tone(1100, .12, .025, 1320, .14);
      });
      if (type === 'COMBAT_ABILITY_TRIGGERED' && event.data.ability === 'dash') this.cue('blade', event.tick, 10, () => {
        this.tone(1350, .14, .035, 180);
        if (Number(event.data.hits) > 0) this.tone(110, .1, .03, 60, .025);
      });
      if (type === 'TRACTION_STARTED') this.cue('traction', event.tick, 12, () => this.tone(160, .25, .025, 420));
      if (type === 'TRACTION_RESOLVED') this.cue('traction-resolved', event.tick, 12, () => this.tone(310, .12, .022, 105));
      if (type === 'VIRAL_CAPSULE_RELEASED') this.cue('capsule', event.tick, 18, () => {
        this.tone(350, .08, .025, 490); this.tone(350, .08, .025, 490, .1);
      });
      if (type === 'PLAYER_HURT' && Number(event.data.damage ?? 1)>0) {
        if(event.data.reason==='infection')this.cue('player-infection-tick',event.tick,6,()=>this.tone(155,.12,.021,105));
        else this.cue('player-hurt', event.tick, 6, () => this.tone(210, .2, .035, 90));
      }
      if (type === 'PLAYER_DASHED') this.cue('dash', event.tick, 10, () => this.tone(480, .12, .018, 180));
      if (type === 'RUN_ENDED') this.cue('result', event.tick, 60, () => this.tone(440, .65, .04, 880));
    }
    this.lastEvent = state.events.at(-1);
    this.lastTick = state.tick;
  }
  /** Presentation-only cues; called once per reveal transition, with the sound setting respected. */
  summonCue(phase: 'charge' | 'rarity' | 'item' | 'complete', rarity: 'white' | 'blue' | 'purple' | 'gold'): void {
    if (phase === 'charge') { this.tone(180,.7,.018,520); this.tone(360,.45,.01,720,.18); }
    if (phase === 'rarity') {
      const root = rarity === 'gold' ? 523 : rarity === 'purple' ? 440 : rarity === 'blue' ? 392 : 330;
      this.tone(root,.45,.022,root*2); this.tone(root*1.5,.35,.016,root*2,.08);
      if (rarity === 'gold') this.tone(root*2,.7,.017,root*2.5,.16);
    }
    if (phase === 'item') { this.tone(660,.22,.018,990); this.tone(990,.4,.012,1320,.07); }
  }
  /** Use simulation ticks so a paused panel cannot reset or flood a cue's cooldown. */
  private cue(group: string, tick: number, gap: number, play: () => void): void {
    if (tick - (this.cueTicks.get(group) ?? -Infinity) < gap) return;
    this.cueTicks.set(group, tick); play();
  }
  private tone(frequency: number, duration: number, volume: number, end: number, delay = 0) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const at = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    let disconnected = false;
    const active = { oscillator, cleanup: () => {
      if (disconnected) return;
      disconnected = true;
      oscillator.onended = null;
      oscillator.disconnect(); gain.disconnect();
      this.activeTones.delete(active);
    } };
    this.activeTones.add(active);
    oscillator.onended = active.cleanup;
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration);
  }
}
