import { Scene, SceneInstrumentation, Tools, Vector3, type AbstractEngine } from '@babylonjs/core';
import { AbilitySystem } from '@/abilities/system';
import { AssetLoader } from '@/assets/loader';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { Pickups } from '@/combat/pickups';
import { Projectiles } from '@/combat/projectiles';
import { Targeting } from '@/combat/targeting';
import type { EnemyId } from '@/content/enemies';
import { PLAYER } from '@/content/player';
import { createEngine, type Backend } from '@/core/engine';
import { EventBus } from '@/core/events';
import { GameLoop } from '@/core/loop';
import { clamp } from '@/core/mathx';
import { EnemyManager } from '@/enemies/manager';
import { Input } from '@/input/input';
import { Player } from '@/player/player';
import { setupRendering, type RenderRig } from '@/rendering/setup';
import { DebugPanel } from '@/ui/debug';
import { Hud } from '@/ui/hud';
import { Vfx } from '@/vfx/vfx';
import { BenchmarkScene } from '@/world/benchmark';

/** Wires every system together and owns the update order (see technical-architecture.md). */
export class Game {
  engine!: AbstractEngine;
  backend!: Backend;
  scene!: Scene;
  loader!: AssetLoader;
  rig!: RenderRig;
  cam!: ThirdPersonCamera;
  input!: Input;
  player!: Player;
  world!: BenchmarkScene;
  enemies!: EnemyManager;
  projectiles!: Projectiles;
  targeting!: Targeting;
  abilities!: AbilitySystem;
  vfx!: Vfx;
  pickups!: Pickups;
  hud!: Hud;
  dbg!: DebugPanel;
  loop!: GameLoop;
  readonly bus = new EventBus();
  private instr!: SceneInstrumentation;
  private statT = 0;
  private wave = 0;
  private spawnTimer = 4;
  private nearby: import('@/enemies/enemy').Enemy[] = [];
  private spawning = false;
  /** Nothing hostile happens until the player has clicked in once. */
  playing = false;

  async start(canvas: HTMLCanvasElement, status: (s: string) => void): Promise<void> {
    status('Waking the engine…');
    const { engine, backend } = await createEngine(canvas);
    this.engine = engine; this.backend = backend;
    this.scene = new Scene(engine);
    this.scene.skipPointerMovePicking = true;
    this.input = new Input(canvas);
    this.cam = new ThirdPersonCamera(this.scene);
    this.scene.activeCamera = this.cam.camera;
    this.rig = setupRendering(this.scene, this.cam.camera, backend);
    this.loader = new AssetLoader(this.scene);
    this.vfx = new Vfx(this.scene);
    this.world = new BenchmarkScene(this.scene, this.loader, this.rig);
    this.player = new Player(this.scene, this.bus);
    this.projectiles = new Projectiles(this.scene, this.vfx, this.rig);
    this.enemies = new EnemyManager(this.scene, this.loader, this.rig, this.bus, this.vfx, this.projectiles, this.world);
    this.targeting = new Targeting();
    this.pickups = new Pickups(this.scene, this.vfx, this.bus, this.rig);
    this.abilities = new AbilitySystem({ player: this.player, cam: this.cam, enemies: this.enemies, projectiles: this.projectiles, vfx: this.vfx, targeting: this.targeting, bus: this.bus, world: this.world });
    this.hud = new Hud(this.cam);
    this.dbg = new DebugPanel({
      spawn: (k, n, elite) => this.spawnPack(k as EnemyId, n, !!elite),
      clear: () => { this.enemies.clear(); this.projectiles.clear(); },
      screenshot: () => { void this.snapshot(`shot-${Date.now()}`); },
      teleport: (w) => this.teleport(w),
      levelUp: () => this.player.addXp(this.player.xpToNext() - this.player.xp),
    }, this.input);

    status('Raising the courtyard…');
    await this.world.build();
    status('Summoning the Sorcerer…');
    await this.player.load(this.loader, this.rig);
    this.player.collider.position.copyFrom(this.world.playerStart); this.player.position.copyFrom(this.world.playerStart);
    this.player.yaw = this.world.playerYaw; this.cam.yaw = this.world.playerYaw;
    status('Waking the dead…');
    await this.enemies.preload(['ghoul', 'fallen_knight', 'cultist', 'wraith']);
    this.wireEvents();
    this.instr = new SceneInstrumentation(this.scene);
    this.instr.captureFrameTime = true;

    window.addEventListener('resize', () => engine.resize());
    this.loop = new GameLoop(engine, this.scene, (dt) => this.fixed(dt), (dt) => this.frame(dt));
    this.loop.start();
  }

  private wireEvents(): void {
    this.bus.on('enemy:damaged', ({ pos, amount, crit, element }) => {
      this.hud.number(pos, `${amount}`, crit ? 'crit' : element === 'fire' ? 'fire' : element === 'frost' ? 'frost' : 'normal');
      if (crit) this.cam.shake(0.05, 0.1);
    });
    this.bus.on('enemy:killed', ({ pos, xp, elite }) => {
      this.player.addXp(xp);
      const def = this.enemies.pool.find((e) => e.position.equalsWithEpsilon(pos, 0.01))?.def;
      const chance = (def?.globeChance ?? 0.12) * (elite ? 3 : 1);
      if (Math.random() < chance || this.player.hp < this.player.hpMax * 0.35 && Math.random() < 0.3) this.pickups.spawnGlobe(pos);
    });
    this.bus.on("player:damaged", () => { this.hud.hurt(); const o = this.hud.root.querySelector(".hud-orb.health")!; o.classList.remove('hurt'); void (o as HTMLElement).offsetWidth; o.classList.add('hurt'); this.cam.shake(0.12, 0.15); });
    this.bus.on('player:levelup', ({ level }) => {
      this.vfx.levelUp(this.player.position);
      const unlock = ({ 2: 'ASTRAL ORB', 3: 'RIFT STEP', 4: 'FLAME NOVA', 5: 'PASSIVE SLOT', 6: 'FROST FIELD', 8: 'SECOND PASSIVE SLOT', 10: 'CATACLYSM' } as Record<number, string>)[level];
      this.hud.toast(`LEVEL ${level}`, unlock ? `${unlock} UNLOCKED` : '');
      this.cam.shake(0.1, 0.3);
    });
    this.bus.on('ability:denied', ({ id, reason }) => { if (reason === 'locked' && (id === 'frost' || id === 'cataclysm')) this.hud.toast(id === 'frost' ? 'FROST FIELD' : 'CATACLYSM', 'ARRIVES IN MILESTONE 4', 1.4); });
  }

  /** Render an off-screen 1080p frame and save it through the dev server (docs/screenshots/<name>.png). */
  async snapshot(name: string, width = 1920, height = 1080): Promise<string> {
    const hidden = this.hud.hidden;
    const data = await Tools.CreateScreenshotUsingRenderTargetAsync(this.engine, this.cam.camera, { width, height }, "image/png", 4, true);
    this.hud.setHidden(hidden);
    const r = await fetch(`/__snap?name=${encodeURIComponent(name)}`, { method: "POST", body: data });
    const j = await r.json();
    return j.file as string;
  }

  async spawnPack(id: EnemyId, n: number, elite = false): Promise<void> {
    if (this.spawning) return;
    this.spawning = true;
    const pp = this.player.position;
    for (let i = 0; i < n; i++) {
      const at = this.world.randomSpawn(pp, 9, 16);
      await this.enemies.spawn(id, at, elite && i === 0);
    }
    this.spawning = false;
  }

  private teleport(where: string): void {
    const p = where === 'door' ? new Vector3(0, 6.7, 30) : this.world.playerStart.clone();
    this.player.collider.position.copyFrom(p); this.player.position.copyFrom(p);
  }

  /** Simulation step. Order: input → player → abilities → projectiles → enemies → pickups → vfx → camera. */
  private fixed(dt: number): void {
    const d = this.dbg.state;
    if (this.input.wasPressed('F1')) this.dbg.toggle();
    if (this.input.wasPressed('F2')) { d.hideHud = !d.hideHud; }
    if (this.input.wasPressed('KeyR') && this.player.dead) { this.player.respawn(this.world.playerStart); this.enemies.clear(); }
    this.hud.setHidden(d.hideHud);
    this.abilities.cdMult = d.cdMult; this.abilities.infiniteEnergy = d.infiniteEnergy; this.abilities.unlockAll = d.unlockAll;
    if (this.input.locked && !this.playing) { this.playing = true; setTimeout(() => this.spawnPack("ghoul", 8), 1500); }
    this.enemies.frozen = d.freezeAI || !this.playing || !this.input.locked; this.enemies.hpMult = d.hpMult; this.vfx.density = d.density;
    this.cam.distanceOverride = d.camDist > 0 ? d.camDist : null; this.cam.fovOverride = d.fov > 0 ? d.fov : null;

    const mouse = this.input.locked ? this.input.consumeMouse() : { dx: 0, dy: 0 };
    this.player.update(dt, this.input, this.cam, this.world);
    const alive = this.enemies.alive;
    this.targeting.update(this.cam, alive, this.player.position, this.world);
    if (this.input.locked) this.abilities.update(dt, this.input);
    this.projectiles.update(dt, (p, r, out) => this.enemies.queryNear(p, r, out), this.player, this.world);
    this.enemies.update(dt, this.player, d.god);
    this.pickups.update(dt, this.player);
    this.vfx.update(dt);
    this.world.update(this.loop.time);

    // combat blend for the camera: pull back and widen as the pack closes in
    const near = this.enemies.countNear(this.player.position, 14);
    this.cam.combatTarget = clamp(near / 6, 0, 1) * 0.85 + (this.player.stance > 0 ? 0.15 : 0);
    this.cam.update(dt, this.player.position, mouse, (a, b) => this.world.obstruct(a, b));

    // gentle wave pressure while the sandbox is empty
    if (this.playing && this.input.locked && !d.freezeAI && alive.length === 0 && !this.player.dead) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.wave++;
        this.spawnTimer = 6;
        this.dbg.state.hpMult = +(1 + this.wave * 0.12).toFixed(2);
        const n = Math.min(24, 8 + this.wave * 3);
        this.spawnPack('ghoul', n);
        if (this.wave >= 2) this.spawnPack('cultist', Math.min(4, this.wave));
        if (this.wave >= 3) this.spawnPack('fallen_knight', Math.min(4, this.wave - 1), this.wave % 3 === 0);
        this.hud.toast(`WAVE ${this.wave}`, `${n} ghouls stir in the dark`, 2);
      }
    }
    this.input.endFrame();
  }

  /** Per-render-frame work: HUD sync and stats. */
  private frame(dt: number): void {
    this.hud.update(dt, this.player, this.abilities.slots(), this.targeting.target, this.enemies.pool, this.input.locked);
    this.statT += dt;
    if (this.dbg.visible && this.statT > 0.25) {
      this.statT = 0;
      const fps = this.engine.getFps();
      this.dbg.setStats(fps, `<b>${this.backend}</b> · enemies <b>${this.enemies.alive.length}</b> · projectiles <b>${this.projectiles.count}</b> · draw calls <b>${this.instr.drawCallsCounter.current}</b><br>frame <b>${this.instr.frameTimeCounter.lastSecAverage.toFixed(1)} ms</b> · meshes <b>${this.scene.getActiveMeshes().length}</b> · lvl <b>${this.player.level}</b> · pos <b>${this.player.position.x.toFixed(1)}, ${this.player.position.z.toFixed(1)}</b><br>yaw <b>${this.cam.yaw.toFixed(2)}</b> pitch <b>${this.cam.pitch.toFixed(2)}</b> combat <b>${this.cam.combat.toFixed(2)}</b>`);
    }
  }
}
