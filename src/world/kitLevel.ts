import { Color3, Mesh, MeshBuilder, PBRMaterial, PointLight, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { AssetLoader } from '@/assets/loader';
import type { KitId } from '@/assets/registry';
import type { EnemyId } from '@/content/enemies';
import { PALETTE } from '@/content/palette';
import { rand } from '@/core/mathx';
import type { RenderRig } from '@/rendering/setup';
import { Textures } from '@/rendering/textures';
import { World } from './world';

/** Architecture is exaggerated 1.5–2.5× (rule R-11). Kit walls are 4 m; gates become 10 m. */
export const KIT_SCALE = 1.5;

/** Local-space bounds (minX, minY, minZ, maxX, maxY, maxZ) for pieces that get rotated box colliders. Measured from the GLBs. */
const KIT_BOUNDS: Partial<Record<KitId, [number, number, number, number, number, number]>> = {
  'kit.wall': [-2, 0, -0.5, 2, 4, 0.5], 'kit.wall_arched': [-2, 0, -0.5, 2, 4, 0.5], 'kit.wall_archedwindow_open': [-2, 0, -0.5, 2, 4, 0.5], 'kit.wall_broken': [-2, 0, -0.5, 2, 4, 0.5],
  'kit.wall_cracked': [-2, 0, -0.5, 2, 4, 0.5], 'kit.wall_window_open': [-2, 0, -0.5, 2, 4, 0.5], 'kit.wall_half': [-2, 0, -0.5, 2, 4, 0.5], 'kit.wall_Tsplit': [-2, 0, -0.5, 2, 4, 0.5],
  'kit.wall_pillar': [-2, 0, -0.75, 2, 4, 0.75], 'kit.wall_corner': [-2, 0, -0.5, 0.5, 4, 2], 'kit.wall_endcap': [0, 0, -0.5, 1.07, 4, 0.5],
  'kit.pillar': [-0.75, 0, -0.75, 0.75, 4, 0.75], 'kit.pillar_decorated': [-0.75, 0, -0.75, 0.75, 4, 0.75], 'kit.column': [-0.35, 0, -0.35, 0.35, 1.4, 0.35],
  'kit.rubble_large': [-4.07, 0, -1.59, 4.06, 3.5, 1.6], 'kit.chest': [-0.85, 0, -0.6, 0.85, 0.8, 1.31], 'kit.barrel_large': [-0.9, 0, -0.9, 0.9, 2, 0.9],
};

export interface Placement { id: KitId; x: number; z: number; y?: number; rot?: number; scale?: number; scaleV?: [number, number, number]; collide?: boolean; ground?: boolean }
export interface WaveDef { fromDoor?: boolean; spawns: { id: EnemyId; n: number; elite?: boolean }[] }
export interface KeepOut { x: number; z: number; r: number }

/**
 * Base for kit-built levels: placement with box colliders, warm lights with flame billboards, portals, grime,
 * prop scatter and teardown. Levels supply `build()`, their waves and where their exit door stands.
 */
export abstract class KitLevel extends World {
  readonly root: TransformNode;
  readonly torches: PointLight[] = [];
  name = 'LEVEL';
  sub = '';
  waves: WaveDef[] = [];
  /** Text on the door prompt once the waves are cleared. */
  exitLabel = 'ENTER';
  /** Where the player must stand to use the door, and the portal plane that brightens when it unlocks. */
  doorPoint = new Vector3(0, 0, 40);
  doorPortal: Mesh | null = null;
  colliderCount = 0;
  private colliderMat!: StandardMaterial;
  private flames: Mesh[] = [];
  private flameMat!: StandardMaterial;
  private flameCore!: StandardMaterial;
  private grimeSrc: Mesh | null = null;
  private portalMat: StandardMaterial | null = null;
  private placed: { x: number; z: number; r: number }[] = [];

  constructor(scene: Scene, protected loader: AssetLoader, protected rig: RenderRig) {
    super(scene);
    this.root = new TransformNode('level', scene);
  }

  abstract build(): Promise<void>;

  /** Invisible box collider (Babylon's collider needs a material and kit winding is mirrored, so boxes it is). */
  addCollider(name: string, center: Vector3, size: Vector3, rotY = 0): Mesh {
    if (!this.colliderMat) { this.colliderMat = new StandardMaterial('colliderMat', this.scene); this.colliderMat.alpha = 0; }
    const box = MeshBuilder.CreateBox(name, { width: size.x, height: size.y, depth: size.z }, this.scene);
    box.position.copyFrom(center); box.rotation.y = rotY;
    box.material = this.colliderMat; box.isVisible = false; box.isPickable = false;
    box.checkCollisions = true; box.collisionGroup = 1; box.metadata = { static: true, collide: true, collider: true };
    box.parent = this.root; box.freezeWorldMatrix();
    this.colliderCount++;
    return box;
  }

  /**
   * Level lights are pooled, never disposed: on WebGPU, disposing a light leaves materials bound to its destroyed
   * uniform buffer and every later submit is rejected (blank frames after a level swap).
   */
  private static lightPool: PointLight[] = [];

  protected addTorch(pos: Vector3, intensity: number, range: number, color = PALETTE.torch): PointLight {
    let l = KitLevel.lightPool.pop();
    if (!l) l = new PointLight(`levelLight${this.scene.lights.length}`, pos.clone(), this.scene);
    l.position.copyFrom(pos); l.setEnabled(true);
    l.diffuse = color.clone(); l.specular = color.scale(0.2); l.intensity = intensity; l.range = range;
    l.metadata = { baseIntensity: intensity, phase: Math.random() * 10 };
    l.renderPriority = 50; l.parent = null;
    this.torches.push(l);
    return l;
  }

  /** Two-layer emissive flame billboard (halo + core) that flickers in update(). */
  protected addFlame(pos: Vector3, size = 1.6): void {
    if (!this.flameMat) {
      this.flameMat = new StandardMaterial('flameMat', this.scene);
      this.flameMat.emissiveColor = new Color3(1, 0.62, 0.22); this.flameMat.diffuseColor = Color3.Black(); this.flameMat.opacityTexture = Textures.softDot(this.scene); this.flameMat.disableLighting = true; this.flameMat.alphaMode = 1; this.flameMat.backFaceCulling = false;
      this.flameCore = new StandardMaterial('flameCore', this.scene);
      this.flameCore.emissiveColor = new Color3(1, 0.9, 0.6); this.flameCore.diffuseColor = Color3.Black(); this.flameCore.opacityTexture = Textures.spark(this.scene); this.flameCore.disableLighting = true; this.flameCore.alphaMode = 1; this.flameCore.backFaceCulling = false;
    }
    const halo = MeshBuilder.CreatePlane(`flame${this.flames.length}`, { size }, this.scene);
    halo.material = this.flameMat; halo.billboardMode = Mesh.BILLBOARDMODE_ALL; halo.position.copyFrom(pos); halo.isPickable = false; halo.applyFog = false; halo.parent = this.root;
    const core = MeshBuilder.CreatePlane(`flameCore${this.flames.length}`, { size: size * 0.34 }, this.scene);
    core.material = this.flameCore; core.billboardMode = Mesh.BILLBOARDMODE_ALL; core.position.copyFrom(pos).addInPlaceFromFloats(0, 0.05, 0); core.isPickable = false; core.applyFog = false; core.parent = this.root;
    this.flames.push(halo, core); this.rig.addGlow(halo); this.rig.addGlow(core);
  }

  /** Torch on a wall/pillar face with its flame and no extra light (lights are budgeted separately). */
  protected torchProp(x: number, z: number, y: number, rot: number, scale = 1.8): { prop: Placement; flame: Vector3 } {
    const fx = x + Math.sin(rot) * 0.55 * (scale / 1.8), fz = z + Math.cos(rot) * 0.55 * (scale / 1.8);
    return { prop: { id: 'kit.torch_mounted', x, z, y, rot, scale }, flame: new Vector3(fx, y + 1.15 * (scale / 1.8), fz) };
  }

  protected addPortal(pos: Vector3, width: number, height: number, isExit = true): Mesh {
    const portal = MeshBuilder.CreatePlane('portal', { width, height }, this.scene);
    const mat = new StandardMaterial('portalMat', this.scene);
    mat.emissiveColor = PALETTE.arcane.scale(0.9); mat.diffuseColor = Color3.Black(); mat.opacityTexture = Textures.softDot(this.scene); mat.disableLighting = true; mat.alphaMode = 1; mat.backFaceCulling = false;
    portal.material = mat; portal.position.copyFrom(pos); portal.isPickable = false; portal.parent = this.root; this.rig.addGlow(portal);
    if (isExit) { this.doorPortal = portal; this.portalMat = mat; }
    return portal;
  }

  /** 0 = sealed (dim violet), 1 = open (bright cyan-white). */
  setPortalOpen(k: number): void {
    if (!this.portalMat || !this.doorPortal) return;
    this.portalMat.emissiveColor = Color3.Lerp(PALETTE.arcane.scale(0.9), PALETTE.arcaneWhite.scale(1.4), k);
    this.doorPortal.scaling.setAll(1 + k * 0.15);
  }

  protected addGrime(minX: number, maxX: number, minZ: number, maxZ: number, count: number, y = 0.095): void {
    if (!this.grimeSrc) {
      const grimeMat = new StandardMaterial('grimeMat', this.scene);
      grimeMat.diffuseColor = new Color3(0.02, 0.015, 0.02); grimeMat.specularColor = Color3.Black(); grimeMat.opacityTexture = Textures.scorch(this.scene); grimeMat.alpha = 0.6; grimeMat.backFaceCulling = false; grimeMat.disableLighting = true;
      this.grimeSrc = MeshBuilder.CreatePlane('grimeSrc', { size: 1 }, this.scene);
      this.grimeSrc.rotation.x = Math.PI / 2; this.grimeSrc.material = grimeMat; this.grimeSrc.isVisible = false; this.grimeSrc.isPickable = false; this.grimeSrc.parent = this.root;
    }
    for (let i = 0; i < count; i++) {
      const g = this.grimeSrc.createInstance(`grime${i}`);
      const r = rand(2.2, 6.5);
      g.position.set(rand(minX, maxX), y + i * 0.0005, rand(minZ, maxZ)); g.scaling.set(r, r * rand(0.6, 1.2), 1); g.rotation.y = rand(0, 6.28);
      g.isPickable = false; g.parent = this.root;
    }
  }

  protected makeGround(color: Color3, y = -0.06): void {
    const ground = MeshBuilder.CreateGround('ground', { width: 400, height: 400, subdivisions: 2 }, this.scene);
    const gm = new PBRMaterial('groundMat', this.scene);
    gm.albedoTexture = Textures.stone(this.scene);
    (gm.albedoTexture as any).uScale = 60; (gm.albedoTexture as any).vScale = 60;
    gm.albedoColor = color; gm.metallic = 0; gm.roughness = 0.95; gm.maxSimultaneousLights = 8;
    ground.material = gm; ground.position.y = y; ground.receiveShadows = true; ground.isPickable = true;
    ground.metadata = { static: true, ground: true }; ground.parent = this.root;
  }

  /**
   * Random prop scatter inside a rectangle, keeping clear of `keepOut` circles and of other scattered props.
   * Returns the placements it produced so callers can add them to the batch.
   */
  protected scatter(ids: KitId[], count: number, rect: { minX: number; maxX: number; minZ: number; maxZ: number }, keepOut: KeepOut[], opts: { scale?: [number, number]; collide?: boolean; spacing?: number; y?: number } = {}): Placement[] {
    const out: Placement[] = [];
    const spacing = opts.spacing ?? 2.4;
    for (let n = 0, tries = 0; n < count && tries < count * 30; tries++) {
      const x = rand(rect.minX, rect.maxX), z = rand(rect.minZ, rect.maxZ);
      if (keepOut.some((k) => Math.hypot(k.x - x, k.z - z) < k.r)) continue;
      if (this.placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + spacing * 0.5)) continue;
      const id = ids[Math.floor(Math.random() * ids.length)];
      out.push({ id, x, z, y: opts.y, rot: rand(0, Math.PI * 2), scale: rand(opts.scale?.[0] ?? 1.2, opts.scale?.[1] ?? 1.6), collide: opts.collide ?? true });
      this.placed.push({ x, z, r: spacing * 0.5 });
      n++;
    }
    return out;
  }
  protected reserve(x: number, z: number, r: number): void { this.placed.push({ x, z, r }); }

  protected async placeAll(list: Placement[]): Promise<void> { await Promise.all(list.map((pl, i) => this.place(pl, i))); }

  protected async place(pl: Placement, i: number): Promise<void> {
    const node = await this.loader.instanceStatic(pl.id, `${pl.id.slice(4)}#${i}`, { collide: false, ground: pl.ground, receiveShadow: true });
    node.position.set(pl.x, pl.y ?? 0, pl.z);
    node.rotation.y = pl.rot ?? 0;
    if (pl.scaleV) node.scaling.set(pl.scaleV[0], pl.scaleV[1], pl.scaleV[2]); else node.scaling.setAll(pl.scale ?? KIT_SCALE);
    node.parent = this.root;
    for (const m of node.getChildMeshes()) {
      const mat = m.material;
      if (mat instanceof PBRMaterial) { mat.metallic = 0; mat.roughness = 0.92; mat.specularIntensity = 0.25; mat.maxSimultaneousLights = 8; if (!mat.metadata?.tinted) { mat.metadata = { tinted: true }; const k = pl.ground ? 0.4 : 0.72; mat.albedoColor = new Color3(k * 0.96, k * 0.94, k); } }
      if (pl.collide && !pl.ground && /pillar|column|rubble|chest|barrel|crates|box|keg|trunk|table|shelf|bed/.test(pl.id)) this.rig.addCaster(m);
      if (/stairs/.test(pl.id)) this.rig.addCaster(m);
      if (/torch|candle/.test(pl.id)) this.rig.addGlow(m);
      m.freezeWorldMatrix();
    }
    if (pl.collide && !pl.ground) {
      const rot = pl.rot ?? 0;
      const sc = pl.scaleV ?? [pl.scale ?? KIT_SCALE, pl.scale ?? KIT_SCALE, pl.scale ?? KIT_SCALE];
      const local = KIT_BOUNDS[pl.id];
      if (local) {
        const w = (local[3] - local[0]) * sc[0], h = (local[4] - local[1]) * sc[1], d = (local[5] - local[2]) * sc[2];
        const cx = ((local[0] + local[3]) / 2) * sc[0], cy = ((local[1] + local[4]) / 2) * sc[1], cz = ((local[2] + local[5]) / 2) * sc[2];
        const c = new Vector3(pl.x + cx * Math.cos(rot) + cz * Math.sin(rot), (pl.y ?? 0) + cy, pl.z - cx * Math.sin(rot) + cz * Math.cos(rot));
        this.addCollider(`col.${pl.id.slice(4)}#${i}`, c, new Vector3(w, h, d), rot);
      } else {
        node.computeWorldMatrix(true);
        const { min, max } = node.getHierarchyBoundingVectors(true);
        const size = max.subtract(min);
        if (Number.isFinite(size.x) && size.x > 0.2 && size.z > 0.2) this.addCollider(`col.${pl.id.slice(4)}#${i}`, min.add(max).scale(0.5), size);
      }
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

  dispose(): void {
    for (const l of this.torches) { l.intensity = 0; l.setEnabled(false); KitLevel.lightPool.push(l); }
    this.torches.length = 0;
    this.root.dispose(false, false);
  }
}
