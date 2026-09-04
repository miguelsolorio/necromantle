import { Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, TrailMesh, Vector3 } from '@babylonjs/core';
import { PALETTE } from '@/content/palette';
import type { Enemy } from '@/enemies/enemy';
import type { Player } from '@/player/player';
import type { Vfx } from '@/vfx/vfx';
import type { World } from '@/world/world';
import { damp } from '@/core/mathx';

export type Visual = 'bolt' | 'orb' | 'shard';
export interface ProjectileSpec {
  team: 'player' | 'enemy';
  pos: Vector3; dir: Vector3; speed: number; radius: number; range: number;
  homing?: number; target?: Enemy | null; pierce?: boolean; visual: Visual;
  onHitEnemy?: (e: Enemy, pos: Vector3, dir: Vector3) => void;
  onHitPlayer?: (pos: Vector3) => void;
  onExpire?: (pos: Vector3) => void;
  onTick?: (pos: Vector3) => void;
}

interface Projectile extends ProjectileSpec {
  mesh: Mesh; trail: TrailMesh | null; light: PointLight | null;
  travelled: number; hitSet: Set<Enemy>; alive: boolean; vel: Vector3; tick: number;
}

/** Swept-sphere projectiles for both teams. Visual bodies are built per kind and reused. */
export class Projectiles {
  private list: Projectile[] = [];
  private free: Record<Visual, Projectile[]> = { bolt: [], orb: [], shard: [] };
  private mats: Record<Visual, StandardMaterial>;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private nearby: Enemy[] = [];

  constructor(private scene: Scene, private vfx: Vfx) {
    const mk = (name: string, c: Color3) => { const m = new StandardMaterial(`proj.${name}`, scene); m.emissiveColor = c; m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.disableLighting = true; return m; };
    this.mats = { bolt: mk('bolt', PALETTE.arcaneWhite), orb: mk('orb', PALETTE.arcaneCore), shard: mk('shard', new Color3(0.6, 1, 0.5)) };
  }

  private build(visual: Visual): Projectile {
    let mesh: Mesh; let trail: TrailMesh | null = null; let light: PointLight | null = null;
    if (visual === 'bolt') {
      mesh = MeshBuilder.CreateSphere('proj.bolt', { diameter: 0.34, segments: 6 }, this.scene);
      mesh.scaling.set(1, 1, 2.6);
      trail = new TrailMesh('proj.boltTrail', mesh, this.scene, 0.16, 14, true);
      const tm = this.mats.bolt.clone('proj.boltTrailMat'); tm.emissiveColor = PALETTE.arcane.clone(); tm.alpha = 0.7; trail.material = tm;
    } else if (visual === 'orb') {
      mesh = MeshBuilder.CreateSphere('proj.orb', { diameter: 1.7, segments: 12 }, this.scene);
      trail = new TrailMesh('proj.orbTrail', mesh, this.scene, 0.7, 40, true);
      const tm = this.mats.orb.clone('proj.orbTrailMat'); tm.emissiveColor = PALETTE.arcane.clone(); tm.alpha = 0.55; trail.material = tm;
      light = new PointLight('proj.orbLight', Vector3.Zero(), this.scene);
      light.diffuse = PALETTE.arcane.clone(); light.intensity = 10; light.range = 11; light.parent = mesh; light.renderPriority = 65;
    } else {
      mesh = MeshBuilder.CreateSphere('proj.shard', { diameter: 0.5, segments: 6 }, this.scene);
      mesh.scaling.set(1, 1, 1.8);
    }
    mesh.material = this.mats[visual];
    mesh.isPickable = false;
    if (trail) { trail.isPickable = false; }
    return { team: 'player', pos: new Vector3(), dir: new Vector3(), speed: 0, radius: 0.3, range: 10, visual, mesh, trail, light, travelled: 0, hitSet: new Set(), alive: false, vel: new Vector3(), tick: 0 };
  }

  spawn(spec: ProjectileSpec): void {
    const p = this.free[spec.visual].pop() ?? this.build(spec.visual);
    Object.assign(p, spec);
    p.pos = spec.pos.clone(); p.dir = spec.dir.clone().normalize();
    p.vel.copyFrom(p.dir).scaleInPlace(p.speed);
    p.travelled = 0; p.hitSet.clear(); p.alive = true; p.tick = 0;
    p.mesh.position.copyFrom(p.pos); p.mesh.lookAt(p.pos.add(p.dir));
    p.mesh.setEnabled(true);
    if (p.trail) { p.trail.setEnabled(true); p.trail.reset(); }
    if (p.light) p.light.setEnabled(true);
    this.list.push(p);
  }

  private kill(p: Projectile): void {
    p.alive = false;
    p.mesh.setEnabled(false);
    if (p.trail) p.trail.setEnabled(false);
    if (p.light) p.light.setEnabled(false);
    p.mesh.position.y = -100;
    this.free[p.visual].push(p);
  }

  update(dt: number, enemiesNear: (pos: Vector3, r: number, out: Enemy[]) => Enemy[], player: Player, world: World): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!p.alive) { this.list.splice(i, 1); continue; }
      // homing: bend velocity toward the soft target's chest
      if (p.homing && p.target && p.target.alive) {
        this.tmp.copyFrom(p.target.hitCenter()).subtractInPlace(p.pos).normalize();
        p.dir.x = damp(p.dir.x, this.tmp.x, p.homing * 30, dt); p.dir.y = damp(p.dir.y, this.tmp.y, p.homing * 30, dt); p.dir.z = damp(p.dir.z, this.tmp.z, p.homing * 30, dt);
        p.dir.normalize(); p.vel.copyFrom(p.dir).scaleInPlace(p.speed);
      }
      const stepLen = p.speed * dt;
      this.tmp2.copyFrom(p.pos).addInPlace(this.tmp.copyFrom(p.vel).scaleInPlace(dt));
      // static world
      const wall = world.obstruct(p.pos, this.tmp2, p.radius * 0.5);
      if (wall !== null) { p.onExpire?.(p.pos.add(p.dir.scale(Math.max(0, wall - p.radius)))); this.kill(p); continue; }
      p.pos.copyFrom(this.tmp2);
      p.travelled += stepLen;
      // targets
      if (p.team === 'player') {
        const hits = enemiesNear(p.pos, p.radius + 1.2, this.nearby);
        for (const e of hits) {
          if (!e.alive || p.hitSet.has(e)) continue;
          const c = e.hitCenter();
          const dy = Math.abs(c.y - p.pos.y);
          const dxz = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
          if (dxz < e.radius + p.radius && dy < e.height * 0.6 + p.radius) {
            p.hitSet.add(e);
            p.onHitEnemy?.(e, p.pos.clone(), p.dir);
            if (!p.pierce) { this.kill(p); break; }
          }
        }
        if (!p.alive) continue;
      } else {
        const pc = player.chest();
        if (!player.dead && Math.hypot(pc.x - p.pos.x, pc.z - p.pos.z) < 0.55 + p.radius && Math.abs(pc.y - p.pos.y) < 1.2) {
          p.onHitPlayer?.(p.pos.clone()); this.kill(p); continue;
        }
      }
      if (p.travelled >= p.range || p.pos.y < -5) { p.onExpire?.(p.pos.clone()); this.kill(p); continue; }
      p.tick += dt;
      if (p.onTick && p.tick > 0.05) { p.tick = 0; p.onTick(p.pos); }
      p.mesh.position.copyFrom(p.pos);
      p.mesh.lookAt(this.tmp.copyFrom(p.pos).addInPlace(p.dir));
      if (p.visual === 'orb') p.mesh.rotation.y += dt * 4;
    }
  }

  get count(): number { return this.list.length; }
  clear(): void { for (const p of this.list) this.kill(p); this.list.length = 0; }
}
