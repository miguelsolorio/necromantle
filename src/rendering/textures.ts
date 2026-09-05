import { DynamicTexture, Scene, Texture } from '@babylonjs/core';

/** Procedural textures so VFX and ground need no external files. Cached per scene. */
const cache = new WeakMap<Scene, Map<string, Texture>>();

function make(scene: Scene, key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, opts: { alpha?: boolean; wrap?: boolean } = {}): Texture {
  let m = cache.get(scene);
  if (!m) { m = new Map(); cache.set(scene, m); }
  const hit = m.get(key);
  if (hit) return hit;
  const tex = new DynamicTexture(`tex.${key}`, size, scene, true);
  const ctx = tex.getContext() as unknown as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  tex.update(false);
  tex.hasAlpha = opts.alpha !== false;
  if (opts.wrap) { tex.wrapU = Texture.WRAP_ADDRESSMODE; tex.wrapV = Texture.WRAP_ADDRESSMODE; }
  m.set(key, tex);
  return tex;
}

export const Textures = {
  /** Soft radial dot for particles. */
  softDot: (scene: Scene) => make(scene, 'softDot', 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }),
  /** Hard-cored dot for sparks and bone chips. */
  spark: (scene: Scene) => make(scene, 'spark', 64, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(0.7, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }),
  /** Ring for nova/shockwave planes. */
  ring: (scene: Scene) => make(scene, 'ring', 256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.62, 'rgba(255,255,255,0)'); g.addColorStop(0.78, 'rgba(255,255,255,0.9)'); g.addColorStop(0.9, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  }),
  /** Scorch/ground-glow decal: dark centre, hot rim, feathered edge. */
  scorch: (scene: Scene) => make(scene, 'scorch', 256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.4, 'rgba(255,255,255,0.55)'); g.addColorStop(0.75, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    // grit
    for (let i = 0; i < 400; i++) { const a = Math.random() * Math.PI * 2, r = Math.random() * s * 0.48; ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; ctx.fillRect(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r, 2, 2); }
  }),
  /** Painterly stone: low-frequency blotches with darker grout lines. Tiles. */
  stone: (scene: Scene) => make(scene, 'stone', 512, (ctx, s) => {
    ctx.fillStyle = '#5a5560'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1400; i++) {
      const r = 6 + Math.random() * 40; const v = 70 + Math.random() * 50; const t = 0.9 + Math.random() * 0.2;
      ctx.fillStyle = `rgba(${v * 1.02 | 0},${v * t | 0},${v * 1.08 | 0},${0.12 + Math.random() * 0.25})`;
      ctx.beginPath(); ctx.ellipse(Math.random() * s, Math.random() * s, r, r * (0.5 + Math.random()), Math.random() * 3, 0, Math.PI * 2); ctx.fill();
    }
    // flagstone grout
    ctx.strokeStyle = 'rgba(20,16,24,0.55)'; ctx.lineWidth = 6;
    const cell = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const ox = (Math.random() - 0.5) * 18, oy = (Math.random() - 0.5) * 18;
      ctx.strokeRect(x * cell + 4 + ox, y * cell + 4 + oy, cell - 8, cell - 8);
    }
    // grime
    for (let i = 0; i < 300; i++) { ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`; const r = 2 + Math.random() * 10; ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2); ctx.fill(); }
  }, { alpha: false, wrap: true }),
  /** Night sky for the dome: navy zenith to blue-grey horizon with faint stars. Mapped with the sphere UVs (v = latitude). */
  sky: (scene: Scene) => make(scene, "sky", 512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, "#2a3358"); g.addColorStop(0.42, "#1a2140"); g.addColorStop(0.55, "#0d1226"); g.addColorStop(1, "#05060f");
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) { const y = Math.random() * s * 0.5; const a = Math.random() * 0.8; ctx.fillStyle = `rgba(220,225,255,${a})`; const r = Math.random() < 0.1 ? 1.6 : 0.9; ctx.beginPath(); ctx.arc(Math.random() * s, y, r, 0, Math.PI * 2); ctx.fill(); }
  }, { alpha: false }),
  /** Frost floor plate: pale centre, crystalline cracks, feathered rim. */
  frost: (scene: Scene) => make(scene, 'frost', 256, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.55, 'rgba(255,255,255,0.45)'); g.addColorStop(0.88, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2; let x = s / 2, y = s / 2; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { const r = (s / 2) * (0.15 + k * 0.14); x = s / 2 + Math.cos(a + (Math.random() - 0.5) * 0.6) * r; y = s / 2 + Math.sin(a + (Math.random() - 0.5) * 0.6) * r; ctx.lineTo(x, y); } ctx.stroke(); }
  }),
  /** Rune ring for the Cataclysm storm: two concentric bands with tick marks. */
  rune: (scene: Scene) => make(scene, 'rune', 256, (ctx, s) => {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.36, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(s / 2 + Math.cos(a) * s * 0.37, s / 2 + Math.sin(a) * s * 0.37); ctx.lineTo(s / 2 + Math.cos(a) * s * (i % 3 ? 0.41 : 0.45), s / 2 + Math.sin(a) * s * (i % 3 ? 0.41 : 0.45)); ctx.stroke(); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const x = s / 2 + Math.cos(a) * s * 0.26, y = s / 2 + Math.sin(a) * s * 0.26; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x, y - 12); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 12); ctx.closePath(); ctx.stroke(); }
  }),
  /** Grey noise used as roughness/detail. Tiles. */
  noise: (scene: Scene) => make(scene, 'noise', 256, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < img.data.length; i += 4) { const v = 120 + Math.random() * 110; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    ctx.putImageData(img, 0, 0);
  }, { alpha: false, wrap: true }),
};
