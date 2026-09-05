import { Scene, SceneInstrumentation, Tools, Vector3, type AbstractEngine } from '@babylonjs/core';
import { AbilitySystem } from '@/abilities/system';
import { AssetLoader } from '@/assets/loader';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { Pickups } from '@/combat/pickups';
import { Areas } from '@/combat/areas';
import { Projectiles } from '@/combat/projectiles';
import { Targeting } from '@/combat/targeting';
import type { EnemyId } from '@/content/enemies';
import { ABILITIES, type AbilityId } from '@/content/abilities';
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
import { audio } from '@/audio';
import type { KitLevel, WaveDef } from '@/world/kitLevel';
import { OuterCourt } from '@/world/outerCourt';
import { Nave } from '@/world/nave';

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
  world!: KitLevel;
  private levels = [OuterCourt, Nave];
  levelIndex = 0;
  enemies!: EnemyManager;
  projectiles!: Projectiles;
  targeting!: Targeting;
  abilities!: AbilitySystem;
  vfx!: Vfx;
  pickups!: Pickups;
  areas!: Areas;
  hud!: Hud;
  dbg!: DebugPanel;
  loop!: GameLoop;
  readonly bus = new EventBus();
  private instr!: SceneInstrumentation;
  private statT = 0;
  wave = 0;
  waveState: 'idle' | 'countdown' | 'active' | 'done' = 'idle';
  private countdown = 3;
  private transitioning = false;
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
    this.world = new this.levels[0](this.scene, this.loader, this.rig);
    this.player = new Player(this.scene, this.bus);
    this.projectiles = new Projectiles(this.scene, this.vfx, this.rig);
    this.enemies = new EnemyManager(this.scene, this.loader, this.rig, this.bus, this.vfx, this.projectiles, this.world);
    this.targeting = new Targeting();
    this.pickups = new Pickups(this.scene, this.vfx, this.bus, this.rig);
    this.areas = new Areas(this.enemies, this.vfx, this.cam, this.rig);
    this.abilities = new AbilitySystem({ player: this.player, cam: this.cam, enemies: this.enemies, projectiles: this.projectiles, vfx: this.vfx, targeting: this.targeting, bus: this.bus, world: this.world, areas: this.areas });
    this.hud = new Hud(this.cam);
    this.dbg = new DebugPanel({
      spawn: (k, n, elite) => this.spawnPack(k as EnemyId, n, !!elite),
      clear: () => { this.enemies.clear(); this.projectiles.clear(); this.areas.clear(); },
      screenshot: () => { void this.snapshot(`shot-${Date.now()}`); },
      teleport: (w) => this.teleport(w),
      levelUp: () => this.player.addXp(this.player.xpToNext() - this.player.xp),
      volume: (bus, v) => audio.engine.setVolume(bus, v),
      getVolume: (bus) => audio.engine.getVolume(bus),
    }, this.input);

    status('Raising the courtyard…');
    await this.world.build();
    this.hud.setArea(this.world.name, this.world.sub);
    this.hud.setObjective('Survive three waves to open the cathedral door');
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
    this.bus.on('enemy:damaged', ({ pos, amount, crit, element, killed }) => {
      this.hud.number(pos, `${amount}`, crit ? 'crit' : element === 'fire' ? 'fire' : element === 'frost' ? 'frost' : 'normal');
      if (crit) this.cam.shake(0.05, 0.1);
      if (!killed) audio.play(element === 'fire' && amount < 40 ? 'burnTick' : 'enemyHit', pos, { pitch: crit ? 0.8 : 0.9 + Math.random() * 0.25, gain: crit ? 1.2 : 0.8 });
    });
    this.bus.on('enemy:killed', ({ pos, xp, elite }) => {
      this.player.addXp(xp);
      audio.play(elite ? 'eliteDeath' : 'enemyDeath', pos);
      const def = this.enemies.pool.find((e) => e.position.equalsWithEpsilon(pos, 0.01))?.def;
      const chance = (def?.globeChance ?? 0.12) * (elite ? 3 : 1);
      if (Math.random() < chance || this.player.hp < this.player.hpMax * 0.35 && Math.random() < 0.3) this.pickups.spawnGlobe(pos);
    });
    this.bus.on("player:damaged", () => { this.hud.hurt(); audio.play('playerHurt'); const o = this.hud.root.querySelector(".hud-orb.health")!; o.classList.remove('hurt'); void (o as HTMLElement).offsetWidth; o.classList.add('hurt'); this.cam.shake(0.12, 0.15); });
    this.bus.on('player:levelup', ({ level }) => {
      this.vfx.levelUp(this.player.position);
      audio.play('levelUp');
      const unlock = ({ 2: 'ASTRAL ORB', 3: 'RIFT STEP', 4: 'FLAME NOVA', 5: 'PASSIVE SLOT', 6: 'FROST FIELD', 8: 'SECOND PASSIVE SLOT', 10: 'CATACLYSM' } as Record<number, string>)[level];
      this.hud.toast(`LEVEL ${level}`, unlock ? `${unlock} UNLOCKED` : '');
      this.cam.shake(0.1, 0.3);
    });
    this.bus.on('pickup:globe', ({ pos }) => audio.play('globe', pos));
    this.bus.on('ability:denied', ({ id, reason }) => {
      audio.play('denied'); if (reason === 'locked') this.hud.toast(ABILITIES[id as AbilityId].name.toUpperCase(), `UNLOCKS AT LEVEL ${ABILITIES[id as AbilityId].unlockLevel}`, 1.4); });
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

  /** Spawn the next wave. Wave 3 bursts from the door with a flare; the others rise around the player. */
  private async startWave(): Promise<void> {
    const def: WaveDef | undefined = this.world.waves[this.wave];
    if (!def) return;
    this.wave++;
    this.waveState = 'active';
    this.dbg.state.hpMult = +(1 + (this.wave - 1) * 0.12 + this.levelIndex * 0.3).toFixed(2);
    this.hud.toast(`WAVE ${this.wave} OF 3`, def.fromDoor ? 'THE DOOR ANSWERS' : 'THE DEAD STIR', 2);
    this.hud.setObjective(`Wave ${this.wave} of 3. Kill everything that moves.`);
    audio.play(def.fromDoor ? 'door' : 'waveStart');
    if (def.fromDoor) {
      const dp = this.world.doorPoint;
      this.vfx.lights.flash(dp.add(new Vector3(0, 4, 2)), this.player.staffLight.diffuse, 80, 1.2, 18);
      this.vfx.burst('arcaneImpact', dp.add(new Vector3(0, 3, 2)), 80);
      this.cam.shake(0.5, 0.6);
    }
    this.spawning = true;
    for (const g of def.spawns) {
      for (let i = 0; i < g.n; i++) {
        const at = def.fromDoor
          ? this.world.randomSpawn(this.world.doorPoint.add(new Vector3(0, 0, -2.5)), 1, 4)
          : this.world.randomSpawn(this.player.position, 9, 16);
        await this.enemies.spawn(g.id, at, !!g.elite);
      }
    }
    this.spawning = false;
  }

  /** Fade out, tear down the level, build the next one, place the player, fade in. */
  private async transition(): Promise<void> {
    this.transitioning = true;
    this.hud.fade(true);
    audio.play('door');
    await new Promise((r) => setTimeout(r, 750));
    this.enemies.clear(); this.projectiles.clear(); this.pickups.clear(); this.areas.clear();
    this.world.dispose();
    this.levelIndex++;
    this.world = new this.levels[this.levelIndex](this.scene, this.loader, this.rig);
    await this.world.build();
    this.enemies.setWorld(this.world); this.abilities.setWorld(this.world);
    this.player.collider.position.copyFrom(this.world.playerStart); this.player.position.copyFrom(this.world.playerStart);
    this.player.yaw = this.world.playerYaw; this.cam.yaw = this.world.playerYaw;
    this.player.heal(this.player.hpMax); this.player.energy = 60;
    this.wave = 0; this.waveState = 'idle'; this.countdown = 4;
    this.hud.setArea(this.world.name, this.world.sub);
    this.hud.setObjective('Survive three waves to open the way onward');
    this.hud.toast(this.world.name, this.world.sub, 3.5);
    this.hud.fade(false);
    this.transitioning = false;
  }

  private teleport(where: string): void {
    const p = where === 'door' ? this.world.doorPoint.add(new Vector3(0, 0.1, -3)) : this.world.playerStart.clone();
    this.player.collider.position.copyFrom(p); this.player.position.copyFrom(p);
  }

  /** Simulation step. Order: input → player → abilities → projectiles → enemies → pickups → vfx → camera. */
  private fixed(dt: number): void {
    const d = this.dbg.state;
    if (this.input.wasPressed('F1')) this.dbg.toggle();
    if (this.input.wasPressed('KeyM')) { const m = audio.engine.toggleMute(); this.hud.toast(m ? 'AUDIO MUTED' : 'AUDIO ON', '', 1); }
    if (this.input.locked && !audio.ready) void audio.unlock();
    if (this.input.wasPressed('F2')) { d.hideHud = !d.hideHud; }
    if (this.input.wasPressed('KeyR') && this.player.dead) { this.player.respawn(this.world.playerStart); this.enemies.clear(); }
    this.hud.setHidden(d.hideHud);
    this.abilities.cdMult = d.cdMult; this.abilities.infiniteEnergy = d.infiniteEnergy; this.abilities.unlockAll = d.unlockAll;
    if (this.input.locked && !this.playing) { this.playing = true; this.waveState = 'idle'; this.countdown = 3; }
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
    this.areas.update(dt);
    this.vfx.update(dt);
    this.world.update(this.loop.time);

    // door prompt: sealed until the three waves are down, then it is the way to the next level
    const dp = this.world.doorPoint;
    const nearDoor = !this.player.dead && Math.abs(this.player.position.y - dp.y) < 1.5 && Math.hypot(this.player.position.x - dp.x, this.player.position.z - dp.z) < 4.5;
    const lastLevel = this.levelIndex >= this.levels.length - 1;
    this.hud.prompt(nearDoor && !this.transitioning ? (this.waveState === 'done' ? (lastLevel ? 'THE CRYPT IS SEALED · NEXT BUILD' : `PRESS E · ${this.world.exitLabel}`) : `SEALED · WAVE ${Math.min(this.wave, 3)} OF 3`) : null);
    if (nearDoor && this.input.wasPressed('KeyE') && !this.transitioning) {
      if (this.waveState === 'done' && !lastLevel) void this.transition();
      else if (this.waveState === 'done') { audio.play('denied'); this.hud.toast('THE CRYPT IS SEALED', 'THE DESCENT ARRIVES IN THE NEXT BUILD', 2.5); }
      else { audio.play('denied'); this.hud.toast('THE DOOR IS SEALED', `${3 - Math.min(this.wave, 3)} WAVE${3 - this.wave === 1 ? '' : 'S'} REMAIN`, 1.8); }
    }

    // combat blend for the camera: pull back and widen as the pack closes in
    const near = this.enemies.countNear(this.player.position, 14);
    audio.setListener(this.player.position, this.cam.yaw);
    audio.setIntensity(this.player.dead ? 0 : clamp(near / 7, 0, 1));
    this.cam.combatTarget = clamp(near / 6, 0, 1) * 0.85 + (this.player.stance > 0 ? 0.15 : 0);
    this.cam.update(dt, this.player.position, mouse, (a, b) => this.world.obstruct(a, b));

    // waves: countdown → active until the pack is dead → next, three per level
    if (this.playing && this.input.locked && !d.freezeAI && !this.player.dead && !this.transitioning) {
      if (this.waveState === 'idle' || this.waveState === 'countdown') {
        this.waveState = 'countdown';
        this.countdown -= dt;
        if (this.countdown <= 0) void this.startWave();
      } else if (this.waveState === 'active' && !this.spawning && alive.length === 0) {
        if (this.wave >= this.world.waves.length) {
          this.waveState = 'done';
          this.world.setPortalOpen(1);
          this.hud.toast('THE WAY IS OPEN', this.levelIndex >= this.levels.length - 1 ? 'THE CRYPT STAIR IS SEALED IN THIS BUILD' : 'CLIMB TO THE DOOR AND PRESS E', 3.5);
          this.hud.setObjective(this.levelIndex >= this.levels.length - 1 ? 'The threshold is held. The descent comes in the next build.' : `${this.world.exitLabel.charAt(0)}${this.world.exitLabel.slice(1).toLowerCase()} through the glowing door`);
          audio.play('levelUp');
        } else { this.waveState = 'countdown'; this.countdown = 5; this.hud.setObjective(`Wave ${this.wave} of 3 cleared. The next stirs…`); }
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
