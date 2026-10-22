/**
 * Moteur audio Web Audio : contexte, bus musique / effets, volumes.
 * Aucun fichier audio : tout est synthétisé (voir `music.ts` et `sfx.ts`).
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  music!: GainNode;
  sfx!: GainNode;
  /** Écho léger partagé par les mélodies. */
  echo!: GainNode;
  noise!: AudioBuffer;
  private musicVolume = 0.6;
  private sfxVolume = 0.8;
  private readonly listeners: Array<() => void> = [];

  /** Le navigateur n'autorise le son qu'après un geste de l'utilisateur. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.music = ctx.createGain();
      this.sfx = ctx.createGain();
      this.music.connect(this.master);
      this.sfx.connect(this.master);
      // Écho (delay avec retour) pour donner de l'espace aux mélodies.
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.27;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.32;
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      this.echo = ctx.createGain();
      this.echo.gain.value = 0.35;
      this.echo.connect(delay);
      delay.connect(tone).connect(feedback).connect(delay);
      tone.connect(this.music);
      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.applyVolumes();
      for (const l of this.listeners) l();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }

  /** Appelé une fois le contexte créé. */
  onReady(listener: () => void): void {
    this.listeners.push(listener);
    if (this.ctx) listener();
  }

  get ready(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    // Courbe perceptive : le curseur à mi-course paraît « à moitié fort ».
    this.music.gain.setTargetAtTime(0.5 * this.musicVolume * this.musicVolume, t, 0.05);
    this.sfx.gain.setTargetAtTime(0.9 * this.sfxVolume * this.sfxVolume, t, 0.05);
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => {});
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
  }
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Enveloppe simple attaque / déclin exponentiel sur un gain. */
export function envelope(g: GainNode, start: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(peak, start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + decay);
}
