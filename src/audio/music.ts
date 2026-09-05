import type { AudioEngine } from './engine';

/**
 * Generative horror score. Everything is synthesized; nothing carries a melody. Three layers share one
 * `intensity` value (0 exploration … 1 heavy combat) and one `mood` per level:
 *
 *  - bed (always on): a sub drone whose pitch never sits still, a breathing noise layer, wind, and for
 *    the cathedral levels an organ pedal. Nothing in it resolves.
 *  - tension (aleatoric, no beat): prepared-piano plucks a minor second apart, cluster stabs, hard-panned
 *    whispers, drips, wolves, metallic shimmer, a distant bell for the village. Each has its own random
 *    interval so the ear cannot predict the next one.
 *  - combat (intensity above 0.2): taiko, a Phrygian ostinato with a tritone on the fourth bar, and low
 *    choir clusters. The boss adds a phase slide on the organ.
 *
 * `riser()` fires a reversed-cymbal swell before waves and elites; `setHealth()` drives a heartbeat under
 * 35 % health. Scheduling uses look-ahead so events land on time regardless of frame rate, and
 * `scheduleUntil` drives the same code offline for the demo renders.
 */
export type MoodId = 'village' | 'road' | 'court' | 'nave' | 'crypt' | 'ossuary';

interface Mood {
  sub: number; breath: number; wind: number; organ: number;
  /** mean seconds between events; 0 disables */
  whisper: number; stab: number; pluck: number; drip: number; wolf: number; bell: number; shimmer: number;
}

const MOODS: Record<MoodId, Mood> = {
  village: { sub: 0.06, breath: 0.0, wind: 0.14, organ: 0, whisper: 0, stab: 0, pluck: 0, drip: 0, wolf: 0, bell: 60, shimmer: 0 },
  road: { sub: 0.10, breath: 0.08, wind: 0.22, organ: 0, whisper: 45, stab: 0, pluck: 10, drip: 0, wolf: 50, bell: 0, shimmer: 0 },
  court: { sub: 0.13, breath: 0.10, wind: 0.12, organ: 0, whisper: 35, stab: 28, pluck: 9, drip: 0, wolf: 0, bell: 0, shimmer: 40 },
  nave: { sub: 0.05, breath: 0.07, wind: 0.05, organ: 0.10, whisper: 30, stab: 30, pluck: 12, drip: 0, wolf: 0, bell: 0, shimmer: 25 },
  crypt: { sub: 0.09, breath: 0.09, wind: 0.0, organ: 0, whisper: 18, stab: 0, pluck: 11, drip: 7, wolf: 0, bell: 0, shimmer: 0 },
  ossuary: { sub: 0.12, breath: 0.08, wind: 0.0, organ: 0.12, whisper: 25, stab: 24, pluck: 0, drip: 12, wolf: 0, bell: 0, shimmer: 30 },
};

type EventName = 'whisper' | 'stab' | 'pluck' | 'drip' | 'wolf' | 'bell' | 'shimmer';
const EVENTS: EventName[] = ['whisper', 'stab', 'pluck', 'drip', 'wolf', 'bell', 'shimmer'];

export class Music {
  intensity = 0;
  mood: MoodId = 'court';
  private target = 0;
  private timer: number | null = null;
  private started = false;
  private nextBeat = 0;
  private beat = 0;
  private bpm = 100;
  private lastTick = 0;
  private next: Record<EventName, number> = { whisper: 0, stab: 0, pluck: 0, drip: 0, wolf: 0, bell: 0, shimmer: 0 };
  private nextWalk = 0;
  private heart = 0;          // 0..1 heartbeat amount
  private nextHeart = 0;
  private nodes: AudioNode[] = [];
  // buses
  private bedGain!: GainNode; private subGain!: GainNode; private breathGain!: GainNode; private windGain!: GainNode; private organGain!: GainNode;
  private tensionGain!: GainNode; private combatGain!: GainNode; private choirGain!: GainNode;
  private subOscs: OscillatorNode[] = [];
  private organOscs: OscillatorNode[] = [];
  private breathFilter!: BiquadFilterNode;

  constructor(private eng: AudioEngine) {}

  private hz(midi: number): number { return 440 * Math.pow(2, (midi - 69) / 12); }
  private get live(): boolean { return !(this.eng.ctx instanceof OfflineAudioContext); }

  // ------------------------------------------------------------ lifecycle
  start(): void {
    const c = this.eng.ctx; if (!c || this.started) return;
    this.started = true;
    const t = c.currentTime + 0.05;
    const bus = (v: number, to: AudioNode, verb = 0) => { const g = c.createGain(); g.gain.value = v; g.connect(to); if (verb > 0) { const s = c.createGain(); s.gain.value = verb; g.connect(s); s.connect(this.eng.reverbSend); } return g; };
    this.bedGain = bus(1, this.eng.musicBus, 0.5);
    this.subGain = bus(0, this.bedGain); this.breathGain = bus(0, this.bedGain); this.organGain = bus(0, this.bedGain);
    this.windGain = bus(0, this.eng.ambientBus);
    this.tensionGain = bus(0.9, this.eng.musicBus, 0.8);
    this.combatGain = bus(0, this.eng.musicBus, 0.35);
    this.choirGain = bus(0, this.eng.musicBus, 0.9);
    this.buildSub(t); this.buildBreath(t); this.buildWind(t); this.buildOrgan(t);
    this.applyMood(this.mood, t, true);
    this.lastTick = t; this.nextBeat = t + 0.5; this.nextWalk = t + 2;
    if (this.live) this.timer = window.setInterval(() => this.schedule(), 90);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer); this.timer = null; this.started = false;
    for (const n of this.nodes) { try { (n as any).stop?.(); n.disconnect(); } catch { /* */ } }
    this.nodes = []; this.subOscs = []; this.organOscs = [];
  }

  /** Offline rendering: drive the scheduler up to `until` seconds with an intensity curve. */
  scheduleUntil(until: number, intensityAt: (t: number) => number): void {
    for (let t = this.lastTick; t < until; t += 0.1) { this.intensity = this.target = intensityAt(t); this.tick(t + 0.1); }
  }

  setMood(id: MoodId): void { this.mood = id; if (this.started && this.eng.ctx) this.applyMood(id, this.eng.ctx.currentTime, false); }

  setIntensity(v: number): void {
    this.target = Math.max(0, Math.min(1, v));
    const c = this.eng.ctx; if (!c || !this.started) return;
    this.intensity += (this.target - this.intensity) * 0.08;
    const k = Math.max(0, (this.intensity - 0.15) / 0.85);
    this.combatGain.gain.setTargetAtTime(k * 0.8, c.currentTime, 0.4);
    this.choirGain.gain.setTargetAtTime(k * 0.5, c.currentTime, 0.8);
    this.bpm = 100 + this.intensity * 20;
  }

  /** Heartbeat under low health: `frac` is health 0..1. */
  setHealth(frac: number): void { this.heart = frac < 0.35 ? 1 - frac / 0.35 : 0; }

  /** Reversed-cymbal swell that warns of a wave or an elite; lands `lead` seconds after now. */
  riser(lead = 2.5, gain = 0.5): void {
    const c = this.eng.ctx; if (!c || !this.started) return;
    const t = c.currentTime + 0.02;
    const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer();
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(180, t); bp.frequency.exponentialRampToValueAtTime(4200, t + lead);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * 0.5, t + lead); g.gain.setValueAtTime(0.0001, t + lead + 0.02);
    s.connect(bp); bp.connect(g); g.connect(this.tensionGain); s.start(t); s.stop(t + lead + 0.1);
    // a low thud where the swell cuts off
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t + lead); o.frequency.exponentialRampToValueAtTime(35, t + lead + 0.3);
    const og = c.createGain(); og.gain.setValueAtTime(0.0001, t + lead); og.gain.exponentialRampToValueAtTime(0.6 * gain, t + lead + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + lead + 0.7);
    o.connect(og); og.connect(this.tensionGain); o.start(t + lead); o.stop(t + lead + 0.8);
  }

  /** Boss phase change: the organ pedal slides down a half-step and crawls back. */
  phaseSlide(): void {
    const c = this.eng.ctx; if (!c || !this.started) return;
    const t = c.currentTime;
    for (const o of this.organOscs) { o.detune.cancelScheduledValues(t); o.detune.setValueAtTime(0, t); o.detune.linearRampToValueAtTime(-100, t + 1.2); o.detune.linearRampToValueAtTime(0, t + 7); }
    this.stab(t + 0.05, 0.22); this.riser(1.2, 0.35);
  }

  // ------------------------------------------------------------ scheduling
  private schedule(): void { const c = this.eng.ctx!; this.tick(c.currentTime + 0.25); }

  /** Advance every timer up to `horizon` (audio time). */
  private tick(horizon: number): void {
    const m = MOODS[this.mood];
    // sub-drone pitch random walk every ~4 s: never a stable pitch to rest on
    while (this.nextWalk < horizon) {
      const at = this.nextWalk; this.nextWalk += 3 + Math.random() * 3;
      for (const o of this.subOscs) o.detune.setTargetAtTime((Math.random() - 0.5) * 40, at, 2.5);
      this.breathFilter.frequency.setTargetAtTime(300 + Math.random() * 600, at, 2);
    }
    // aleatoric tension events: only in the quiet, each on its own clock
    for (const name of EVENTS) {
      const mean = m[name];
      if (mean <= 0) { this.next[name] = 0; continue; }
      if (this.next[name] === 0) this.next[name] = this.lastTick + mean * (0.3 + Math.random() * 0.7);
      while (this.next[name] < horizon) {
        const at = this.next[name]; this.next[name] = at + mean * (0.5 + Math.random());
        if (this.intensity < 0.3 || name === 'drip') this.fire(name, at);
      }
    }
    // heartbeat under low health
    if (this.heart > 0) { while (this.nextHeart < horizon) { const at = Math.max(this.nextHeart, this.lastTick); this.heartbeat(at, this.heart); this.nextHeart = at + 60 / 55; } } else this.nextHeart = horizon;
    // combat beat grid
    while (this.nextBeat < horizon) { if (this.intensity > 0.15) this.onBeat(this.nextBeat, this.beat); this.nextBeat += 60 / this.bpm; this.beat++; }
    this.lastTick = horizon;
  }

  private fire(name: EventName, at: number): void {
    switch (name) {
      case 'whisper': this.whisper(at); break;
      case 'stab': this.stab(at, 0.12); break;
      case 'pluck': this.pluck(at); break;
      case 'drip': this.drip(at); break;
      case 'wolf': this.wolf(at); break;
      case 'bell': this.bell(at); break;
      case 'shimmer': this.shimmer(at); break;
    }
  }

  private onBeat(t: number, beat: number): void {
    const bar = Math.floor(beat / 4), inBar = beat % 4, beatLen = 60 / this.bpm;
    // taiko: downbeats, a ghost on two, a double on four when it gets heavy
    if (inBar === 0) this.taiko(t, 1.0);
    if (inBar === 2) this.taiko(t, 0.8);
    if (inBar === 1 && Math.random() < 0.5) this.taiko(t + beatLen / 2, 0.4);
    if (inBar === 3 && this.intensity > 0.6) { this.taiko(t, 0.6); this.taiko(t + beatLen / 2, 0.7); }
    // Phrygian ostinato: D  Eb  D  A | Bb ... with a tritone (G#) on the fourth bar
    const line = bar % 4 === 3 ? [38, 39, 44, 39] : [38, 39, 38, bar % 2 ? 46 : 45];
    this.ostinato(t, line[inBar], beatLen);
    // low choir cluster every four bars
    if (inBar === 0 && bar % 4 === 0) this.cluster(t, beatLen * 16);
  }

  // ------------------------------------------------------------ bed
  private buildSub(t: number): void {
    const c = this.eng.ctx!;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140; lp.Q.value = 0.7;
    for (const [midi, type, det, amp] of [[26, 'sine', 0, 1], [26, 'sine', 5, 0.7], [26, 'sine', -7, 0.7], [38, 'triangle', 3, 0.35]] as const) {
      const o = c.createOscillator(); o.type = type; o.frequency.value = this.hz(midi); o.detune.value = det;
      const g = c.createGain(); g.gain.value = amp; o.connect(g); g.connect(lp); o.start(t); this.nodes.push(o); this.subOscs.push(o);
    }
    lp.connect(this.subGain);
  }

  private buildBreath(t: number): void {
    const c = this.eng.ctx!;
    const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); s.loop = true;
    const pink = c.createBiquadFilter(); pink.type = 'lowpass'; pink.frequency.value = 1800;
    this.breathFilter = c.createBiquadFilter(); this.breathFilter.type = 'bandpass'; this.breathFilter.frequency.value = 500; this.breathFilter.Q.value = 2.2;
    // inhale / exhale envelope, about five seconds per breath, never perfectly regular
    const env = c.createGain(); env.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.19; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg); lg.connect(env.gain);
    const lfo2 = c.createOscillator(); lfo2.type = 'sine'; lfo2.frequency.value = 0.043; const lg2 = c.createGain(); lg2.gain.value = 0.25; lfo2.connect(lg2); lg2.connect(env.gain);
    const bias = c.createConstantSource(); bias.offset.value = 0.5; bias.connect(env.gain);
    s.connect(pink); pink.connect(this.breathFilter); this.breathFilter.connect(env); env.connect(this.breathGain);
    s.start(t); lfo.start(t); lfo2.start(t); bias.start(t); this.nodes.push(s, lfo, lfo2, bias);
  }

  private buildWind(t: number): void {
    const c = this.eng.ctx!;
    const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.5;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.06; const lg = c.createGain(); lg.gain.value = 320; lfo.connect(lg); lg.connect(bp.frequency);
    const gust = c.createGain(); gust.gain.value = 0.7;
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.13; const lg2 = c.createGain(); lg2.gain.value = 0.3; lfo2.connect(lg2); lg2.connect(gust.gain);
    s.connect(bp); bp.connect(gust); gust.connect(this.windGain);
    s.start(t); lfo.start(t); lfo2.start(t); this.nodes.push(s, lfo, lfo2);
  }

  /** Organ pedal on D1: additive partials with a slow chorus so it breathes like pipes. */
  private buildOrgan(t: number): void {
    const c = this.eng.ctx!;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.5;
    for (const [mult, amp, det] of [[1, 1, 0], [2, 0.5, 4], [3, 0.3, -3], [4, 0.2, 6], [6, 0.08, 0]] as const) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = this.hz(26) * mult; o.detune.value = det;
      const g = c.createGain(); g.gain.value = amp * 0.4; o.connect(g); g.connect(lp); o.start(t); this.nodes.push(o); this.organOscs.push(o);
    }
    lp.connect(this.organGain);
  }

  private applyMood(id: MoodId, t: number, instant: boolean): void {
    const m = MOODS[id]; const tc = instant ? 0.01 : 3;
    this.subGain.gain.setTargetAtTime(m.sub, t, tc);
    this.breathGain.gain.setTargetAtTime(m.breath, t, tc);
    this.windGain.gain.setTargetAtTime(m.wind, t, tc);
    this.organGain.gain.setTargetAtTime(m.organ, t, tc);
    for (const name of EVENTS) this.next[name] = 0;
  }

  // ------------------------------------------------------------ tension events
  /** Prepared piano: two damped Karplus-Strong strings a minor second apart, struck together, low register. */
  private pluck(t: number): void {
    const c = this.eng.ctx!;
    const root = [38, 40, 41, 43, 45][Math.floor(Math.random() * 5)];
    for (const midi of [root, root + 1]) {
      const f = this.hz(midi);
      const burst = c.createBufferSource(); burst.buffer = this.eng.noiseBuffer();
      const bg = c.createGain(); bg.gain.setValueAtTime(0.9, t); bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.01);
      const delay = c.createDelay(0.05); delay.delayTime.value = 1 / f;
      const fb = c.createGain(); fb.gain.value = 0.975;
      const damp = c.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = 900; damp.Q.value = -12;
      const out = c.createGain(); out.gain.setValueAtTime(0.5, t); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      burst.connect(bg); bg.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay); delay.connect(out); out.connect(this.tensionGain);
      burst.start(t); burst.stop(t + 0.02);
      if (this.live) window.setTimeout(() => { try { out.disconnect(); delay.disconnect(); fb.disconnect(); damp.disconnect(); } catch { /* */ } }, 2200);
    }
  }

  /** Cluster stab: three saws a semitone apart, 5 ms attack, felt more than heard. */
  private stab(t: number, vol: number): void {
    const c = this.eng.ctx!;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(300, t + 1.0);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    for (const midi of [50, 51, 52]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(midi); o.detune.value = (Math.random() - 0.5) * 10; o.connect(lp); o.start(t); o.stop(t + 1.4); }
    lp.connect(g); g.connect(this.tensionGain);
  }

  /** Whisper: formant-swept noise burst panned hard to one side. */
  private whisper(t: number): void {
    const c = this.eng.ctx!; const dur = 0.35 + Math.random() * 0.4;
    const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9; f.frequency.setValueAtTime(900 + Math.random() * 600, t); f.frequency.exponentialRampToValueAtTime(2000 + Math.random() * 900, t + dur);
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 6; f2.frequency.setValueAtTime(3000, t); f2.frequency.exponentialRampToValueAtTime(1400, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner(); pan.pan.value = Math.random() < 0.5 ? -0.9 : 0.9;
    s.connect(f); f.connect(f2); f2.connect(g); g.connect(pan); pan.connect(this.tensionGain); s.start(t); s.stop(t + dur + 0.05);
    // sometimes a second syllable on the same side
    if (Math.random() < 0.4) { const s2 = c.createBufferSource(); s2.buffer = this.eng.noiseBuffer(); const g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, t + dur + 0.08); g2.gain.exponentialRampToValueAtTime(0.06, t + dur + 0.12); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35); s2.connect(f); f.connect(g2); g2.connect(pan); s2.start(t + dur + 0.08); s2.stop(t + dur + 0.4); }
  }

  /** Water drip: a pitched click with a fast downward glide, random position, long reverb tail. */
  private drip(t: number): void {
    const c = this.eng.ctx!;
    const o = c.createOscillator(); o.type = 'sine'; const f0 = 1600 + Math.random() * 1400; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.42, t + 0.07);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const pan = c.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.6;
    o.connect(g); g.connect(pan); pan.connect(this.tensionGain); o.start(t); o.stop(t + 0.15);
  }

  /** Distant wolf: a vibrato sine sweep, low-passed and mostly reverb. */
  private wolf(t: number): void {
    const c = this.eng.ctx!; const dur = 1.4 + Math.random() * 0.8;
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(380, t); o.frequency.exponentialRampToValueAtTime(640, t + dur * 0.35); o.frequency.exponentialRampToValueAtTime(330, t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 5.5; const vg = c.createGain(); vg.gain.value = 9; vib.connect(vg); vg.connect(o.frequency);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.045, t + 0.3); g.gain.setValueAtTime(0.045, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.4;
    o.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this.tensionGain); o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  }

  /** Inharmonic FM shimmer: metal that rings on its own in the dark. */
  private shimmer(t: number): void {
    const c = this.eng.ctx!; const dur = 3 + Math.random() * 2;
    const car = c.createOscillator(); car.type = 'sine'; const f = 420 + Math.random() * 300; car.frequency.value = f;
    const mod = c.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * 2.41; const mg = c.createGain(); mg.gain.setValueAtTime(f * 1.5, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.035, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const pan = c.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.2;
    car.connect(g); g.connect(pan); pan.connect(this.tensionGain); car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
  }

  /** Village bell: one strike, far away, slightly flat. */
  private bell(t: number): void {
    const c = this.eng.ctx!;
    for (const [mult, amp, dec] of [[1, 0.5, 5], [2.76, 0.22, 3], [5.4, 0.1, 2]] as const) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = 146.8 * 0.985 * mult;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp * 0.18, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(this.tensionGain); o.start(t); o.stop(t + dec + 0.1);
    }
  }

  private heartbeat(t: number, amount: number): void {
    const c = this.eng.ctx!;
    for (const [dt, vol] of [[0, 1], [0.32, 0.7]] as const) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(64, t + dt); o.frequency.exponentialRampToValueAtTime(40, t + dt + 0.09);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.5 * vol * amount, t + dt + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.11);
      o.connect(g); g.connect(this.tensionGain); o.start(t + dt); o.stop(t + dt + 0.15);
    }
  }

  // ------------------------------------------------------------ combat
  private taiko(t: number, vol: number): void {
    const c = this.eng.ctx!;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.25);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6 * vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g); g.connect(this.combatGain); o.start(t); o.stop(t + 0.6);
    const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.3 * vol, t + 0.004); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    s.connect(f); f.connect(ng); ng.connect(this.combatGain); s.start(t); s.stop(t + 0.12);
  }

  /** Staccato low ostinato voice: two detuned saws through a closing filter, eighth notes. */
  private ostinato(t: number, midi: number, beatLen: number): void {
    const c = this.eng.ctx!;
    for (let i = 0; i < 2; i++) {
      const st = t + (i * beatLen) / 2, len = beatLen * 0.28;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(1400, st); fl.frequency.exponentialRampToValueAtTime(250, st + len);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.16, st + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, st + len);
      for (const det of [-9, 9]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(midi); o.detune.value = det; o.connect(fl); o.start(st); o.stop(st + len + 0.05); }
      fl.connect(g); g.connect(this.combatGain);
    }
  }

  /** Low choir cluster D–Eb–A: formant saws with a short attack, one octave under the old choir. */
  private cluster(t: number, dur: number): void {
    const c = this.eng.ctx!;
    for (const midi of [50, 51, 57]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = this.hz(midi - 12); o.detune.value = (Math.random() - 0.5) * 16;
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 4;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 980; f2.Q.value = 5;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.35); g.gain.setValueAtTime(0.14, t + dur - 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(this.choirGain); o.start(t); o.stop(t + dur + 0.1);
    }
  }
}
