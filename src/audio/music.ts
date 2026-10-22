import { envelope, midiToFreq } from './engine';
import type { AudioEngine } from './engine';

/**
 * Musiques composées pour le jeu, jouées par un petit séquenceur (16 pas par mesure).
 * - menu « Nébuleuse » : calme, nappes et arpège lent (la mineur) ;
 * - jeu « Glisse » : rythmé, basse pulsée, batterie électronique, mélodie un tour sur deux ;
 * - boss « Furie » : intense, basse en doubles croches, caisse claire, mélodie en mi mineur harmonique.
 */
export type ThemeId = 'menu' | 'game' | 'boss';

/** [pas, note MIDI, durée en pas] */
type Note = [number, number, number];

interface Theme {
  bpm: number;
  /** Accords (notes MIDI), un par mesure. */
  chords: number[][];
  /** Basse : notes relatives à la fondamentale de l'accord (en demi-tons) par pas, null = silence. */
  bass: (number | null)[];
  bassOctave: number;
  bassType: OscillatorType;
  /** Arpège : indices dans l'accord (+3 = octave au-dessus) par pas. */
  arp: (number | null)[];
  arpType: OscillatorType;
  arpGain: number;
  pad: number;
  /** Mélodie par mesure. */
  lead: Note[][];
  leadType: OscillatorType;
  leadGain: number;
  /** La mélodie joue un tour sur `leadEvery`. */
  leadEvery: number;
  kick: string;
  snare: string;
  hat: string;
}

const _ = null;

// Accords en la mineur / mi mineur harmonique.
const Am = [57, 60, 64];
const F = [53, 57, 60];
const C = [48, 52, 55];
const G = [55, 59, 62];
const Dm = [50, 53, 57];
const E = [52, 56, 59];
const Em = [52, 55, 59];
const Cb = [48, 52, 55];
const D = [50, 54, 57];
const B = [47, 51, 54];

const THEMES: Record<ThemeId, Theme> = {
  menu: {
    bpm: 72,
    chords: [Am, F, C, G, Am, F, Dm, E],
    bass: [0, _, _, _, _, _, _, _, 7, _, _, _, _, _, _, _],
    bassOctave: -12,
    bassType: 'triangle',
    arp: [0, _, 1, _, 2, _, 4, _, 3, _, 2, _, 1, _, 2, _],
    arpType: 'triangle',
    arpGain: 0.05,
    pad: 0.045,
    lead: [
      [[0, 76, 6], [8, 72, 6]],
      [[0, 77, 6], [8, 72, 6]],
      [[0, 79, 6], [8, 76, 6]],
      [[0, 74, 8], [8, 71, 6]],
      [[0, 72, 4], [4, 76, 4], [8, 81, 8]],
      [[0, 79, 4], [4, 77, 4], [8, 76, 8]],
      [[0, 74, 4], [4, 77, 4], [8, 81, 8]],
      [[0, 80, 8], [8, 76, 8]],
    ],
    leadType: 'sine',
    leadGain: 0.07,
    leadEvery: 1,
    kick: '',
    snare: '',
    hat: '',
  },
  game: {
    bpm: 118,
    chords: [Am, Am, F, G, Am, Am, F, E],
    bass: [0, _, 0, 12, 0, _, 0, 12, 0, _, 0, 12, 0, 7, 0, 12],
    bassOctave: -24,
    bassType: 'sawtooth',
    arp: [0, 1, 2, 4, 2, 1, 0, 1, 2, 4, 5, 4, 2, 1, 2, 4],
    arpType: 'square',
    arpGain: 0.022,
    pad: 0.02,
    lead: [
      [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 69, 4]],
      [[0, 72, 2], [2, 74, 2], [4, 76, 4], [8, 79, 2], [10, 76, 2], [12, 74, 4]],
      [[0, 72, 3], [3, 69, 3], [6, 72, 2], [8, 77, 4], [12, 76, 4]],
      [[0, 74, 2], [2, 71, 2], [4, 67, 4], [8, 71, 2], [10, 74, 2], [12, 79, 4]],
      [[0, 76, 2], [2, 74, 2], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 69, 4]],
      [[0, 81, 4], [4, 79, 2], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 74, 4]],
      [[0, 72, 2], [2, 69, 2], [4, 65, 4], [8, 69, 2], [10, 72, 2], [12, 77, 4]],
      [[0, 76, 4], [4, 74, 2], [6, 71, 2], [8, 68, 4], [12, 64, 4]],
    ],
    leadType: 'square',
    leadGain: 0.045,
    leadEvery: 2,
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
  },
  boss: {
    bpm: 140,
    chords: [Em, Cb, D, B, Em, Cb, D, B],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
    bassOctave: -24,
    bassType: 'sawtooth',
    arp: [0, 2, 4, 2, 0, 2, 4, 5, 0, 2, 4, 2, 5, 4, 2, 1],
    arpType: 'sawtooth',
    arpGain: 0.016,
    pad: 0.025,
    lead: [
      [[0, 76, 2], [2, 79, 2], [4, 83, 4], [8, 81, 2], [10, 79, 2], [12, 78, 4]],
      [[0, 79, 2], [2, 76, 2], [4, 72, 4], [8, 76, 2], [10, 79, 2], [12, 84, 4]],
      [[0, 81, 2], [2, 78, 2], [4, 74, 4], [8, 78, 2], [10, 81, 2], [12, 86, 4]],
      [[0, 83, 4], [4, 78, 2], [6, 75, 2], [8, 71, 4], [12, 75, 4]],
      [[0, 88, 2], [2, 86, 2], [4, 83, 4], [8, 81, 2], [10, 83, 2], [12, 79, 4]],
      [[0, 79, 2], [2, 81, 2], [4, 84, 4], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
      [[0, 78, 2], [2, 81, 2], [4, 86, 4], [8, 84, 2], [10, 81, 2], [12, 78, 4]],
      [[0, 75, 4], [4, 78, 2], [6, 83, 2], [8, 87, 4], [12, 83, 4]],
    ],
    leadType: 'square',
    leadGain: 0.04,
    leadEvery: 1,
    kick: 'x.....x.x.....x.',
    snare: '....x.......x..x',
    hat: 'xxxxxxxxxxxxxxxx',
  },
};

const FADE = 1.6;
const LOOKAHEAD = 0.15;

interface Playing {
  id: ThemeId;
  theme: Theme;
  gain: GainNode;
  step: number;
  next: number;
  /** Instant d'arrêt (fondu terminé), Infinity tant que le thème est actif. */
  stopAt: number;
}

export class Music {
  private playing: Playing[] = [];
  private wanted: ThemeId | null = null;
  private timer: number | null = null;

  constructor(private readonly audio: AudioEngine) {
    audio.onReady(() => {
      if (this.wanted) this.start(this.wanted);
    });
  }

  /** Change de thème avec un fondu enchaîné. */
  play(id: ThemeId | null): void {
    if (this.wanted === id) return;
    this.wanted = id;
    if (!this.audio.ctx) return;
    this.start(id);
  }

  get current(): ThemeId | null {
    return this.wanted;
  }

  private start(id: ThemeId | null): void {
    const ctx = this.audio.ctx!;
    const now = ctx.currentTime;
    for (const p of this.playing) {
      if (p.stopAt === Infinity) {
        p.gain.gain.cancelScheduledValues(now);
        p.gain.gain.setValueAtTime(p.gain.gain.value, now);
        p.gain.gain.linearRampToValueAtTime(0.0001, now + FADE);
        p.stopAt = now + FADE;
      }
    }
    if (id) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1, now + FADE);
      gain.connect(this.audio.music);
      this.playing.push({ id, theme: THEMES[id], gain, step: 0, next: now + 0.05, stopAt: Infinity });
    }
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 25);
  }

  private tick(): void {
    const ctx = this.audio.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (const p of this.playing) {
      const stepDur = 60 / p.theme.bpm / 4;
      while (p.next < horizon && p.next < p.stopAt) {
        this.scheduleStep(p, p.next, stepDur);
        p.next += stepDur;
        p.step++;
      }
    }
    this.playing = this.playing.filter((p) => {
      if (ctx.currentTime < p.stopAt + 0.5) return true;
      p.gain.disconnect();
      return false;
    });
    if (this.playing.length === 0 && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private scheduleStep(p: Playing, t: number, stepDur: number): void {
    const th = p.theme;
    const s = p.step % 16;
    const bar = Math.floor(p.step / 16) % th.chords.length;
    const cycle = Math.floor(p.step / (16 * th.chords.length));
    const chord = th.chords[bar];
    const out = p.gain;

    if (s === 0 && th.pad > 0) this.pad(out, chord, t, stepDur * 16, th.pad);
    const b = th.bass[s];
    if (b !== null) this.bass(out, chord[0] + th.bassOctave + b, t, stepDur * (th.bpm > 100 ? 0.9 : 7), th.bassType);
    const a = th.arp[s];
    if (a !== null) {
      const midi = chord[a % 3] + 12 * (1 + Math.floor(a / 3));
      this.tone(out, midi, t, stepDur * (th.bpm > 100 ? 0.8 : 1.8), th.arpType, th.arpGain, false);
    }
    if (cycle % th.leadEvery === th.leadEvery - 1 || th.leadEvery === 1) {
      for (const [step, midi, len] of th.lead[bar]) {
        if (step === s) this.tone(out, midi, t, stepDur * len, th.leadType, th.leadGain, true);
      }
    }
    if (th.kick[s] === 'x') this.kick(out, t);
    if (th.snare[s] === 'x') this.snare(out, t);
    if (th.hat[s] === 'x') this.hat(out, t, s % 4 === 2 ? 0.05 : 0.03);
  }

  private tone(out: AudioNode, midi: number, t: number, dur: number, type: OscillatorType, gain: number, echo: boolean): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = midiToFreq(midi);
    const g = ctx.createGain();
    envelope(g, t, gain, 0.01, Math.max(0.08, dur));
    o.connect(g).connect(out);
    if (echo) g.connect(this.audio.echo);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private pad(out: AudioNode, chord: number[], t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(gain, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    f.connect(g).connect(out);
    for (const n of chord) {
      for (const detune of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiToFreq(n);
        o.detune.value = detune;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.5);
      }
    }
  }

  private bass(out: AudioNode, midi: number, t: number, dur: number, type: OscillatorType): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = midiToFreq(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + Math.max(0.1, dur));
    const g = ctx.createGain();
    envelope(g, t, 0.16, 0.005, Math.max(0.1, dur));
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  private kick(out: AudioNode, t: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain();
    envelope(g, t, 0.5, 0.003, 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private snare(out: AudioNode, t: number): void {
    const ctx = this.audio.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    envelope(g, t, 0.2, 0.002, 0.16);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.2);
  }

  private hat(out: AudioNode, t: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    envelope(g, t, gain, 0.001, 0.045);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.07);
  }
}
