import { Color3, Vector3 } from '@babylonjs/core';
import type { KitId } from '@/assets/registry';
import { PALETTE } from '@/content/palette';
import { pick, rand } from '@/core/mathx';
import { KIT_SCALE, KitLevel, type KeepOut, type Placement } from './kitLevel';

/**
 * Level 2: the ruined nave of St. Vessel. A long hall open to the sky, two colonnades, broken pews, candles
 * everywhere, an altar at the far end and a sealed stair down to the crypt (a later build).
 */
export class Nave extends KitLevel {
  override name = 'THE NAVE';
  override sub = 'CATHEDRAL OF ST. VESSEL';
  override exitLabel = 'DESCEND TO THE CRYPT';
  override waves = [
    { spawns: [{ id: 'ghoul' as const, n: 10 }, { id: 'wraith' as const, n: 2 }] },
    { spawns: [{ id: 'ghoul' as const, n: 12 }, { id: 'cultist' as const, n: 3 }, { id: 'necromancer' as const, n: 1 }, { id: 'fallen_knight' as const, n: 2 }] },
    { fromDoor: true, spawns: [{ id: 'ghoul' as const, n: 16 }, { id: 'wraith' as const, n: 3 }, { id: 'necromancer' as const, n: 1 }, { id: 'brute' as const, n: 1, elite: true }] },
  ];

  async build(): Promise<void> {
    const S = KIT_SCALE, T = 4 * S;
    const W = 3, L = 6; // half-extents in tiles: 36 m wide, 72 m long
    const halfX = W * T, halfZ = L * T;
    this.playerStart = new Vector3(0, 0, -halfZ + 8); this.playerYaw = 0;
    const p: Placement[] = [];
    const flames: Vector3[] = [];

    // floor
    for (let ix = -W; ix < W; ix++) for (let iz = -L; iz < L; iz++) {
      const r = Math.random();
      const id: KitId = r < 0.1 ? 'kit.floor_tile_large_rocks' : r < 0.16 ? 'kit.floor_dirt_large_rocky' : 'kit.floor_tile_large';
      p.push({ id, x: ix * T + T / 2, z: iz * T + T / 2, rot: Math.floor(rand(0, 4)) * Math.PI / 2, ground: true });
    }
    for (let i = 0; i < 30; i++) p.push({ id: pick(['kit.floor_tile_small_broken_A', 'kit.floor_tile_small_weeds_A'] as KitId[]), x: rand(-halfX + 2, halfX - 2), z: rand(-halfZ + 2, halfZ - 2), y: 0.012, rot: Math.floor(rand(0, 4)) * Math.PI / 2, scale: S, collide: false });
    this.addSurface({ minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ, y0: 0.075, y1: 0.075 });
    this.addSurface({ minX: -halfX + 2, maxX: halfX - 2, minZ: -halfZ + 2, maxZ: halfZ - 2, y0: 0.075, y1: 0.075, spawn: true });
    this.addSurface({ minX: -200, maxX: 200, minZ: -200, maxZ: 200, y0: -0.06, y1: -0.06 });

    // tall walls (8 m) with arched windows, banners and torches between window bays
    const wallIds: KitId[] = ['kit.wall_archedwindow_open', 'kit.wall', 'kit.wall_archedwindow_open', 'kit.wall_cracked', 'kit.wall_window_open'];
    const banners: KitId[] = ['kit.banner_patternA_red', 'kit.banner_triple_red', 'kit.banner_red'];
    const WS: [number, number, number] = [S, 2.0, S];
    let seg = 0;
    const dress = (x: number, z: number, rot: number) => {
      const ix = x + Math.sin(rot) * 0.85, iz = z + Math.cos(rot) * 0.85;
      if (seg % 2 === 0) p.push({ id: pick(banners), x: ix, z: iz, y: 3.4, rot, scale: 1.9 });
      else { const t = this.torchProp(ix, iz, 4.4, rot, 2); p.push(t.prop); flames.push(t.flame); }
      seg++;
    };
    for (let i = -L; i < L; i++) {
      const c = i * T + T / 2;
      p.push({ id: pick(wallIds), x: halfX, z: c, rot: Math.PI / 2, scaleV: WS, collide: true }); dress(halfX, c, Math.PI / 2);
      p.push({ id: pick(wallIds), x: -halfX, z: c, rot: -Math.PI / 2, scaleV: WS, collide: true }); dress(-halfX, c, -Math.PI / 2);
      p.push({ id: 'kit.wall_pillar', x: halfX, z: i * T, scaleV: [S * 1.1, 2.1, S * 1.1], collide: true });
      p.push({ id: 'kit.wall_pillar', x: -halfX, z: i * T, scaleV: [S * 1.1, 2.1, S * 1.1], collide: true });
    }
    for (let i = -W; i < W; i++) {
      const c = i * T + T / 2;
      // entrance wall (south) with a doorway in the middle bay, far wall (north) with the crypt arch
      if (i === -1 || i === 0) p.push({ id: 'kit.wall_arched', x: c, z: -halfZ, rot: 0, scaleV: WS, collide: true });
      else { p.push({ id: pick(wallIds), x: c, z: -halfZ, rot: 0, scaleV: WS, collide: true }); dress(c, -halfZ, 0); }
      if (i === -1 || i === 0) p.push({ id: 'kit.wall_arched', x: c, z: halfZ, rot: Math.PI, scaleV: WS, collide: true });
      else { p.push({ id: pick(wallIds), x: c, z: halfZ, rot: Math.PI, scaleV: WS, collide: true }); dress(c, halfZ, Math.PI); }
      p.push({ id: 'kit.wall_pillar', x: i * T, z: -halfZ, scaleV: [S * 1.1, 2.1, S * 1.1], collide: true });
      p.push({ id: 'kit.wall_pillar', x: i * T, z: halfZ, scaleV: [S * 1.1, 2.1, S * 1.1], collide: true });
    }
    for (const [x, z] of [[-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ]]) p.push({ id: 'kit.pillar', x, z, scale: 2.6, collide: true });

    // colonnades: pillars every 8 m with torches on the aisle side
    for (let z = -halfZ + 8; z < halfZ - 4; z += 8) for (const x of [-8, 8]) {
      p.push({ id: Math.random() < 0.35 ? 'kit.pillar_decorated' : 'kit.pillar', x, z, scale: 2.3, collide: true });
      const rot = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      const t = this.torchProp(x + (x < 0 ? 1.75 : -1.75), z, 4.6, rot, 1.8); p.push(t.prop); flames.push(t.flame);
      this.reserve(x, z, 2.6);
    }

    // altar at the far end: raised on a column plinth of candles, chest, banners
    const altarZ = halfZ - 7;
    p.push({ id: 'kit.table_long_broken', x: 0, z: altarZ, rot: Math.PI / 2, scale: 1.8, collide: true });
    p.push({ id: 'kit.chest', x: 0, z: altarZ + 2.4, rot: Math.PI, scale: 1.4, collide: true });
    for (const sx of [-1, 1]) {
      p.push({ id: 'kit.pillar_decorated', x: sx * 4.5, z: altarZ + 1, scale: 1.6, collide: true });
      p.push({ id: 'kit.candle_triple', x: sx * 2.2, z: altarZ - 2, scale: 2.4 }); flames.push(new Vector3(sx * 2.2, 2.0, altarZ - 2));
      p.push({ id: 'kit.candle_triple', x: sx * 3.4, z: altarZ + 3, scale: 2.2 }); flames.push(new Vector3(sx * 3.4, 1.9, altarZ + 3));
      p.push({ id: 'kit.shelf_large', x: sx * 12, z: altarZ + 2, rot: sx > 0 ? -Math.PI / 2 : Math.PI / 2, scale: 1.6, collide: true });
      p.push({ id: 'kit.coin_stack_large', x: sx * 1.2, z: altarZ + 0.2, y: 1.2, scale: 1.4, collide: false });
    }

    // pews: rows of broken tables and chairs down the aisle sides, bones and rubble between
    const keep: KeepOut[] = [{ x: 0, z: -halfZ + 8, r: 5 }, { x: 0, z: altarZ, r: 6 }, { x: 0, z: 0, r: 2 }];
    for (let z = -halfZ + 16; z < altarZ - 10; z += 6) for (const sx of [-1, 1]) {
      if (Math.random() < 0.7) p.push({ id: 'kit.table_long_broken', x: sx * 4.2, z, rot: Math.PI / 2 + rand(-0.15, 0.15), scale: 1.5, collide: true });
      if (Math.random() < 0.5) p.push({ id: 'kit.chair', x: sx * (4.2 + rand(-1.5, 1.5)), z: z + rand(-2, 2), rot: rand(0, 6), scale: 1.5, collide: false });
      this.reserve(sx * 4.2, z, 2.6);
    }
    const heavy: KitId[] = ['kit.rubble_half', 'kit.column', 'kit.barrel_large', 'kit.crates_stacked', 'kit.trunk_large_A', 'kit.box_stacked', 'kit.keg', 'kit.shelf_large', 'kit.bed_frame'];
    const light: KitId[] = ['kit.candle_triple', 'kit.candle_lit', 'kit.barrel_small', 'kit.coin_stack_large', 'kit.chair', 'kit.box_large'];
    p.push(...this.scatter(heavy, 16, { minX: -halfX + 2, maxX: -10, minZ: -halfZ + 3, maxZ: halfZ - 3 }, keep, { scale: [1.2, 1.7] }));
    p.push(...this.scatter(heavy, 16, { minX: 10, maxX: halfX - 2, minZ: -halfZ + 3, maxZ: halfZ - 3 }, keep, { scale: [1.2, 1.7] }));
    p.push(...this.scatter(light, 16, { minX: -halfX + 2, maxX: halfX - 2, minZ: -halfZ + 3, maxZ: halfZ - 3 }, keep, { scale: [1.3, 2], collide: false, spacing: 1.6 }));
    p.push({ id: 'kit.rubble_large', x: -13, z: -halfZ + 24, rot: 0.9, scale: 1.5, collide: true });
    p.push({ id: 'kit.rubble_large', x: 14, z: 6, rot: -0.7, scale: 1.4, collide: true });
    // a few fallen columns across the aisle read as collapsed roof
    for (const [x, z, rot] of [[-3, -halfZ + 30, 1.1], [5, 10, -0.6]] as const) p.push({ id: 'kit.column', x, z, y: 0.3, rot, scaleV: [2.2, 2.2, 2.2], collide: true });

    await this.placeAll(p);

    // entrance sealed behind the player, crypt arch sealed ahead
    this.addCollider('entranceBlock', new Vector3(0, 4, -halfZ + 0.6), new Vector3(12, 8, 1));
    this.addCollider('cryptBlock', new Vector3(0, 4, halfZ - 0.6), new Vector3(12, 8, 1));
    this.doorPoint = new Vector3(0, 0.075, halfZ - 3);

    this.makeGround(new Color3(0.22, 0.2, 0.26));
    for (const z of [-halfZ + 12, -halfZ + 32, 8, altarZ - 6]) this.addTorch(new Vector3(0, 5, z), 24, 20);
    for (const f of flames) this.addFlame(f);
    this.addPortal(new Vector3(0, 4, halfZ - 1.2), 6.5, 8.5);
    this.addTorch(new Vector3(0, 4, halfZ - 3), 16, 18, PALETTE.arcane.scale(0.9));
    // entrance glow behind the player (where they came from)
    this.addPortal(new Vector3(0, 4, -halfZ + 1.2), 6.5, 8.5, false).name = 'entrancePortal';
    this.addGrime(-halfX + 1, halfX - 1, -halfZ + 1, halfZ - 1, 90);
  }
}
