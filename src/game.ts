import { Scene, SceneInstrumentation, Tools, Vector3, type AbstractEngine } from '@babylonjs/core';
import { AbilitySystem } from '@/abilities/system';
import { AssetLoader } from '@/assets/loader';
import { ThirdPersonCamera } from '@/camera/thirdPerson';
import { Pickups } from '@/combat/pickups';
import { Areas } from '@/combat/areas';
import { Drops } from '@/loot/drops';
import { rollItem } from '@/loot/generator';
import { InventoryUI } from '@/ui/inventory';
import { RARITY } from '@/content/items';
import { IMPROVEMENTS } from '@/content/passives';
import { Save, type SaveV2, type Settings } from '@/persistence/save';
import { TitleScreen, type TitleView } from '@/ui/title';
import { SelectStage } from '@/world/selectStage';
import { CLASSES } from '@/content/classes';
import type { ClassId } from '@/content/abilities';
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
import type { MoodId } from '@/audio/music';
import type { KitLevel, WaveDef } from '@/world/kitLevel';
import { OuterCourt } from '@/world/outerCourt';
import { Nave } from '@/world/nave';
import { Village } from '@/world/village';
import { Road } from '@/world/road';
import { Crypt } from '@/world/crypt';
import { Ossuary } from '@/world/ossuary';
import { PALETTE } from '@/content/palette';

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
  private levels = [Village, Road, OuterCourt, Nave, Crypt, Ossuary];
  private moods: MoodId[] = ['village', 'road', 'court', 'nave', 'crypt', 'ossuary'];
  levelIndex = 0;
  enemies!: EnemyManager;
  projectiles!: Projectiles;
  targeting!: Targeting;
  abilities!: AbilitySystem;
  vfx!: Vfx;
  pickups!: Pickups;
  areas!: Areas;
  drops!: Drops;
  inventoryUI!: InventoryUI;
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
  private saveTimer = 10;
  private ssaoOn = false;
  /** 'title' and 'select' run the hub as a backdrop; 'play' is the game. */
  mode: 'boot' | 'title' | 'select' | 'play' = 'boot';
  title!: TitleScreen;
  stage!: SelectStage;
  classId: ClassId = 'sorcerer';
  private playTime = 0;
  private stats = { kills: 0, eliteKills: 0, deaths: 0, legendaries: 0 };
  private settings: Settings = { music: 0.8, sfx: 0.9, ssao: false };
  private titleT = 0;
  private launched = false;
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
    this.levelIndex = 0;
    this.world = new this.levels[0](this.scene, this.loader, this.rig);
    this.player = new Player(this.scene, this.bus);
    this.hud = new Hud(this.cam);
    this.projectiles = new Projectiles(this.scene, this.vfx, this.rig);
    this.enemies = new EnemyManager(this.scene, this.loader, this.rig, this.bus, this.vfx, this.projectiles, this.world);
    this.targeting = new Targeting();
    this.pickups = new Pickups(this.scene, this.vfx, this.bus, this.rig);
    this.areas = new Areas(this.enemies, this.vfx, this.cam, this.rig);
    this.drops = new Drops(this.scene, this.vfx, this.rig, this.bus, this.world);
    this.abilities = new AbilitySystem({ player: this.player, cam: this.cam, enemies: this.enemies, projectiles: this.projectiles, vfx: this.vfx, targeting: this.targeting, bus: this.bus, world: this.world, areas: this.areas });
    this.inventoryUI = new InventoryUI(this.player, () => { /* stats already recomputed */ }, (open) => { this.input.wantsLock = !open; if (open) this.input.release(); });
    this.dbg = new DebugPanel({
      spawn: (k, n, elite) => this.spawnPack(k as EnemyId, n, !!elite),
      clear: () => { this.enemies.clear(); this.projectiles.clear(); this.areas.clear(); },
      screenshot: () => { void this.snapshot(`shot-${Date.now()}`); },
      teleport: (w) => this.teleport(w),
      levelUp: () => this.player.addXp(this.player.xpToNext() - this.player.xp),
      wipe: () => { Save.wipe(); location.search = `?new=1&play=${this.classId}`; },
      nextLevel: () => { if (!this.transitioning) { this.waveState = 'done'; void this.transition(); } },
      loot: (legendary) => { for (let i = 0; i < (legendary ? 1 : 5); i++) this.drops.drop(rollItem(this.player.level + this.levelIndex * 2, legendary ? 'legendary' : undefined), this.player.position.add(new Vector3((Math.random() - 0.5) * 2, 0, 2 + Math.random()))); },
      volume: (bus, v) => audio.engine.setVolume(bus, v),
      getVolume: (bus) => audio.engine.getVolume(bus),
    }, this.input);

    Save.migrate();
    Save.onError = (msg) => this.hud?.toast('SAVE', msg.toUpperCase(), 3);
    const settings = Save.load(Save.lastPlayed() ?? 'sorcerer')?.settings; if (settings) this.applySettings(settings);
    status('Raising Hollowmere…');
    await this.world.build();
    this.enterLevel();
    this.stage = new SelectStage(this.scene, this.loader, this.rig);
    status('Carving the pedestals…');
    await this.stage.build();
    this.stage.setVisible(false);
    this.hud.setHidden(true);
    this.title = new TitleScreen({
      slots: () => Save.slots(), lastPlayed: () => Save.lastPlayed(), backend: this.backend,
      onView: (v) => this.onTitleView(v),
      onFocus: (id) => { this.stage.focused = id; this.cam.cinematic = this.stage.cameraPose(id); },
      onPreview: (id, clip) => this.stage.preview(id, clip),
      onBegin: (id, fresh) => { void this.launch(id, fresh); },
      onDelete: (id) => Save.remove(id),
      getSettings: () => this.settings, onSettings: (st) => this.applySettings(st),
    });
    this.instr = new SceneInstrumentation(this.scene);
    this.instr.captureFrameTime = true;
    window.addEventListener('resize', () => engine.resize());
    this.loop = new GameLoop(engine, this.scene, (dt) => this.fixed(dt), (dt) => this.frame(dt));
    this.loop.start();
    // harness and deep links: ?play=<class> skips the title
    const auto = new URLSearchParams(location.search).get('play') as ClassId | null;
    if (auto && CLASSES[auto]) await this.launch(auto, new URLSearchParams(location.search).has('new'));
    else this.title.show('title');
  }

  private onTitleView(v: TitleView): void {
    if (v === 'hidden') return;
    this.mode = v;
    this.stage.setVisible(v === 'select');
    if (v === 'select') this.cam.cinematic = this.stage.cameraPose(this.stage.focused);
    else this.cam.cinematic = this.titlePose(0);
  }

  /** Slow drift around the village square for the title backdrop. */
  private titlePose(t: number): { pos: Vector3; target: Vector3 } {
    const a = t * 0.05; const r = 15;
    return { pos: new Vector3(Math.sin(a) * r, 5.5, Math.cos(a) * r), target: new Vector3(0, 1.5, 0) };
  }

  applySettings(st: Settings): void {
    this.settings = { ...st };
    audio.engine.setVolume('music', st.music); audio.engine.setVolume('sfx', st.sfx);
    if (this.dbg) this.dbg.state.ssao = st.ssao;
  }

  /** Leave the title: load the chosen class, restore its slot (or start fresh), build the saved level, hand over the controls. */
  async launch(classId: ClassId, fresh: boolean): Promise<void> {
    if (this.launched) return; this.launched = true;
    const cls = CLASSES[classId]; this.classId = classId;
    this.title.show('hidden'); this.mode = 'play'; this.stage.setVisible(false); this.cam.cinematic = null;
    this.hud.fade(true);
    if (fresh) Save.remove(classId);
    if (new URLSearchParams(location.search).has('new')) Save.wipe();
    this.player.setClass(cls);
    const startLevel = this.restore();
    if (startLevel !== 0) { this.world.dispose(); this.levelIndex = startLevel; this.world = new this.levels[startLevel](this.scene, this.loader, this.rig); await this.world.build(); this.enterLevel(); }
    this.hud.setClass(cls);
    await this.player.load(this.loader, this.rig);
    this.player.collider.position.copyFrom(this.world.playerStart); this.player.position.copyFrom(this.world.playerStart);
    this.player.yaw = this.world.playerYaw; this.cam.yaw = this.world.playerYaw;
    await this.enemies.preload(['ghoul', 'fallen_knight', 'cultist', 'wraith', 'brute', 'necromancer', 'hollow_king']);
    this.enemies.setWorld(this.world); this.abilities.setWorld(this.world); this.drops.setWorld(this.world);
    this.wireEvents();
    this.abilities.onHitStop = (sec, scale) => this.loop.hitStop(sec, scale);
    this.cam.extraDistance = cls.melee ? 1.2 : 0;
    this.hud.setHidden(this.dbg.state.hideHud);
    this.hud.fade(false);
    if (this.player.level > 1) this.hud.toast(`WELCOME BACK · LEVEL ${this.player.level}`, this.player.passiveNames ? this.player.passiveNames.toUpperCase() : '', 3);
    else this.hud.toast(cls.name.toUpperCase(), 'CLICK TO TAKE THE FIELD', 3);
    this.save();
  }

  private wireEvents(): void {
    this.bus.on('enemy:damaged', ({ pos, amount, crit, element, killed }) => {
      this.hud.number(pos, `${amount}`, crit ? 'crit' : element === 'fire' ? 'fire' : element === 'frost' ? 'frost' : 'normal');
      if (crit) { this.cam.shake(0.05, 0.1); this.loop.hitStop(0.05, 0.15); }
      if (!killed) audio.play(element === 'fire' && amount < 40 ? 'burnTick' : 'enemyHit', pos, { pitch: crit ? 0.8 : 0.9 + Math.random() * 0.25, gain: crit ? 1.2 : 0.8 });
    });
    this.bus.on('enemy:killed', ({ pos, xp, elite, id, burning, marked }) => {
      this.player.addXp(xp); this.player.onKill();
      if (this.player.harvestT > 0) { this.player.heal(Math.round(this.player.hpMax * 0.08)); this.player.addEnergy(10); }
      if (marked) this.pickups.spawnGlobe(pos);
      this.stats.kills++; if (elite) this.stats.eliteKills++;
      audio.play(elite ? 'eliteDeath' : 'enemyDeath', pos);
      if (elite) this.loop.hitStop(0.14, 0.08);
      this.drops.dropFor(id, elite, pos, Math.min(10, this.player.level + this.levelIndex * 2));
      if (burning && (this.player.powers.has('cinderBand') || this.player.hasPassive('chainReaction'))) { const at = pos.add(new Vector3(0, 0.8, 0)); this.vfx.nova(pos, 2.2); this.enemies.damageArea(at, 2.4, () => Math.round(40 * this.player.spellPower()), { element: 'fire', knockback: 5, burn: { dps: 10, dur: 2 } }); }
      const def = this.enemies.pool.find((e) => e.position.equalsWithEpsilon(pos, 0.01))?.def;
      const chance = (def?.globeChance ?? 0.12) * (elite ? 3 : 1);
      if (Math.random() < chance || this.player.hp < this.player.hpMax * 0.35 && Math.random() < 0.3) this.pickups.spawnGlobe(pos);
    });
    this.bus.on("player:damaged", () => { this.hud.hurt(); audio.play('playerHurt'); const o = this.hud.root.querySelector(".hud-orb.health")!; o.classList.remove('hurt'); void (o as HTMLElement).offsetWidth; o.classList.add('hurt'); this.cam.shake(0.12, 0.15); });
    this.bus.on('player:levelup', ({ level }) => {
      this.vfx.levelUp(this.player.position);
      audio.play('levelUp');
      const unlock = ({ 2: 'ASTRAL ORB UNLOCKED', 3: 'RIFT STEP UNLOCKED', 4: 'FLAME NOVA UNLOCKED', 6: 'FROST FIELD UNLOCKED', 10: 'CATACLYSM UNLOCKED' } as Record<number, string>)[level];
      const imp = IMPROVEMENTS.find((i) => i.level === level);
      this.hud.toast(`LEVEL ${level}`, unlock ?? (imp ? `${imp.title.toUpperCase()} · ${imp.text}` : ''), 3.2);
      this.save();
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

  /** Persist the class slot: progression, bag, gear, passives, checkpoint, stats, settings. */
  save(): void {
    if (this.mode !== 'play') return;
    const p = this.player;
    const prev = Save.load(this.classId);
    const rec: SaveV2 = {
      version: 2, classId: this.classId, createdAt: prev?.createdAt ?? Date.now(), savedAt: Date.now(), playTime: this.playTime,
      level: p.level, xp: p.xp, levelIndex: this.levelIndex, areaName: this.world.name, waveIndex: this.wave,
      hp: p.hp, resource: p.energy, inventory: p.inventory, equipment: p.equipment, passives: p.passives,
      stats: { ...this.stats }, settings: { ...this.settings },
    };
    Save.commit(rec);
  }

  /** Restore the class slot if present. Returns the level index to start on. */
  private restore(): number {
    const s = Save.load(this.classId);
    if (!s) { this.playTime = 0; this.stats = { kills: 0, eliteKills: 0, deaths: 0, legendaries: 0 }; return 0; }
    this.player.level = Math.max(1, Math.min(10, s.level)); this.player.xp = s.xp;
    this.player.inventory = s.inventory ?? [];
    for (const k of Object.keys(this.player.equipment)) (this.player.equipment as any)[k] = (s.equipment as any)?.[k] ?? null;
    this.player.passives = [s.passives?.[0] ?? null, s.passives?.[1] ?? null];
    this.player.recalcStats(); this.player.hp = s.hp > 0 ? Math.min(this.player.hpMax, s.hp) : this.player.hpMax;
    if (s.resource >= 0) this.player.energy = Math.min(this.player.energyMax, s.resource);
    this.playTime = s.playTime ?? 0; this.stats = { ...{ kills: 0, eliteKills: 0, deaths: 0, legendaries: 0 }, ...(s.stats ?? {}) };
    if (s.settings) this.applySettings(s.settings);
    return Math.max(0, Math.min(this.levels.length - 1, s.levelIndex ?? 0));
  }

  /** Death: count it, then bring the level back to the last checkpoint (start of the level, waves reset). */
  private checkpoint(): void {
    this.stats.deaths++;
    this.player.respawn(this.world.playerStart); this.player.yaw = this.world.playerYaw; this.cam.yaw = this.world.playerYaw;
    this.enemies.clear(); this.projectiles.clear(); this.areas.clear();
    this.wave = 0; if (!this.world.safe) { this.waveState = 'idle'; this.countdown = 4; } this.world.setPortalOpen?.(this.world.safe ? 0.25 : 0);
    this.hud.toast('YOU RISE AGAIN', `${this.world.name} · WAVES RESET`, 2.5);
    this.save();
  }

  /** Per-level setup shared by boot, restore and transitions. */
  private enterLevel(): void {
    const w = this.world;
    this.rig.setFog(w.fogColor ?? PALETTE.fog, w.fogDensity);
    this.rig.setMoon(w.lightBoost);
    this.hud.setArea(w.name, w.sub);
    this.hud.setObjective(w.objective);
    this.hud.setBoss(null);
    audio.setMood(this.moods[this.levelIndex] ?? 'court');
    this.wave = 0;
    if (w.safe) { this.waveState = 'done'; w.setPortalOpen(0.25); } else { this.waveState = 'idle'; this.countdown = 4; }
    for (const n of w.npcs) n.talked = false;
  }

  /** Talk to the nearest townsperson: a line of dialogue and, the first time, what they do for you. */
  private talk(): void {
    const w = this.world; const pp = this.player.position;
    const n = w.npcs.find((x) => Math.hypot(x.def.pos.x - pp.x, x.def.pos.z - pp.z) < 3.2);
    if (!n) return;
    const line = n.def.lines[n.talked ? Math.min(1, n.def.lines.length - 1) : 0];
    this.hud.toast(`${n.def.name.toUpperCase()} · ${n.def.title}`, line, 4.5);
    n.root.rotation.y = Math.atan2(pp.x - n.def.pos.x, pp.z - n.def.pos.z);
    n.animator?.once('Interact', { speed: 1.2 });
    audio.play('ready');
    if (!n.talked) {
      if (n.def.action === 'heal') { this.player.heal(this.player.hpMax); this.vfx.globePickup(this.player.chest()); audio.play('globe'); }
      if (n.def.action === 'gift') this.drops.drop(rollItem(Math.min(10, this.player.level + 1), Math.random() < 0.2 ? 'rare' : 'magic'), n.def.pos.add(new Vector3(0, 0, -2.5)));
    }
    n.talked = true;
  }

  /** Spawn the next wave. Wave 3 bursts from the door with a flare; the others rise around the player. */
  private async startWave(): Promise<void> {
    const def: WaveDef | undefined = this.world.waves[this.wave];
    if (!def) return;
    this.wave++;
    this.waveState = 'active';
    this.dbg.state.hpMult = +(1 + (this.wave - 1) * 0.12 + this.levelIndex * 0.3 + (this.player.level - 1) * 0.1).toFixed(2);
    const boss = def.spawns.some((g) => g.id === 'hollow_king');
    this.hud.toast(boss ? 'THE HOLLOW KING' : `WAVE ${this.wave} OF ${this.world.waves.length}`, boss ? 'RISES FROM HIS THRONE' : def.fromDoor ? 'THE DOOR ANSWERS' : 'THE DEAD STIR', 2.5);
    this.hud.setObjective(boss ? 'Destroy the Hollow King. Kill what he raises first.' : `Wave ${this.wave} of ${this.world.waves.length}. Kill everything that moves.`);
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
        const at = g.id === 'hollow_king' ? new Vector3(0, 0.075, 12)
          : def.fromDoor ? this.world.randomSpawn(this.world.doorPoint.add(new Vector3(0, 0, -2.5)), 1, 4)
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
    this.enemies.clear(); this.projectiles.clear(); this.pickups.clear(); this.areas.clear(); this.drops.clear();
    this.world.dispose();
    this.levelIndex = (this.levelIndex + 1) % this.levels.length;
    this.world = new this.levels[this.levelIndex](this.scene, this.loader, this.rig);
    await this.world.build();
    this.enemies.setWorld(this.world); this.abilities.setWorld(this.world); this.drops.setWorld(this.world);
    this.player.collider.position.copyFrom(this.world.playerStart); this.player.position.copyFrom(this.world.playerStart);
    this.player.yaw = this.world.playerYaw; this.cam.yaw = this.world.playerYaw;
    this.player.heal(this.player.hpMax); this.player.energy = 60;
    this.enterLevel();
    this.hud.toast(this.world.name, this.world.sub, 3.5);
    this.hud.fade(false);
    this.transitioning = false;
    this.save();
  }

  private teleport(where: string): void {
    const p = where === 'door' ? this.world.doorPoint.add(new Vector3(0, 0.1, -3)) : this.world.playerStart.clone();
    this.player.collider.position.copyFrom(p); this.player.position.copyFrom(p);
  }

  /** Simulation step. Order: input → player → abilities → projectiles → enemies → pickups → vfx → camera. */
  private fixed(dt: number): void {
    const d = this.dbg.state;
    if (this.mode !== 'play') {
      this.titleT += dt;
      if (this.mode === 'title') this.cam.cinematic = this.titlePose(this.titleT);
      if (this.mode === 'select') this.stage.update(dt);
      this.world.update(this.loop.time); this.vfx.update(dt);
      this.cam.update(dt, this.world.playerStart, { dx: 0, dy: 0 }, () => null);
      audio.setListener(this.cam.camera.position, 0); audio.setIntensity(0);
      this.input.endFrame();
      return;
    }
    this.playTime += dt;
    if (this.input.wasPressed('F1')) this.dbg.toggle();
    if (this.input.wasPressed('KeyI') || this.input.wasPressed('Tab')) this.inventoryUI.toggle();
    if (this.input.wasPressed('Escape') && this.inventoryUI.open) this.inventoryUI.close();
    if (this.input.wasPressed('KeyM')) { const m = audio.engine.toggleMute(); this.hud.toast(m ? 'AUDIO MUTED' : 'AUDIO ON', '', 1); }
    if (!audio.ready) void audio.unlock();
    if (this.input.wasPressed('F2')) { d.hideHud = !d.hideHud; }
    if (this.input.wasPressed('KeyR') && this.player.dead) this.checkpoint();
    this.hud.setHidden(d.hideHud);
    this.abilities.cdMult = d.cdMult; this.abilities.infiniteEnergy = d.infiniteEnergy; this.abilities.unlockAll = d.unlockAll;
    if (this.input.locked && !this.playing) { this.playing = true; if (!this.world.safe) { this.waveState = 'idle'; this.countdown = 3; } }
    this.enemies.frozen = d.freezeAI || !this.playing || !this.input.locked || this.inventoryUI.open; this.enemies.hpMult = d.hpMult; this.vfx.density = d.density;
    this.enemies.damageMult = 1 + (this.player.level - 1) * 0.07 + this.levelIndex * 0.25;
    this.enemies.frozenBonus = this.player.hasPassive('frozenHeart') ? 1.6 : 1; this.enemies.frozenExtra = this.player.hasPassive('frozenHeart') ? 1 : 0;
    this.saveTimer -= dt; if (this.saveTimer <= 0) { this.saveTimer = 10; this.save(); }
    this.cam.distanceOverride = d.camDist > 0 ? d.camDist : null; this.cam.fovOverride = d.fov > 0 ? d.fov : null;
    if (d.ssao !== this.ssaoOn) { this.ssaoOn = d.ssao; this.rig.setSsao(d.ssao); }

    const mouse = this.input.locked ? this.input.consumeMouse() : { dx: 0, dy: 0 };
    this.player.update(dt, this.input, this.cam, this.world);
    const alive = this.enemies.alive;
    this.targeting.update(this.cam, alive, this.player.position, this.world);
    if (this.input.locked) this.abilities.update(dt, this.input);
    this.projectiles.update(dt, (p, r, out) => this.enemies.queryNear(p, r, out), this.player, this.world);
    this.enemies.update(dt, this.player, d.god);
    this.pickups.update(dt, this.player);
    this.drops.update(dt, this.player, (item, ok) => {
      if (ok && item.rarity === 'legendary') this.stats.legendaries++;
      if (ok) { this.hud.toast(item.name.toUpperCase(), `${RARITY[item.rarity].label.toUpperCase()} · ${item.slot.toUpperCase()} · PRESS I`, item.rarity === 'legendary' ? 3 : 1.4); if (this.inventoryUI.open) this.inventoryUI.refresh(); }
      else this.hud.toast('BAG FULL', 'DROP SOMETHING FROM THE INVENTORY', 1.4);
    });
    this.areas.update(dt);
    this.vfx.update(dt);
    this.world.update(this.loop.time);

    // door prompt: sealed until the three waves are down, then it is the way to the next level
    const dp = this.world.doorPoint;
    const nearDoor = !this.player.dead && Math.abs(this.player.position.y - dp.y) < 1.5 && Math.hypot(this.player.position.x - dp.x, this.player.position.z - dp.z) < 4.5;
    const totalWaves = this.world.waves.length;
    const npc = this.world.npcs.find((x) => Math.hypot(x.def.pos.x - this.player.position.x, x.def.pos.z - this.player.position.z) < 3.2);
    this.hud.prompt(this.transitioning ? null : nearDoor ? (this.waveState === 'done' ? `PRESS E · ${this.world.exitLabel}` : `SEALED · WAVE ${Math.min(this.wave, totalWaves)} OF ${totalWaves}`) : npc ? `PRESS E · TALK TO ${npc.def.name.toUpperCase()}` : null);
    if (this.input.wasPressed('KeyE') && !this.transitioning) {
      if (nearDoor) {
        if (this.waveState === 'done') void this.transition();
        else { audio.play('denied'); this.hud.toast('THE WAY IS SEALED', `${totalWaves - Math.min(this.wave, totalWaves)} WAVE${totalWaves - this.wave === 1 ? '' : 'S'} REMAIN`, 1.8); }
      } else if (npc) this.talk();
    }

    // combat blend for the camera: pull back and widen as the pack closes in
    const near = this.enemies.countNear(this.player.position, 14);
    audio.setListener(this.player.position, this.cam.yaw);
    audio.setIntensity(this.player.dead ? 0 : clamp(near / 7, 0, 1));
    audio.setHealth(this.player.dead ? 1 : this.player.hp / Math.max(1, this.player.hpMax));
    this.cam.combatTarget = clamp(near / 6, 0, 1) * 0.85 + (this.player.stance > 0 ? 0.15 : 0);
    this.cam.update(dt, this.player.position, mouse, (a, b) => this.world.obstruct(a, b));

    // waves: countdown → active until the pack is dead → next, three per level
    if (this.playing && this.input.locked && !d.freezeAI && !this.player.dead && !this.transitioning && !this.world.safe) {
      if (this.waveState === 'idle' || this.waveState === 'countdown') {
        // the riser lands exactly on the spawn: fire it 2.5 s out (or immediately if the countdown is shorter)
        if (this.waveState === 'idle' && this.countdown <= 2.5) audio.riser(Math.max(0.5, this.countdown));
        this.waveState = 'countdown';
        const before = this.countdown;
        this.countdown -= dt;
        if (before > 2.5 && this.countdown <= 2.5) audio.riser(2.5);
        if (this.countdown <= 0) void this.startWave();
      } else if (this.waveState === 'active' && !this.spawning && alive.length === 0) {
        if (this.wave >= this.world.waves.length) {
          this.waveState = 'done';
          this.world.setPortalOpen(1);
          const boss = this.levelIndex === this.levels.length - 1;
          if (boss) { this.hud.setBoss(null); this.hud.toast('THE HOLLOW KING IS DESTROYED', 'HOLLOWMERE SLEEPS · RETURN TO THE VILLAGE', 6); for (let i = 0; i < 2; i++) this.drops.drop(rollItem(10, 'legendary'), this.player.position.add(new Vector3((i - 0.5) * 2, 0, 3))); this.vfx.levelUp(this.player.position); audio.play('legendary'); this.cam.shake(0.4, 0.8); }
          else { this.hud.toast('THE WAY IS OPEN', 'FIND THE GLOWING DOOR AND PRESS E', 3.5); audio.play('levelUp'); }
          this.hud.setObjective(boss ? 'The King is dust. The road home is open; the dead will gather again.' : `${this.world.exitLabel.charAt(0)}${this.world.exitLabel.slice(1).toLowerCase()} through the glowing door`);
          this.save();
        } else { this.waveState = 'countdown'; this.countdown = 5; this.hud.setObjective(`Wave ${this.wave} of ${this.world.waves.length} cleared. The next stirs…`); }
      }
    }
    this.input.endFrame();
  }

  /** Per-render-frame work: HUD sync and stats. */
  private frame(dt: number): void {
    if (this.mode !== 'play') return;
    this.hud.update(dt, this.player, this.abilities.slots(), this.targeting.target, this.enemies.pool, this.input.locked || this.inventoryUI.open);
    this.hud.updateLoot(this.drops.views);
    const king = this.enemies.pool.find((e) => e.alive && e.def.id === 'hollow_king');
    this.hud.setBoss(king ? 'THE HOLLOW KING' : null, king ? king.hp / king.hpMax : 1);
    this.statT += dt;
    if (this.dbg.visible && this.statT > 0.25) {
      this.statT = 0;
      const fps = this.engine.getFps();
      this.dbg.setStats(fps, `<b>${this.backend}</b> · enemies <b>${this.enemies.alive.length}</b> · projectiles <b>${this.projectiles.count}</b> · draw calls <b>${this.instr.drawCallsCounter.current}</b><br>frame <b>${this.instr.frameTimeCounter.lastSecAverage.toFixed(1)} ms</b> · meshes <b>${this.scene.getActiveMeshes().length}</b> · lvl <b>${this.player.level}</b> · pos <b>${this.player.position.x.toFixed(1)}, ${this.player.position.z.toFixed(1)}</b><br>yaw <b>${this.cam.yaw.toFixed(2)}</b> pitch <b>${this.cam.pitch.toFixed(2)}</b> combat <b>${this.cam.combat.toFixed(2)}</b>`);
    }
  }
}
