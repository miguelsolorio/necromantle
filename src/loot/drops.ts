import { Color3, Mesh, MeshBuilder, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { RARITY, type Item, type Rarity, type Slot } from '@/content/items';
import { rand } from '@/core/mathx';
import type { EventBus } from '@/core/events';
import type { Player } from '@/player/player';
import type { RenderRig } from '@/rendering/setup';
import { Textures } from '@/rendering/textures';
import type { Vfx } from '@/vfx/vfx';
import type { World } from '@/world/world';
import { audio } from '@/audio';
import { rollItem, rollRarity } from './generator';

export interface DropView { id: number; pos: Vector3; text: string; color: string; big: boolean }

interface Drop { item: Item; mesh: Mesh; beam: Mesh; vel: Vector3; pos: Vector3; groundY: number; settled: boolean; t: number; alive: boolean }

/**
 * Physical loot: items burst out of a kill, arc, bounce and settle with a rarity beam; walking over one picks it up.
 * Legendary drops are a full audiovisual event (rule R-30).
 */
export class Drops {
  private list: Drop[] = [];
  private mats: Record<Rarity, StandardMaterial>;
  private beamMats: Record<Rarity, StandardMaterial>;
  private beamSrc: Mesh;
  private nextId = 1;
  readonly views: DropView[] = [];

  setWorld(w: World): void { this.world = w; }

  constructor(private scene: Scene, private vfx: Vfx, private rig: RenderRig, private bus: EventBus, private world: World) {
    const mk = (r: Rarity) => { const m = new StandardMaterial(`loot.${r}`, scene); const c = Color3.FromHexString(RARITY[r].color); m.emissiveColor = c.scale(0.7); m.diffuseColor = c.scale(0.5); m.specularColor = Color3.White(); m.specularPower = 48; return m; };
    const mkBeam = (r: Rarity) => { const m = new StandardMaterial(`lootBeam.${r}`, scene); m.emissiveColor = Color3.FromHexString(RARITY[r].color); m.diffuseColor = Color3.Black(); m.opacityTexture = Textures.softDot(scene); m.disableLighting = true; m.alphaMode = 1; m.backFaceCulling = false; return m; };
    this.mats = { common: mk('common'), magic: mk('magic'), rare: mk('rare'), legendary: mk('legendary') };
    this.beamMats = { common: mkBeam('common'), magic: mkBeam('magic'), rare: mkBeam('rare'), legendary: mkBeam('legendary') };
    this.beamSrc = MeshBuilder.CreatePlane('lootBeamSrc', { width: 1, height: 1 }, scene);
    this.beamSrc.isVisible = false; this.beamSrc.isPickable = false; this.beamSrc.position.y = -500;
  }

  private body(slot: Slot, rarity: Rarity): Mesh {
    let m: Mesh;
    switch (slot) {
      case 'weapon': m = MeshBuilder.CreateBox('loot', { width: 0.12, height: 1.1, depth: 0.12 }, this.scene); break;
      case 'head': m = MeshBuilder.CreateSphere('loot', { diameter: 0.5, segments: 8 }, this.scene); m.scaling.y = 0.7; break;
      case 'chest': m = MeshBuilder.CreateBox('loot', { width: 0.55, height: 0.45, depth: 0.3 }, this.scene); break;
      case 'gloves': m = MeshBuilder.CreateBox('loot', { width: 0.3, height: 0.25, depth: 0.35 }, this.scene); break;
      case 'boots': m = MeshBuilder.CreateBox('loot', { width: 0.28, height: 0.3, depth: 0.5 }, this.scene); break;
      case 'amulet': m = MeshBuilder.CreateTorus('loot', { diameter: 0.4, thickness: 0.08, tessellation: 12 }, this.scene); break;
      default: m = MeshBuilder.CreateTorus('loot', { diameter: 0.28, thickness: 0.07, tessellation: 10 }, this.scene);
    }
    m.material = this.mats[rarity]; m.isPickable = false; this.rig.addGlow(m);
    return m;
  }

  /** Spawn one item at `pos`, launched upward with a random horizontal kick. */
  drop(item: Item, pos: Vector3): void {
    const mesh = this.body(item.slot, item.rarity);
    const beam = this.beamSrc.clone(`lootBeam${this.nextId}`); beam.isVisible = true; beam.material = this.beamMats[item.rarity]; beam.billboardMode = Mesh.BILLBOARDMODE_Y; beam.isPickable = false;
    const h = 2 + RARITY[item.rarity].beam * 6;
    beam.scaling.set(0.35 + RARITY[item.rarity].beam * 0.5, h, 1);
    const a = Math.random() * Math.PI * 2, k = rand(1.5, 3.5);
    const d: Drop = { item, mesh, beam, vel: new Vector3(Math.cos(a) * k, rand(5, 7.5), Math.sin(a) * k), pos: pos.clone().addInPlaceFromFloats(0, 0.6, 0), groundY: pos.y, settled: false, t: 0, alive: true };
    mesh.position.copyFrom(d.pos); beam.position.set(d.pos.x, d.groundY + h / 2, d.pos.z);
    this.list.push(d);
    if (item.rarity === 'legendary') {
      this.vfx.levelUp(pos); this.vfx.lights.flash(pos.add(new Vector3(0, 1, 0)), Color3.FromHexString(RARITY.legendary.color), 60, 1.2, 14);
      audio.play('legendary', pos);
    } else if (item.rarity === 'rare') { this.vfx.burst('gold', pos.add(new Vector3(0, 0.5, 0)), 20); audio.play('lootRare', pos); }
    else audio.play('loot', pos, { gain: 0.5 });
  }

  /** Roll the drops for a kill: chance and quality depend on the archetype and elite status. */
  dropFor(enemyId: string, elite: boolean, pos: Vector3, ilvl: number): void {
    const chance = elite ? 1 : enemyId === 'brute' ? 1 : enemyId === 'fallen_knight' ? 0.45 : enemyId === 'necromancer' ? 0.6 : enemyId === 'cultist' ? 0.28 : enemyId === 'wraith' ? 0.3 : 0.13;
    const count = elite ? 3 : enemyId === 'brute' ? 2 : 1;
    if (Math.random() > chance) return;
    for (let i = 0; i < count; i++) this.drop(rollItem(ilvl, rollRarity(elite ? 1.6 : enemyId === 'brute' ? 1 : 0)), pos);
  }

  update(dt: number, player: Player, onPickup: (item: Item, ok: boolean) => void): void {
    this.views.length = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      if (!d.settled) {
        d.vel.y -= 22 * dt;
        d.pos.addInPlace(d.vel.scale(dt));
        const gy = this.world.groundY(d.pos.x, d.pos.z, d.pos.y + 1) ?? d.groundY;
        if (d.pos.y <= gy + 0.25 && d.vel.y < 0) { d.pos.y = gy + 0.25; d.groundY = gy; if (Math.abs(d.vel.y) > 2.5) { d.vel.y *= -0.35; d.vel.x *= 0.5; d.vel.z *= 0.5; } else { d.settled = true; d.vel.setAll(0); } }
        d.mesh.position.copyFrom(d.pos); d.mesh.rotation.x += dt * 6; d.mesh.rotation.z += dt * 3;
        d.beam.position.x = d.pos.x; d.beam.position.z = d.pos.z; d.beam.position.y = d.groundY + d.beam.scaling.y / 2;
      } else {
        d.mesh.position.y = d.groundY + 0.35 + Math.sin(d.t * 2.5) * 0.08; d.mesh.rotation.y += dt * 1.2; d.mesh.rotation.x = 0.4; d.mesh.rotation.z = 0;
        const dist = Math.hypot(d.pos.x - player.position.x, d.pos.z - player.position.z);
        if (dist < 1.3 && !player.dead && d.t > 0.8) {
          const ok = player.addItem(d.item);
          onPickup(d.item, ok);
          if (ok) { this.vfx.burst('gold', d.mesh.position, d.item.rarity === 'common' ? 4 : 12); audio.play('pickup', d.pos, { pitch: d.item.rarity === 'legendary' ? 0.8 : 1 }); this.kill(d, i); continue; }
        }
        if (d.t > 240) { this.kill(d, i); continue; }
      }
      const big = d.item.rarity === 'legendary';
      if (d.item.rarity !== 'common' || Math.hypot(d.pos.x - player.position.x, d.pos.z - player.position.z) < 5) this.views.push({ id: d.item.uid, pos: d.mesh.position, text: d.item.name, color: RARITY[d.item.rarity].color, big });
    }
  }

  private kill(d: Drop, i: number): void { d.alive = false; d.mesh.dispose(); d.beam.dispose(); this.list.splice(i, 1); }
  clear(): void { for (const d of this.list) { d.mesh.dispose(); d.beam.dispose(); } this.list.length = 0; this.views.length = 0; }
  get count(): number { return this.list.length; }
}
