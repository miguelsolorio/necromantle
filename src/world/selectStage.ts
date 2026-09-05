import { Color3, Mesh, MeshBuilder, PBRMaterial, PointLight, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import type { AssetLoader, CharacterInstance } from '@/assets/loader';
import { CLASS_ORDER, CLASSES, type ClassDef } from '@/content/classes';
import type { ClassId } from '@/content/abilities';
import { addRim } from '@/rendering/rimPlugin';
import type { RenderRig } from '@/rendering/setup';
import { Animator } from '@/player/animator';

/**
 * Character-select stage: four stone pedestals in a walled corner far outside the village bounds, one rig
 * each, lit by a warm key and the class accent as rim colour. Lives in the hub scene so the title needs no
 * second scene; the player never reaches it (it sits 90 m south of the square, past the ground fog).
 */
export class SelectStage {
  readonly root: TransformNode;
  readonly origin = new Vector3(0, 0, -90);
  private rigs = new Map<ClassId, { inst: CharacterInstance; anim: Animator; node: TransformNode; light: PointLight }>();
  private spin = 0;
  focused: ClassId = 'sorcerer';

  constructor(private scene: Scene, private loader: AssetLoader, private rig: RenderRig) {
    this.root = new TransformNode('selectStage', scene);
    this.root.position.copyFrom(this.origin);
  }

  pedestalPos(id: ClassId): Vector3 {
    const i = CLASS_ORDER.indexOf(id);
    return this.origin.add(new Vector3((i - 1.5) * 3.2, 0, 0));
  }

  /** Camera pose for the whole row, or for one pedestal when `id` is given. */
  cameraPose(id: ClassId | null): { pos: Vector3; target: Vector3 } {
    if (!id) return { pos: this.origin.add(new Vector3(0, 2.6, -9.5)), target: this.origin.add(new Vector3(0, 1.3, 0)) };
    const p = this.pedestalPos(id);
    return { pos: p.add(new Vector3(1.6, 1.9, -4.6)), target: p.add(new Vector3(0.3, 1.25, 0)) };
  }

  async build(): Promise<void> {
    const s = this.scene;
    const stone = new PBRMaterial('stage.stone', s); stone.albedoColor = new Color3(0.16, 0.15, 0.17); stone.metallic = 0; stone.roughness = 0.9; stone.maxSimultaneousLights = 8;
    const floor = MeshBuilder.CreateCylinder('stage.floor', { diameter: 22, height: 0.3, tessellation: 24 }, s);
    floor.position.copyFrom(this.origin).addInPlaceFromFloats(0, -0.15, 0); floor.material = stone; floor.receiveShadows = true; floor.isPickable = false;
    const back = MeshBuilder.CreateBox('stage.back', { width: 24, height: 7, depth: 1 }, s);
    back.position.copyFrom(this.origin).addInPlaceFromFloats(0, 3.5, 4.5); back.material = stone; back.isPickable = false;
    for (const id of CLASS_ORDER) {
      const def = CLASSES[id]; const p = this.pedestalPos(id);
      const ped = MeshBuilder.CreateCylinder(`stage.ped.${id}`, { diameterTop: 1.7, diameterBottom: 2.1, height: 0.45, tessellation: 8 }, s);
      ped.position.copyFrom(p).addInPlaceFromFloats(0, 0.225, 0); ped.material = stone; ped.isPickable = false; ped.receiveShadows = true;
      const light = new PointLight(`stage.light.${id}`, p.add(new Vector3(0, 2.6, -1.4)), s);
      light.diffuse = Color3.FromHexString(def.accent).scale(0.55).add(new Color3(0.45, 0.35, 0.25)); light.intensity = 9; light.range = 7; light.renderPriority = 60;
      const node = new TransformNode(`stage.rig.${id}`, s); node.position.copyFrom(p).addInPlaceFromFloats(0, 0.45, 0); node.rotation.y = Math.PI;
      const inst = await this.loader.instanceCharacter(def.model, `select.${id}`);
      inst.root.parent = node; inst.root.scaling.setAll(def.height / 2.2);
      for (const m of inst.meshes) {
        const n = m.name.split('|').pop() ?? '';
        if (def.hideMeshes.includes(n)) m.setEnabled(false);
        this.rig.addCaster(m); m.receiveShadows = true;
        const mat = m.material;
        if (mat instanceof PBRMaterial) { mat.maxSimultaneousLights = 8; addRim(mat, Color3.FromHexString(def.accent), 0.7, 2.6); }
      }
      const anim = new Animator(inst.groups); anim.play(def.anims.idle);
      this.rigs.set(id, { inst, anim, node, light });
    }
  }

  setVisible(v: boolean): void { this.root.setEnabled(v); for (const r of this.rigs.values()) { r.node.setEnabled(v); r.light.setEnabled(v); } this.scene.getMeshByName('stage.floor')?.setEnabled(v); this.scene.getMeshByName('stage.back')?.setEnabled(v); for (const id of CLASS_ORDER) this.scene.getMeshByName(`stage.ped.${id}`)?.setEnabled(v); }

  /** Play a clip on one rig (ability preview). */
  preview(id: ClassId, clip: string): void { const r = this.rigs.get(id); r?.anim.once(clip, { speed: 1.1 }); }

  update(dt: number): void {
    this.spin += dt;
    for (const [id, r] of this.rigs) {
      r.anim.update?.(dt);
      const focus = id === this.focused;
      const target = focus ? Math.PI + Math.sin(this.spin * 0.5) * 0.35 : Math.PI;
      r.node.rotation.y += (target - r.node.rotation.y) * Math.min(1, dt * 3);
      r.light.intensity += ((focus ? 14 : 6) - r.light.intensity) * Math.min(1, dt * 4);
    }
  }

  def(id: ClassId): ClassDef { return CLASSES[id]; }
  get hasRigs(): boolean { return this.rigs.size > 0; }
  meshes(): Mesh[] { return []; }
}
