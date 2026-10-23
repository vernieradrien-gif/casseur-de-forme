import { envelope, midiToFreq } from './engine';
import type { AudioEngine } from './engine';

export type SfxId =
  | 'shot'
  | 'hit'
  | 'weak'
  | 'blocked'
  | 'kill'
  | 'bossFire'
  | 'shieldDown'
  | 'bossKilled'
  | 'cannonHit'
  | 'cannonExplode'
  | 'gem'
  | 'click'
  | 'levelClear'
  | 'ability'
  | 'shockwave'
  | 'laser'
  | 'lightning'
  | 'achievement';

/** Intervalle minimal entre deux sons identiques (évite la cacophonie). */
const THROTTLE: Partial<Record<SfxId, number>> = {
  shot: 0.07,
  hit: 0.045,
  weak: 0.06,
  blocked: 0.08,
  kill: 0.05,
  bossFire: 0.12,
  cannonHit: 0.1,
};

/** Effets sonores synthétisés à la volée. */
export class Sfx {
  private readonly last = new Map<SfxId, number>();

  constructor(private readonly audio: AudioEngine) {}

  play(id: SfxId, intensity = 1): void {
    const ctx = this.audio.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const gap = THROTTLE[id];
    if (gap !== undefined) {
      if (t - (this.last.get(id) ?? -1) < gap) return;
      this.last.set(id, t);
    }
    switch (id) {
      case 'shot':
        this.sweep('square', 980, 620, t, 0.05, 0.025);
        break;
      case 'hit':
        this.noise(t, 0.03, 0.05, 'highpass', 3500, 3500);
        break;
      case 'weak':
        this.sweep('sine', 1500, 2100, t, 0.08, 0.08);
        break;
      case 'blocked':
        this.sweep('triangle', 600, 400, t, 0.06, 0.07);
        break;
      case 'kill':
        this.noise(t, 0.2, 0.14 * intensity, 'lowpass', 3200, 260);
        this.sweep('sine', 320, 70, t, 0.16, 0.12 * intensity);
        break;
      case 'bossFire':
        this.sweep('sawtooth', 300, 160, t, 0.12, 0.035);
        break;
      case 'shieldDown':
        this.sweep('sine', 1600, 300, t, 0.6, 0.14);
        this.noise(t, 0.6, 0.12, 'highpass', 6000, 1500);
        break;
      case 'bossKilled':
        this.noise(t, 1.3, 0.35, 'lowpass', 4000, 90);
        this.sweep('sine', 140, 28, t, 1.1, 0.45);
        [69, 73, 76, 81].forEach((m, i) => this.note('triangle', m, t + 0.35 + i * 0.09, 0.5, 0.09));
        break;
      case 'cannonHit':
        this.sweep('square', 150, 55, t, 0.22, 0.16);
        this.noise(t, 0.15, 0.12, 'lowpass', 1800, 300);
        break;
      case 'cannonExplode':
        this.noise(t, 1.6 * intensity, 0.4, 'lowpass', 2400, 60);
        this.sweep('sine', 110, 24, t, 1.4 * intensity, 0.5);
        break;
      case 'gem':
        [84, 88, 91, 96].forEach((m, i) => this.note('sine', m, t + i * 0.055, 0.22, 0.1));
        break;
      case 'achievement':
        [76, 81, 84, 88].forEach((m, i) => this.note('triangle', m, t + i * 0.08, 0.35, 0.09));
        break;
      case 'click':
        this.note('sine', 96, t, 0.04, 0.06);
        break;
      case 'levelClear':
        [72, 76, 79, 84].forEach((m, i) => this.note('square', m, t + i * 0.09, 0.25, 0.05));
        break;
      case 'ability':
        this.sweep('sine', 400, 1400, t, 0.3, 0.12);
        break;
      case 'shockwave':
        this.noise(t, 0.8, 0.3, 'lowpass', 5000, 120);
        this.sweep('sine', 90, 30, t, 0.7, 0.4);
        break;
      case 'laser':
        this.sweep('sawtooth', 220, 880, t, 0.75, 0.05);
        break;
      case 'lightning':
        this.noise(t, 0.25, 0.14, 'bandpass', 2600, 1800);
        break;
    }
  }

  private out(): AudioNode {
    return this.audio.sfx;
  }

  private note(type: OscillatorType, midi: number, t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    envelope(g, t, gain, 0.005, dur);
    o.connect(g).connect(this.out());
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private sweep(type: OscillatorType, from: number, to: number, t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    envelope(g, t, gain, 0.004, dur);
    o.connect(g).connect(this.out());
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(t: number, dur: number, gain: number, type: BiquadFilterType, from: number, to: number): void {
    const ctx = this.audio.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.audio.noise;
    n.loop = dur > 0.9;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    envelope(g, t, gain, 0.004, dur);
    n.connect(f).connect(g).connect(this.out());
    n.start(t, Math.random() * 0.3);
    n.stop(t + dur + 0.05);
  }
}
