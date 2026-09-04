import { Color3, Mesh, MeshBuilder, PointLight, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import { PALETTE } from '@/content/palette';
import type { EventBus } from '@/core/events';
import type { Player } from '@/player/player';
import type { Vfx } from '@/vfx/vfx';

interface Globe { mesh: Mesh; halo: Mesh; t: number; alive: boolean; light: PointLight | null }

/** Health globes: bright, bobbing, the only red thing on the floor (rule R-29). */
export class Pickups {
  private globes: Globe[] = [];
  private mat: StandardMaterial;
  private haloMat: StandardMaterial;
  constructor(private scene: Scene, private vfx: Vfx, private bus: EventBus) {
    this.mat = new StandardMaterial('globeMat', scene);
    this.mat.emissiveColor = PALETTE.healthBright.clone(); this.mat.diffuseColor = PALETTE.health.clone(); this.mat.specularColor = new Color3(1, 0.8, 0.8); this.mat.specularPower = 32;
    this.haloMat = new StandardMaterial('globeHalo', scene);
    this.haloMat.emissiveColor = PALETTE.health.clone(); this.haloMat.disableLighting = true; this.haloMat.alpha = 0.35; this.haloMat.backFaceCulling = false;
  }
  spawnGlobe(pos: Vector3): void {
    let g = this.globes.find((x) => !x.alive);
    if (!g) {
      const mesh = MeshBuilder.CreateSphere('globe', { diameter: 0.7, segments: 10 }, this.scene);
      mesh.material = this.mat; mesh.isPickable = false;
      const halo = MeshBuilder.CreateDisc('globeHalo', { radius: 0.9, tessellation: 20 }, this.scene);
      halo.rotation.x = Math.PI / 2; halo.material = this.haloMat; halo.isPickable = false;
      const light: PointLight | null = null;
      g = { mesh, halo, t: 0, alive: false, light };
      this.globes.push(g);
    }
    g.alive = true; g.t = 0;
    g.mesh.position.set(pos.x, pos.y + 0.6, pos.z); g.halo.position.set(pos.x, pos.y + 0.04, pos.z);
    g.mesh.setEnabled(true); g.halo.setEnabled(true); g.light?.setEnabled(true);
  }
  update(dt: number, player: Player): void {
    for (const g of this.globes) {
      if (!g.alive) continue;
      g.t += dt;
      g.mesh.position.y = g.halo.position.y + 0.55 + Math.sin(g.t * 3) * 0.12;
      g.mesh.rotation.y += dt;
      const d = Math.hypot(g.mesh.position.x - player.position.x, g.mesh.position.z - player.position.z);
      if (d < 1.4 && !player.dead) {
        player.heal(player.hpMax * 0.25);
        this.vfx.globePickup(g.mesh.position);
        this.bus.emit('pickup:globe', { pos: g.mesh.position.clone() });
        this.kill(g);
      } else if (g.t > 45) this.kill(g);
    }
  }
  private kill(g: Globe): void { g.alive = false; g.mesh.setEnabled(false); g.halo.setEnabled(false); g.light?.setEnabled(false); }
  clear(): void { for (const g of this.globes) this.kill(g); }
}
