import type { AudioEngine } from './engine';

/**
 * Generative score in D minor. Four layers, all synthesized:
 *  - drone: detuned low voices under a slow filter sweep (always on)
 *  - lute: a plucked Karplus-Strong string playing a sparse, wandering melody over the chord tones
 *  - choir: a soft formant pad that changes with the chord every eight bars
 *  - war: taiko-style drums and a tremolo string, faded in by `intensity` when the pack closes in
 * Scheduling uses the standard look-ahead pattern so notes land on time regardless of frame rate.
 */
export class Music {
  intensity = 0;            // 0 exploration … 1 heavy combat (set by the game)
  private target = 0;
  private timer: number | null = null;
  private nextBeat = 0;
  private beat = 0;
  private bpm = 66;
  private droneNodes: AudioNode[] = [];
  private warGain!: GainNode;
  private luteGain!: GainNode;
  private choirGain!: GainNode;
  private windGain!: GainNode;
  private lastMelody = 62;
  private chordIndex = 0;
  private started = false;
  // D minor: i (Dm) – VI (Bb) – iv (Gm) – V (A)  as MIDI roots and chord tones
  private chords: { root: number; tones: number[] }[] = [
    { root: 38, tones: [62, 65, 69, 74] }, { root: 46, tones: [58, 62, 65, 70] }, { root: 43, tones: [55, 58, 62, 67] }, { root: 45, tones: [57, 61, 64, 69] },
  ];
  private scale = [62, 64, 65, 67, 69, 70, 72, 74, 76, 77, 79, 81]; // D aeolian across two octaves

  constructor(private eng: AudioEngine) {}

  private hz(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }

  start(): void {
    const c = this.eng.ctx; if (!c || this.started) return;
    this.started = true;
    const t = c.currentTime + 0.1;
    this.buildDrone(t); this.buildWind(t);
    this.warGain = c.createGain(); this.warGain.gain.value = 0; this.warGain.connect(this.eng.musicBus);
    this.luteGain = c.createGain(); this.luteGain.gain.value = 0.7; this.luteGain.connect(this.eng.musicBus);
    const luteVerb = c.createGain(); luteVerb.gain.value = 0.6; this.luteGain.connect(luteVerb); luteVerb.connect(this.eng.reverbSend);
    this.choirGain = c.createGain(); this.choirGain.gain.value = 0.5; this.choirGain.connect(this.eng.musicBus);
    const choirVerb = c.createGain(); choirVerb.gain.value = 0.9; this.choirGain.connect(choirVerb); choirVerb.connect(this.eng.reverbSend);
    this.nextBeat = t + 0.5;
    if (!(c instanceof OfflineAudioContext)) this.timer = window.setInterval(() => this.schedule(), 90);
  }

  /** Offline rendering: schedule every beat up to `until` seconds, applying an intensity curve. */
  scheduleUntil(until: number, intensityAt: (t: number) => number): void {
    while (this.nextBeat < until) { this.intensity = intensityAt(this.nextBeat); this.bpm = 66 + this.intensity * 44; this.warGain.gain.setValueAtTime(this.intensity * 0.9, this.nextBeat); this.onBeat(this.nextBeat, this.beat); this.nextBeat += 60 / this.bpm; this.beat++; }
  }

  stop(): void { if (this.timer !== null) window.clearInterval(this.timer); this.timer = null; this.started = false; for (const n of this.droneNodes) { try { (n as any).stop?.(); } catch { /* */ } } }

  setIntensity(v: number): void {
    this.target = Math.max(0, Math.min(1, v));
    const c = this.eng.ctx; if (!c || !this.started) return;
    this.intensity += (this.target - this.intensity) * 0.08;
    this.warGain.gain.setTargetAtTime(this.intensity * 0.7, c.currentTime, 0.4);
    this.luteGain.gain.setTargetAtTime(0.7 - this.intensity * 0.35, c.currentTime, 0.6);
    const bpm = 66 + this.intensity * 44; this.bpm = bpm;
  }

  // ------------------------------------------------------------ scheduling
  private schedule(): void {
    const c = this.eng.ctx!; const lookahead = 0.25;
    while (this.nextBeat < c.currentTime + lookahead) {
      this.onBeat(this.nextBeat, this.beat);
      this.nextBeat += 60 / this.bpm;
      this.beat++;
    }
  }

  private onBeat(t: number, beat: number): void {
    const bar = Math.floor(beat / 4), inBar = beat % 4;
    if (inBar === 0 && bar % 2 === 0) { this.chordIndex = Math.floor(bar / 2) % this.chords.length; this.choir(t, this.chords[this.chordIndex]); }
    const chord = this.chords[this.chordIndex];
    // lute: sparse in exploration (about one note per two beats), busier as intensity rises
    const density = 0.45 + this.intensity * 0.35;
    if (Math.random() < density) this.lute(t + (Math.random() < 0.3 ? 30 / this.bpm : 0), chord);
    // war layer
    if (this.intensity > 0.05) {
      if (inBar === 0 || inBar === 2) this.taiko(t, 1.0);
      if (inBar === 1 && Math.random() < 0.6) this.taiko(t + 30 / this.bpm, 0.5);
      if (inBar === 3) { this.taiko(t, 0.7); if (this.intensity > 0.6) this.taiko(t + 30 / this.bpm, 0.6); }
      this.tremolo(t, chord, 60 / this.bpm);
    }
    // distant bell every 24 bars in the quiet
    if (beat % 96 === 0 && this.intensity < 0.3) this.bell(t + 0.2);
  }

  // ------------------------------------------------------------ instruments
  private buildDrone(t: number): void {
    const c = this.eng.ctx!;
    const g = c.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.5, t + 6);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 1.2;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.035; const lg = c.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(t);
    for (const [midi, type, det] of [[38, 'sawtooth', -6], [38, 'sawtooth', 6], [45, 'triangle', 0], [26, 'sine', 0]] as const) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = this.hz(midi); o.detune.value = det; o.connect(lp); o.start(t); this.droneNodes.push(o);
    }
    lp.connect(g); g.connect(this.eng.musicBus);
    const verb = c.createGain(); verb.gain.value = 0.4; g.connect(verb); verb.connect(this.eng.reverbSend);
    this.droneNodes.push(lfo);
  }

  private buildWind(t: number): void {
    const c = this.eng.ctx!;
    const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.6;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(bp.frequency);
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = c.createGain(); lg2.gain.value = 0.04;
    this.windGain = c.createGain(); this.windGain.gain.value = 0.12; lfo2.connect(lg2); lg2.connect(this.windGain.gain);
    s.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.eng.ambientBus);
    s.start(t); lfo.start(t); lfo2.start(t); this.droneNodes.push(s, lfo, lfo2);
  }

  /** Karplus-Strong plucked string: a noise burst through a tuned feedback delay. */
  private lute(t: number, chord: { tones: number[] }): void {
    const c = this.eng.ctx!;
    // pick a melody note: mostly stepwise within the scale, favouring chord tones
    const candidates = this.scale.filter((n) => Math.abs(n - this.lastMelody) <= 5);
    let note = candidates[Math.floor(Math.random() * candidates.length)] ?? 62;
    if (Math.random() < 0.55) { const ct = chord.tones.filter((n) => Math.abs(n - this.lastMelody) <= 7); if (ct.length) note = ct[Math.floor(Math.random() * ct.length)]; }
    this.lastMelody = note;
    const f = this.hz(note);
    const burst = c.createBufferSource(); burst.buffer = this.eng.noiseBuffer();
    const bg = c.createGain(); bg.gain.setValueAtTime(0.9, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    const delay = c.createDelay(0.05); delay.delayTime.value = 1 / f;
    // loop gain must stay under 1: lowpass Q is in dB for this filter type, so pull it well below the default resonance
    const fb = c.createGain(); fb.gain.value = 0.955 - (note - 50) * 0.0008;
    const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 2600 + this.intensity * 1500; damp.Q.value = -12;
    const out = c.createGain(); out.gain.setValueAtTime(0.55, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    burst.connect(bg); bg.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay); delay.connect(out); out.connect(this.luteGain);
    burst.start(t); burst.stop(t + 0.02);
    if (!(c instanceof OfflineAudioContext)) window.setTimeout(() => { try { out.disconnect(); delay.disconnect(); fb.disconnect(); damp.disconnect(); } catch { /* */ } }, 2800);
  }

  /** Soft choir: three voices, each a saw through two formant band-passes, long attack. */
  private choir(t: number, chord: { tones: number[] }): void {
    const c = this.eng.ctx!; const dur = (60 / this.bpm) * 8 + 1.5;
    for (const midi of chord.tones.slice(0, 3)) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(midi - 12); o.detune.value = (Math.random() - 0.5) * 12;
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 600; f1.Q.value = 4;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 5;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 2.5); g.gain.setValueAtTime(0.16, t + dur - 2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.choirGain); o.start(t); o.stop(t + dur + 0.1);
    }
  }

  private taiko(t: number, vol: number): void {
    const c = this.eng.ctx!;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6 * vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.warGain); o.start(t); o.stop(t + 0.6);
    const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.35 * vol, t + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.connect(f); f.connect(ng); ng.connect(this.warGain); s.start(t); s.stop(t + 0.15);
  }

  /** Tremolo strings: sixteenth-note pulses on the chord root. */
  private tremolo(t: number, chord: { root: number }, beatLen: number): void {
    const c = this.eng.ctx!; const f = this.hz(chord.root + 12);
    for (let i = 0; i < 4; i++) {
      const st = t + (i * beatLen) / 4;
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = (i % 2 ? 7 : -7);
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1200;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.09, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + beatLen / 4);
      o.connect(fl); fl.connect(g); g.connect(this.warGain); o.start(st); o.stop(st + beatLen / 4 + 0.05);
    }
  }

  private bell(t: number): void {
    const c = this.eng.ctx!;
    for (const [mult, amp, dec] of [[1, 0.5, 5], [2.76, 0.25, 3], [5.4, 0.12, 2]] as const) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 146.8 * mult;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp * 0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(this.choirGain); o.start(t); o.stop(t + dec + 0.1);
    }
  }
}
