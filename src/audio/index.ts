import type { Vector3 } from '@babylonjs/core';
import { AudioEngine } from './engine';
import { Music } from './music';
import { Sfx, type SfxName } from './sfx';
import { Music as MusicClass } from './music';

/**
 * Game-facing audio facade. `play(name, worldPos?)` pans and attenuates by distance from the listener
 * (the player), so a crowd of hits spreads across the stereo field instead of piling up in the centre.
 */
class AudioFacade {
  readonly engine = new AudioEngine();
  readonly sfx = new Sfx(this.engine);
  readonly music = new Music(this.engine);
  private listener = { x: 0, z: 0, yaw: 0 };

  async unlock(): Promise<void> { if (await this.engine.unlock()) this.music.start(); }
  get ready(): boolean { return this.engine.ready; }

  setListener(pos: Vector3, yaw: number): void { this.listener.x = pos.x; this.listener.z = pos.z; this.listener.yaw = yaw; }

  play(name: SfxName, pos?: Vector3, opts: { gain?: number; pitch?: number } = {}): void {
    if (!this.engine.ready) return;
    let pan = 0, gain = opts.gain ?? 1;
    if (pos) {
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      // rotate into listener space: right = +x after removing camera yaw
      const right = dx * Math.cos(this.listener.yaw) - dz * Math.sin(this.listener.yaw);
      pan = Math.max(-0.8, Math.min(0.8, right / 10));
      gain *= 1 / (1 + d * d * 0.012);
      if (gain < 0.04) return;
    }
    this.sfx.play(name, { pan, gain, pitch: opts.pitch });
  }

  setIntensity(v: number): void { this.music.setIntensity(v); }

  /**
   * Render a demo of the score plus a scripted burst of effects to a WAV data URL (dev tooling: lets the
   * soundtrack be reviewed without a live tab). Quiet exploration for the first half, combat after.
   */
  async renderDemo(seconds = 24): Promise<string> {
    const rate = 44100;
    const ctx = new OfflineAudioContext(2, rate * seconds, rate);
    const eng = new AudioEngine(); eng.attach(ctx);
    const music = new MusicClass(eng); music.start();
    music.scheduleUntil(seconds, (t) => (t < seconds * 0.45 ? 0 : Math.min(1, (t - seconds * 0.45) / 4)));
    const sfx = new Sfx(eng);
    const at = (t: number, name: SfxName, pan = 0, gain = 1) => { (ctx as any).__t = t; sfx.playAt(name, t, { pan, gain }); };
    at(2, 'footstep', 0, 0.4); at(2.35, 'footstep', 0, 0.4); at(2.7, 'footstep', 0, 0.4);
    at(4, 'boltCast', 0, 0.6); at(4.25, 'boltImpact', 0.3, 0.7); at(4.5, 'boltCast', 0, 0.6); at(4.75, 'boltImpact', 0.4, 0.7); at(4.9, 'enemyHit', 0.4, 0.8);
    at(6, 'globe', -0.3); at(8, 'door');
    const c0 = seconds * 0.45;
    at(c0 + 0.5, 'waveStart'); at(c0 + 2, 'orbCast'); at(c0 + 3.4, 'orbExplode', 0.2); at(c0 + 3.5, 'enemyDeath', 0.2); at(c0 + 3.6, 'enemyDeath', -0.4);
    for (let i = 0; i < 6; i++) { at(c0 + 4.5 + i * 0.3, 'boltCast', 0, 0.6); at(c0 + 4.7 + i * 0.3, 'enemyHit', (i % 2 ? 0.5 : -0.5), 0.8); }
    at(c0 + 6.8, 'playerHurt'); at(c0 + 7.2, 'nova'); at(c0 + 7.4, 'enemyDeath', 0.6); at(c0 + 7.5, 'enemyDeath', -0.6); at(c0 + 7.6, 'enemyDeath', 0.1);
    at(c0 + 9, 'rift'); at(c0 + 10.2, 'cultistShot', 0.7); at(c0 + 11, 'eliteDeath', 0.2); at(c0 + 11.6, 'levelUp');
    const buf = await ctx.startRendering();
    return encodeWav(buf);
  }
}

/** 16-bit PCM WAV as a data URL. */
function encodeWav(buf: AudioBuffer): string {
  const ch = buf.numberOfChannels, len = buf.length, rate = buf.sampleRate;
  const bytes = new ArrayBuffer(44 + len * ch * 2); const v = new DataView(bytes);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + len * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, len * ch * 2, true);
  let o = 44;
  for (let i = 0; i < len; i++) for (let c = 0; c < ch; c++) { const x = Math.max(-1, Math.min(1, buf.getChannelData(c)[i])); v.setInt16(o, x < 0 ? x * 32768 : x * 32767, true); o += 2; }
  let bin = ''; const u8 = new Uint8Array(bytes); for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.subarray(i, i + 8192));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

export const audio = new AudioFacade();
