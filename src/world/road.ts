import { Color3, Vector3 } from '@babylonjs/core';
import type { KitId } from '@/assets/registry';
import { pick, rand } from '@/core/mathx';
import { KIT_SCALE, KitLevel, type KeepOut, type Placement } from './kitLevel';

/**
 * Sexton's Road: a winding dirt track through dead farms and a burial ground toward the cathedral court.
 * 150×150 m with three side pockets (a ruined farm, a shrine, a grave field) and the gate at the far end.
 */
export class Road extends KitLevel {
  override name = 'SEXTON\'S ROAD';
  override sub = 'WILDERNESS';
  override exitLabel = 'ENTER THE OUTER COURT';
  override fogDensity = 0.014;
  override lightBoost = 1.6;
  override waves = [
    { spawns: [{ id: 'ghoul' as const, n: 9 }, { id: 'wraith' as const, n: 1 }] },
    { spawns: [{ id: 'ghoul' as const, n: 10 }, { id: 'cultist' as const, n: 3 }, { id: 'fallen_knight' as const, n: 1 }] },
    { fromDoor: true, spawns: [{ id: 'ghoul' as const, n: 12 }, { id: 'wraith' as const, n: 2 }, { id: 'fallen_knight' as const, n: 2 }, { id: 'ghoul' as const, n: 1, elite: true }] },
  ];

  async build(): Promise<void> {
    const S = KIT_SCALE, T = 4 * S, H = 75;
    this.playerStart = new Vector3(0, 0, -H + 8); this.playerYaw = 0;
    const p: Placement[] = []; const flames: Vector3[] = [];
    this.addSurface({ minX: -H, maxX: H, minZ: -H, maxZ: H, y0: 0.02, y1: 0.02 });
    this.addSurface({ minX: -H + 6, maxX: H - 6, minZ: -H + 6, maxZ: H - 6, y0: 0.02, y1: 0.02, spawn: true });
    this.addSurface({ minX: -300, maxX: 300, minZ: -300, maxZ: 300, y0: -0.06, y1: -0.06 });
    // the track: dirt tiles along a gentle S curve from south gate to north gate
    const roadX = (z: number) => Math.sin(z / 28) * 14;
    for (let z = -H + 3; z < H - 3; z += T / 2) for (const dx of [-T / 2, 0, T / 2]) p.push({ id: Math.random() < 0.7 ? 'kit.floor_dirt_large' : 'kit.floor_dirt_large_rocky', x: roadX(z) + dx + rand(-0.6, 0.6), z, y: -0.02, rot: Math.floor(rand(0, 4)) * Math.PI / 2, ground: false, collide: false });
    // pockets: farm west, shrine east, grave field north-west
    const farm = { x: -38, z: -20 }, shrine = { x: 40, z: 10 }, graves = { x: -34, z: 42 };
    // farm: fallen fences, a collapsed hut, carts of barrels
    for (let i = 0; i < 7; i++) p.push({ id: 'kit.barrier', x: farm.x - 9 + i * 2.6, z: farm.z - 8, rot: rand(-0.3, 0.3), scale: 1.4, collide: true });
    for (let i = 0; i < 5; i++) p.push({ id: 'kit.barrier_half', x: farm.x - 9, z: farm.z - 6 + i * 2.2, rot: Math.PI / 2, scale: 1.4, collide: true });
    p.push({ id: 'kit.wall_broken', x: farm.x, z: farm.z + 4, rot: 0.2, collide: true }); p.push({ id: 'kit.wall_cracked', x: farm.x - 5.5, z: farm.z + 1, rot: Math.PI / 2 + 0.2, collide: true }); p.push({ id: 'kit.wall_pillar', x: farm.x - 5.7, z: farm.z + 4, scale: S, collide: true });
    p.push({ id: 'kit.rubble_large', x: farm.x + 4, z: farm.z - 1, rot: 1.2, scale: 1.3, collide: true }); p.push({ id: 'kit.bed_frame', x: farm.x - 2, z: farm.z - 1, rot: 0.4, scale: 1.4, collide: true });
    for (const [dx, dz] of [[6, -6], [8, -4], [7, -8]]) p.push({ id: 'kit.barrel_large', x: farm.x + dx, z: farm.z + dz, scale: 1.4, collide: true });
    p.push({ id: 'kit.table_long_broken', x: farm.x + 7, z: farm.z - 5, rot: 0.7, scale: 1.6, collide: true });
    this.reserve(farm.x, farm.z, 12);
    // shrine: a ring of columns, an altar with candles, banners
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.push({ id: i % 3 === 0 ? 'kit.column' : 'kit.pillar', x: shrine.x + Math.sin(a) * 7, z: shrine.z + Math.cos(a) * 7, rot: a, scale: i % 3 === 0 ? 2.2 : 1.7, collide: true }); }
    p.push({ id: 'kit.table_medium', x: shrine.x, z: shrine.z, rot: 0, scale: 1.6, collide: true }); p.push({ id: 'kit.chest', x: shrine.x, z: shrine.z + 2.2, rot: Math.PI, scale: 1.4, collide: true });
    for (const [dx, dz] of [[-1.6, -1.4], [1.6, -1.4], [0, 2.8]]) { p.push({ id: 'kit.candle_triple', x: shrine.x + dx, z: shrine.z + dz, scale: 2.2 }); flames.push(new Vector3(shrine.x + dx, 1.9, shrine.z + dz)); }
    for (let i = 0; i < 6; i++) p.push({ id: 'kit.floor_tile_large', x: shrine.x + (i % 3 - 1) * T, z: shrine.z + (Math.floor(i / 3) - 0.5) * T, y: 0.002, ground: false, collide: false });
    this.reserve(shrine.x, shrine.z, 10);
    // grave field: rows of stones with candles and a low wall
    for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) { const x = graves.x - 8 + c * 2.4 + rand(-0.4, 0.4), z = graves.z - 4 + r * 2.6 + rand(-0.4, 0.4); p.push({ id: 'kit.column', x, z, rot: rand(-0.3, 0.3), scaleV: [0.7, rand(0.5, 1.0), 0.5], collide: true }); if (Math.random() < 0.25) { p.push({ id: 'kit.candle_lit', x: x + 0.7, z: z - 0.5, scale: 1.6 }); flames.push(new Vector3(x + 0.7, 0.9, z - 0.5)); } }
    for (let i = 0; i < 8; i++) p.push({ id: pick(['kit.wall_half', 'kit.wall_broken'] as KitId[]), x: graves.x - 9 + i * 2.6, z: graves.z + 8, rot: Math.PI, scaleV: [0.65, 0.5, S], collide: true });
    this.reserve(graves.x, graves.z, 12);
    // gates: south (from the village, sealed behind) and north (to the court)
    for (const z of [-H, H]) { p.push({ id: 'kit.pillar', x: roadX(z) - 5, z, scale: 2.2, collide: true }); p.push({ id: 'kit.pillar', x: roadX(z) + 5, z, scale: 2.2, collide: true }); const l = this.torchProp(roadX(z) - 3.4, z, 4.5, z < 0 ? Math.PI / 2 : Math.PI / 2, 1.8), r = this.torchProp(roadX(z) + 3.4, z, 4.5, -Math.PI / 2, 1.8); p.push(l.prop, r.prop); flames.push(l.flame, r.flame); }
    p.push({ id: 'kit.wall_arched', x: roadX(H), z: H + 0.5, rot: Math.PI, scale: 2.2, collide: true });
    // standing torches along the track every 30 m
    for (let z = -H + 25; z < H - 10; z += 30) { const x = roadX(z) + (Math.floor(z / 30) % 2 ? 7 : -7); p.push({ id: 'kit.torch', x, z, scale: 2.4, collide: false }); flames.push(new Vector3(x, 2.9, z)); this.reserve(x, z, 2); }
    // roadside rubble, carts, stones, shrines; keep the track clear
    const keep: KeepOut[] = [{ x: 0, z: -H + 8, r: 6 }, { x: roadX(H), z: H - 4, r: 8 }, { x: farm.x, z: farm.z, r: 12 }, { x: shrine.x, z: shrine.z, r: 10 }, { x: graves.x, z: graves.z, r: 12 }];
    for (let z = -H; z <= H; z += 6) keep.push({ x: roadX(z), z, r: 5 });
    const props: KitId[] = ['kit.rubble_half', 'kit.rubble_large', 'kit.column', 'kit.barrel_large', 'kit.crates_stacked', 'kit.trunk_large_A', 'kit.box_large', 'kit.barrier', 'kit.wall_broken'];
    p.push(...this.scatter(props, 40, { minX: -H + 4, maxX: H - 4, minZ: -H + 4, maxZ: H - 4 }, keep, { scale: [1.2, 1.8], spacing: 5 }));
    p.push(...this.scatter(['kit.candle_lit', 'kit.candle_triple', 'kit.floor_dirt_small_weeds', 'kit.floor_tile_small_broken_A'], 30, { minX: -H + 4, maxX: H - 4, minZ: -H + 4, maxZ: H - 4 }, keep, { scale: [1.4, 2], collide: false, spacing: 3 }));
    await this.placeAll(p);
    // dead trees: thick outside the track, thinning toward it
    for (let i = 0; i < 90; i++) { const x = rand(-H + 3, H - 3), z = rand(-H + 3, H - 3); if (Math.abs(x - roadX(z)) < 9 || keep.some((k) => Math.hypot(k.x - x, k.z - z) < k.r * 0.8)) continue; this.addTree(new Vector3(x, 0, z), rand(0.7, 1.6)); }
    for (let i = 0; i < 40; i++) { const a = rand(0, Math.PI * 2), r = rand(H + 4, H + 40); this.addTree(new Vector3(Math.sin(a) * r, -0.06, Math.cos(a) * r), rand(1, 1.8)); }
    // boundary: invisible walls, with the far silhouette of the court beyond the north gate
    this.addCollider('boundS', new Vector3(0, 4, -H - 0.5), new Vector3(2 * H, 8, 1)); this.addCollider('boundN', new Vector3(0, 4, H + 0.5), new Vector3(2 * H, 8, 1));
    this.addCollider('boundE', new Vector3(H + 0.5, 4, 0), new Vector3(1, 8, 2 * H)); this.addCollider('boundW', new Vector3(-H - 0.5, 4, 0), new Vector3(1, 8, 2 * H));
    await this.placeAll([{ id: 'kit.wall_pillar', x: roadX(H) - 22, z: H + 30, scale: 8 }, { id: 'kit.wall_pillar', x: roadX(H) + 22, z: H + 30, scale: 8 }, { id: 'kit.pillar', x: roadX(H), z: H + 60, scale: 16 }]);
    this.doorPoint = new Vector3(roadX(H), 0.02, H - 3.5);
    this.makeGround(new Color3(0.16, 0.15, 0.12), -0.06);
    this.addTorch(new Vector3(roadX(-H), 4.5, -H + 1), 20, 18); this.addTorch(new Vector3(roadX(H), 4.5, H - 1), 22, 18);
    for (let z = -H + 25; z < H - 10; z += 30) { const x = roadX(z) + (Math.floor(z / 30) % 2 ? 7 : -7); this.addTorch(new Vector3(x, 3.2, z), 18, 18); } this.addTorch(new Vector3(shrine.x, 2.5, shrine.z), 18, 16, new Color3(1, 0.8, 0.5)); this.addTorch(new Vector3(graves.x, 2, graves.z), 10, 14, new Color3(0.6, 0.9, 1));
    for (const f of flames) this.addFlame(f);
    this.addPortal(new Vector3(roadX(H), 4.5, H + 0.2), 7, 8);
    this.addGrime(-H, H, -H, H, 80, 0.03);
  }
}
