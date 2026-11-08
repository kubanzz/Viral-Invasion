import { describe, expect, it } from 'vitest';
import { PrologueAudio } from '../../src/audio/worldPrologueAudio';

function audioDevice() {
  const nodes: { stopped: boolean; disconnected: boolean }[] = [];
  const lifecycle = { closes: 0, resumes: 0 };
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => {
    const record = { stopped: false, disconnected: false }; nodes.push(record);
    return { connect() {}, disconnect() { record.disconnected = true; },
      start() {}, stop() { record.stopped = true; }, onended: null,
      frequency: parameter(), gain: parameter(), buffer: null, loop: false, type: '' };
  };
  const context = { state: 'running', currentTime: 1, sampleRate: 48000, destination: {},
    resume: () => { lifecycle.resumes++; return Promise.resolve(); },
    close: () => { lifecycle.closes++; return Promise.resolve(); },
    createOscillator: node, createGain: node, createBiquadFilter: node, createBufferSource: node,
    createBuffer: (_channels: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  } as unknown as AudioContext;
  return { context, nodes, lifecycle };
}

describe('opening score lifecycle', () => {
  it('keeps playback usable without an audio device, including a constructor refusal', () => {
    for (const factory of [() => undefined, () => { throw new Error('audio unavailable'); }]) {
      const score = new PrologueAudio(factory);
      expect(() => { score.setEnabled(true); score.update(12, 'heart'); score.pause(); score.destroy(); }).not.toThrow();
    }
  });

  it('silences all pending voices immediately on mute and can resume on the next cue', () => {
    const device = audioDevice(), score = new PrologueAudio(() => device.context);
    score.setEnabled(true); score.update(0, 'body');
    expect(device.nodes.length).toBeGreaterThan(0);
    score.setEnabled(false);
    expect(device.nodes.every(node => node.disconnected)).toBe(true);
    const mutedCount = device.nodes.length;
    score.update(8, 'lung'); expect(device.nodes).toHaveLength(mutedCount);
    score.setEnabled(true); score.update(12, 'heart');
    expect(device.nodes.length).toBeGreaterThan(mutedCount);
    score.pause(); expect(device.nodes.every(node => node.disconnected)).toBe(true);
    score.destroy();
  });

  it('closes its own context exactly once and never restarts after leaving the opening', () => {
    const device = audioDevice(), score = new PrologueAudio(() => device.context);
    score.setEnabled(true); score.update(21, 'transit');
    score.destroy(); score.destroy(); const count = device.nodes.length;
    score.setEnabled(true); score.update(30, 'arrival');
    expect(device.lifecycle.closes).toBe(1);
    expect(device.nodes).toHaveLength(count);
    expect(device.nodes.every(node => node.disconnected)).toBe(true);
  });
});
