/**
 * Web Audio backbone: context, buses, a procedural cathedral reverb, and helper nodes.
 * The context starts on the first user gesture (browser autoplay policy).
 */
export class AudioEngine {
  ctx: BaseAudioContext | null = null;
  master!: GainNode;
  sfxBus!: GainNode;
  musicBus!: GainNode;
  ambientBus!: GainNode;
  reverbSend!: GainNode;
  private noise: AudioBuffer | null = null;
  private volumes = { master: 1, sfx: 0.9, music: 0.55 };
  muted = false;

  get ready(): boolean { return !!this.ctx && (this.ctx.state === 'running' || this.ctx instanceof OfflineAudioContext); }
  get now(): number { return this.ctx?.currentTime ?? 0; }

  /** Build the bus graph on any context (live or offline). */
  attach(ctx: BaseAudioContext): void {
    this.ctx = ctx;
    this.buildGraph();
  }

  /** Create or resume the context. Safe to call on every click. */
  async unlock(): Promise<boolean> {
    if (!this.ctx) {
      try { this.ctx = new AudioContext({ latencyHint: 'interactive' }); } catch { return false; }
      this.buildGraph();
    }
    const live = this.ctx as AudioContext;
    if (live.state !== 'running') { try { await live.resume(); } catch { /* still locked */ } }
    return live.state === 'running';
  }

  private buildGraph(): void {
    {
      const c = this.ctx!;
      // master → soft limiter → output, so stacked effects never clip
      const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.12;
      limiter.connect(c.destination);
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volumes.master; this.master.connect(limiter);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.volumes.sfx; this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.volumes.music; this.musicBus.connect(this.master);
      this.ambientBus = c.createGain(); this.ambientBus.gain.value = 0.5; this.ambientBus.connect(this.master);
      // reverb: exponentially decaying stereo noise, 2.6 s, rolled off like stone
      const conv = c.createConvolver();
      conv.buffer = this.impulse(2.6, 2.2);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
      this.reverbSend = c.createGain(); this.reverbSend.gain.value = 0.35;
      this.reverbSend.connect(conv); conv.connect(lp); lp.connect(this.master);
      this.load();
    }
  }

  setVolume(bus: 'master' | 'sfx' | 'music', v: number): void {
    this.volumes[bus] = v; this.save();
    if (!this.ctx) return;
    const node = bus === 'master' ? this.master : bus === 'sfx' ? this.sfxBus : this.musicBus;
    node.gain.setTargetAtTime(bus === 'master' && this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  getVolume(bus: 'master' | 'sfx' | 'music'): number { return this.volumes[bus]; }
  toggleMute(): boolean { this.muted = !this.muted; this.save(); if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, this.ctx.currentTime, 0.05); return this.muted; }

  private impulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx!; const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 400 ? i / 400 : 1); }
    return buf;
  }

  /** 2 s of white noise, looped by callers. */
  noiseBuffer(): AudioBuffer {
    if (this.noise) return this.noise;
    const c = this.ctx!; const len = c.sampleRate * 2;
    const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf; return buf;
  }

  private save(): void { try { localStorage.setItem('necromantle.audio', JSON.stringify({ ...this.volumes, muted: this.muted })); } catch { /* ignore */ } }
  private load(): void {
    try {
      const raw = localStorage.getItem('necromantle.audio'); if (!raw) return;
      const v = JSON.parse(raw); this.volumes = { master: v.master ?? 1, sfx: v.sfx ?? 0.9, music: v.music ?? 0.55 }; this.muted = !!v.muted;
      this.master.gain.value = this.muted ? 0 : this.volumes.master; this.sfxBus.gain.value = this.volumes.sfx; this.musicBus.gain.value = this.volumes.music;
    } catch { /* ignore */ }
  }
}
