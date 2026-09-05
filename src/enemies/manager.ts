import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { Textures } from "@/rendering/textures";
import { audio } from "@/audio";
import type { AssetLoader } from '@/assets/loader';
import { ENEMIES, type EnemyDef, type EnemyId } from '@/content/enemies';
import type { EventBus } from '@/core/events';
import { clamp, rand } from '@/core/mathx';
import type { RenderRig } from '@/rendering/setup';
import type { Player } from '@/player/player';
import type { Projectiles } from '@/combat/projectiles';
import { SpatialHash } from '@/combat/spatialHash';
import type { Vfx } from '@/vfx/vfx';
import type { World } from '@/world/world';
import { Enemy } from './enemy';

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/**
 * Owns the enemy pool, group steering (ring slots + separation), attacks and deaths.
 * Melee enemies claim slots on two rings around the player so packs surround rather than queue (rule R-03).
 */
export class EnemyManager {
  readonly pool: Enemy[] = [];
  readonly hash = new SpatialHash<Enemy>(3);
  frozen = false;
  hpMult = 1;
  private nextId = 1;
  private ringT = 0;
  private tmp = new Vector3();
  private push = new Vector3();
  private near: Enemy[] = [];
  private frame = 0;
  private modelsReady = new Set<EnemyId>();
  private blobSrc: Mesh | null = null;

  constructor(private scene: Scene, private loader: AssetLoader, private rig: RenderRig, private bus: EventBus, private vfx: Vfx, private projectiles: Projectiles, private world: World) {}

  setWorld(w: World): void { this.world = w; }

  async preload(ids: EnemyId[]): Promise<void> {
    await this.loader.preload(ids.map((id) => ENEMIES[id].model));
    for (const id of ids) this.modelsReady.add(id);
  }

  get alive(): Enemy[] { return this.pool.filter((e) => e.alive); }
  countNear(p: Vector3, r: number): number { return this.hash.query(p, r, this.near).length; }
  queryNear(p: Vector3, r: number, out: Enemy[]): Enemy[] { return this.hash.query(p, r, out); }

  /** Spawn a new enemy of `id`. Models are cloned lazily per pooled slot and reused. */
  async spawn(id: EnemyId, pos: Vector3, elite = false): Promise<Enemy> {
    const def = ENEMIES[id];
    let e = this.pool.find((x) => !x.alive && x.state === 'dead' && x.def?.id === id && x.deathTimer > 4 || (x.def?.id === id && !x.alive && x.root.position.y < -100));
    if (!e) {
      e = new Enemy(this.scene);
      const inst = await this.loader.instanceCharacter(def.model, `${id}.${this.nextId}`);
      e.bindModel(inst, def);
      this.tintModel(e, def);
      // blob shadow instead of a cascaded caster: 24 skinned casters cost ~400 draw calls per frame
      for (const m of inst.meshes) { if (/eyes/i.test(m.name)) this.rig.addGlow(m); }
      const blob = this.blobSource().createInstance(`blob.${this.nextId}`);
      blob.parent = e.root; blob.position.y = 0.05; blob.isPickable = false; blob.scaling.setAll(def.radius * 5.5);
      this.pool.push(e);
    }
    e.spawn(def, pos, elite, this.nextId++);
    e.hpMax = Math.round(e.hpMax * this.hpMult); e.hp = e.hpMax;
    e.slot = this.pool.indexOf(e);
    if (elite) this.styleElite(e, true); else this.styleElite(e, false);
    return e;
  }

  private blobSource(): Mesh {
    if (this.blobSrc) return this.blobSrc;
    const m = new StandardMaterial("blobMat", this.scene);
    m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black(); m.opacityTexture = Textures.softDot(this.scene); m.alpha = 0.75; m.disableLighting = true; m.backFaceCulling = false;
    const src = MeshBuilder.CreatePlane("blobSrc", { size: 1 }, this.scene);
    src.rotation.x = Math.PI / 2; src.material = m; src.isPickable = false; src.position.y = -500;
    this.blobSrc = src;
    return src;
  }

  /** Enemies read darker and less saturated than the world (rule R-07); eyes glow in the archetype colour. */
  private tintModel(e: Enemy, def: EnemyDef): void {
    for (const m of e.meshes) {
      const mat = m.material;
      if (!(mat instanceof PBRMaterial)) continue;
      if (/glow/i.test(mat.name) || /eyes/i.test(m.name)) {
        const own = mat.clone(`${mat.name}.${e.id}`); own.emissiveColor = Color3.FromHexString(def.eye); own.albedoColor = Color3.Black(); m.material = own;
      } else {
        const own = mat.clone(`${mat.name}.${e.id}`);
        own.albedoColor = new Color3(def.tint[0], def.tint[1], def.tint[2]); own.metallic = 0; own.roughness = 0.95; own.specularIntensity = 0.15;
        m.material = own;
      }
    }
  }
  private styleElite(e: Enemy, elite: boolean): void {
    for (const m of e.meshes) {
      const mat = m.material;
      if (!(mat instanceof PBRMaterial)) continue;
      if (/eyes/i.test(m.name) || /glow/i.test(mat.name)) { mat.emissiveColor = elite ? Color3.FromHexString('#FFB347') : Color3.FromHexString(e.def.eye); continue; }
      const base = elite ? new Color3(0.25, 0.12, 0.02) : Color3.Black();
      mat.emissiveColor = base.clone(); mat.metadata = { ...(mat.metadata ?? {}), baseEmissive: base };
    }
  }

  damage(e: Enemy, amount: number, opts: { dir?: Vector3 | null; knockback?: number; crit?: boolean; element?: string; pos?: Vector3 }): void {
    if (!e.alive) return;
    const killed = e.hurt(amount, opts.dir ?? null, opts.knockback ?? 0);
    const at = opts.pos ?? e.hitCenter();
    this.bus.emit('enemy:damaged', { pos: at.clone(), amount, crit: !!opts.crit, element: opts.element ?? 'arcane', killed });
    if (killed) {
      this.vfx.enemyDeath(e.hitCenter(), opts.dir ?? undefined);
      this.bus.emit('enemy:killed', { pos: e.position.clone(), xp: Math.round(e.def.xp * (e.elite ? 4 : 1)), elite: e.elite });
    }
  }

  /** Damage every living enemy within `radius` of `center`. */
  damageArea(center: Vector3, radius: number, amount: (e: Enemy) => number, opts: { knockback?: number; element?: string; crit?: boolean; burn?: { dps: number; dur: number } }): number {
    const hits = this.hash.query(center, radius + 0.8, this.near);
    let n = 0;
    for (const e of hits) {
      if (!e.alive) continue;
      const c = e.hitCenter();
      if (Math.hypot(c.x - center.x, c.z - center.z) > radius + e.radius) continue;
      const dir = new Vector3(e.position.x - center.x, 0, e.position.z - center.z);
      if (dir.lengthSquared() < 0.001) dir.set(rand(-1, 1), 0, rand(-1, 1));
      dir.normalize();
      if (opts.burn) e.applyBurn(opts.burn.dps, opts.burn.dur);
      this.damage(e, amount(e), { dir, knockback: opts.knockback, element: opts.element, crit: opts.crit, pos: c });
      n++;
    }
    return n;
  }

  update(dt: number, player: Player, god: boolean): void {
    this.frame++;
    this.ringT += dt * 0.25;
    this.hash.clear();
    const pp = player.position;
    let meleeIdx = 0;
    const alive = this.pool.filter((e) => e.alive);
    for (const e of alive) this.hash.insert(e);

    for (const e of this.pool) {
      if (!e.alive) {
        if (e.state === 'dead' && e.root.isEnabled()) { e.updateAnimation(dt); if (e.deathTimer > 5) e.hide(); }
        continue;
      }
      if (this.frozen) { e.updateAnimation(dt); continue; }
      const def = e.def;
      e.attackCd = Math.max(0, e.attackCd - dt);
      // safety net: anything that ends up below the courtyard floor is off the playable surfaces; put it back near the player
      if (e.position.y < 0 && e.state !== 'spawning') {
        const at = this.world.randomSpawn(pp, 5, 10);
        e.root.position.copyFrom(at); e.collider.position.copyFrom(at);
      }
      const dist = Vector3.Distance(e.position, pp);

      // burning
      if (e.burn > 0) {
        e.burn -= dt; e.burnTick += dt;
        if (e.burnTick >= 0.5) { e.burnTick = 0; this.damage(e, Math.round(e.burnDps * 0.5), { element: 'fire', pos: e.hitCenter() }); if (this.frame % 2 === 0) this.vfx.burst('ember', e.hitCenter(), 3); }
        if (!e.alive) continue;
      }

      // --- seek target ---
      if (def.attack.ranged) {
        // keep preferred range, drift sideways slowly
        const pr = def.attack.ranged.preferredRange;
        const a = Math.atan2(e.position.x - pp.x, e.position.z - pp.z) + Math.sin(this.ringT * 2 + e.slot) * 0.25;
        e.seek.set(pp.x + Math.sin(a) * pr, pp.y, pp.z + Math.cos(a) * pr);
      } else {
        const ring = meleeIdx < 8 ? 0 : 1;
        const count = ring === 0 ? 8 : 14;
        const idx = ring === 0 ? meleeIdx : meleeIdx - 8;
        const a = (idx / count) * Math.PI * 2 + e.slot * GOLDEN * 0.1 + this.ringT * (ring === 0 ? 1 : -0.6);
        const r = ring === 0 ? def.attack.range + 0.25 : def.attack.range + 3.2;
        e.seek.set(pp.x + Math.sin(a) * r, pp.y, pp.z + Math.cos(a) * r);
        meleeIdx++;
      }

      // --- state machine ---
      switch (e.state) {
        case 'spawning': e.timer += dt; if (e.timer > 2.5) e.state = 'chase'; break;
        case 'chase': {
          e.faceToward(dist < 4 ? pp : e.seek, dt);
          const inRange = def.attack.ranged ? dist < def.attack.range && dist > 3 : dist < def.attack.range + 0.15;
          if (inRange && e.attackCd <= 0 && !player.dead) {
            e.state = 'windup'; e.timer = 0;
            e.animator?.clearOneShot(); e.animator?.once(def.attack.anim, { speed: 1.25 });
          }
          break;
        }
        case 'windup': {
          e.timer += dt; e.faceToward(pp, dt, def.turnRate * 0.5);
          if (e.timer >= def.attack.windup) {
            e.state = 'recover'; e.timer = 0; e.attackCd = def.attack.cooldown + rand(0, 0.4);
            if (def.attack.ranged) this.fireShard(e, player);
            else if (dist < def.attack.range + 0.5 && !player.dead) {
              player.takeDamage(def.damage * (e.elite ? 1.8 : 1), god);
              this.vfx.burst('gore', player.chest(), 6);
            }
          }
          break;
        }
        case 'recover': e.timer += dt; if (e.timer >= def.attack.recovery) e.state = 'chase'; break;
        case 'stagger': e.timer -= dt; if (e.timer <= 0) e.state = 'chase'; break;
      }

      // --- separation ---
      this.push.setAll(0);
      const nb = this.hash.query(e.position, 1.6, this.near);
      for (const o of nb) {
        if (o === e || !o.alive) continue;
        const dx = e.position.x - o.position.x, dz = e.position.z - o.position.z;
        const d = Math.hypot(dx, dz) || 0.01;
        const minD = e.radius + o.radius + 0.15;
        if (d < minD) { const f = (minD - d) / minD * 7; this.push.x += (dx / d) * f; this.push.z += (dz / d) * f; }
      }
      // do not overlap the player
      const dxp = e.position.x - pp.x, dzp = e.position.z - pp.z, dp = Math.hypot(dxp, dzp) || 0.01;
      const minP = e.radius + 0.75;
      if (dp < minP) { const f = (minP - dp) / minP * 9; this.push.x += (dxp / dp) * f; this.push.z += (dzp / dp) * f; }

      const gy = (this.frame + e.id) % 3 === 0 ? this.world.groundY(e.position.x, e.position.z, e.position.y + 1) : null;
      e.integrate(dt, gy, this.push);
      e.updateAnimation(dt);
    }
  }

  private fireShard(e: Enemy, player: Player): void {
    const from = e.hitCenter().add(new Vector3(0, 0.3, 0));
    const to = player.chest();
    const dir = to.subtract(from).normalize();
    const r = e.def.attack.ranged!;
    this.vfx.burst('venom', from, 6);
    audio.play('cultistShot', from);
    this.projectiles.spawn({
      team: 'enemy', pos: from, dir, speed: r.speed, radius: r.radius, range: e.def.attack.range + 4, visual: 'shard',
      onHitPlayer: (p) => { player.takeDamage(e.def.damage * (e.elite ? 1.8 : 1), false); this.vfx.cultistImpact(p); audio.play('cultistImpact', p); },
      onExpire: (p) => { this.vfx.cultistImpact(p); audio.play('cultistImpact', p, { gain: 0.5 }); },
    });
  }

  clear(): void { for (const e of this.pool) { e.alive = false; e.state = 'dead'; e.deathTimer = 99; e.hide(); } }
}
