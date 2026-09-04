import { Color3, Mesh, MeshBuilder, PBRMaterial, PointLight, Scene, StandardMaterial, TransformNode, Vector3 } from "@babylonjs/core";
import type { AssetLoader } from '@/assets/loader';
import type { KitId } from '@/assets/registry';
import { PALETTE } from '@/content/palette';
import { pick, rand } from '@/core/mathx';
import type { RenderRig } from '@/rendering/setup';
import { Textures } from '@/rendering/textures';
import { World } from './world';

/** Architecture is exaggerated 1.5–2.5× (rule R-11). Kit walls are 4 m; the gate becomes 10 m. */
export const KIT_SCALE = 1.5;

interface Placement { id: KitId; x: number; z: number; y?: number; rot?: number; scale?: number; collide?: boolean; ground?: boolean }

/**
 * Milestone-1 benchmark: a walled courtyard below a raised cathedral door, two rows of giant pillars,
 * torches, props and distant silhouettes in the fog. Built from placement data so it can grow into the village.
 */
export class BenchmarkScene extends World {
  readonly torches: PointLight[] = [];
  private flames: Mesh[] = [];
  private flameMat!: StandardMaterial;
  private root: TransformNode;

  constructor(scene: Scene, private loader: AssetLoader, private rig: RenderRig) {
    super(scene);
    this.root = new TransformNode('benchmark', scene);
    this.playerStart = new Vector3(0, 0, -12);
    this.playerYaw = 0;
  }

  async build(): Promise<void> {
    const S = KIT_SCALE, T = 4 * S; // tile pitch 6 m
    const p: Placement[] = [];

    // ---- floor: 8×8 large tiles with rocky / weedy variants
    for (let ix = -4; ix < 4; ix++) for (let iz = -4; iz < 4; iz++) {
      const r = Math.random();
      const id: KitId = r < 0.12 ? 'kit.floor_tile_large_rocks' : r < 0.2 ? 'kit.floor_dirt_large' : 'kit.floor_tile_large';
      p.push({ id, x: ix * T + T / 2, z: iz * T + T / 2, rot: Math.floor(rand(0, 4)) * Math.PI / 2, ground: true });
    }
    // ---- perimeter walls (24 m half-extent), north side has the stair opening
    const half = 4 * T; // 24
    const wallIds: KitId[] = ['kit.wall', 'kit.wall', 'kit.wall_cracked', 'kit.wall_broken', 'kit.wall_archedwindow_open', 'kit.wall_window_open', 'kit.wall'];
    for (let i = -4; i < 4; i++) {
      const c = i * T + T / 2;
      // south (z = -half), facing +z
      p.push({ id: pick(wallIds), x: c, z: -half, rot: 0, collide: true });
      // east / west
      p.push({ id: pick(wallIds), x: half, z: c, rot: Math.PI / 2, collide: true });
      p.push({ id: pick(wallIds), x: -half, z: c, rot: -Math.PI / 2, collide: true });
      // north, leave the middle two tiles for the stair
      if (i !== -1 && i !== 0) p.push({ id: pick(wallIds), x: c, z: half, rot: Math.PI, collide: true });
    }
    // wall pillars at corners and thirds
    for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half], [0, -half], [-half, 0], [half, 0], [-T * 1.5, half], [T * 1.5, half]]) {
      p.push({ id: 'kit.wall_pillar', x, z, rot: 0, scale: S * 1.15, collide: true });
    }
    // ---- gate: two giant pillars framing the stair
    p.push({ id: 'kit.pillar', x: -T - 0.6, z: half + 1.4, scale: 2.6, collide: true });
    p.push({ id: 'kit.pillar', x: T + 0.6, z: half + 1.4, scale: 2.6, collide: true });
    // stair up to the raised threshold (stairs_wide: 7 wide × 5.1 high × 4 deep at scale 1)
    const stairS = 1.3;
    p.push({ id: 'kit.stairs_wide', x: 0, z: half - 0.5, scale: stairS, rot: 0, collide: true, ground: true });
    const topY = 5.1 * stairS, topZ = half - 0.5 + 4 * stairS;
    // threshold platform: foundation tiles
    for (let ix = -1; ix <= 1; ix++) for (let iz = 0; iz < 2; iz++) p.push({ id: 'kit.floor_tile_large', x: ix * T, z: topZ + T / 2 + iz * T, y: topY, ground: true, collide: true });
    // the cathedral door: an arched wall at 2.5× (10 m) flanked by wall pillars, on the platform
    p.push({ id: 'kit.wall_arched', x: 0, z: topZ + T * 2 - 1, y: topY, rot: Math.PI, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall_pillar', x: -T * 1.2, z: topZ + T * 2 - 1, y: topY, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall_pillar', x: T * 1.2, z: topZ + T * 2 - 1, y: topY, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall', x: -T * 2.2, z: topZ + T * 2 - 1, y: topY, rot: Math.PI, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall', x: T * 2.2, z: topZ + T * 2 - 1, y: topY, rot: Math.PI, scale: 2.5, collide: true });
    // banners on the door wall
    p.push({ id: 'kit.banner_triple_red', x: -T * 1.2, z: topZ + T * 2 - 1.9, y: topY + 2.5, rot: Math.PI, scale: 2.2 });
    p.push({ id: 'kit.banner_triple_red', x: T * 1.2, z: topZ + T * 2 - 1.9, y: topY + 2.5, rot: Math.PI, scale: 2.2 });
    // ---- two rows of giant pillars down the courtyard
    for (const z of [-15, -5, 5, 15]) for (const x of [-9, 9]) {
      p.push({ id: Math.random() < 0.3 ? 'kit.pillar_decorated' : 'kit.pillar', x, z, scale: 2.0, collide: true });
    }
    // broken column stubs and rubble
    p.push({ id: 'kit.rubble_large', x: -17, z: 12, rot: 0.6, scale: 1.4, collide: true });
    p.push({ id: 'kit.rubble_large', x: 18, z: -14, rot: -1.1, scale: 1.3, collide: true });
    p.push({ id: 'kit.rubble_half', x: 14, z: 8, rot: 2.3, scale: 1.4, collide: true });
    for (const [x, z] of [[-14, -18], [16, 17], [-19, -4]]) p.push({ id: 'kit.column', x, z, rot: rand(0, 3), scale: 2.2, collide: true });
    // props: barrels, crates, kegs, chest
    const props: KitId[] = ['kit.barrel_large', 'kit.barrel_small_stack', 'kit.crates_stacked', 'kit.box_stacked', 'kit.keg', 'kit.box_large', 'kit.trunk_large_A'];
    for (let i = 0; i < 16; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      p.push({ id: pick(props), x: side * rand(16, 21.5), z: rand(-21, 20), rot: rand(0, 6), scale: rand(1.2, 1.6), collide: true });
    }
    p.push({ id: 'kit.chest', x: -20, z: 20, rot: 0.8, scale: 1.5, collide: true });
    p.push({ id: 'kit.table_long_broken', x: 19, z: 3, rot: 1.4, scale: 1.5, collide: true });
    // candles at the stair foot
    for (const x of [-4.5, 4.5]) p.push({ id: 'kit.candle_triple', x, z: half - 1.6, scale: 2.2 });
    // torches on inner pillars (facing inward) + wall torches
    const torchAt: { x: number; z: number; rot: number }[] = [];
    for (const z of [-15, -5, 5, 15]) { torchAt.push({ x: -9 + 1.55, z, rot: Math.PI / 2 }); torchAt.push({ x: 9 - 1.55, z, rot: -Math.PI / 2 }); }
    for (const t of torchAt) p.push({ id: 'kit.torch_mounted', x: t.x, z: t.z, y: 4.2, rot: t.rot, scale: 1.8 });
    p.push({ id: 'kit.torch_mounted', x: -T - 0.6 + 2.1, z: half + 1.4, y: 6, rot: Math.PI / 2, scale: 2 });
    p.push({ id: 'kit.torch_mounted', x: T + 0.6 - 2.1, z: half + 1.4, y: 6, rot: -Math.PI / 2, scale: 2 });

    // ---- distant silhouettes beyond the walls: a cathedral mass to the north, towers east/west
    const far: Placement[] = [
      { id: 'kit.wall_arched', x: 0, z: 95, scale: 9, rot: Math.PI }, { id: 'kit.wall_pillar', x: -30, z: 95, scale: 9 }, { id: 'kit.wall_pillar', x: 30, z: 95, scale: 9 },
      { id: 'kit.pillar', x: -12, z: 110, scale: 14 }, { id: 'kit.pillar', x: 12, z: 110, scale: 14 }, { id: 'kit.pillar', x: 0, z: 118, scale: 19 },
      { id: 'kit.wall', x: -55, z: 60, scale: 7, rot: 0.4 }, { id: 'kit.pillar', x: -70, z: 40, scale: 9 }, { id: 'kit.pillar', x: 72, z: 55, scale: 11 },
      { id: 'kit.wall_broken', x: 60, z: 20, scale: 7, rot: -0.8 }, { id: 'kit.wall_broken', x: -62, z: -20, scale: 6, rot: 1.2 },
      { id: 'kit.pillar', x: 40, z: -70, scale: 8 }, { id: 'kit.wall', x: -20, z: -75, scale: 7 },
    ];

    await Promise.all([...p, ...far].map((pl, i) => this.place(pl, i)));

    // ---- big ground plane under everything (painterly stone, mid-value: rule R-06)
    const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400, subdivisions: 2 }, this.scene);
    const gm = new PBRMaterial('groundMat', this.scene);
    gm.albedoTexture = Textures.stone(this.scene);
    (gm.albedoTexture as any).uScale = 60; (gm.albedoTexture as any).vScale = 60;
    gm.albedoColor = new Color3(0.3, 0.27, 0.31);
    gm.metallic = 0; gm.roughness = 0.95; gm.maxSimultaneousLights = 8;
    ground.material = gm; ground.position.y = -0.06; ground.receiveShadows = true; ground.isPickable = true;
    ground.metadata = { static: true, ground: true };
    ground.parent = this.root;

    // ---- torch lights (warm locals, rule R-15)
    // WebGPU allows 8 lights per mesh, so torch pairs share one light between the pillar rows (priority below spells)
    for (const z of [-10, 10]) this.addTorch(new Vector3(0, 4.6, z), 26, 20);
    this.addTorch(new Vector3(0, 6.5, half + 0.4), 30, 22);
    // visible flames: two-layer emissive billboards (halo + core) that flicker in update()
    this.flameMat = new StandardMaterial("flameMat", this.scene);
    this.flameMat.emissiveColor = new Color3(1, 0.62, 0.22); this.flameMat.diffuseColor = Color3.Black(); this.flameMat.opacityTexture = Textures.softDot(this.scene); this.flameMat.disableLighting = true; this.flameMat.alphaMode = 1; this.flameMat.backFaceCulling = false;
    const flameCore = new StandardMaterial("flameCore", this.scene);
    flameCore.emissiveColor = new Color3(1, 0.9, 0.6); flameCore.diffuseColor = Color3.Black(); flameCore.opacityTexture = Textures.spark(this.scene); flameCore.disableLighting = true; flameCore.alphaMode = 1; flameCore.backFaceCulling = false;
    const flamePositions = [...torchAt.map((t) => new Vector3(t.x + (t.rot > 0 ? 0.55 : -0.55), 5.35, t.z)), new Vector3(-T - 0.6 + 2.6, 7.4, half + 1.4), new Vector3(T + 0.6 - 2.6, 7.4, half + 1.4), new Vector3(-4.5, 1.9, half - 1.6), new Vector3(4.5, 1.9, half - 1.6)];
    for (const fp of flamePositions) {
      const halo = MeshBuilder.CreatePlane(`flame${this.flames.length}`, { size: 1.6 }, this.scene);
      halo.material = this.flameMat; halo.billboardMode = Mesh.BILLBOARDMODE_ALL; halo.position.copyFrom(fp); halo.isPickable = false; halo.applyFog = false;
      const core = MeshBuilder.CreatePlane(`flameCore${this.flames.length}`, { size: 0.55 }, this.scene);
      core.material = flameCore; core.billboardMode = Mesh.BILLBOARDMODE_ALL; core.position.copyFrom(fp).addInPlaceFromFloats(0, 0.05, 0); core.isPickable = false; core.applyFog = false;
      this.flames.push(halo, core);
    }
    // arcane glow inside the cathedral door
    const portal = MeshBuilder.CreatePlane("portal", { width: 7.5, height: 10 }, this.scene);
    const pm = new StandardMaterial("portalMat", this.scene);
    pm.emissiveColor = PALETTE.arcane.scale(0.9); pm.diffuseColor = Color3.Black(); pm.opacityTexture = Textures.softDot(this.scene); pm.disableLighting = true; pm.alphaMode = 1; pm.backFaceCulling = false;
    portal.material = pm; portal.position.set(0, topY + 4.5, topZ + T * 2 - 1.6); portal.isPickable = false;
    portal.parent = this.root;
    // door glow behind the arch
    const doorGlow = this.addTorch(new Vector3(0, topY + 5, topZ + T * 2 - 3), 18, 22, PALETTE.arcane.scale(0.9));
    doorGlow.name = 'doorGlow';

    // grime: dark blotches over the flagstones so the floor stops reading as a clean tile grid (rule R-14)
    const grimeMat = new StandardMaterial("grimeMat", this.scene);
    grimeMat.diffuseColor = new Color3(0.02, 0.015, 0.02); grimeMat.specularColor = Color3.Black(); grimeMat.opacityTexture = Textures.scorch(this.scene); grimeMat.alpha = 0.6; grimeMat.backFaceCulling = false; grimeMat.disableLighting = true;
    const grimeSrc = MeshBuilder.CreatePlane("grimeSrc", { size: 1 }, this.scene);
    grimeSrc.rotation.x = Math.PI / 2; grimeSrc.material = grimeMat; grimeSrc.isVisible = false; grimeSrc.isPickable = false;
    for (let i = 0; i < 46; i++) {
      const g = grimeSrc.createInstance(`grime${i}`);
      const r = rand(2.2, 6.5);
      g.position.set(rand(-23, 23), 0.095 + i * 0.0005, rand(-23, 23)); g.scaling.set(r, r * rand(0.6, 1.2), 1); g.rotation.y = rand(0, 6.28);
      g.isPickable = false; g.parent = this.root;
    }
    // spawn ring
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; this.spawnPoints.push(new Vector3(Math.sin(a) * 16, 0, Math.cos(a) * 16)); }
  }

  private addTorch(pos: Vector3, intensity: number, range: number, color = PALETTE.torch): PointLight {
    const l = new PointLight(`torch${this.torches.length}`, pos, this.scene);
    l.diffuse = color.clone(); l.specular = color.scale(0.2); l.intensity = intensity; l.range = range;
    l.metadata = { baseIntensity: intensity, phase: Math.random() * 10 };
    l.renderPriority = 50;
    this.torches.push(l);
    return l;
  }

  private async place(pl: Placement, i: number): Promise<void> {
    const node = await this.loader.instanceStatic(pl.id, `${pl.id.slice(4)}#${i}`, { collide: pl.collide, ground: pl.ground, receiveShadow: true });
    node.position.set(pl.x, pl.y ?? 0, pl.z);
    node.rotation.y = pl.rot ?? 0;
    node.scaling.setAll(pl.scale ?? KIT_SCALE);
    node.parent = this.root;
    for (const m of node.getChildMeshes()) {
      const mat = m.material;
      if (mat instanceof PBRMaterial) { mat.metallic = 0; mat.roughness = 0.92; mat.specularIntensity = 0.25; mat.maxSimultaneousLights = 8; if (!mat.metadata?.tinted) { mat.metadata = { tinted: true }; const k = pl.ground ? 0.4 : 0.72; mat.albedoColor = new Color3(k * 0.96, k * 0.94, k); } }
      if (pl.collide && !pl.ground) this.rig.addCaster(m);
      if (pl.id.startsWith('kit.torch') && /fire|flame/i.test(m.name)) { /* flames stay emissive via material */ }
      m.freezeWorldMatrix();
    }
  }

  /** Flicker the warm lights and flames a little each frame. */
  update(t: number): void {
    for (let i = 0; i < this.flames.length; i++) { const f = this.flames[i]; const k = 0.85 + 0.15 * Math.sin(t * 11 + i * 1.7) * Math.sin(t * 5.3 + i); f.scaling.set(k, k * (1.1 + 0.2 * Math.sin(t * 7 + i)), 1); }
    for (const l of this.torches) {
      const b = l.metadata.baseIntensity as number, ph = l.metadata.phase as number;
      l.intensity = b * (0.88 + 0.12 * Math.sin(t * 9 + ph) * Math.sin(t * 3.3 + ph * 2));
    }
  }
}
