import type { GameEvent, GameState } from './game/types';
export class Soundscape {
  enabled = true;
  private context?: AudioContext;
  private lastEvent?: GameEvent;
  unlock() { this.context ??= new AudioContext(); void this.context.resume(); }
  toggle() { this.enabled = !this.enabled; return this.enabled; }
  update(state: GameState) {
    const index = this.lastEvent ? state.events.indexOf(this.lastEvent) : -1;
    for (const event of state.events.slice(index + 1)) {
      const type = event.type;
      if (/SHOT|TOOL_USED|TARGET_HIT/.test(type)) this.tone(520, .045, .025, 270);
      if (/CLEARED|DESTROYED/.test(type)) { this.tone(660, .13, .045, 990); this.tone(990, .18, .02, 1320); }
      if (/SCAN/.test(type)) this.tone(180, .25, .025, 720);
      if (/REPAIR|INTEGRITY_CHANGED/.test(type)) this.tone(580, .18, .025, 800);
      if (type === 'PLAYER_HURT') this.tone(210, .2, .035, 90);
      if (type === 'RUN_ENDED') this.tone(440, .65, .04, 880);
    }
    this.lastEvent = state.events.at(-1);
  }
  private tone(frequency: number, duration: number, volume: number, end: number) {
    const ctx = this.context;
    if (!ctx || !this.enabled || ctx.state !== 'running') return;
    const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
    oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(frequency, ctx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(end, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration);
    oscillator.connect(gain).connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + duration);
  }
}
