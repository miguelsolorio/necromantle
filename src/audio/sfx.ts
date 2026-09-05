import type { AudioEngine } from './engine';

export type SfxName = 'boltCast' | 'boltImpact' | 'orbCast' | 'orbExplode' | 'nova' | 'rift' | 'enemyHit' | 'enemyDeath' | 'eliteDeath' | 'playerHurt' | 'globe' | 'levelUp' | 'potion' | 'denied' | 'door' | 'footstep' | 'cultistShot' | 'cultistImpact' | 'waveStart' | 'ready' | 'burnTick' | 'frostCast' | 'freeze' | 'shatter' | 'cataclysmCast' | 'strike' | 'charge' | 'summon' | 'loot' | 'lootRare' | 'legendary' | 'pickup';

interface Opts { pan?: number; gain?: number; pitch?: number }

/**
 * Every effect is synthesized from oscillators and filtered noise so the game ships with no recorded audio.
 * Each builder writes into `sfxBus`; a slice of it goes to the shared cathedral reverb.
 */
export class Sfx {
  private lastPlay = new Map<SfxName, number>();
  constructor(private eng: AudioEngine) {}

  play(name: SfxName, o: Opts = {}): void {
    const c = this.eng.ctx; if (!c || !this.eng.ready) return;
    this.playAt(name, c.currentTime, o);
  }

  /** Schedule a sound at an absolute context time (used by offline rendering). */
  playAt(name: SfxName, t: number, o: Opts = {}): void {
    const c = this.eng.ctx; if (!c) return;
    // rate limit identical sounds so a crowd does not stack into noise
    const last = this.lastPlay.get(name) ?? -1; const minGap = name === 'enemyHit' ? 0.04 : name === 'boltCast' ? 0.05 : name === 'footstep' ? 0.12 : 0.02;
    if (t - last < minGap) return;
    this.lastPlay.set(name, t);
    const out = this.chain(o.pan ?? 0, (o.gain ?? 1));
    const p = o.pitch ?? 1;
    switch (name) {
      case 'boltCast': this.zap(out, t, 1100 * p, 260 * p, 0.14, 0.35); this.noiseHit(out, t, 0.04, 3000, 0.25); break;
      case 'boltImpact': this.noiseHit(out, t, 0.09, 2400, 0.5); this.thump(out, t, 220 * p, 0.12, 0.35); this.reverb(out, 0.2); break;
      case 'orbCast': this.swell(out, t, 90, 180, 0.5, 0.5); this.shimmer(out, t + 0.05, 0.5, 0.25); break;
      case 'orbExplode': this.thump(out, t, 70, 0.8, 1.0); this.noiseHit(out, t, 0.5, 900, 0.7, 'lowpass'); this.shimmer(out, t, 0.6, 0.3); this.reverb(out, 0.6); break;
      case 'nova': this.whoosh(out, t, 0.45, 0.8); this.thump(out, t + 0.05, 55, 0.7, 0.9); this.crackle(out, t + 0.1, 1.2, 0.45); this.reverb(out, 0.5); break;
      case 'rift': this.swell(out, t, 400, 1400, 0.22, 0.4); this.shimmer(out, t + 0.12, 0.35, 0.35); this.noiseHit(out, t + 0.18, 0.12, 5000, 0.25, 'highpass'); this.reverb(out, 0.4); break;
      case 'enemyHit': this.rattle(out, t, 2, 0.35 * p); this.thump(out, t, 160 * p, 0.08, 0.25); break;
      case 'enemyDeath': this.rattle(out, t, 6, 0.55); this.thump(out, t + 0.03, 90, 0.35, 0.6); this.reverb(out, 0.3); break;
      case 'eliteDeath': this.rattle(out, t, 10, 0.7); this.thump(out, t, 50, 0.9, 1.0); this.swell(out, t, 200, 60, 0.9, 0.5); this.reverb(out, 0.7); break;
      case 'playerHurt': this.thump(out, t, 120, 0.2, 0.7); this.noiseHit(out, t, 0.12, 700, 0.4, 'lowpass'); break;
      case 'globe': this.chime(out, t, [660, 990, 1320], 0.5, 0.5); this.reverb(out, 0.5); break;
      case 'levelUp': this.chime(out, t, [392, 523, 659, 784, 1047], 1.6, 0.6, 0.11); this.swell(out, t, 98, 196, 1.4, 0.35); this.reverb(out, 0.8); break;
      case 'potion': this.swell(out, t, 500, 180, 0.3, 0.35); this.shimmer(out, t + 0.25, 0.4, 0.2); break;
      case 'denied': this.buzz(out, t, 110, 0.18, 0.35); break;
      case 'door': this.grind(out, t, 1.6, 0.7); this.thump(out, t + 1.2, 45, 1.2, 1.0); this.reverb(out, 0.9); break;
      case 'footstep': this.noiseHit(out, t, 0.06, 500 * p, 0.22, 'lowpass'); break;
      case 'cultistShot': this.noiseHit(out, t, 0.25, 1800, 0.35, 'bandpass'); this.zap(out, t, 300, 700, 0.25, 0.2); break;
      case 'cultistImpact': this.noiseHit(out, t, 0.15, 1200, 0.4, 'bandpass'); this.thump(out, t, 140, 0.15, 0.3); break;
      case 'waveStart': this.horn(out, t, 73.4, 1.8, 0.55); this.reverb(out, 0.9); break;
      case 'ready': this.chime(out, t, [1320], 0.18, 0.15); break;
      case 'burnTick': this.crackle(out, t, 0.25, 0.15); break;
      case 'frostCast': this.whoosh(out, t, 0.6, 0.5); this.shimmer(out, t + 0.1, 0.9, 0.4); this.swell(out, t, 900, 300, 0.7, 0.2); this.reverb(out, 0.5); break;
      case 'freeze': this.chime(out, t, [1760, 2637], 0.35, 0.25, 0.04); this.noiseHit(out, t, 0.12, 6000, 0.25, 'highpass'); break;
      case 'shatter': this.rattle(out, t, 12, 0.5); this.chime(out, t, [2093, 2637, 3136], 0.3, 0.3, 0.02); this.reverb(out, 0.4); break;
      case 'cataclysmCast': this.horn(out, t, 55, 2.2, 0.5); this.swell(out, t, 60, 240, 2.0, 0.4); this.shimmer(out, t + 0.3, 1.5, 0.4); this.reverb(out, 0.9); break;
      case 'charge': this.whoosh(out, t, 0.5, 0.6); this.thump(out, t, 90, 0.3, 0.5); break;
      case 'summon': this.swell(out, t, 80, 200, 1.2, 0.35); this.rattle(out, t + 0.3, 8, 0.4); this.shimmer(out, t + 0.2, 0.8, 0.2); this.reverb(out, 0.6); break;
      case 'loot': this.noiseHit(out, t, 0.05, 1800, 0.25, 'bandpass'); this.thump(out, t, 300, 0.08, 0.2); break;
      case 'lootRare': this.chime(out, t, [880, 1320], 0.5, 0.35, 0.05); this.reverb(out, 0.3); break;
      case 'legendary': this.chime(out, t, [523, 659, 784, 1047, 1319], 2.2, 0.55, 0.09); this.swell(out, t, 65, 130, 1.8, 0.4); this.thump(out, t, 50, 1.0, 0.8); this.reverb(out, 0.9); break;
      case 'pickup': this.chime(out, t, [1047, 1568], 0.25, 0.25, 0.03); break;
      case 'strike': this.noiseHit(out, t, 0.06, 5000, 0.6, 'highpass'); this.thump(out, t + 0.01, 60, 0.6, 0.9); this.noiseHit(out, t + 0.02, 0.35, 700, 0.5, 'lowpass'); this.reverb(out, 0.6); break;
    }
  }

  /** Output chain for one sound: gain → pan → sfx bus (+ optional reverb send). */
  private chain(pan: number, gain: number): GainNode {
    const c = this.eng.ctx!;
    const g = c.createGain(); g.gain.value = gain;
    const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p); p.connect(this.eng.sfxBus);
    (g as any).__pan = p;
    return g;
  }
  private reverb(out: GainNode, amount: number): void { const c = this.eng.ctx!; const s = c.createGain(); s.gain.value = amount; ((out as any).__pan as StereoPannerNode).connect(s); s.connect(this.eng.reverbSend); }

  // ------------------------------------------------------------- primitives
  private env(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
    param.setValueAtTime(0.0001, t); param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack); param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  private zap(out: GainNode, t: number, f0: number, f1: number, dur: number, vol: number): void {
    const c = this.eng.ctx!; const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(400, t + dur);
    const g = c.createGain(); this.env(g.gain, t, vol, 0.005, dur); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  private thump(out: GainNode, t: number, f: number, dur: number, vol: number): void {
    const c = this.eng.ctx!; const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 2.2, t); o.frequency.exponentialRampToValueAtTime(f, t + Math.min(0.08, dur * 0.3));
    const g = c.createGain(); this.env(g.gain, t, vol, 0.004, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  private noiseHit(out: GainNode, t: number, dur: number, freq: number, vol: number, type: BiquadFilterType = 'bandpass'): void {
    const c = this.eng.ctx!; const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = type === 'bandpass' ? 0.9 : 0.7;
    const g = c.createGain(); this.env(g.gain, t, vol, 0.003, dur); s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
  }
  private swell(out: GainNode, t: number, f0: number, f1: number, dur: number, vol: number): void {
    const c = this.eng.ctx!; const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f0 * 1.005, t); o2.frequency.exponentialRampToValueAtTime(f1 * 1.005, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g); g.connect(out); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  private shimmer(out: GainNode, t: number, dur: number, vol: number): void {
    const c = this.eng.ctx!;
    for (let i = 0; i < 5; i++) {
      const o = c.createOscillator(); o.type = 'sine'; const f = 1800 + Math.random() * 2600; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur);
      const g = c.createGain(); const st = t + i * 0.03; this.env(g.gain, st, vol * 0.25, 0.01, dur * (0.4 + Math.random() * 0.6)); o.connect(g); g.connect(out); o.start(st); o.stop(st + dur + 0.05);
    }
  }
  private whoosh(out: GainNode, t: number, dur: number, vol: number): void {
    const c = this.eng.ctx!; const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(3500, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + dur + 0.05);
  }
  private crackle(out: GainNode, t: number, dur: number, vol: number): void {
    const n = Math.floor(dur * 18);
    for (let i = 0; i < n; i++) { const st = t + Math.random() * dur; this.noiseHit(out, st, 0.02 + Math.random() * 0.03, 1500 + Math.random() * 3000, vol * (0.4 + Math.random() * 0.6), 'highpass'); }
  }
  private rattle(out: GainNode, t: number, count: number, vol: number): void {
    for (let i = 0; i < count; i++) { const st = t + i * (0.03 + Math.random() * 0.03); this.noiseHit(out, st, 0.025, 2600 + Math.random() * 2000, vol * (0.5 + Math.random() * 0.5), 'bandpass'); }
  }
  private chime(out: GainNode, t: number, freqs: number[], dur: number, vol: number, stagger = 0.06): void {
    const c = this.eng.ctx!;
    freqs.forEach((f, i) => {
      const st = t + i * stagger;
      for (const [mult, amp] of [[1, 1], [2.01, 0.35], [3.0, 0.15]] as const) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * mult;
        const g = c.createGain(); this.env(g.gain, st, vol * amp, 0.005, dur); o.connect(g); g.connect(out); o.start(st); o.stop(st + dur + 0.05);
      }
    });
  }
  private buzz(out: GainNode, t: number, f: number, dur: number, vol: number): void {
    const c = this.eng.ctx!; const o = c.createOscillator(); o.type = 'square'; o.frequency.value = f;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500;
    const g = c.createGain(); this.env(g.gain, t, vol, 0.01, dur); o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  private grind(out: GainNode, t: number, dur: number, vol: number): void {
    const c = this.eng.ctx!; const s = c.createBufferSource(); s.buffer = this.eng.noiseBuffer(); s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(180, t); f.frequency.linearRampToValueAtTime(420, t + dur);
    const lfo = c.createOscillator(); lfo.frequency.value = 11; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.2); g.gain.setValueAtTime(vol, t + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lg.connect(g.gain); s.connect(f); f.connect(g); g.connect(out); s.start(t); lfo.start(t); s.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  }
  private horn(out: GainNode, t: number, f: number, dur: number, vol: number): void {
    const c = this.eng.ctx!;
    for (const [mult, amp, type] of [[1, 1, 'sawtooth'], [0.5, 0.6, 'triangle'], [1.5, 0.3, 'sawtooth']] as const) {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f * mult * 0.97, t); o.frequency.linearRampToValueAtTime(f * mult, t + 0.25);
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(300, t); fl.frequency.linearRampToValueAtTime(1400, t + dur * 0.5); fl.frequency.linearRampToValueAtTime(300, t + dur);
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * amp, t + 0.3); g.gain.setValueAtTime(vol * amp, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
    }
  }
}
