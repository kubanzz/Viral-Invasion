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

  constructor(private readonly createContext: AudioContextFactory = defaultContext) {}

  unlock() {
    try {
      this.context ??= this.createContext();
      // Audio is optional: unsupported browsers and autoplay refusal never block play.
      void this.context?.resume().catch(() => {});
    } catch { /* AudioContext may be unavailable or disabled by the browser. */ }
  }
  toggle() { this.enabled = !this.enabled; return this.enabled; }
  update(state: GameState) {
    const run = `${state.seed}:${state.growth?.runId ?? 'training'}`;
    if (run !== this.run || state.tick < this.lastTick) {
      this.lastEvent = undefined; this.cueTicks.clear(); this.run = run;
    }
    const index = this.lastEvent ? state.events.indexOf(this.lastEvent) : -1;
    for (const event of state.events.slice(index + 1)) {
      const type = event.type;
      if (/SHOT|TOOL_USED|TARGET_HIT/.test(type)) this.cue('hit', event.tick, 4, () => this.tone(520, .045, .025, 270));
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
      if (type === 'PROTOCOL_EQUIPPED') this.cue('evolution', event.tick, 18, () => {
        this.tone(660, .07, .025, 720);
        this.tone(880, .07, .025, 990, .07);
        this.tone(1100, .12, .025, 1320, .14);
      });
      if (type === 'PLAYER_HURT') this.cue('player-hurt', event.tick, 6, () => this.tone(210, .2, .035, 90));
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
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(at); oscillator.stop(at + duration);
  }
}
