import { Color3, Mesh, MeshBuilder, PBRMaterial, Scene, StandardMaterial, Vector3 } from "@babylonjs/core";
import { Textures } from "@/rendering/textures";
import { audio } from "@/audio";
import type { AssetLoader } from '@/assets/loader';
import { ENEMIES, type EnemyDef, type EnemyId } from '@/content/enemies';
import { ELITE_MODS, ELITE_POOL, type EliteModId } from '@/content/elites';
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
  /** Enemy outgoing damage scale (rises with player level so gear growth stays dangerous). */
  damageMult = 1;
  /** Frozen Heart passive: extra multiplier on frozen targets. */
  frozenBonus = 1;
  frozenExtra = 0;
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
  async spawn(id: EnemyId, pos: Vector3, elite = false, mod: EliteModId | null = null): Promise<Enemy> {
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
    if (elite && !mod && def.behaviour !== 'boss') mod = ELITE_POOL[Math.floor(Math.random() * ELITE_POOL.length)];
    e.spawn(def, pos, elite, this.nextId++, mod);
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
      const base = elite ? (e.def.behaviour === 'boss' ? new Color3(0.22, 0.05, 0.38) : new Color3(0.25, 0.12, 0.02)) : Color3.Black();
      mat.emissiveColor = base.clone(); mat.metadata = { ...(mat.metadata ?? {}), baseEmissive: base };
    }
  }

  damage(e: Enemy, amount: number, opts: { dir?: Vector3 | null; knockback?: number; crit?: boolean; element?: string; pos?: Vector3 }): void {
    if (!e.alive) return;
    if (e.frozen > 0) amount = Math.round(amount * this.frozenBonus);
    const killed = e.hurt(amount, opts.dir ?? null, opts.knockback ?? 0);
    const at = opts.pos ?? e.hitCenter();
    this.bus.emit('enemy:damaged', { pos: at.clone(), amount, crit: !!opts.crit, element: opts.element ?? 'arcane', killed });
    if (killed) {
      if (e.frozen > 0 || opts.element === 'frost') this.vfx.shatter(e.hitCenter());
      this.vfx.enemyDeath(e.hitCenter(), opts.dir ?? undefined);
      this.bus.emit('enemy:killed', { pos: e.position.clone(), xp: Math.round(e.def.xp * (e.elite ? 4 : 1)), elite: e.elite, id: e.def.id, burning: e.burn > 0 });
    }
  }

  /** Damage every living enemy within `radius` of `center`. */
  damageArea(center: Vector3, radius: number, amount: (e: Enemy) => number, opts: { knockback?: number; element?: string; crit?: boolean; burn?: { dps: number; dur: number }; chill?: number }): number {
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
      if (opts.chill) { const wasFrozen = e.frozen > 0; e.applyChill(opts.chill); if (!wasFrozen && e.frozen > 0) { e.frozen += this.frozenExtra; this.vfx.freeze(c); audio.play('freeze', c); } }
      const dmg = amount(e);
      if (dmg > 0) this.damage(e, dmg, { dir, knockback: opts.knockback, element: opts.element, crit: opts.crit, pos: c });
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
    // necromancer aura pre-pass: allies near a caster move and hit harder this step
    for (const e of alive) { e.auraSpeed = 1; e.auraDamage = 1; }
    for (const e of alive) { const aura = e.def.aura; if (!aura || this.frozen) continue; for (const o of this.hash.query(e.position, aura.radius, this.near)) { if (o !== e && o.alive) { o.auraSpeed = Math.max(o.auraSpeed, aura.speed); o.auraDamage = Math.max(o.auraDamage, aura.damage); } } }

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


      // --- boss: slam on its own timer, phases by health ---
      if (def.behaviour === 'boss' && e.state === 'chase' && !player.dead) {
        e.slamTimer -= dt;
        const frac = e.hp / e.hpMax;
        if (frac < 0.5 && e.bossPhase < 1) { e.bossPhase = 1; this.vfx.lights.flash(e.hitCenter(), Color3.FromHexString('#FF3AB0'), 60, 1, 16); audio.play('cataclysmCast', e.position); this.bus.emit('boss:phase', { phase: 1 }); }
        if (frac < 0.25 && e.bossPhase < 2) { e.bossPhase = 2; audio.play('waveStart', e.position); this.bus.emit('boss:phase', { phase: 2 }); }
        e.auraSpeed = Math.max(e.auraSpeed, e.bossPhase >= 2 ? 1.45 : 1);
        if (e.slamTimer <= 0 && dist < 6) { e.slamTimer = e.bossPhase >= 1 ? 5 : 7; this.slam(e, player, god); }
      }

      // --- special behaviours ---
      e.behaviourTimer -= dt;
      if (def.behaviour && e.behaviourTimer <= 0 && e.state === 'chase' && e.frozen <= 0 && !player.dead) {
        e.behaviourTimer = def.behaviourCooldown ?? 4;
        if (def.behaviour === 'blink' && dist > 3.5) this.blink(e, player);
        else if (def.behaviour === 'charge' && dist > 4 && dist < 14) this.startCharge(e, player);
        else if (def.behaviour === 'summoner') void this.summon(e, 2);
        else if (def.behaviour === 'boss') this.bossAct(e, player, dist, god);
      }
      if (e.charge) {
        e.charge.left -= 13 * dt;
        const dp2 = Math.hypot(e.position.x - pp.x, e.position.z - pp.z);
        if (dp2 < e.radius + 0.9 && !player.dead) {
          player.takeDamage(def.damage * 1.4 * this.damageMult * e.auraDamage * (e.elite ? 1.8 : 1), god);
          player.shove(e.charge.dir.scale(7));
          this.vfx.burst('gore', player.chest(), 8); audio.play('playerHurt');
          e.charge = null; e.state = 'recover'; e.timer = 0; e.attackCd = def.attack.cooldown;
        } else if (e.charge.left <= 0 || Math.hypot(e.velocity.x, e.velocity.z) < 2 && e.charge.left < 8) { e.charge = null; e.state = 'recover'; e.timer = 0; }
      }

      // --- elite affixes ---
      if (e.elite && e.mod) {
        e.modTimer -= dt;
        if (e.modTimer <= 0) { e.modTimer = ELITE_MODS[e.mod].period; this.runMod(e, player, god); }
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
      if (e.frozen > 0) { this.push.setAll(0); e.integrate(dt, null, this.push); e.updateAnimation(dt); continue; }
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
              player.takeDamage(def.damage * this.damageMult * e.auraDamage * (e.elite ? 1.8 : 1), god);
              this.vfx.burst('gore', player.chest(), 6);
            }
          }
          break;
        }
        case 'recover': e.timer += dt; if (e.timer >= def.attack.recovery) e.state = 'chase'; break;
        case 'charge': {
          e.timer += dt;
          if (!e.charge) {
            e.faceToward(pp, dt, def.turnRate);
            // the Taunt clip normally releases the charge; this fallback covers missing clips and stalled animation
            if (e.timer > 0.9) { const dir = new Vector3(pp.x - e.position.x, 0, pp.z - e.position.z).normalize(); e.charge = { dir, left: 9 }; audio.play('charge', e.position); this.vfx.burst('smoke', e.position.add(new Vector3(0, 0.3, 0)), 10); }
          }
          break;
        }
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
      onHitPlayer: (p) => { player.takeDamage(e.def.damage * this.damageMult * e.auraDamage * (e.elite ? 1.8 : 1), false); this.vfx.cultistImpact(p); audio.play('cultistImpact', p); },
      onExpire: (p) => { this.vfx.cultistImpact(p); audio.play('cultistImpact', p, { gain: 0.5 }); },
    });
  }

  /** Wraith blink: vanish and reappear beside the player, then strike. */
  private blink(e: Enemy, player: Player): void {
    const from = e.hitCenter();
    const a = Math.random() * Math.PI * 2;
    const to = this.world.randomSpawn(player.position, 1.6, 2.4);
    if (Math.abs(to.y - player.position.y) > 1.5) return;
    this.vfx.rift(e.position.clone(), to.clone()); this.vfx.burst('frostMist', from, 6);
    audio.play('rift', from, { gain: 0.5, pitch: 1.3 });
    e.root.position.copyFrom(to); e.collider.position.copyFrom(to);
    e.yaw = Math.atan2(player.position.x - to.x, player.position.z - to.z) + a * 0;
    e.attackCd = 0.15;
  }

  /** Brute charge: a telegraphed windup, then a straight dash that knocks the player back. */
  private startCharge(e: Enemy, player: Player): void {
    const dir = new Vector3(player.position.x - e.position.x, 0, player.position.z - e.position.z).normalize();
    e.state = 'charge'; e.timer = 0; e.charge = null;
    e.animator?.clearOneShot(); e.animator?.once('Taunt', { speed: 1.6, onEnd: () => { if (e.alive && e.state === 'charge' && !e.charge) { e.charge = { dir, left: 9 }; audio.play('charge', e.position); this.vfx.burst('smoke', e.position.add(new Vector3(0, 0.3, 0)), 10); } } });
    audio.play('waveStart', e.position, { gain: 0.35, pitch: 1.6 });
  }

  /** Raise ghouls from the floor around the caster. */
  private async summon(e: Enemy, n: number): Promise<void> {
    if (this.alive.length > 40) return;
    this.vfx.burst('venom', e.hitCenter(), 20); this.vfx.lights.flash(e.hitCenter(), Color3.FromHexString('#B14DFF'), 20, 0.5, 8);
    audio.play('summon', e.position);
    e.animator?.clearOneShot(); e.animator?.once('Spellcast_Summon', { speed: 1.3 });
    for (let i = 0; i < n; i++) { const at = this.world.randomSpawn(e.position, 1.5, 3.5); await this.spawn('ghoul', at); }
  }

  /** Hollow King: raises the dead every cooldown; from half health also fires radial volleys. */
  private bossAct(e: Enemy, player: Player, dist: number, god: boolean): void {
    void this.summon(e, e.bossPhase >= 1 ? 5 : 3);
    if (e.bossPhase >= 1) {
      const c = e.hitCenter(); audio.play('cultistShot', c);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + Math.random() * 0.2; this.projectiles.spawn({ team: 'enemy', pos: c.clone(), dir: new Vector3(Math.sin(a), 0.03, Math.cos(a)), speed: 10, radius: 0.4, range: 16, visual: 'shard', onHitPlayer: (p) => { player.takeDamage(16 * this.damageMult, god); this.vfx.cultistImpact(p); audio.play('cultistImpact', p); }, onExpire: (p) => this.vfx.cultistImpact(p) }); }
    }
    if (dist > 7 && Math.random() < 0.5) this.startCharge(e, player);
  }

  /** Boss ground slam: a violet shockwave ring that throws everything nearby. */
  private slam(e: Enemy, player: Player, god: boolean): void {
    e.state = 'windup'; e.timer = 0; e.attackCd = 1;
    e.animator?.clearOneShot(); e.animator?.once('2H_Melee_Attack_Chop', { speed: 1.1 });
    audio.play('waveStart', e.position, { gain: 0.5, pitch: 1.3 });
    window.setTimeout(() => {
      if (!e.alive) return;
      const at = e.position.clone();
      this.vfx.nova(at, 6); this.vfx.lights.flash(at.add(new Vector3(0, 2, 0)), Color3.FromHexString('#B14DFF'), 60, 0.5, 16);
      audio.play('strike', at);
      const d = Math.hypot(player.position.x - at.x, player.position.z - at.z);
      if (d < 6.5 && !player.dead) { player.takeDamage(e.def.damage * 0.9 * this.damageMult, god); const dir = new Vector3(player.position.x - at.x, 0, player.position.z - at.z).normalize(); player.shove(dir.scale(9)); }
      e.state = 'recover'; e.timer = 0;
    }, 700);
  }

  /** Elite affix tick. */
  private runMod(e: Enemy, player: Player, god: boolean): void {
    const c = e.hitCenter();
    switch (e.mod) {
      case 'scorched': {
        const p = e.position.clone(); p.y += 0.02;
        this.vfx.scorchTrail(p);
        const d = Math.hypot(player.position.x - p.x, player.position.z - p.z);
        if (d < 1.4 && !player.dead) { player.takeDamage(6, god); this.vfx.burst('ember', player.chest(), 6); }
        break;
      }
      case 'blink': this.blink(e, player); break;
      case 'volley': {
        audio.play('cultistShot', c);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const dir = new Vector3(Math.sin(a), 0.05, Math.cos(a));
          this.projectiles.spawn({ team: 'enemy', pos: c.clone(), dir, speed: 9, radius: 0.35, range: 14, visual: 'shard', onHitPlayer: (p) => { player.takeDamage(12, false); this.vfx.cultistImpact(p); audio.play('cultistImpact', p); }, onExpire: (p) => this.vfx.cultistImpact(p) });
        }
        break;
      }
      case 'summoner': void this.summon(e, 2); break;
      case 'pull': {
        const d = new Vector3(e.position.x - player.position.x, 0, e.position.z - player.position.z); const len = d.length();
        if (len < 14 && len > 2.5 && !player.dead) {
          d.scaleInPlace((len - 2.2) / len);
          player.shove(d, 0.35);
          this.vfx.burst('arcaneSpark', player.chest(), 20); this.vfx.rift(player.position.clone(), player.position.add(d));
          audio.play('rift', player.position, { gain: 0.6, pitch: 0.7 });
        }
        break;
      }
      case 'chilling': {
        const d = Math.hypot(player.position.x - e.position.x, player.position.z - e.position.z);
        if (d < 5) { player.speedMult = 0.6; player.chilled = 0.6; this.vfx.burst('frostMist', player.position.add(new Vector3(0, 0.3, 0)), 2); }
        break;
      }
    }
  }

  clear(): void { for (const e of this.pool) { e.alive = false; e.state = 'dead'; e.deathTimer = 99; e.hide(); } }
}
