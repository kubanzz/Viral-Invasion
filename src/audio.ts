import type { GameEvent, GameState } from './game/types';
import { PlayerDangerFeedback } from './render/playerDamageFeedback';
import { anchorDangerView, isAnchorAttackDamage } from './game/anchorDanger';
import { BLADE_TECHNIQUES } from './game/bladeTechniques';
import { seraphCue, type SeraphCue } from './render/seraphVfx';

type AudioContextFactory = () => AudioContext | undefined;
const defaultContext: AudioContextFactory = () => typeof AudioContext === 'undefined' ? undefined : new AudioContext();
export const SERAPH_SOUND_BUDGET = { tonesPerUpdate: 8, rememberedEvents: 128, ordinaryGapTicks: 10, windupGapTicks: 12, focusGapTicks: 30, echoGapTicks: 60 } as const;

export class Soundscape {
  enabled = true;
  private context?: AudioContext;
  private lastEvent?: GameEvent;
  private lastTick = -1;
  private run = '';
  private readonly cueTicks = new Map<string, number>();
  private readonly bladeCues = new Set<string>();
  private readonly seraphCues = new Set<string>();
  private seraphToneBudget: number = SERAPH_SOUND_BUDGET.tonesPerUpdate;
  private seraphOrgan = '';
  private readonly activeTones = new Set<{ oscillator: OscillatorNode; cleanup: () => void; group?: 'seraph' }>();
  private readonly dangerFeedback = new PlayerDangerFeedback();
  private nextHeartbeat = 0;
  private lastPhase?: GameState['phase'];
  private thunderHum?: { oscillator: OscillatorNode; gain: GainNode; cleanup: () => void };

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
    if (!this.enabled) this.silence();
    return this.enabled;
  }
  /** Blur/visibility callbacks must stop a sustained voice before rAF is suspended. */
  silence(): void {
    for (const tone of [...this.activeTones]) {
      try { tone.oscillator.stop(this.context?.currentTime ?? 0); } catch { /* Already ended. */ }
      tone.cleanup();
    }
  }
  update(state: GameState) {
    const run = `${state.seed}:${state.growth?.runId ?? 'training'}`;
    if (run !== this.run || state.tick < this.lastTick) {
      this.lastEvent = undefined; this.cueTicks.clear(); this.bladeCues.clear(); this.seraphCues.clear(); this.run = run;
      this.dangerFeedback.reset(); this.nextHeartbeat=state.tick;
    }
    const seraphOrgan = state.battle?.organId ?? '';
    if (seraphOrgan !== this.seraphOrgan || !!state.camp || (state.player?.hp ?? 1) <= 0) {
      for (const tone of [...this.activeTones]) if (tone.group === 'seraph') {
        try { tone.oscillator.stop(this.context?.currentTime ?? 0); } catch { /* Already ended. */ } tone.cleanup();
      }
    }
    this.seraphOrgan = seraphOrgan;
    if(state.phase==='paused'||state.phase==='menu'||state.phase==='result'){
      if(this.lastPhase!==state.phase)for(const tone of [...this.activeTones]){try{tone.oscillator.stop(this.context?.currentTime??0);}catch{/* Already ended. */}tone.cleanup();}
      this.lastPhase=state.phase;
      if(state.phase!=='result'){this.lastEvent=state.events.at(-1);this.lastTick=state.tick;return;}
    }
    this.lastPhase=state.phase;
    this.updateThunderHum(state);
    if (state.phase === 'playing' && anchorDangerView(state).attacked) this.cue('anchor-warning', state.tick, 180, () => {
      this.tone(740, .09, .028, 520); this.tone(740, .09, .028, 520, .14);
    });
    if(state.player){
      const danger=this.dangerFeedback.update(state);
      if(state.phase==='playing'&&danger!=='healthy'&&state.tick>=this.nextHeartbeat){
        this.nextHeartbeat=state.tick+(danger==='critical'?43:69);
        this.tone(83,.12,danger==='critical'?.037:.025,49);
        this.tone(65,.13,danger==='critical'?.029:.018,40,.14);
      }else if(danger==='healthy')this.nextHeartbeat=state.tick;
    }
    const index = this.lastEvent ? state.events.indexOf(this.lastEvent) : -1;
    this.seraphToneBudget = SERAPH_SOUND_BUDGET.tonesPerUpdate;
    const projectileLaunches = new Set(state.events.filter(event => event.type === 'PLAYER_PROJECTILE_LAUNCHED')
      .map(event => `${event.tick}:${event.data.kind === 'primary' ? 1 : event.data.kind === 'cannon' ? 2 : 'sword'}`));
    const milestoneTicks = new Set(state.events.filter(event => event.type !== 'TARGET_CLEARED' && /CLEARED|DESTROYED/.test(event.type)).map(event => event.tick));
    for (const event of state.events.slice(index + 1)) {
      const type = event.type;
      if (type === 'THUNDER_DETONATE') this.cue('thunder-detonate', event.tick, 1, () => {
        this.tone(1320, .08, .019, 310); this.tone(135, .24, .03, 48, .07);
      });
      if (type === 'THUNDER_ROD_PLANTED') this.cue('thunder-rod', event.tick, 1, () => {
        this.tone(240, .12, .019, 710); this.tone(1120, .1, .012, 540, .06);
      });
      if (type === 'THUNDER_DASH_STARTED') this.cue('thunder-step', event.tick, 1, () => {
        this.tone(1480, .15, .026, 180); this.tone(270, .12, .013, 640);
      });
      if (type === 'THUNDER_STORM_COLLAPSE') this.cue('thunder-collapse', event.tick, 1, () => {
        this.tone(110, .22, .027, 440); this.tone(440, .22, .014, 1440);
      });
      if (type.startsWith('LEGION_SERAPH_') && event.tick <= state.tick && !state.camp && (state.player?.hp ?? 1) > 0 && state.phase !== 'result') this.seraphBattleCue(event);
      if (type === 'WEAPON_ENERGY_CHANGED' && event.data.ready === true) this.cue('weapon-ultimate-ready', event.tick, 1, () => {
        this.tone(660, .09, .018, 880); this.tone(990, .15, .018, 1320, .1);
      });
      if (type === 'WEAPON_ULTIMATE_CAST' && event.data.weaponId !== 'redblade') this.cue('weapon-ultimate', event.tick, 1, () => {
        this.tone(180, .25, .035, 480); this.tone(720, .16, .02, 1080, .08);
      });
      // Stage/landmark events, never the 60 Hz movement segments or each collateral target hit.
      if (type.startsWith('BLADE_TRACE_') && event.tick <= state.tick) this.bladeTraceCue(event);
      if (type === 'WEAPON_ULTIMATE_PULSE') this.cue(event.data.final ? 'ultimate-terminal' : 'ultimate-pulse', event.tick, event.data.final ? 1 : 10, () => {
        if (event.data.weaponId === 'thunder' && event.data.final) {
          this.tone(90, .42, .04, 30); this.tone(1520, .12, .025, 160); this.tone(220, .32, .023, 50, .07); return;
        }
        this.tone(event.data.final ? 110 : 320, event.data.final ? .28 : .08, event.data.final ? .032 : .012, event.data.final ? 48 : 160);
      });
      if (type === 'WEAPON_MELEE_SWING' || type === 'WEAPON_MELEE_SWEEP') this.cue('blade-swing', event.tick, 7, () => {
        this.tone(730, .065, .012, 170);
      });
      if (type === 'WEAPON_MELEE_HIT' && Number(event.data.damage) > 0) this.cue('blade-contact', event.tick, 5, () => {
        // The blade has one directional swish and a separate, short contact body.
        // A crowd hit in the same sweep cannot turn into one voice per enemy.
        this.tone(155, .09, .024, 64); this.tone(970, .035, .008, 390);
      });
      if (type === 'WEAPON_CHAIN_HIT') this.cue('thunder-chain', event.tick, 5, () => this.tone(1200, .055, .016, 420));
      if (type === 'ENDLESS_OPENING_EVOLUTION_WARNING') this.cue('opening-evolution-warning', event.tick, 1, () => {
        this.tone(390, .1, .018, 520); this.tone(520, .16, .018, 430, .13);
      });
      if (type === 'ENDLESS_OPENING_VARIANT_BORN') this.cue(`opening-evolution-born:${event.data.wave}`, event.tick, 1, () => {
        this.tone(event.data.trait === 'FISSION' ? 470 : 590, .12, .02, 760);
        if (event.data.elite === true) this.tone(300, .18, .018, 430, .1);
      });
      if (type === 'TOOL_FIRED' && !(event.data.tool === 1 && state.weaponCombat?.loadout.weaponId === 'thunder') && !projectileLaunches.has(`${event.tick}:${event.data.tool}`) && (event.data.tool === 1 || event.data.tool === 2 || event.data.tool === 3)) this.cue(`fire:${event.data.tool}`, event.tick, 4, () => {
        // One short, distinguishable launch cue per accepted action. Impact and
        // successful repair have separate, rate-limited cues below.
        if (event.data.tool === 1) this.tone(820, .06, .022, 390);
        else if (event.data.tool === 2) this.tone(230, .09, .018, 430);
        else if (event.data.tool === 3) this.tone(560, .09, .018, 830);
      });
      if (type === 'PLAYER_PROJECTILE_LAUNCHED' && event.data.kind !== 'sword' && event.data.weaponId !== 'redblade') this.cue(`fire:${event.data.kind === 'primary' ? 1 : 2}`, event.tick, 4, () => {
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
      if (type === 'TARGET_HIT' && Number(event.data.damage ?? 1) > 0 && event.data.weaponId !== 'thunder' && event.data.weaponId !== 'redblade' && event.data.skillId !== 'redblade-ultimate' && event.data.legionId !== 'seraph') {
        // `tool` can be the currently selected tool for autonomous damage.
        // Only explicit basicTool provenance identifies a player's tool hit.
        const data = event.data;
        if (data.cause === 'basic' && data.basicTool === 1)
          this.cue('hit:tool1', event.tick, 4, () => this.tone(620, .045, .022, 330));
        else if (data.cause === 'basic' && data.basicTool === 2)
          this.cue('hit:tool2', event.tick, 4, () => this.tone(340, .075, .022, 180));
        else if (data.cause === 'protocol' && (data.protocolId === 'IMMUNE_BEACON'
          || typeof data.immuneCellId === 'string' && data.immuneCellId))
          this.cue('hit:cell', event.tick, 8, () => this.tone(450, .035, .009, 320));
        else if (data.cause === 'ability')
          this.cue('hit:ability', event.tick, 6, () => this.tone(700, .045, .011, 460));
        else this.cue('hit:other', event.tick, 8, () => this.tone(520, .035, .012, 270));
      }
      if (type === 'TARGET_CLEARED' && !milestoneTicks.has(event.tick)) this.cue('ordinary-clear', event.tick, 12, () => {
        this.tone(300, .065, .009, 110); this.tone(160, .09, .006, 70, .015);
      });
      else if (type !== 'TARGET_CLEARED' && /CLEARED|DESTROYED/.test(type)) this.cue('clear', event.tick, 10, () => { this.tone(660, .13, .032, 990); this.tone(990, .18, .016, 1320); });
      if (/SCAN/.test(type)) this.cue('scan', event.tick, 12, () => this.tone(180, .25, .025, 720));
      if (type === 'ORGAN_INTEGRITY_CHANGED') {
        const before = Number(event.data.before), after = Number(event.data.after);
        if (Number.isFinite(before) && Number.isFinite(after)) {
          if (event.data.reason === 'repair' && after > before) this.cue('repair', event.tick, 12, () => this.tone(580, .18, .025, 800));
          else if (after < before && event.data.reason === 'protocol-pressure') this.cue('protocol-pressure', event.tick, 30, () => this.tone(320, .09, .012, 270));
          else if (after < before && !isAnchorAttackDamage(state, event)) this.cue('organ-damage', event.tick, 20, () => this.tone(250, .14, .025, 130));
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
  /** One sustained voice, owned by actual live connections rather than hit events. */
  private updateThunderHum(state: GameState): void {
    const count = state.phase === 'playing' && (state.player?.hp ?? 0) > 0
      ? state.weaponCombat?.thunder?.channel?.links.length ?? 0 : 0;
    const ctx = this.context;
    if (!count || !this.enabled || !ctx || ctx.state !== 'running') {
      if (this.thunderHum) {
        try { this.thunderHum.oscillator.stop(ctx?.currentTime ?? 0); } catch { /* Already ended. */ }
        this.thunderHum.cleanup();
      }
      return;
    }
    if (!this.thunderHum) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain();
      oscillator.type = 'triangle';
      const active = { oscillator, cleanup: () => {
        if (this.thunderHum?.oscillator !== oscillator) return;
        this.thunderHum = undefined; oscillator.onended = null;
        oscillator.disconnect(); gain.disconnect(); this.activeTones.delete(active);
      } };
      this.thunderHum = { oscillator, gain, cleanup: active.cleanup };
      this.activeTones.add(active); oscillator.onended = active.cleanup;
      oscillator.frequency.setValueAtTime(110 + Math.min(16, count) * 4, ctx.currentTime);
      gain.gain.setValueAtTime(.009 + Math.min(16, count) * .001, ctx.currentTime);
      oscillator.connect(gain).connect(ctx.destination); oscillator.start(ctx.currentTime);
    } else {
      this.thunderHum.oscillator.frequency.setValueAtTime(110 + Math.min(16, count) * 4, ctx.currentTime);
      this.thunderHum.gain.gain.setValueAtTime(.009 + Math.min(16, count) * .001, ctx.currentTime);
    }
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
  /** Short voiced landmarks, never a note for every travelling frame or echo particle. */
  private seraphBattleCue(event: GameEvent): void {
    const cue = seraphCue(event);
    if (!cue || this.seraphCues.has(cue.key)) return;
    this.seraphCues.add(cue.key);
    if (this.seraphCues.size > SERAPH_SOUND_BUDGET.rememberedEvents) this.seraphCues.delete(this.seraphCues.values().next().value!);
    const gap = cue.kind === 'focus' ? SERAPH_SOUND_BUDGET.focusGapTicks : cue.kind === 'echo' ? SERAPH_SOUND_BUDGET.echoGapTicks
      : cue.kind === 'windup' ? SERAPH_SOUND_BUDGET.windupGapTicks : SERAPH_SOUND_BUDGET.ordinaryGapTicks;
    this.cue(`seraph:${cue.kind}:${cue.kind === 'focus' || cue.kind === 'echo' ? 'squad' : cue.role}`, event.tick, gap, () => this.playSeraphCue(cue));
  }
  private playSeraphCue(cue: SeraphCue): void {
    const note = (frequency: number, duration: number, volume: number, end: number, delay = 0) => {
      if (this.seraphToneBudget-- > 0) this.tone(frequency, duration, volume, end, delay, 'seraph');
    };
    if (cue.kind === 'windup') note(cue.role === 'prism' ? 740 : 520, .09, .008, 880);
    if (cue.kind === 'release') {
      if (cue.role === 'commander') { note(1240, .11, .017, 350); note(140, .1, .012, 70); }
      else if (cue.role === 'prism') { note(1500, .12, .011, 1850); note(920, .09, .008, 1380, .035); }
      else note(1100, .075, .013, 460);
    }
    if (cue.kind === 'hit') {
      if (cue.role === 'commander') { note(170, .11, .016, 80); note(1760, .065, .011, 850); }
      else note(cue.role === 'prism' ? 1840 : 1260, .065, .011, cue.role === 'prism' ? 920 : 550);
    }
    if (cue.kind === 'focus') { note(523, .1, .014, 784); note(784, .12, .009, 1046, .07); }
    if (cue.kind === 'echo') { note(660, .14, .012, 1320); note(990, .1, .008, 1485, .08); }
  }
  private bladeTraceCue(event: GameEvent): void {
    const stage = event.type;
    if (!['BLADE_TRACE_STARTED', 'BLADE_TRACE_MARK_CONNECTED', 'BLADE_TRACE_COMMITTED',
      'BLADE_TRACE_RELEASED', 'BLADE_TRACE_IMPACT', 'BLADE_TRACE_FINISHED'].includes(stage)) return;
    const landmark = stage === 'BLADE_TRACE_MARK_CONNECTED' || stage === 'BLADE_TRACE_IMPACT';
    if (landmark && (!Number.isInteger(event.data.mark) || Number(event.data.mark) < 0 || Number(event.data.mark) > 3)) return;
    const key = `${stage}:${String(event.data.castId)}:${landmark ? String(event.data.mark) : ''}`;
    if (this.bladeCues.has(key)) return;
    this.bladeCues.add(key);
    if (this.bladeCues.size > 64) this.bladeCues.delete(this.bladeCues.values().next().value!);
    if (stage === 'BLADE_TRACE_STARTED') this.tone(440, .09, .014, 660);
    // Automatic completion remains readable without playing four synthetic connection clicks at once.
    if (stage === 'BLADE_TRACE_MARK_CONNECTED' && event.data.manual === true) this.tone(970, .045, .012, 1360);
    if (stage === 'BLADE_TRACE_COMMITTED') {
      const eyeOpens = Math.min(.4, BLADE_TECHNIQUES.trace.windup * .64);
      this.tone(120, eyeOpens, .026, 82);
      this.tone(1420, .055, .018, 2200, eyeOpens);
    }
    if (stage === 'BLADE_TRACE_RELEASED') {
      this.tone(1560, .11, .028, 260); this.tone(180, .16, .026, 54);
    }
    if (stage === 'BLADE_TRACE_IMPACT') {
      this.tone(920 + Math.max(0, Math.min(3, Number(event.data.mark) || 0)) * 90, .065, .018, 170);
      this.tone(96, .1, .022, 48);
    }
    if (stage === 'BLADE_TRACE_FINISHED') {
      this.tone(145, .26, .032, 48); this.tone(820, .12, .019, 260, .035);
    }
  }
  /** Use simulation ticks so a paused panel cannot reset or flood a cue's cooldown. */
  private cue(group: string, tick: number, gap: number, play: () => void): void {
    if (tick - (this.cueTicks.get(group) ?? -Infinity) < gap) return;
    this.cueTicks.set(group, tick); play();
  }
  private tone(frequency: number, duration: number, volume: number, end: number, delay = 0, group?: 'seraph') {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const at = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = frequency < 220 || frequency > 900 && duration < .14 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency, at); oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
    gain.gain.setValueAtTime(volume, at); gain.gain.exponentialRampToValueAtTime(.001, at + duration);
    let disconnected = false;
    const active = { oscillator, group, cleanup: () => {
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
