import { Color3, MeshBuilder, Vector3 } from '@babylonjs/core';
import type { KitId } from '@/assets/registry';
import { PALETTE } from '@/content/palette';
import { pick, rand } from '@/core/mathx';
import { KIT_SCALE, KitLevel, type KeepOut, type Placement } from './kitLevel';

/**
 * Level 1: a walled courtyard below the raised cathedral threshold. Two rows of giant pillars, a closed stone
 * plinth with a stair, dense dressing along the walls, and a fogged skyline beyond.
 */
export class OuterCourt extends KitLevel {
  override name = 'THE OUTER COURT';
  override sub = 'HOLLOWMERE · NIGHT';
  override exitLabel = 'ENTER THE CATHEDRAL';
  override waves = [
    { spawns: [{ id: 'ghoul' as const, n: 8 }] },
    { spawns: [{ id: 'ghoul' as const, n: 12 }, { id: 'cultist' as const, n: 3 }] },
    { fromDoor: true, spawns: [{ id: 'ghoul' as const, n: 14 }, { id: 'wraith' as const, n: 2 }, { id: 'fallen_knight' as const, n: 1, elite: true }] },
  ];

  async build(): Promise<void> {
    this.playerStart = new Vector3(0, 0, -12); this.playerYaw = 0;
    const S = KIT_SCALE, T = 4 * S, half = 4 * T; // tile pitch 6 m, half-extent 24 m
    const p: Placement[] = [];
    const flames: Vector3[] = [];

    // ---- floor: 8×8 large tiles with variants, plus small broken/weedy patches on top
    for (let ix = -4; ix < 4; ix++) for (let iz = -4; iz < 4; iz++) {
      const r = Math.random();
      const id: KitId = r < 0.12 ? 'kit.floor_tile_large_rocks' : r < 0.2 ? 'kit.floor_dirt_large' : 'kit.floor_tile_large';
      p.push({ id, x: ix * T + T / 2, z: iz * T + T / 2, rot: Math.floor(rand(0, 4)) * Math.PI / 2, ground: true });
    }
    const patches: KitId[] = ['kit.floor_tile_small_broken_A', 'kit.floor_tile_small_weeds_A', 'kit.floor_tile_small_broken_A'];
    for (let i = 0; i < 22; i++) p.push({ id: pick(patches), x: rand(-21, 21), z: rand(-21, 21), y: 0.012, rot: Math.floor(rand(0, 4)) * Math.PI / 2, scale: S, ground: false, collide: false });

    // ---- perimeter walls, pillars between every segment, banners and torches on the inner faces
    const wallIds: KitId[] = ['kit.wall', 'kit.wall', 'kit.wall_cracked', 'kit.wall_broken', 'kit.wall_archedwindow_open', 'kit.wall_window_open', 'kit.wall'];
    const banners: KitId[] = ['kit.banner_patternA_red', 'kit.banner_thin_red', 'kit.banner_red', 'kit.banner_triple_red'];
    const dress = (x: number, z: number, rot: number, i: number) => {
      // rot is the wall's facing; inner face offset 0.85 m toward the courtyard
      const ix = x + Math.sin(rot) * 0.85, iz = z + Math.cos(rot) * 0.85;
      if (i % 2 === 0) p.push({ id: pick(banners), x: ix, z: iz, y: 2.2, rot, scale: 1.6 });
      else { const t = this.torchProp(ix, iz, 3.6, rot, 1.8); p.push(t.prop); flames.push(t.flame); }
    };
    let seg = 0;
    for (let i = -4; i < 4; i++) {
      const c = i * T + T / 2;
      p.push({ id: pick(wallIds), x: c, z: -half, rot: 0, collide: true }); dress(c, -half, 0, seg++);
      p.push({ id: pick(wallIds), x: half, z: c, rot: Math.PI / 2, collide: true }); dress(half, c, Math.PI / 2, seg++);
      p.push({ id: pick(wallIds), x: -half, z: c, rot: -Math.PI / 2, collide: true }); dress(-half, c, -Math.PI / 2, seg++);
      if (i !== -1 && i !== 0) { p.push({ id: pick(wallIds), x: c, z: half, rot: Math.PI, collide: true }); dress(c, half, Math.PI, seg++); }
    }
    for (let i = -4; i <= 4; i++) {
      const c = i * T;
      for (const [x, z] of [[c, -half], [half, c], [-half, c]]) p.push({ id: 'kit.wall_pillar', x, z, rot: 0, scale: S * 1.15, collide: true });
      if (Math.abs(c) >= T * 1.5) p.push({ id: 'kit.wall_pillar', x: c, z: half, rot: 0, scale: S * 1.15, collide: true });
    }

    // ---- gate pillars and the stair to the threshold
    p.push({ id: 'kit.pillar', x: -T - 0.6, z: half + 1.4, scale: 2.6, collide: true });
    p.push({ id: 'kit.pillar', x: T + 0.6, z: half + 1.4, scale: 2.6, collide: true });
    const stairScale: [number, number, number] = [1.3, 0.72, 1.7];
    const stairZ0 = half - 0.5;
    const topY = 5.1 * stairScale[1], topZ = stairZ0 + 4 * stairScale[2];
    const stairHalfW = 3.5 * stairScale[0];
    p.push({ id: 'kit.stairs_wide', x: 0, z: topZ, scaleV: stairScale, rot: Math.PI, collide: false, ground: false });
    this.addSurface({ minX: -stairHalfW, maxX: stairHalfW, minZ: stairZ0, maxZ: topZ, y0: 0, y1: topY, spawn: true });
    this.addSurface({ minX: -T * 1.5 + 0.6, maxX: T * 1.5 - 0.6, minZ: topZ, maxZ: topZ + 2 * T, y0: topY, y1: topY, spawn: true });
    this.addSurface({ minX: -half, maxX: half, minZ: -half, maxZ: half, y0: 0.075, y1: 0.075 });
    this.addSurface({ minX: -half + 1.5, maxX: half - 1.5, minZ: -half + 1.5, maxZ: half - 1.5, y0: 0.075, y1: 0.075, spawn: true });
    this.addSurface({ minX: -200, maxX: 200, minZ: -200, maxZ: 200, y0: -0.06, y1: -0.06 });
    for (let ix = -1; ix <= 1; ix++) for (let iz = 0; iz < 2; iz++) p.push({ id: 'kit.floor_tile_large', x: ix * T, z: topZ + T / 2 + iz * T, y: topY, ground: true, collide: true });
    // the cathedral door wall
    p.push({ id: 'kit.wall_arched', x: 0, z: topZ + T * 2 - 1, y: topY, rot: Math.PI, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall_pillar', x: -T * 1.2, z: topZ + T * 2 - 1, y: topY, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall_pillar', x: T * 1.2, z: topZ + T * 2 - 1, y: topY, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall', x: -T * 2.2, z: topZ + T * 2 - 1, y: topY, rot: Math.PI, scale: 2.5, collide: true });
    p.push({ id: 'kit.wall', x: T * 2.2, z: topZ + T * 2 - 1, y: topY, rot: Math.PI, scale: 2.5, collide: true });
    p.push({ id: 'kit.banner_triple_red', x: -T * 1.2, z: topZ + T * 2 - 1.9, y: topY + 2.5, rot: Math.PI, scale: 2.2 });
    p.push({ id: 'kit.banner_triple_red', x: T * 1.2, z: topZ + T * 2 - 1.9, y: topY + 2.5, rot: Math.PI, scale: 2.2 });
    // plinth: walls under every edge, plus one behind the stair top so no slit shows between step and tile
    const plinth: [number, number, number, number][] = [
      [stairHalfW + 2.2, topZ, 0, 1.1], [-(stairHalfW + 2.2), topZ, 0, 1.1], [0, topZ + 0.35, 0, 2.4],
      [T * 1.5, topZ + T * 0.5, Math.PI / 2, 1.5], [T * 1.5, topZ + T * 1.5, Math.PI / 2, 1.5],
      [-T * 1.5, topZ + T * 0.5, -Math.PI / 2, 1.5], [-T * 1.5, topZ + T * 1.5, -Math.PI / 2, 1.5],
      [-T, topZ + T * 2, Math.PI, 1.5], [0, topZ + T * 2, Math.PI, 1.5], [T, topZ + T * 2, Math.PI, 1.5],
    ];
    for (const [x, z, rot, sx] of plinth) p.push({ id: 'kit.wall', x, z, rot, scaleV: [sx, topY / 4, 1.5], collide: false });
    for (const sx of [-1, 1]) p.push({ id: 'kit.wall', x: sx * (stairHalfW + 1.0), z: half, rot: Math.PI, scaleV: [0.5, S, S], collide: false });
    // low parapets on the threshold edges (visual) and their colliders
    for (const sx of [-1, 1]) {
      p.push({ id: 'kit.wall', x: sx * (T * 1.5 - 0.35), z: topZ + T * 0.5, rot: Math.PI / 2, scaleV: [1.5, 0.28, 0.5], collide: false });
      p.push({ id: 'kit.wall', x: sx * (T * 1.5 - 0.35), z: topZ + T * 1.5, rot: Math.PI / 2, scaleV: [1.5, 0.28, 0.5], collide: false });
      p.push({ id: 'kit.wall', x: sx * (stairHalfW + (T * 1.5 - stairHalfW) / 2), z: topZ + 0.25, rot: 0, scaleV: [(T * 1.5 - stairHalfW) / 4, 0.28, 0.5], collide: false });
      p.push({ id: 'kit.candle_triple', x: sx * (stairHalfW + 1.2), z: topZ + 1.2, y: topY, scale: 2.2 });
      p.push({ id: 'kit.candle_triple', x: sx * (T * 1.5 - 1.6), z: topZ + T * 1.6, y: topY, scale: 2.0 });
      p.push({ id: 'kit.rubble_half', x: sx * (T * 1.5 - 2.4), z: topZ + T * 0.9, y: topY, rot: rand(0, 6), scale: 1.2, collide: true });
      p.push({ id: 'kit.column', x: sx * (stairHalfW + 0.9), z: topZ - 0.2, y: topY, scale: 1.6, collide: true });
    }
    for (const x of [-4.5, 4.5]) { p.push({ id: 'kit.candle_triple', x, z: half - 1.6, scale: 2.2 }); flames.push(new Vector3(x, 1.9, half - 1.6)); }
    for (const sx of [-1, 1]) { flames.push(new Vector3(sx * (stairHalfW + 1.2), topY + 1.9, topZ + 1.2)); flames.push(new Vector3(sx * (T * 1.5 - 1.6), topY + 1.75, topZ + T * 1.6)); }

    // ---- two rows of giant pillars with torches facing inward
    for (const z of [-15, -5, 5, 15]) for (const x of [-9, 9]) {
      p.push({ id: Math.random() < 0.3 ? 'kit.pillar_decorated' : 'kit.pillar', x, z, scale: 2.0, collide: true });
      const rot = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      const t = this.torchProp(x + (x < 0 ? 1.55 : -1.55), z, 4.2, rot, 1.8); p.push(t.prop); flames.push(t.flame);
      this.reserve(x, z, 2.2);
    }
    const gateTorchL = this.torchProp(-T - 0.6 + 2.1, half + 1.4, 6, Math.PI / 2, 2); const gateTorchR = this.torchProp(T + 0.6 - 2.1, half + 1.4, 6, -Math.PI / 2, 2);
    p.push(gateTorchL.prop, gateTorchR.prop); flames.push(gateTorchL.flame, gateTorchR.flame);

    // ---- dressing: heavy along the walls, lighter between the pillar rows, never on the lanes to the stair
    const keep: KeepOut[] = [{ x: 0, z: -12, r: 4 }, { x: 0, z: half - 4, r: 7 }, { x: 0, z: 0, r: 2.5 }];
    const heavy: KitId[] = ['kit.barrel_large', 'kit.barrel_small_stack', 'kit.crates_stacked', 'kit.box_stacked', 'kit.keg', 'kit.box_large', 'kit.trunk_large_A', 'kit.rubble_half', 'kit.column', 'kit.table_long_broken', 'kit.shelf_large', 'kit.chest'];
    const light: KitId[] = ['kit.barrel_small', 'kit.chair', 'kit.candle_triple', 'kit.candle_lit', 'kit.coin_stack_large', 'kit.rubble_half', 'kit.box_large'];
    const edge = 2.2, inner = 20.5;
    p.push(...this.scatter(heavy, 14, { minX: -inner, maxX: -13, minZ: -inner, maxZ: inner }, keep, { scale: [1.2, 1.7] }));
    p.push(...this.scatter(heavy, 14, { minX: 13, maxX: inner, minZ: -inner, maxZ: inner }, keep, { scale: [1.2, 1.7] }));
    p.push(...this.scatter(heavy, 8, { minX: -13, maxX: 13, minZ: -inner, maxZ: -15 }, keep, { scale: [1.2, 1.6] }));
    p.push(...this.scatter(light, 10, { minX: -inner, maxX: inner, minZ: -inner, maxZ: 16 }, keep, { scale: [1.3, 1.9], collide: false, spacing: 1.6 }));
    p.push(...this.scatter(['kit.rubble_half', 'kit.column', 'kit.barrel_large', 'kit.crates_stacked'], 6, { minX: -11, maxX: 11, minZ: -14, maxZ: 16 }, [...keep, { x: 0, z: -12, r: 6 }], { scale: [1.2, 1.5], spacing: 4 }));
    p.push({ id: 'kit.rubble_large', x: -17, z: 12, rot: 0.6, scale: 1.4, collide: true });
    p.push({ id: 'kit.rubble_large', x: 18, z: -14, rot: -1.1, scale: 1.3, collide: true });
    p.push({ id: 'kit.bed_frame', x: -20.5, z: -6, rot: Math.PI / 2, scale: 1.4, collide: true });
    // corner candle clusters catch the eye at the far ends
    for (const [x, z] of [[-21, -21], [21, -21], [-21, 21], [21, 21]]) { p.push({ id: 'kit.candle_triple', x: x + rand(-1, 1), z: z + rand(-1, 1), scale: 2 }); flames.push(new Vector3(x, 1.75, z)); }

    // ---- distant silhouettes beyond the walls
    const far: Placement[] = [
      { id: 'kit.wall_arched', x: 0, z: 95, scale: 9, rot: Math.PI }, { id: 'kit.wall_pillar', x: -30, z: 95, scale: 9 }, { id: 'kit.wall_pillar', x: 30, z: 95, scale: 9 },
      { id: 'kit.pillar', x: -12, z: 110, scale: 14 }, { id: 'kit.pillar', x: 12, z: 110, scale: 14 }, { id: 'kit.pillar', x: 0, z: 118, scale: 19 },
      { id: 'kit.wall', x: -55, z: 60, scale: 7, rot: 0.4 }, { id: 'kit.pillar', x: -70, z: 40, scale: 9 }, { id: 'kit.pillar', x: 72, z: 55, scale: 11 },
      { id: 'kit.wall_broken', x: 60, z: 20, scale: 7, rot: -0.8 }, { id: 'kit.wall_broken', x: -62, z: -20, scale: 6, rot: 1.2 },
      { id: 'kit.pillar', x: 40, z: -70, scale: 8 }, { id: 'kit.wall', x: -20, z: -75, scale: 7 },
    ];
    await this.placeAll([...p, ...far]);

    // ---- blockers around the stair and threshold
    this.addCollider('doorBlock', new Vector3(0, topY + 6, topZ + T * 2 - 0.4), new Vector3(12, 12, 1));
    const slab = MeshBuilder.CreateBox('stairSlab', { width: 7 * stairScale[0], height: 0.3, depth: Math.hypot(topY, 4 * stairScale[2]) }, this.scene);
    slab.position.set(0, topY / 2 - 0.15, stairZ0 + 2 * stairScale[2]); slab.rotation.x = -Math.atan2(topY, 4 * stairScale[2]);
    slab.isVisible = false; slab.isPickable = false; slab.metadata = { static: true }; slab.parent = this.root;
    this.addCollider('platformUnder', new Vector3(0, (topY - 0.6) / 2, topZ + T), new Vector3(T * 3, topY - 0.6, 2 * T));
    for (const sx of [-1, 1]) this.addCollider(`stairGap${sx}`, new Vector3(sx * (stairHalfW + (T - stairHalfW) / 2), 3, half), new Vector3(T - stairHalfW + 0.4, 6, 1.5));
    for (const sx of [-1, 1]) this.addCollider(`stairRail${sx}`, new Vector3(sx * (stairHalfW + 0.3), (topY + 2) / 2, stairZ0 + 2 * stairScale[2]), new Vector3(0.6, topY + 2, 4 * stairScale[2] + 0.5));
    for (const sx of [-1, 1]) this.addCollider(`platformSide${sx}`, new Vector3(sx * (T * 1.5 - 0.2), topY + 1, topZ + T), new Vector3(0.9, 2, 2 * T));
    for (const sx of [-1, 1]) this.addCollider(`platformFront${sx}`, new Vector3(sx * (stairHalfW + T * 1.5) / 2, topY + 1, topZ + 0.1), new Vector3(T * 1.5 - stairHalfW, 2, 0.9));
    this.doorPoint = new Vector3(0, topY, topZ + T * 2 - 2.5);

    this.makeGround(new Color3(0.3, 0.27, 0.31));
    for (const z of [-10, 10]) this.addTorch(new Vector3(0, 4.6, z), 26, 20);
    this.addTorch(new Vector3(0, 6.5, half + 0.4), 30, 22);
    for (const f of flames) this.addFlame(f);
    this.addPortal(new Vector3(0, topY + 4.5, topZ + T * 2 - 1.6), 7.5, 10);
    this.addTorch(new Vector3(0, topY + 5, topZ + T * 2 - 3), 18, 22, PALETTE.arcane.scale(0.9)).name = 'doorGlow';
    this.addGrime(-23, 23, -23, 23, 46);
  }
}
