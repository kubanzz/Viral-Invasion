import type { GameEvent, GameState } from './game/types';

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
    }
    const index = this.lastEvent ? state.events.indexOf(this.lastEvent) : -1;
    for (const event of state.events.slice(index + 1)) {
      const type = event.type;
      if (type === 'TOOL_FIRED' && (event.data.tool === 1 || event.data.tool === 2 || event.data.tool === 3)) this.cue(`fire:${event.data.tool}`, event.tick, 4, () => {
        // One short, distinguishable launch cue per accepted action. Impact and
        // successful repair have separate, rate-limited cues below.
        if (event.data.tool === 1) this.tone(820, .06, .022, 390);
        else if (event.data.tool === 2) this.tone(230, .09, .018, 430);
        else if (event.data.tool === 3) this.tone(560, .09, .018, 830);
      });
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
      if (type === 'PLAYER_HURT') this.cue('player-hurt', event.tick, 6, () => this.tone(210, .2, .035, 90));
      if (type === 'PLAYER_DASHED') this.cue('dash', event.tick, 10, () => this.tone(480, .12, .018, 180));
      if (type === 'RUN_ENDED') this.cue('result', event.tick, 60, () => this.tone(440, .65, .04, 880));
    }
    this.lastEvent = state.events.at(-1);
    this.lastTick = state.tick;
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
