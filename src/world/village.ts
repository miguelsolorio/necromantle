import { Color3, Vector3 } from '@babylonjs/core';
import type { KitId } from '@/assets/registry';
import { PALETTE } from '@/content/palette';
import { pick, rand } from '@/core/mathx';
import { KIT_SCALE, KitLevel, type KeepOut, type Placement } from './kitLevel';

/**
 * Hollowmere: the safe hub. Muddy square with a well, huts built from kit walls under dark roofs, a smithy,
 * a merchant's stall, a cemetery, townsfolk, and the road gate north toward the cathedral on the ridge.
 */
export class Village extends KitLevel {
  override name = 'HOLLOWMERE';
  override sub = 'VILLAGE · NIGHT';
  override safe = true;
  override exitLabel = 'TAKE THE SEXTON\'S ROAD';
  override objective = 'Speak with Maren at the forge, then take the road north';
  override fogDensity = 0.013;

  async build(): Promise<void> {
    const S = KIT_SCALE, T = 4 * S;
    this.playerStart = new Vector3(0, 0, -13); this.playerYaw = 0;
    const p: Placement[] = []; const flames: Vector3[] = [];
    // square: dirt tiles with weedy patches, 10×10 tiles (60 m)
    for (let ix = -5; ix < 5; ix++) for (let iz = -5; iz < 5; iz++) {
      const r = Math.random();
      const id: KitId = r < 0.5 ? 'kit.floor_dirt_large' : r < 0.7 ? 'kit.floor_dirt_large_rocky' : 'kit.floor_tile_large_rocks';
      p.push({ id, x: ix * T + T / 2, z: iz * T + T / 2, rot: Math.floor(rand(0, 4)) * Math.PI / 2, ground: true });
    }
    for (let i = 0; i < 24; i++) p.push({ id: 'kit.floor_dirt_small_weeds', x: rand(-28, 28), z: rand(-28, 28), y: 0.012, rot: rand(0, 6), scale: S, collide: false });
    this.addSurface({ minX: -30, maxX: 30, minZ: -30, maxZ: 30, y0: 0.075, y1: 0.075 });
    this.addSurface({ minX: -200, maxX: 200, minZ: -200, maxZ: 200, y0: -0.06, y1: -0.06 });

    // huts: closed wall boxes with a doorway, a roof slab, and lit windows (torches inside the doorway)
    const hut = (x: number, z: number, w: number, d: number, rot: number, doorSide: 0 | 1 | 2 | 3) => {
      const sides: [number, number, number][] = [[0, -d / 2, 0], [w / 2, 0, Math.PI / 2], [0, d / 2, Math.PI], [-w / 2, 0, -Math.PI / 2]];
      sides.forEach(([sx, sz, srot], i) => {
        const len = i % 2 === 0 ? w : d; const n = Math.max(1, Math.round(len / T));
        for (let k = 0; k < n; k++) {
          const off = (k - (n - 1) / 2) * T;
          const lx = sx + (i % 2 === 0 ? off : 0), lz = sz + (i % 2 === 0 ? 0 : off);
          const wx = x + lx * Math.cos(rot) + lz * Math.sin(rot), wz = z - lx * Math.sin(rot) + lz * Math.cos(rot);
          const isDoor = i === doorSide && k === Math.floor(n / 2);
          p.push({ id: isDoor ? 'kit.wall_doorway' : pick(['kit.wall', 'kit.wall_window_open', 'kit.wall_cracked'] as KitId[]), x: wx, z: wz, rot: srot + rot, collide: true });
          if (isDoor) { const fx = wx + Math.sin(srot + rot) * 0.9, fz = wz + Math.cos(srot + rot) * 0.9; flames.push(new Vector3(fx, 2.2, fz)); }
        }
      });
      for (const [cx, cz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) p.push({ id: 'kit.wall_pillar', x: x + cx * Math.cos(rot) + cz * Math.sin(rot), z: z - cx * Math.sin(rot) + cz * Math.cos(rot), rot, scale: S * 1.05, collide: true });
      this.roof(x, z, w, d, 6);
      this.reserve(x, z, Math.max(w, d) / 2 + 2);
    };
    hut(-19, 8, T * 2, T, 0, 0); hut(19, 6, T, T * 2, 0, 3); hut(-16, -16, T * 2, T, 0.35, 0); hut(18, -14, T, T, -0.4, 3);
    // smithy: open-fronted, forge glow, anvil-ish crates, Maren
    p.push({ id: 'kit.wall', x: 14, z: 22, rot: Math.PI, collide: true }); p.push({ id: 'kit.wall', x: 8, z: 22, rot: Math.PI, collide: true });
    p.push({ id: 'kit.wall_pillar', x: 17, z: 22, scale: S * 1.05, collide: true }); p.push({ id: 'kit.wall_pillar', x: 5, z: 22, scale: S * 1.05, collide: true }); p.push({ id: 'kit.wall_pillar', x: 17, z: 16, scale: S * 1.05, collide: true }); p.push({ id: 'kit.wall_pillar', x: 5, z: 16, scale: S * 1.05, collide: true });
    this.roof(11, 19, 12, 6, 6);
    p.push({ id: 'kit.keg', x: 15, z: 20, scale: 1.6, collide: true }); p.push({ id: 'kit.box_large', x: 11, z: 20.5, scale: 1.3, collide: true }); p.push({ id: 'kit.shelf_large', x: 8, z: 21, rot: Math.PI, scale: 1.5, collide: true }); p.push({ id: 'kit.table_medium', x: 11, z: 18, scale: 1.5, collide: true });
    flames.push(new Vector3(15, 2.6, 20)); flames.push(new Vector3(8, 3.2, 21));
    // merchant stall
    p.push({ id: 'kit.table_long', x: -12, z: -4, rot: 0, scale: 1.5, collide: true }); p.push({ id: 'kit.shelf_small_candles', x: -12, z: -2, rot: 0, scale: 1.5, collide: true });
    for (const [dx, id] of [[-1.5, 'kit.bottle_A_green'], [0, 'kit.plate_food_A'], [1.5, 'kit.bottle_B_brown']] as const) p.push({ id, x: -12 + dx, z: -4, y: 1.4, scale: 1.6, collide: false });
    p.push({ id: 'kit.coin_stack_small', x: -13.5, z: -4.5, y: 1.4, scale: 1.4, collide: false }); p.push({ id: 'kit.crates_stacked', x: -15.5, z: -3, scale: 1.4, collide: true });
    // the well: a ring of barrier pieces around a dark pit
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.push({ id: 'kit.barrier_column', x: Math.sin(a) * 2.2, z: Math.cos(a) * 2.2, rot: a, scale: 1.4, collide: true }); }
    p.push({ id: 'kit.barrel_large', x: 0, z: 0, scaleV: [1.1, 0.5, 1.1], collide: true });
    this.reserve(0, 0, 4);
    // cemetery east: rows of stones (short columns), fences, candles
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) { const x = 20 + c * 1.6 + rand(-0.3, 0.3), z = -26 + r * 2.4 + rand(-0.3, 0.3); p.push({ id: 'kit.column', x, z, rot: rand(-0.2, 0.2), scaleV: [0.7, rand(0.5, 0.9), 0.5], collide: true }); if (Math.random() < 0.3) { p.push({ id: 'kit.candle_lit', x: x + 0.6, z: z - 0.5, scale: 1.6 }); flames.push(new Vector3(x + 0.6, 0.9, z - 0.5)); } }
    for (let i = 0; i < 6; i++) p.push({ id: 'kit.barrier', x: 18 + i * 2, z: -20, rot: 0, scale: 1.4, collide: true });
    for (let i = 0; i < 4; i++) p.push({ id: 'kit.barrier', x: 18, z: -22 - i * 2, rot: Math.PI / 2, scale: 1.4, collide: true });
    this.reserve(25, -24, 8);
    // gate north: two pillars, banners, torches, sealed by waves? no: the road is always open
    p.push({ id: 'kit.pillar', x: -5, z: 29, scale: 2.2, collide: true }); p.push({ id: 'kit.pillar', x: 5, z: 29, scale: 2.2, collide: true });
    p.push({ id: 'kit.banner_thin_red', x: -3.3, z: 29, y: 4, rot: 0, scale: 1.8 }); p.push({ id: 'kit.banner_thin_red', x: 3.3, z: 29, y: 4, rot: 0, scale: 1.8 });
    const tl = this.torchProp(-3.4, 29, 4.5, Math.PI / 2, 1.8), tr = this.torchProp(3.4, 29, 4.5, -Math.PI / 2, 1.8); p.push(tl.prop, tr.prop); flames.push(tl.flame, tr.flame);
    // low walls around the square with gaps, and props along them
    for (let i = -4; i <= 4; i++) { if (Math.abs(i) <= 1 && true) { /* gap north */ } else p.push({ id: pick(['kit.wall_half', 'kit.wall_broken', 'kit.barrier'] as KitId[]), x: i * T, z: 29.5, rot: Math.PI, scaleV: [S, 0.6, S], collide: true }); }
    for (let i = -4; i <= 4; i++) { p.push({ id: pick(['kit.wall_half', 'kit.barrier', 'kit.wall_broken'] as KitId[]), x: i * T, z: -29.5, rot: 0, scaleV: [S, 0.6, S], collide: true }); p.push({ id: pick(['kit.wall_half', 'kit.barrier'] as KitId[]), x: -29.5, z: i * T, rot: -Math.PI / 2, scaleV: [S, 0.6, S], collide: true }); p.push({ id: pick(['kit.wall_half', 'kit.barrier'] as KitId[]), x: 29.5, z: i * T, rot: Math.PI / 2, scaleV: [S, 0.6, S], collide: true }); }
    // dead trees around the outside, props on the square
    const keep: KeepOut[] = [{ x: 0, z: -13, r: 8 }, { x: 0, z: -22, r: 6 }, { x: 0, z: 0, r: 5 }, { x: 0, z: 29, r: 5 }, { x: 11, z: 19, r: 8 }, { x: -12, z: -3, r: 4 }];
    const props: KitId[] = ['kit.barrel_large', 'kit.crates_stacked', 'kit.box_stacked', 'kit.keg', 'kit.barrel_small_stack', 'kit.trunk_medium_A', 'kit.stool', 'kit.rubble_half'];
    p.push(...this.scatter(props, 18, { minX: -27, maxX: 27, minZ: -27, maxZ: 27 }, keep, { scale: [1.2, 1.5] }));
    p.push(...this.scatter(['kit.candle_triple', 'kit.candle_lit', 'kit.coin_stack_small', 'kit.stool'], 8, { minX: -26, maxX: 26, minZ: -26, maxZ: 26 }, keep, { scale: [1.4, 1.9], collide: false, spacing: 1.5 }));
    await this.placeAll(p);
    for (let i = 0; i < 26; i++) { const a = rand(0, Math.PI * 2), r = rand(36, 70); this.addTree(new Vector3(Math.sin(a) * r, -0.06, Math.cos(a) * r), rand(0.8, 1.5)); }
    // silhouette of the cathedral on the ridge to the north
    const far: Placement[] = [{ id: 'kit.wall_arched', x: 0, z: 140, scale: 10, rot: Math.PI }, { id: 'kit.pillar', x: -16, z: 150, scale: 14 }, { id: 'kit.pillar', x: 16, z: 150, scale: 14 }, { id: 'kit.pillar', x: 0, z: 160, scale: 20 }, { id: 'kit.wall_broken', x: -70, z: 60, scale: 7, rot: 0.5 }, { id: 'kit.wall_broken', x: 65, z: 40, scale: 6, rot: -0.7 }];
    await this.placeAll(far);
    // road gate leads north; townsfolk
    this.addCollider('gateBlock', new Vector3(0, 4, 30.5), new Vector3(12, 8, 1));
    this.doorPoint = new Vector3(0, 0.075, 27);
    await this.addNpc({ model: 'npc.smith', pos: new Vector3(11, 0.075, 18.5), yaw: Math.PI, name: 'Maren', title: 'THE SMITH', action: 'heal', lines: ['You\'ll want a sturdier staff before you go up that road. The dead don\'t care how clever you are.', 'Hold still. There. Now go and do something about the cathedral.'] });
    await this.addNpc({ model: 'npc.merchant', pos: new Vector3(-12, 0.075, -6), yaw: 0, name: 'Osric', title: 'THE MERCHANT', action: 'gift', lines: ['Nobody buys anything any more. Take this, it was going to rot on the table anyway.', 'Come back alive and I might have something better.'] });
    await this.addNpc({ model: 'npc.guard', pos: new Vector3(-6.5, 0.075, 26), yaw: Math.PI, name: 'Warden Tal', title: 'THE GATE', action: 'none', lines: ['The sexton locked the cathedral the night of the plague. Nothing has come down that road since. Nothing living.'] });
    this.makeGround(new Color3(0.2, 0.17, 0.14));
    this.addTorch(new Vector3(11, 4, 19), 26, 18); this.addTorch(new Vector3(0, 5, 28), 22, 18); this.addTorch(new Vector3(-12, 3.5, -4), 16, 12, new Color3(1, 0.8, 0.5)); this.addTorch(new Vector3(0, 4, -24), 10, 18, new Color3(0.9, 0.7, 0.45));
    for (const f of flames) this.addFlame(f);
    this.addPortal(new Vector3(0, 4.5, 30), 8, 8);
    this.addGrime(-28, 28, -28, 28, 40);
  }
}
