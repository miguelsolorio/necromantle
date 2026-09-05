import { Color3, Vector3 } from '@babylonjs/core';
import type { KitId } from '@/assets/registry';
import { rand } from '@/core/mathx';
import { KIT_SCALE, KitLevel, type KeepOut, type Placement } from './kitLevel';

/**
 * The Ossuary: the Hollow King's chamber. A round hall of bone-white pillars around a sunken floor, a throne
 * on a dais at the far end, violet grave-light. One wave: the King and what he raises.
 */
export class Ossuary extends KitLevel {
  override name = 'THE OSSUARY';
  override sub = 'THRONE OF THE HOLLOW KING · DEPTH III';
  override exitLabel = 'RETURN TO HOLLOWMERE';
  override fogDensity = 0.026;
  override fogColor = new Color3(0.09, 0.05, 0.14);
  override waves = [
    { fromDoor: true, spawns: [{ id: 'hollow_king' as const, n: 1, elite: true }, { id: 'ghoul' as const, n: 6 }] },
  ];

  async build(): Promise<void> {
    const S = KIT_SCALE, T = 4 * S, R = 22;
    this.playerStart = new Vector3(0, 0, -R + 5); this.playerYaw = 0;
    const p: Placement[] = []; const flames: Vector3[] = [];
    for (let ix = -4; ix < 4; ix++) for (let iz = -4; iz < 4; iz++) { const x = ix * T + T / 2, z = iz * T + T / 2; if (Math.hypot(x, z) > R + 4) continue; p.push({ id: Math.random() < 0.2 ? 'kit.floor_tile_large_rocks' : 'kit.floor_tile_large', x, z, rot: Math.floor(rand(0, 4)) * Math.PI / 2, ground: true }); }
    this.addSurface({ minX: -R, maxX: R, minZ: -R, maxZ: R, y0: 0.075, y1: 0.075 });
    this.addSurface({ minX: -R + 3, maxX: R - 3, minZ: -R + 3, maxZ: R - 3, y0: 0.075, y1: 0.075, spawn: true });
    this.addSurface({ minX: -200, maxX: 200, minZ: -200, maxZ: 200, y0: -0.06, y1: -0.06 });
    // ring of walls and pillars around the chamber
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = Math.sin(a) * (R + 1.5), z = Math.cos(a) * (R + 1.5);
      const isDoor = i === n / 2; // south entrance
      p.push({ id: isDoor ? 'kit.wall_arched' : i % 2 ? 'kit.wall_archedwindow_open' : 'kit.wall', x, z, rot: a + Math.PI, scaleV: [1.55, 2.0, S], collide: true });
      p.push({ id: 'kit.pillar', x: Math.sin(a + Math.PI / n) * (R + 1), z: Math.cos(a + Math.PI / n) * (R + 1), scale: 2.4, collide: true });
      if (i % 2 === 0) { const t = this.torchProp(Math.sin(a) * (R - 0.2), Math.cos(a) * (R - 0.2), 4.6, a, 2); p.push(t.prop); flames.push(t.flame); }
      else p.push({ id: 'kit.banner_triple_red', x: Math.sin(a) * (R + 0.6), z: Math.cos(a) * (R + 0.6), y: 3.5, rot: a + Math.PI, scale: 2 });
      this.addCollider(`ringCol${i}`, new Vector3(x, 4, z), new Vector3(9.5, 8, 1.6), a + Math.PI);
    }
    // inner ring of bone columns
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const x = Math.sin(a) * 11, z = Math.cos(a) * 11; p.push({ id: 'kit.pillar_decorated', x, z, scale: 1.8, collide: true }); this.reserve(x, z, 2.5); }
    // the dais and throne at the north end
    for (let ix = -1; ix <= 1; ix++) p.push({ id: 'kit.floor_tile_large', x: ix * T, z: R - 5, y: 0.6, ground: false, collide: false });
    this.addSurface({ minX: -T * 1.5, maxX: T * 1.5, minZ: R - 8, maxZ: R - 2, y0: 0.6, y1: 0.6 });
    for (let ix = -1; ix <= 1; ix++) p.push({ id: 'kit.wall', x: ix * T, z: R - 8, rot: 0, scaleV: [S, 0.16, 0.6], collide: false });
    p.push({ id: 'kit.chair', x: 0, z: R - 4, y: 0.6, rot: Math.PI, scale: 3.2, collide: true });
    p.push({ id: 'kit.pillar', x: -3.5, z: R - 3, y: 0.6, scale: 1.6, collide: true }); p.push({ id: 'kit.pillar', x: 3.5, z: R - 3, y: 0.6, scale: 1.6, collide: true });
    for (const [x, z] of [[-2.5, R - 6.5], [2.5, R - 6.5], [-5.5, R - 4], [5.5, R - 4]]) { p.push({ id: 'kit.candle_triple', x, z, y: 0.6, scale: 2.4 }); flames.push(new Vector3(x, 2.5, z)); }
    p.push({ id: 'kit.chest', x: 0, z: R - 6.2, y: 0.6, rot: Math.PI, scale: 1.4, collide: true });
    this.reserve(0, R - 5, 8);
    // bone piles and broken coffins around the floor
    const keep: KeepOut[] = [{ x: 0, z: -R + 5, r: 5 }, { x: 0, z: 0, r: 4 }];
    p.push(...this.scatter(['kit.rubble_half', 'kit.trunk_medium_A', 'kit.column', 'kit.rubble_half'] as KitId[], 16, { minX: -R + 3, maxX: R - 3, minZ: -R + 3, maxZ: R - 9 }, keep, { scale: [1.1, 1.5], spacing: 3.5 }));
    p.push(...this.scatter(['kit.candle_lit', 'kit.candle_triple', 'kit.coin_stack_small'] as KitId[], 18, { minX: -R + 3, maxX: R - 3, minZ: -R + 3, maxZ: R - 9 }, keep, { scale: [1.4, 2], collide: false, spacing: 2 }));
    await this.placeAll(p);
    this.addCollider('entranceBlock', new Vector3(0, 4, -R - 0.9), new Vector3(10, 8, 1));
    this.doorPoint = new Vector3(0, 0.075, -R + 3.5);
    this.makeGround(new Color3(0.12, 0.09, 0.14));
    this.addTorch(new Vector3(0, 6, R - 5), 30, 22, new Color3(0.7, 0.35, 1));
    for (const z of [-10, 4]) this.addTorch(new Vector3(0, 5, z), 22, 22, new Color3(0.5, 0.35, 0.9));
    this.addTorch(new Vector3(0, 4, -R + 3), 14, 14);
    for (const f of flames) this.addFlame(f, 1.4);
    this.addPortal(new Vector3(0, 4.5, -R - 0.5), 6.5, 8);
    this.addGrime(-R, R, -R, R, 50);
    this.ceiling(-R - 3, R + 3, -R - 3, R + 3, 8.4);
  }
}
