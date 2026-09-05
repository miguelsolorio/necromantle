import { Color3, Vector3 } from '@babylonjs/core';
import type { KitId } from '@/assets/registry';
import { pick, rand } from '@/core/mathx';
import { KIT_SCALE, KitLevel, type KeepOut, type Placement } from './kitLevel';

/**
 * The crypt beneath St. Vessel: a long vaulted gallery of repeating arches, sarcophagi in alcoves, bone piles,
 * teal grave-light, and the densest packs of the slice. Ends at the ossuary door.
 */
export class Crypt extends KitLevel {
  override name = 'THE CRYPT';
  override sub = 'BENEATH ST. VESSEL · DEPTH II';
  override exitLabel = 'ENTER THE OSSUARY';
  override fogDensity = 0.03;
  override fogColor = new Color3(0.05, 0.11, 0.12);
  override waves = [
    { spawns: [{ id: 'ghoul' as const, n: 14 }, { id: 'wraith' as const, n: 2 }, { id: 'cultist' as const, n: 2 }] },
    { spawns: [{ id: 'ghoul' as const, n: 16 }, { id: 'necromancer' as const, n: 2 }, { id: 'fallen_knight' as const, n: 3 }, { id: 'wraith' as const, n: 1, elite: true }] },
    { fromDoor: true, spawns: [{ id: 'ghoul' as const, n: 20 }, { id: 'wraith' as const, n: 4 }, { id: 'necromancer' as const, n: 2 }, { id: 'brute' as const, n: 2 }, { id: 'brute' as const, n: 1, elite: true }] },
  ];

  async build(): Promise<void> {
    const S = KIT_SCALE, T = 4 * S, W = 2, L = 6; // 24 m wide, 72 m long
    const halfX = W * T, halfZ = L * T;
    this.playerStart = new Vector3(0, 0, -halfZ + 6); this.playerYaw = 0;
    const p: Placement[] = []; const flames: Vector3[] = [];
    for (let ix = -W; ix < W; ix++) for (let iz = -L; iz < L; iz++) p.push({ id: Math.random() < 0.15 ? 'kit.floor_tile_large_rocks' : 'kit.floor_tile_large', x: ix * T + T / 2, z: iz * T + T / 2, rot: Math.floor(rand(0, 4)) * Math.PI / 2, ground: true });
    this.addSurface({ minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ, y0: 0.075, y1: 0.075 });
    this.addSurface({ minX: -halfX + 2, maxX: halfX - 2, minZ: -halfZ + 2, maxZ: halfZ - 2, y0: 0.075, y1: 0.075, spawn: true });
    this.addSurface({ minX: -200, maxX: 200, minZ: -200, maxZ: 200, y0: -0.06, y1: -0.06 });
    // side galleries: alcoves of arches with sarcophagi, walls behind
    const WS: [number, number, number] = [S, 1.6, S];
    for (let i = -L; i < L; i++) {
      const c = i * T + T / 2;
      for (const sx of [-1, 1]) {
        p.push({ id: 'kit.wall_arched', x: sx * halfX, z: c, rot: sx > 0 ? Math.PI / 2 : -Math.PI / 2, scaleV: WS, collide: true });
        p.push({ id: 'kit.wall_pillar', x: sx * halfX, z: i * T, scaleV: [S * 1.1, 1.7, S * 1.1], collide: true });
        // alcove: a sarcophagus (trunk) with candles, every other bay
        if (i % 2 === 0) { p.push({ id: 'kit.trunk_large_A', x: sx * (halfX - 1.6), z: c, rot: sx > 0 ? Math.PI / 2 : -Math.PI / 2, scale: 1.7, collide: true }); p.push({ id: 'kit.candle_triple', x: sx * (halfX - 1.4), z: c - 1.6, scale: 2 }); flames.push(new Vector3(sx * (halfX - 1.4), 1.6, c - 1.6)); }
        else { const t = this.torchProp(sx * (halfX - 0.9), c, 3.6, sx > 0 ? -Math.PI / 2 : Math.PI / 2, 1.8); p.push(t.prop); flames.push(t.flame); }
      }
    }
    // end walls with arches (entrance behind, ossuary ahead)
    for (let i = -W; i < W; i++) { const c = i * T + T / 2; const arch = i === -1 || i === 0; p.push({ id: arch ? 'kit.wall_arched' : 'kit.wall', x: c, z: -halfZ, rot: 0, scaleV: WS, collide: true }); p.push({ id: arch ? 'kit.wall_arched' : 'kit.wall', x: c, z: halfZ, rot: Math.PI, scaleV: WS, collide: true }); p.push({ id: 'kit.wall_pillar', x: i * T, z: -halfZ, scaleV: [S * 1.1, 1.7, S * 1.1], collide: true }); p.push({ id: 'kit.wall_pillar', x: i * T, z: halfZ, scaleV: [S * 1.1, 1.7, S * 1.1], collide: true }); }
    // central colonnade of low arches every 12 m (pillars pairs) for cover
    for (let z = -halfZ + 12; z < halfZ - 6; z += 12) for (const x of [-4.5, 4.5]) { p.push({ id: 'kit.pillar', x, z, scale: 1.7, collide: true }); this.reserve(x, z, 2.2); }
    // bone piles (pale rubble), broken coffins, roots of candles
    const keep: KeepOut[] = [{ x: 0, z: -halfZ + 6, r: 5 }, { x: 0, z: halfZ - 6, r: 6 }];
    p.push(...this.scatter(['kit.rubble_half', 'kit.trunk_medium_A', 'kit.column', 'kit.rubble_half', 'kit.box_large'], 22, { minX: -halfX + 2.5, maxX: halfX - 2.5, minZ: -halfZ + 4, maxZ: halfZ - 4 }, keep, { scale: [1.1, 1.6], spacing: 3.2 }));
    p.push(...this.scatter(['kit.candle_lit', 'kit.candle_triple', 'kit.coin_stack_small', 'kit.floor_tile_small_broken_A'], 30, { minX: -halfX + 2, maxX: halfX - 2, minZ: -halfZ + 3, maxZ: halfZ - 3 }, keep, { scale: [1.4, 2], collide: false, spacing: 2 }));
    await this.placeAll(p);
    this.addCollider('entranceBlock', new Vector3(0, 4, -halfZ + 0.6), new Vector3(12, 8, 1));
    this.addCollider('exitBlock', new Vector3(0, 4, halfZ - 0.6), new Vector3(12, 8, 1));
    this.doorPoint = new Vector3(0, 0.075, halfZ - 3);
    this.makeGround(new Color3(0.1, 0.13, 0.13));
    // grave-light: cold teal locals along the gallery, warm candles are only flames
    for (const z of [-halfZ + 10, -halfZ + 30, 5, halfZ - 12]) this.addTorch(new Vector3(0, 4.5, z), 20, 22, new Color3(0.35, 0.95, 0.85));
    this.addTorch(new Vector3(0, 3.5, halfZ - 3), 16, 16, new Color3(0.6, 0.3, 1));
    for (const f of flames) this.addFlame(f, 1.1);
    this.addPortal(new Vector3(0, 3.8, halfZ - 1.2), 6, 7.5);
    this.addPortal(new Vector3(0, 3.8, -halfZ + 1.2), 6, 7.5, false);
    this.addGrime(-halfX + 1, halfX - 1, -halfZ + 1, halfZ - 1, 70);
    this.ceiling(-halfX, halfX, -halfZ, halfZ, 6.6);
  }
}
