import { Color3, Color4, Mesh, MeshBuilder, ParticleSystem, Scene, StandardMaterial, Texture, Vector3 } from '@babylonjs/core';
import { PALETTE, c4 } from '@/content/palette';
import type { Element } from '@/content/abilities';
import { Textures } from '@/rendering/textures';
import { LightPool } from './lightPool';

interface Timed { mesh: Mesh; t: number; dur: number; kind: 'ring' | 'decal' | 'ghost'; from: number; to: number }

/**
 * Effects are composed from four families: particle bursts, flat ground rings/decals, pooled lights and ghost
 * meshes. Each ability's effect is split into anticipation / travel / impact / aftermath (design section 31).
 */
export class Vfx {
  readonly lights: LightPool;
  density = 1;
  private bursts = new Map<string, ParticleSystem>();
  private timed: Timed[] = [];
  private ringMat: StandardMaterial;
  private decalMat: StandardMaterial;
  private ghostMat: StandardMaterial;
  private ringSrc: Mesh;
  private decalSrc: Mesh;
  private ghostSrc: Mesh;

  constructor(private scene: Scene) {
    this.lights = new LightPool(scene, 3);
    const dot = Textures.softDot(scene), spark = Textures.spark(scene);

    this.mkBurst('arcaneImpact', dot, { c1: PALETTE.arcaneWhite, c2: PALETTE.arcane, size: [0.25, 0.6], life: [0.18, 0.4], power: [2, 6], gravity: -4, cap: 400 });
    this.mkBurst('arcaneSpark', spark, { c1: PALETTE.arcaneCore, c2: PALETTE.arcane, size: [0.06, 0.16], life: [0.25, 0.55], power: [4, 9], gravity: -14, cap: 400 });
    this.mkBurst('orbBoom', dot, { c1: PALETTE.arcaneWhite, c2: PALETTE.arcane, size: [0.8, 2.2], life: [0.35, 0.8], power: [3, 9], gravity: -2, cap: 300 });
    this.mkBurst('ember', spark, { c1: PALETTE.fireCore, c2: PALETTE.fire, size: [0.08, 0.22], life: [0.5, 1.2], power: [4, 12], gravity: -9, cap: 600 });
    this.mkBurst('fireBloom', dot, { c1: PALETTE.fireCore, c2: PALETTE.crimson, size: [0.9, 2.4], life: [0.3, 0.7], power: [2, 7], gravity: 3, cap: 300 });
    this.mkBurst('smoke', dot, { c1: new Color3(0.25, 0.2, 0.25), c2: new Color3(0.08, 0.06, 0.1), size: [0.8, 2.0], life: [0.8, 1.6], power: [0.5, 2], gravity: 1.2, cap: 300, blend: ParticleSystem.BLENDMODE_STANDARD, alpha: 0.45 });
    this.mkBurst('bone', spark, { c1: new Color3(0.85, 0.8, 0.7), c2: new Color3(0.5, 0.45, 0.4), size: [0.08, 0.2], life: [0.6, 1.2], power: [3, 9], gravity: -18, cap: 500, blend: ParticleSystem.BLENDMODE_STANDARD });
    this.mkBurst('gore', dot, { c1: PALETTE.crimson, c2: new Color3(0.3, 0.02, 0.04), size: [0.15, 0.5], life: [0.4, 0.9], power: [3, 8], gravity: -16, cap: 500, blend: ParticleSystem.BLENDMODE_STANDARD, alpha: 0.9 });
    this.mkBurst('heal', dot, { c1: PALETTE.healthBright, c2: PALETTE.health, size: [0.2, 0.5], life: [0.4, 0.9], power: [1, 3], gravity: 4, cap: 200 });
    this.mkBurst('gold', spark, { c1: new Color3(1, 0.95, 0.7), c2: PALETTE.gilt, size: [0.08, 0.25], life: [0.6, 1.4], power: [2, 7], gravity: -6, cap: 400 });
    this.mkBurst('rift', dot, { c1: PALETTE.arcaneCore, c2: PALETTE.arcane, size: [0.2, 0.7], life: [0.25, 0.6], power: [0.5, 2], gravity: 1, cap: 400 });
    this.mkBurst('venom', dot, { c1: new Color3(0.7, 1, 0.5), c2: new Color3(0.2, 0.6, 0.2), size: [0.2, 0.5], life: [0.2, 0.5], power: [2, 5], gravity: -4, cap: 300 });

    this.ringMat = new StandardMaterial('vfx.ring', scene);
    this.ringMat.diffuseTexture = Textures.ring(scene); this.ringMat.opacityTexture = Textures.ring(scene);
    this.ringMat.emissiveColor = PALETTE.fire.clone(); this.ringMat.disableLighting = true; this.ringMat.backFaceCulling = false;
    this.ringMat.alphaMode = 1; // add
    this.ringSrc = MeshBuilder.CreatePlane('vfx.ringSrc', { size: 1 }, scene);
    this.ringSrc.rotation.x = Math.PI / 2; this.ringSrc.material = this.ringMat; this.ringSrc.isVisible = false; this.ringSrc.isPickable = false; this.ringSrc.position.y = -500;

    this.decalMat = new StandardMaterial('vfx.decal', scene);
    this.decalMat.diffuseTexture = Textures.scorch(scene); this.decalMat.opacityTexture = Textures.scorch(scene);
    this.decalMat.emissiveColor = new Color3(0.1, 0.025, 0.006); this.decalMat.diffuseColor = Color3.Black(); this.decalMat.alpha = 0.85;
    this.decalMat.disableLighting = true; this.decalMat.backFaceCulling = false;
    this.decalSrc = MeshBuilder.CreatePlane('vfx.decalSrc', { size: 1 }, scene);
    this.decalSrc.rotation.x = Math.PI / 2; this.decalSrc.material = this.decalMat; this.decalSrc.isVisible = false; this.decalSrc.isPickable = false; this.decalSrc.position.y = -500;

    this.ghostMat = new StandardMaterial('vfx.ghost', scene);
    this.ghostMat.emissiveColor = PALETTE.arcane.scale(0.7); this.ghostMat.diffuseColor = Color3.Black(); this.ghostMat.alpha = 0.28; this.ghostMat.disableLighting = true; this.ghostMat.alphaMode = 1;
    this.ghostSrc = MeshBuilder.CreateCapsule("vfx.ghostSrc", { radius: 0.32, height: 1.7, tessellation: 8, subdivisions: 1 }, scene);
    this.ghostSrc.material = this.ghostMat; this.ghostSrc.isVisible = false; this.ghostSrc.isPickable = false; this.ghostSrc.position.y = -500;
  }

  private mkBurst(name: string, tex: Texture, o: { c1: Color3; c2: Color3; size: [number, number]; life: [number, number]; power: [number, number]; gravity: number; cap: number; blend?: number; alpha?: number }): void {
    const ps = new ParticleSystem(`vfx.${name}`, o.cap, this.scene);
    ps.particleTexture = tex;
    ps.emitter = new Vector3(0, -100, 0);
    ps.minEmitBox = new Vector3(-0.1, -0.1, -0.1); ps.maxEmitBox = new Vector3(0.1, 0.1, 0.1);
    ps.color1 = c4(o.c1, o.alpha ?? 1); ps.color2 = c4(o.c2, o.alpha ?? 1); ps.colorDead = new Color4(0, 0, 0, 0);
    ps.minSize = o.size[0]; ps.maxSize = o.size[1];
    ps.minLifeTime = o.life[0]; ps.maxLifeTime = o.life[1];
    ps.emitRate = 0;
    ps.blendMode = o.blend ?? ParticleSystem.BLENDMODE_ADD;
    ps.gravity = new Vector3(0, o.gravity, 0);
    ps.createSphereEmitter(0.25, 1);
    ps.minEmitPower = o.power[0]; ps.maxEmitPower = o.power[1];
    ps.updateSpeed = 1 / 60;
    ps.addSizeGradient(0, 0.6); ps.addSizeGradient(0.25, 1); ps.addSizeGradient(1, 0.15);
    ps.start();
    this.bursts.set(name, ps);
  }

  burst(name: string, pos: Vector3, count: number, dir?: Vector3, spread = 1): void {
    const ps = this.bursts.get(name);
    if (!ps) return;
    (ps.emitter as Vector3).copyFrom(pos);
    if (dir) { ps.direction1 = dir.scale(1).addInPlaceFromFloats(-spread, -spread, -spread); ps.direction2 = dir.scale(1).addInPlaceFromFloats(spread, spread, spread); }
    ps.manualEmitCount = Math.max(1, Math.round(count * this.density));
  }

  private spawnTimed(src: Mesh, kind: Timed['kind'], pos: Vector3, from: number, to: number, dur: number, color?: Color3): Mesh {
    const m = src.createInstance(`${src.name}.i${this.timed.length}`) as unknown as Mesh;
    m.position.copyFrom(pos); m.scaling.setAll(from);
    m.isPickable = false;
    if (color && kind === 'ring') { /* instances share material; ring colour switches per family below */ }
    this.timed.push({ mesh: m, t: 0, dur, kind, from, to });
    return m;
  }

  // ------------------------------------------------------------------ composed effects

  boltImpact(pos: Vector3, dir?: Vector3): void {
    this.burst("arcaneImpact", pos, 10);
    this.burst("arcaneSpark", pos, 16, dir ? dir.scale(-1) : undefined, 0.9);
    this.lights.flash(pos, PALETTE.arcane, 14, 0.18, 6);
  }
  hitSpark(pos: Vector3, element: Element): void {
    if (element === 'fire') this.burst('ember', pos, 8); else this.burst('arcaneSpark', pos, 6);
    this.burst('bone', pos, 4);
  }
  orbTravelTick(pos: Vector3): void { this.burst('arcaneImpact', pos, 2); }
  orbExplode(pos: Vector3, radius: number): void {
    this.burst('orbBoom', pos, 40); this.burst('arcaneSpark', pos, 60); this.burst('smoke', pos, 10);
    this.lights.flash(pos, PALETTE.arcane, 40, 0.45, radius * 4);
    const r = this.spawnTimed(this.ringSrc, 'ring', new Vector3(pos.x, pos.y - 0.9, pos.z), 0.5, radius * 2.4, 0.4);
    r.position.y = Math.max(0.05, r.position.y);
  }
  nova(pos: Vector3, radius: number): void {
    const p = new Vector3(pos.x, pos.y + 0.06, pos.z);
    this.burst('fireBloom', pos.add(new Vector3(0, 0.8, 0)), 50); this.burst('ember', pos.add(new Vector3(0, 0.6, 0)), 140); this.burst('smoke', pos.add(new Vector3(0, 0.6, 0)), 20);
    this.lights.flash(pos.add(new Vector3(0, 1.2, 0)), PALETTE.fire, 60, 0.5, radius * 3.2);
    this.spawnTimed(this.ringSrc, 'ring', p, 0.6, radius * 2.15, 0.38);
    const d = this.spawnTimed(this.decalSrc, "decal", p, radius * 1.9, radius * 1.9, 7);
    d.position.y = Math.max(d.position.y, 0.1);
  }
  rift(from: Vector3, to: Vector3): void {
    const n = 3;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const p = Vector3.Lerp(from, to, t).addInPlaceFromFloats(0, 0.95, 0);
      const g = this.spawnTimed(this.ghostSrc, "ghost", p, 1, 1.05, 0.22 + t * 0.1);
      g.scaling.setAll(1);
      this.burst('rift', p, 6);
    }
    this.lights.flash(to.add(new Vector3(0, 1.2, 0)), PALETTE.arcaneCore, 20, 0.3, 6);
    this.burst('arcaneSpark', to.add(new Vector3(0, 1, 0)), 16);
  }
  enemyDeath(pos: Vector3, dir?: Vector3): void {
    this.burst('bone', pos, 26, dir, 1.5); this.burst('gore', pos, 14, dir, 1.2); this.burst('smoke', pos, 4);
  }
  cultistImpact(pos: Vector3): void { this.burst('venom', pos, 12); this.lights.flash(pos, new Color3(0.4, 1, 0.4), 8, 0.15, 4); }
  globePickup(pos: Vector3): void { this.burst('heal', pos, 30); this.lights.flash(pos, PALETTE.healthBright, 14, 0.35, 5); }
  levelUp(pos: Vector3): void {
    this.burst('gold', pos, 120); this.lights.flash(pos.add(new Vector3(0, 1.5, 0)), PALETTE.gilt, 50, 0.9, 12);
    this.spawnTimed(this.ringSrc, 'ring', new Vector3(pos.x, pos.y + 0.05, pos.z), 0.5, 9, 0.6);
  }

  update(dt: number): void {
    this.lights.update(dt);
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      if (t.kind === 'ring') { const e = 1 - (1 - k) * (1 - k); t.mesh.scaling.setAll(t.from + (t.to - t.from) * e); }
      else if (t.kind === 'ghost') { t.mesh.scaling.setAll(t.from + (t.to - t.from) * k); t.mesh.position.y += dt * 0.4; }
      // instances cannot fade individually; drop them near the end (rings are short-lived anyway)
      if (t.kind === 'ring' && k > 0.85) t.mesh.setEnabled(false);
      if (t.kind === 'ghost' && k > 0.8) t.mesh.setEnabled(false);
      if (t.kind === 'decal' && k > 0.9) t.mesh.setEnabled(false);
      if (k >= 1) { t.mesh.dispose(); this.timed.splice(i, 1); }
    }
  }
}
