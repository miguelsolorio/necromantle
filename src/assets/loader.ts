import { AbstractMesh, AnimationGroup, AssetContainer, Color3, InstancedMesh, LoadAssetContainerAsync, Mesh, MeshBuilder, Scene, StandardMaterial, TransformNode, type InstantiatedEntries } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { assetUrl, type AssetId } from './registry';

export interface StaticOptions { collide?: boolean; ground?: boolean; castShadow?: boolean; receiveShadow?: boolean }
export interface CharacterInstance { root: TransformNode; meshes: AbstractMesh[]; groups: Map<string, AnimationGroup>; nodes: TransformNode[]; failed: boolean }

/** Loads asset containers once and hands out instances. Missing assets become magenta placeholders. */
export class AssetLoader {
  private containers = new Map<string, Promise<AssetContainer | null>>();
  private placeholderMat?: StandardMaterial;
  constructor(readonly scene: Scene) {}

  container(id: AssetId): Promise<AssetContainer | null> {
    let p = this.containers.get(id);
    if (!p) {
      p = LoadAssetContainerAsync(assetUrl(id), this.scene).catch((e) => { console.warn(`[assets] failed to load ${id}`, e); return null; });
      this.containers.set(id, p);
    }
    return p;
  }

  async preload(ids: AssetId[]): Promise<void> { await Promise.all(ids.map((id) => this.container(id))); }

  /** Instanced (shared geometry) copy of a static kit piece under a fresh TransformNode positioned at the feet. */
  async instanceStatic(id: AssetId, name: string, opts: StaticOptions = {}): Promise<TransformNode> {
    const holder = new TransformNode(name, this.scene);
    const container = await this.container(id);
    if (!container) { this.placeholder(holder, 2, 2, 2); return holder; }
    const entries: InstantiatedEntries = container.instantiateModelsToScene((n) => `${name}|${n}`, false, { doNotInstantiate: false });
    for (const root of entries.rootNodes) root.parent = holder;
    const meta = { static: true, collide: !!opts.collide, ground: !!opts.ground };
    for (const m of holder.getChildMeshes()) {
      m.metadata = meta;
      m.isPickable = true;
      m.checkCollisions = !!opts.collide;
      if (m instanceof InstancedMesh) m.sourceMesh.receiveShadows = opts.receiveShadow !== false; else m.receiveShadows = opts.receiveShadow !== false;
      m.alwaysSelectAsActiveMesh = false;
    }
    return holder;
  }

  /** Cloned (own skeleton + animation groups) character. */
  async instanceCharacter(id: AssetId, name: string): Promise<CharacterInstance> {
    const root = new TransformNode(name, this.scene);
    const container = await this.container(id);
    const groups = new Map<string, AnimationGroup>();
    if (!container) { this.placeholder(root, 0.8, 2, 0.8); return { root, meshes: root.getChildMeshes(), groups, nodes: [], failed: true }; }
    const entries = container.instantiateModelsToScene((n) => `${name}|${n}`, false, { doNotInstantiate: true });
    for (const r of entries.rootNodes) r.parent = root;
    for (const g of entries.animationGroups) { g.stop(); groups.set(g.name.split('|').pop()!, g); }
    const meshes = root.getChildMeshes();
    for (const m of meshes) { m.isPickable = false; m.checkCollisions = false; m.metadata = { character: true }; }
    const nodes = root.getDescendants(false).filter((n): n is TransformNode => n instanceof TransformNode && !(n instanceof AbstractMesh));
    return { root, meshes, groups, nodes, failed: false };
  }

  private placeholder(parent: TransformNode, w: number, h: number, d: number): Mesh {
    if (!this.placeholderMat) {
      this.placeholderMat = new StandardMaterial('placeholder', this.scene);
      this.placeholderMat.diffuseColor = Color3.Magenta();
      this.placeholderMat.emissiveColor = Color3.Magenta().scale(0.4);
    }
    const box = MeshBuilder.CreateBox(`${parent.name}|placeholder`, { width: w, height: h, depth: d }, this.scene);
    box.position.y = h / 2;
    box.material = this.placeholderMat;
    box.parent = parent;
    box.metadata = { placeholder: true };
    return box;
  }
}
