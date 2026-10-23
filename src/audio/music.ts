import { envelope, midiToFreq } from './engine';
import type { AudioEngine } from './engine';

/**
 * Musiques composées pour le jeu, jouées par un petit séquenceur (16 pas par mesure).
 * - menu « Nébuleuse » : calme, nappes et arpège lent (la mineur) ;
 * - pour chaque monde, un thème de vagues et un thème de boss qui lui sont propres (5 + 5) ;
 *   le thème du boss démarre quand son bouclier tombe.
 * Registre volontairement grave : mélodies entre sol 2 et do 4, basse présente, aigus filtrés.
 * Chaque thème alterne deux mélodies (A et B), avec une intro, des passages allégés et des roulements.
 */
export type ThemeId = 'menu' | `wave${number}` | `boss${number}`;

/** [pas, note MIDI, durée en pas] */
type Note = [number, number, number];
type LeadType = 'sine' | 'brass' | 'soft' | 'pluck' | 'saw';

interface Theme {
  bpm: number;
  /** Accords (notes MIDI), un par mesure. */
  chords: number[][];
  /** Basse : notes relatives à la fondamentale de l'accord (en demi-tons) par pas, null = silence. */
  bass: (number | null)[];
  /** Octave de la basse : la fondamentale est ramenée entre do 2 et si 2, plus ce décalage. */
  bassShift: number;
  bassType: OscillatorType;
  bassGain: number;
  /** Sous-basse (sinus une octave plus bas) : 0 = aucune. */
  sub: number;
  /** Arpège : indices dans l'accord (+3 = octave au-dessus) par pas. */
  arp: (number | null)[];
  arpType: OscillatorType;
  arpGain: number;
  /** Décalage de l'arpège (demi-tons) : 0 pour les thèmes graves, +12 pour le menu. */
  arpOctave: number;
  /** Nappe (0 = aucune). */
  pad: number;
  /** Accords de puissance plaqués (motif de 16 pas). */
  stabs: string;
  stabGain: number;
  /** Mélodies A et B (8 mesures chacune) ; B est jouée un tour sur deux. */
  lead: Note[][];
  leadB?: Note[][];
  leadType: LeadType;
  leadGain: number;
  /** La mélodie commence à ce tour (0 = tout de suite). */
  leadFrom: number;
  kick: string;
  snare: string;
  hat: string;
  hatGain: number;
  /** Roulement de toms à la fin du cycle. */
  toms: boolean;
  /** Un tour sur quatre, la première moitié est allégée (sans batterie). */
  breakdown: boolean;
}

const _ = null;

// Accords (triades).
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
const Cm = [48, 51, 55];
const Ab = [44, 48, 51];
const Eb = [51, 55, 58];
const Fm = [53, 56, 60];
const Gm = [55, 58, 62];
const Fsm = [54, 57, 61];
const Csh = [49, 53, 56];
const Bm = [47, 50, 54];

// Gammes (demi-tons depuis la tonique).
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];

/** Hasard à graine (mulberry32) : les mélodies composées sont toujours les mêmes. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rythmes de mélodie sur une mesure (x = attaque). */
const RHYTHMS = [
  'x...x.x.x...x...',
  'x.x...x.x.x.x...',
  'x...x...x.x.x.x.',
  'x..x..x.x...x...',
  'x.....x.x.x.....',
  'x...x.xx..x.x...',
  'x.x.x...x...x.x.',
  'x..x..x...x.x...',
];
/** Fins de phrase (mesures 4 et 8). */
const CADENCES = ['x.......x.......', 'x...x...x.......', 'x.x.x...x.......'];

/**
 * Compose une mélodie de 8 mesures qui suit les accords : notes de l'accord sur les temps forts,
 * mouvements par petits intervalles entre deux, motif rythmique de 2 mesures répété, fins de phrase longues.
 */
function compose(seed: number, chords: number[][], tonic: number, scale: number[], lo: number, hi: number): Note[][] {
  const r = seeded(seed);
  const pitches: number[] = [];
  for (let m = lo; m <= hi; m++) if (scale.includes((((m - tonic) % 12) + 12) % 12)) pitches.push(m);
  const motif = [RHYTHMS[Math.floor(r() * RHYTHMS.length)], RHYTHMS[Math.floor(r() * RHYTHMS.length)]];
  let prev = pitches[Math.floor(pitches.length / 2)];
  const bars: Note[][] = [];
  for (let bar = 0; bar < chords.length; bar++) {
    const end = bar % 4 === 3;
    const rhythm = end ? CADENCES[Math.floor(r() * CADENCES.length)] : motif[bar % 2];
    const onsets: number[] = [];
    for (let i = 0; i < 16; i++) if (rhythm[i] === 'x') onsets.push(i);
    const chordPcs = chords[bar].map((n) => n % 12);
    const notes: Note[] = [];
    onsets.forEach((step, k) => {
      const strong = step % 4 === 0;
      const pool = strong ? pitches.filter((p) => chordPcs.includes(p % 12)) : pitches;
      // Préfère les petits intervalles, évite de répéter trop souvent la même note.
      let best = pool[0];
      let bestScore = Infinity;
      for (const p of pool) {
        const d = Math.abs(p - prev);
        const score = (d === 0 ? 3 : d) + r() * 3.5 + (d > 7 ? 6 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }
      const next = onsets[k + 1] ?? 16;
      const len = Math.max(1, Math.min(end && k === onsets.length - 1 ? 8 : 6, next - step));
      notes.push([step, best, len]);
      prev = best;
    });
    bars.push(notes);
  }
  return bars;
}

interface Recipe {
  bpm: number;
  chords: number[][];
  tonic: number;
  scale: number[];
  /** Graines des mélodies A et B, et tessiture. */
  seeds: [number, number];
  range: [number, number];
  rest: Omit<Theme, 'bpm' | 'chords' | 'lead' | 'leadB'>;
}

function theme(rc: Recipe): Theme {
  return {
    bpm: rc.bpm,
    chords: rc.chords,
    lead: compose(rc.seeds[0], rc.chords, rc.tonic, rc.scale, rc.range[0], rc.range[1]),
    leadB: compose(rc.seeds[1], rc.chords, rc.tonic, rc.scale, rc.range[0] + 2, rc.range[1] + 3),
    ...rc.rest,
  };
}

const QUIET = { stabs: '', stabGain: 0, pad: 0, arpOctave: 0 };

/** Thèmes de vagues, un par monde : Nébuleuse, Astéroïdes, Supernova, Trou noir, Tempête ionique. */
const WAVES: Theme[] = [
  theme({
    bpm: 112,
    chords: [Am, F, C, G, Am, F, G, E],
    tonic: 57,
    scale: DORIAN,
    seeds: [11, 12],
    range: [55, 71],
    rest: {
      ...QUIET,
      pad: 0.02,
      bass: [0, _, _, 0, _, _, 0, _, 0, _, _, 0, _, _, 7, _],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.17,
      sub: 0.12,
      arp: [0, _, _, 1, _, _, 2, _, 4, _, _, 2, _, _, 1, _],
      arpType: 'triangle',
      arpGain: 0.022,
      leadType: 'soft',
      leadGain: 0.085,
      leadFrom: 1,
      kick: 'x.....x.x...x...',
      snare: '....x.......x...',
      hat: '..x...x...x...x.',
      hatGain: 0.022,
      toms: false,
      breakdown: true,
    },
  }),
  theme({
    bpm: 120,
    chords: [Em, C, G, D, Em, C, D, B],
    tonic: 52,
    scale: MINOR,
    seeds: [21, 22],
    range: [55, 71],
    rest: {
      ...QUIET,
      stabs: 'x.......x.......',
      stabGain: 0.03,
      bass: [0, _, 0, _, 12, _, 0, _, 0, _, 0, _, 12, _, 7, _],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.18,
      sub: 0.1,
      arp: [0, _, 2, _, 1, _, 2, _, 0, _, 2, _, 1, _, 3, _],
      arpType: 'square',
      arpGain: 0.012,
      leadType: 'pluck',
      leadGain: 0.075,
      leadFrom: 1,
      kick: 'x...x...x...x...',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      hatGain: 0.018,
      toms: true,
      breakdown: true,
    },
  }),
  theme({
    bpm: 124,
    chords: [Dm, Bb, F, C, Dm, Bb, C, A],
    tonic: 50,
    scale: MINOR,
    seeds: [31, 32],
    range: [55, 72],
    rest: {
      ...QUIET,
      stabs: 'x..x..x...x.x...',
      stabGain: 0.04,
      bass: [0, _, 12, _, 0, _, 12, _, 0, _, 12, _, 0, 0, 12, 0],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.17,
      sub: 0.1,
      arp: [0, _, 2, _, 4, _, 2, _, 0, _, 2, _, 5, _, 4, _],
      arpType: 'square',
      arpGain: 0.01,
      leadType: 'brass',
      leadGain: 0.065,
      leadFrom: 1,
      kick: 'x...x...x...x.x.',
      snare: '....x.......x...',
      hat: '..x...x...x...x.',
      hatGain: 0.02,
      toms: true,
      breakdown: true,
    },
  }),
  theme({
    bpm: 100,
    chords: [Cm, Ab, Eb, Bb, Cm, Ab, Bb, G],
    tonic: 48,
    scale: MINOR,
    seeds: [41, 42],
    range: [53, 68],
    rest: {
      ...QUIET,
      pad: 0.025,
      bass: [0, _, _, _, _, _, _, 0, 0, _, _, _, 7, _, _, _],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.2,
      sub: 0.16,
      arp: [0, _, _, _, 2, _, _, _, 1, _, _, _, 2, _, _, _],
      arpType: 'triangle',
      arpGain: 0.02,
      leadType: 'saw',
      leadGain: 0.06,
      leadFrom: 1,
      kick: 'x.......x.x.....',
      snare: '........x.......',
      hat: '..x...x...x...x.',
      hatGain: 0.016,
      toms: true,
      breakdown: true,
    },
  }),
  theme({
    bpm: 132,
    chords: [Fsm, D, A, E, Fsm, D, E, Csh],
    tonic: 54,
    scale: MINOR,
    seeds: [51, 52],
    range: [54, 70],
    rest: {
      ...QUIET,
      stabs: '..x...x...x...x.',
      stabGain: 0.025,
      bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
      bassShift: 0,
      bassType: 'square',
      bassGain: 0.13,
      sub: 0.1,
      arp: [0, 1, 2, 4, 2, 1, 0, 1, 2, 4, 5, 4, 2, 1, 2, 4],
      arpType: 'sawtooth',
      arpGain: 0.009,
      leadType: 'pluck',
      leadGain: 0.07,
      leadFrom: 1,
      kick: 'x...x...x...x...',
      snare: '....x.......x..x',
      hat: '.x.x.x.x.x.x.x.x',
      hatGain: 0.016,
      toms: true,
      breakdown: true,
    },
  }),
];

/** Thèmes de boss, un par monde (plus rapides, plus denses). */
const BOSSES: Theme[] = [
  theme({
    bpm: 136,
    chords: [Am, Bb, Am, G, F, G, Am, E],
    tonic: 57,
    scale: PHRYGIAN,
    seeds: [111, 112],
    range: [57, 74],
    rest: {
      ...QUIET,
      stabs: 'x.....x.x.....x.',
      stabGain: 0.045,
      bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.17,
      sub: 0.1,
      arp: [0, 2, 4, 2, 0, 2, 4, 5, 0, 2, 4, 2, 5, 4, 2, 1],
      arpType: 'sawtooth',
      arpGain: 0.008,
      leadType: 'brass',
      leadGain: 0.06,
      leadFrom: 0,
      kick: 'x.x...x.x.x...x.',
      snare: '....x.......x..x',
      hat: 'x.x.x.x.x.x.x.x.',
      hatGain: 0.018,
      toms: true,
      breakdown: false,
    },
  }),
  theme({
    bpm: 146,
    chords: [Em, C, Am, B, Em, C, D, B],
    tonic: 52,
    scale: HARMONIC,
    seeds: [121, 122],
    range: [55, 72],
    rest: {
      ...QUIET,
      stabs: 'x.....x.x.....x.',
      stabGain: 0.045,
      bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.17,
      sub: 0.1,
      arp: [0, 2, 4, 2, 0, 2, 4, 5, 0, 2, 4, 2, 5, 4, 2, 1],
      arpType: 'square',
      arpGain: 0.008,
      leadType: 'saw',
      leadGain: 0.055,
      leadFrom: 0,
      kick: 'x.x...x.x.x...x.',
      snare: '....x.......x...',
      hat: 'xxxxxxxxxxxxxxxx',
      hatGain: 0.012,
      toms: true,
      breakdown: false,
    },
  }),
  theme({
    bpm: 150,
    chords: [Dm, Bb, Gm, A, Dm, Bb, C, A],
    tonic: 50,
    scale: HARMONIC,
    seeds: [131, 132],
    range: [55, 72],
    rest: {
      ...QUIET,
      stabs: 'x..x..x...x..x..',
      stabGain: 0.045,
      bass: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 7, 0],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.17,
      sub: 0.1,
      arp: [0, _, 2, _, 4, _, 2, _, 0, _, 2, _, 5, _, 4, _],
      arpType: 'square',
      arpGain: 0.01,
      leadType: 'brass',
      leadGain: 0.06,
      leadFrom: 0,
      kick: 'x...x.x.x...x.x.',
      snare: '....x.......x...',
      hat: 'x.x.x.x.x.x.x.x.',
      hatGain: 0.018,
      toms: true,
      breakdown: false,
    },
  }),
  theme({
    bpm: 138,
    chords: [Cm, Ab, Fm, G, Cm, Ab, Bb, G],
    tonic: 48,
    scale: HARMONIC,
    seeds: [141, 142],
    range: [53, 70],
    rest: {
      ...QUIET,
      stabs: 'x.......x..x....',
      stabGain: 0.05,
      bass: [0, _, 0, 0, _, 0, 12, _, 0, _, 0, 0, _, 7, 12, _],
      bassShift: 0,
      bassType: 'sawtooth',
      bassGain: 0.2,
      sub: 0.15,
      arp: [0, _, _, 2, _, _, 4, _, 0, _, _, 2, _, _, 5, _],
      arpType: 'triangle',
      arpGain: 0.016,
      leadType: 'saw',
      leadGain: 0.06,
      leadFrom: 0,
      kick: 'x.......x.x.x...',
      snare: '....x.......x...',
      hat: '..x...x...x...x.',
      hatGain: 0.018,
      toms: true,
      breakdown: false,
    },
  }),
  theme({
    bpm: 156,
    chords: [Fsm, D, Bm, Csh, Fsm, D, E, Csh],
    tonic: 54,
    scale: HARMONIC,
    seeds: [151, 152],
    range: [54, 71],
    rest: {
      ...QUIET,
      stabs: 'x.x...x.x.x...x.',
      stabGain: 0.04,
      bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 7],
      bassShift: 0,
      bassType: 'square',
      bassGain: 0.13,
      sub: 0.1,
      arp: [0, 1, 2, 4, 2, 1, 0, 1, 2, 4, 5, 4, 2, 1, 2, 4],
      arpType: 'sawtooth',
      arpGain: 0.008,
      leadType: 'pluck',
      leadGain: 0.07,
      leadFrom: 0,
      kick: 'x.x.x.x.x.x.x.x.',
      snare: '....x.......x...',
      hat: '.x.x.x.x.x.x.x.x',
      hatGain: 0.014,
      toms: true,
      breakdown: false,
    },
  }),
];

/** Thème du menu (inchangé). */
const MENU: Theme = {
  bpm: 72,
  chords: [Am, F, C, G, Am, F, Dm, E],
  bass: [0, _, _, _, _, _, _, _, 7, _, _, _, _, _, _, _],
  bassShift: 0,
  bassType: 'triangle',
  bassGain: 0.16,
  sub: 0,
  arp: [0, _, 1, _, 2, _, 4, _, 3, _, 2, _, 1, _, 2, _],
  arpType: 'triangle',
  arpGain: 0.05,
  arpOctave: 12,
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
  hatGain: 0,
  toms: false,
  breakdown: false,
};

/** Thème correspondant à un identifiant (les mondes du mode infini reprennent les thèmes dans l'ordre). */
export function themeFor(id: ThemeId): Theme {
  if (id === 'menu') return MENU;
  const n = Number(id.slice(4)) || 0;
  const list = id.startsWith('boss') ? BOSSES : WAVES;
  return list[((n % list.length) + list.length) % list.length];
}

/** Nombre de thèmes par catégorie (vagues, boss). */
export const THEME_COUNT = { waves: WAVES.length, bosses: BOSSES.length };

const FADE = 1.6;
/** Passage rapide vers le thème du boss (le bouclier tombe). */
const FAST_FADE = 0.5;
/** Notes préparées à l'avance (s) : la musique ne se coupe pas si une image prend du retard. */
const LOOKAHEAD = 0.5;

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
    const boss = id?.startsWith('boss') ?? false;
    const fade = boss ? FAST_FADE : FADE;
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
      gain.gain.linearRampToValueAtTime(1, now + (boss ? 0.08 : fade));
      gain.connect(this.audio.music);
      const p: Playing = { id, theme: themeFor(id), gain, step: 0, next: now + 0.05, stopAt: Infinity };
      this.playing.push(p);
      // Le boss entre avec une cymbale.
      if (boss) this.crash(gain, now + 0.05);
    }
    if (this.timer === null) this.timer = window.setInterval(() => this.tick(), 60);
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
    // Arrangement : intro sans caisse claire, un tour sur quatre la première moitié sans batterie.
    const intro = th.leadFrom > 0 && cycle === 0;
    const light = th.breakdown && cycle % 4 === 3 && bar < 4;

    if (s === 0 && th.pad > 0) this.pad(out, chord, t, stepDur * 16, light ? th.pad * 1.6 : th.pad);
    if (s === 0 && bar === 0 && th.toms && cycle > 0) this.crash(out, t);
    const b = th.bass[s];
    const bassRoot = 36 + (chord[0] % 12) + th.bassShift;
    if (b !== null && !(light && s % 8 !== 0)) {
      const dur = light ? stepDur * 7 : stepDur * (th.bpm > 100 ? 0.9 : 7);
      this.bass(out, bassRoot + b, t, dur, th.bassType, th.bassGain);
      if (th.sub > 0 && b === 0) this.sub(out, bassRoot - 12, t, dur, th.sub);
    }
    if (th.stabs[s] === 'x' && !light) this.stab(out, chord[0], t, stepDur * 1.6, th.stabGain);
    const a = th.arp[s];
    if (a !== null) {
      const midi = chord[a % 3] + 12 * Math.floor(a / 3) + th.arpOctave;
      this.tone(out, midi, t, stepDur * (th.bpm > 100 ? 0.8 : 1.8), th.arpType, th.arpGain, false);
    }
    if (cycle >= th.leadFrom) {
      const melody = th.leadB && (cycle - th.leadFrom) % 2 === 1 ? th.leadB : th.lead;
      for (const [step, midi, len] of melody[bar]) {
        if (step === s) this.lead(out, th.leadType, midi, t, stepDur * len, th.leadGain);
      }
    }
    if (light) return;
    const lastBar = bar === th.chords.length - 1;
    if (th.toms && lastBar && s >= 12) {
      this.tom(out, t, 160 - (s - 12) * 22);
    } else {
      if (th.kick[s] === 'x') this.kick(out, t);
      if (th.snare[s] === 'x' && !intro) this.snare(out, t);
    }
    if (th.hat[s] === 'x') this.hat(out, t, s % 4 === 2 ? th.hatGain * 1.5 : th.hatGain);
  }

  /** Mélodie selon le timbre du thème (toujours filtrée : pas d'aigus agressifs). */
  private lead(out: AudioNode, type: LeadType, midi: number, t: number, dur: number, gain: number): void {
    switch (type) {
      case 'brass':
        this.brass(out, midi, t, dur, gain);
        break;
      case 'sine':
        this.tone(out, midi, t, dur, 'sine', gain, true);
        break;
      default:
        this.filtered(out, type, midi, t, dur, gain);
    }
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

  /** Mélodie douce (triangle), pincée (carré) ou chaude (scie), passée dans un filtre passe-bas. */
  private filtered(out: AudioNode, type: Exclude<LeadType, 'brass' | 'sine'>, midi: number, t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type === 'soft' ? 'triangle' : type === 'pluck' ? 'square' : 'sawtooth';
    o.frequency.value = midiToFreq(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    const top = type === 'soft' ? 1400 : type === 'pluck' ? 1800 : 1300;
    f.frequency.setValueAtTime(top, t);
    f.frequency.exponentialRampToValueAtTime(type === 'pluck' ? 420 : top * 0.6, t + Math.max(0.1, type === 'pluck' ? 0.25 : dur));
    const g = ctx.createGain();
    const len = type === 'pluck' ? Math.min(dur, 0.35) : dur;
    envelope(g, t, gain, type === 'soft' ? 0.02 : 0.006, Math.max(0.08, len));
    o.connect(f).connect(g).connect(out);
    g.connect(this.audio.echo);
    o.start(t);
    o.stop(t + len + 0.15);
  }

  /** Cuivre synthétique : deux scies désaccordées, filtre qui s'ouvre à l'attaque. */
  private brass(out: AudioNode, midi: number, t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.linearRampToValueAtTime(1900, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(900, t + Math.max(0.15, dur));
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

  /** Accord de puissance (fondamentale, quinte, octave) court et percutant, dans le grave. */
  private stab(out: AudioNode, root: number, t: number, dur: number, gain: number): void {
    const ctx = this.audio.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1800, t);
    f.frequency.exponentialRampToValueAtTime(400, t + dur);
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
    f.frequency.value = 1000;
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

  private bass(out: AudioNode, midi: number, t: number, dur: number, type: OscillatorType, gain: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = midiToFreq(midi);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1000, t);
    f.frequency.exponentialRampToValueAtTime(240, t + Math.max(0.1, dur));
    const g = ctx.createGain();
    envelope(g, t, gain, 0.005, Math.max(0.1, dur));
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  /** Sous-basse : sinus pur une octave sous la basse (rondeur, surtout au casque). */
  private sub(out: AudioNode, midi: number, t: number, dur: number, gain: number): void {
    this.tone(out, midi, t, Math.max(0.12, dur), 'sine', gain, false);
  }

  private kick(out: AudioNode, t: number): void {
    const ctx = this.audio.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain();
    envelope(g, t, 0.6, 0.003, 0.26);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.32);
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
    f.frequency.value = 4000;
    const g = ctx.createGain();
    envelope(g, t, 0.08, 0.002, 1.2);
    n.connect(f).connect(g).connect(out);
    n.start(t);
    n.stop(t + 1.3);
  }

  private snare(out: AudioNode, t: number): void {
    const ctx = this.audio.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    envelope(g, t, 0.22, 0.002, 0.18);
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
    f.frequency.value = 6000;
    const g = ctx.createGain();
    envelope(g, t, gain, 0.001, 0.04);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random() * 0.5);
    n.stop(t + 0.06);
  }
}
