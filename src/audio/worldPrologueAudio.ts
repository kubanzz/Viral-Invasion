/** Short, locally synthesized score. No network, speech engine or audio download. */
type PrologueShot = 'body' | 'lung' | 'heart' | 'orders' | 'transit' | 'arrival';
type ContextFactory = () => AudioContext | undefined;
interface Voice { source: AudioScheduledSourceNode; nodes: AudioNode[] }

export class PrologueAudio {
  private context?: AudioContext;
  private enabled = true;
  private failed = false;
  private voices = new Set<Voice>();
  private noise?: AudioBuffer;
  private shot?: PrologueShot;
  private nextBeat = 0;
  private nextBattle = 0;
  private destroyed = false;

  constructor(private readonly factory: ContextFactory = () => {
    const Constructor = globalThis.AudioContext;
    return typeof Constructor === 'function' ? new Constructor() : undefined;
  }) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) { this.pause(); return; }
    if (this.destroyed || this.failed) return;
    try {
      this.context ??= this.factory();
      void this.context?.resume().catch(() => {});
    } catch { this.failed = true; }
  }

  update(seconds: number, shot: PrologueShot): void {
    if (!this.enabled || this.destroyed || !Number.isFinite(seconds) || !this.context || this.context.state !== 'running') return;
    try {
      if (shot !== this.shot) {
        this.shot = shot;
        if (shot === 'body') this.chord([110, 164.81, 220], 3.8, .018);
        if (shot === 'lung') { this.chord([116.54, 174.61, 233.08], 3.2, .018); this.rush(.65, .055, 430); }
        if (shot === 'heart') { this.chord([103.83, 155.56, 207.65], 3.2, .023); this.tone(68, .65, .08, 28); this.rush(.8, .07, 260); }
        if (shot === 'orders') {
          this.tone(880, .08, .035, 880); this.tone(1320, .12, .025, 1320, .14);
          this.chord([146.83, 220, 293.66], 3.8, .017);
        }
        if (shot === 'transit') { this.rush(2.3, .06, 600); this.chord([164.81, 246.94, 329.63], 4.4, .018); }
        if (shot === 'arrival') {
          this.chord([196, 246.94, 293.66, 392], 3.5, .022);
          this.tone(783.99, 1.5, .021, 783.99); this.tone(987.77, 1.4, .016, 987.77, .22);
        }
      }
      if (seconds >= this.nextBeat && shot !== 'arrival') {
        this.nextBeat = seconds + (shot === 'heart' ? .72 : shot === 'transit' ? 1.05 : 1.18);
        this.tone(61, .19, .055, 35);
        this.tone(47, .17, .033, 29, .18);
      }
      if ((shot === 'lung' || shot === 'heart') && seconds >= this.nextBattle) {
        this.nextBattle = seconds + .42;
        const pitch = 480 + Math.sin(seconds * 7.3) * 170;
        this.tone(pitch, .09, .018, pitch * .32);
        this.rush(.13, .026, 1000 + Math.cos(seconds * 3.1) * 600);
        if (Math.floor(seconds * 2.3) % 3 === 0) this.tone(94, .21, .033, 43, .11);
      }
    } catch {
      // An unavailable or interrupted audio device cannot interrupt the film.
      this.failed = true; this.pause();
    }
  }

  pause(): void {
    for (const voice of [...this.voices]) {
      try { voice.source.stop(); } catch { /* The source may already have ended. */ }
      this.clean(voice);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true; this.pause();
    void this.context?.close().catch(() => {});
    this.noise = undefined;
  }

  private clean(voice: Voice): void {
    if (!this.voices.delete(voice)) return;
    for (const node of voice.nodes) { try { node.disconnect(); } catch { /* Optional audio. */ } }
  }

  private tone(frequency: number, duration: number, volume: number, endFrequency = frequency, delay = 0): void {
    const context = this.context!;
    if (this.voices.size >= 28) return;
    const start = context.currentTime + delay, source = context.createOscillator(), gain = context.createGain();
    source.type = 'sine'; source.frequency.setValueAtTime(frequency, start);
    source.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), start + Math.min(.045, duration * .2));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(gain); gain.connect(context.destination);
    const voice: Voice = { source, nodes: [source, gain] };
    this.voices.add(voice); source.onended = () => this.clean(voice);
    source.start(start); source.stop(start + duration + .03);
  }

  private chord(notes: readonly number[], duration: number, volume: number): void {
    notes.forEach((frequency, index) => this.tone(frequency, duration, volume, frequency, index * .045));
  }

  private rush(duration: number, volume: number, cutoff: number): void {
    const context = this.context!;
    if (this.voices.size >= 28) return;
    if (!this.noise) {
      this.noise = context.createBuffer(1, Math.round(context.sampleRate * .5), context.sampleRate);
      const data = this.noise.getChannelData(0);
      // The same quiet noise bed is reused throughout the sequence.
      let seed = 130026;
      for (let index = 0; index < data.length; index++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        data[index] = seed / 0x80000000 - 1;
      }
    }
    const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
    const start = context.currentTime;
    source.buffer = this.noise; source.loop = true;
    filter.type = 'lowpass'; filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * .35), start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(.08, duration * .3));
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(context.destination);
    const voice: Voice = { source, nodes: [source, filter, gain] };
    this.voices.add(voice); source.onended = () => this.clean(voice);
    source.start(); source.stop(start + duration + .03);
  }
}
