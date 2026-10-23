import { envelope, midiToFreq } from './engine';
import type { AudioEngine } from './engine';

/**
 * Musiques composées pour le jeu, jouées par un petit séquenceur (16 pas par mesure).
 * - menu « Nébuleuse » : calme, nappes et arpège lent (la mineur) ;
 * - jeu « Épopée » : épique, ré mineur, accords de puissance, cuivre synthétique, batterie lourde ;
 * - boss « Furie » : intense, mi mineur harmonique, basse en doubles croches, sans nappes.
 * Le passage au thème du boss est rapide (au moment où son bouclier tombe).
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
  /** Nappe (0 = aucune). */
  pad: number;
  /** Accords de puissance plaqués (motif de 16 pas). */
  stabs: string;
  stabGain: number;
  /** Mélodie par mesure. */
  lead: Note[][];
  leadType: OscillatorType | 'brass';
  leadGain: number;
  /** La mélodie commence à ce tour (0 = tout de suite). */
  leadFrom: number;
  kick: string;
  snare: string;
  hat: string;
  /** Roulement de toms à la fin du cycle. */
  toms: boolean;
}

const _ = null;

// Accords.
const Am = [57, 60, 64];
const F = [53, 57, 60];
const C = [48, 52, 55];
const G = [55, 59, 62];
const Dm = [50, 53, 57];
const E = [52, 56, 59];
const Bb = [46, 50, 53];
const A = [45, 49, 52];
const Em = [52, 55, 59];
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
    stabs: '',
    stabGain: 0,
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
    leadFrom: 0,
    kick: '',
    snare: '',
    hat: '',
    toms: false,
  },
  game: {
    bpm: 124,
    chords: [Dm, Bb, F, C, Dm, Bb, C, A],
    bass: [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, 0, 12, 0],
    bassOctave: -24,
    bassType: 'sawtooth',
    arp: [0, _, 2, _, 4, _, 2, _, 0, _, 2, _, 5, _, 4, _],
    arpType: 'square',
    arpGain: 0.014,
    pad: 0,
    stabs: 'x..x..x...x.x...',
    stabGain: 0.05,
    lead: [
      [[0, 74, 4], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 69, 4]],
      [[0, 70, 4], [4, 74, 2], [6, 77, 2], [8, 77, 4], [12, 76, 4]],
      [[0, 72, 4], [4, 77, 4], [8, 81, 6], [14, 79, 2]],
      [[0, 79, 6], [6, 76, 2], [8, 72, 4], [12, 76, 4]],
      [[0, 74, 2], [2, 77, 2], [4, 81, 4], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
      [[0, 77, 4], [4, 74, 4], [8, 70, 4], [12, 74, 4]],
      [[0, 76, 4], [4, 79, 4], [8, 84, 4], [12, 83, 4]],
      [[0, 81, 8], [8, 73, 4], [12, 76, 4]],
    ],
    leadType: 'brass',
    leadGain: 0.06,
    leadFrom: 1,
    kick: 'x...x...x...x.x.',
    snare: '....x.......x...',
    hat: '..x...x...x...x.',
    toms: true,
  },
  boss: {
    bpm: 146,
    chords: [Em, C, D, B, Em, C, D, B],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
    bassOctave: -24,
    bassType: 'sawtooth',
    arp: [0, 2, 4, 2, 0, 2, 4, 5, 0, 2, 4, 2, 5, 4, 2, 1],
    arpType: 'sawtooth',
    arpGain: 0.012,
    pad: 0,
    stabs: 'x.....x.x.....x.',
    stabGain: 0.045,
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
    leadType: 'brass',
    leadGain: 0.055,
    leadFrom: 0,
    kick: 'x.x...x.x.x...x.',
    snare: '....x.......x..x',
    hat: 'xxxxxxxxxxxxxxxx',
    toms: true,
  },
};

const FADE = 1.6;
/** Passage rapide vers le thème du boss (le bouclier tombe). */
const FAST_FADE = 0.5;
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
    const fade = id === 'boss' ? FAST_FADE : FADE;
    for (const p of this.playing) {
      if (p.stopAt === Infinity) {
        p.gain.gain.cancelScheduledValues(now);
        p.gain.gain.setValueAtTime(p.gain.gain.value, now);
        p.gain.gain.linearRampToValueAtTime(0.0001, now + fade);
        p.stopAt = now + fade;
      }
    }
    if (id) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1, now + (id === 'boss' ? 0.08 : fade));
      gain.connect(this.audio.music);
      const p: Playing = { id, theme: THEMES[id], gain, step: 0, next: now + 0.05, stopAt: Infinity };
      this.playing.push(p);
      // Le boss entre avec une cymbale.
      if (id === 'boss') this.crash(gain, now + 0.05);
    }
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 25);
  }

  private tick(): void {
    const ctx = this.audio.ctx;
    if (!ctx || ctx.state !== 'running' || this.audio.muted) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    for (const p of this.playing) {
      const stepDur = 60 / p.theme.bpm / 4;
      // Après une pause (publicité, arrière-plan), on reprend sans rattraper les notes manquées.
      if (p.next < ctx.currentTime - 0.2) p.next = ctx.currentTime + 0.05;
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
    if (s === 0 && bar === 0 && th.toms) this.crash(out, t);
    const b = th.bass[s];
    if (b !== null) this.bass(out, chord[0] + th.bassOctave + b, t, stepDur * (th.bpm > 100 ? 0.9 : 7), th.bassType);
    if (th.stabs[s] === 'x') this.stab(out, chord[0], t, stepDur * 1.6, th.stabGain);
    const a = th.arp[s];
    if (a !== null) {
      const midi = chord[a % 3] + 12 * (1 + Math.floor(a / 3));
      this.tone(out, midi, t, stepDur * (th.bpm > 100 ? 0.8 : 1.8), th.arpType, th.arpGain, false);
    }
    if (cycle >= th.leadFrom) {
      for (const [step, midi, len] of th.lead[bar]) {
        if (step !== s) continue;
        if (th.leadType === 'brass') this.brass(out, midi, t, stepDur * len, th.leadGain);
        else this.tone(out, midi, t, stepDur * len, th.leadType, th.leadGain, true);
      }
    }
    const lastBar = bar === th.chords.length - 1;
    if (th.toms && lastBar && s >= 12) {
      this.tom(out, t, 180 - (s - 12) * 25);
    } else {
      if (th.kick[s] === 'x') this.kick(out, t);
      if (th.snare[s] === 'x') this.snare(out, t);
    }
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

  /** Cuivre synthétique : deux scies désaccordées, filtre qui s'ouvre à l'attaque. */
  private brass(out: AudioNode, midi: number, t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(2800, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(1200, t + Math.max(0.15, dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.setValueAtTime(gain * 0.85, t + Math.max(0.05, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    f.connect(g).connect(out);
    g.connect(this.audio.echo);
    for (const detune of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(midi);
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.2);
    }
  }

  /** Accord de puissance (fondamentale, quinte, octave) court et percutant. */
  private stab(out: AudioNode, root: number, t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    envelope(g, t, gain, 0.004, dur);
    f.connect(g).connect(out);
    for (const n of [root - 12, root - 5, root]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(n);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
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
    envelope(g, t, 0.55, 0.003, 0.24);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private tom(out: AudioNode, t: number, freq: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + 0.18);
    const g = ctx.createGain();
    envelope(g, t, 0.35, 0.003, 0.22);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private crash(out: AudioNode, t: number): void {
    const ctx = this.audio.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.audio.noise;
    n.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 5000;
    const g = ctx.createGain();
    envelope(g, t, 0.12, 0.002, 1.4);
    n.connect(f).connect(g).connect(out);
    n.start(t);
    n.stop(t + 1.5);
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
    envelope(g, t, 0.24, 0.002, 0.18);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.22);
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
