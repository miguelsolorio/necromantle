const KIT = ['floor_tile_large', 'floor_tile_small', 'floor_tile_small_broken_A', 'floor_tile_small_weeds_A', 'floor_tile_large_rocks', 'floor_dirt_large', 'floor_dirt_large_rocky',
  'wall', 'wall_arched', 'wall_archedwindow_open', 'wall_broken', 'wall_cracked', 'wall_corner', 'wall_endcap', 'wall_half', 'wall_pillar', 'wall_window_open', 'wall_Tsplit',
  'column', 'pillar', 'pillar_decorated', 'stairs_wide', 'stairs', 'stairs_walled', 'torch_mounted', 'torch_lit', 'candle_triple', 'candle_lit',
  'barrel_large', 'barrel_small', 'barrel_small_stack', 'box_large', 'box_stacked', 'crates_stacked', 'keg', 'rubble_large', 'rubble_half',
  'banner_red', 'banner_patternA_red', 'banner_triple_red', 'banner_thin_red', 'chest', 'table_long_broken', 'chair', 'bed_frame', 'shelf_large', 'trunk_large_A', 'coin_stack_large'] as const;

export type KitId = `kit.${(typeof KIT)[number]}`;
export type AssetId = 'char.sorcerer' | 'char.staff' | 'enemy.ghoul' | 'enemy.fallen_knight' | 'enemy.cultist' | 'enemy.wraith' | KitId;

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
const table: Record<string, string> = {
  'char.sorcerer': 'assets/characters/sorcerer.glb',
  'char.staff': 'assets/characters/staff.gltf',
  'enemy.ghoul': 'assets/enemies/ghoul.glb',
  'enemy.fallen_knight': 'assets/enemies/fallen_knight.glb',
  'enemy.cultist': 'assets/enemies/cultist.glb',
  'enemy.wraith': 'assets/enemies/wraith.glb',
};
for (const k of KIT) table[`kit.${k}`] = `assets/environment/dungeon/${k}.glb`;

export function assetUrl(id: AssetId): string {
  const p = table[id];
  if (!p) throw new Error(`Unknown asset id ${id}`);
  return `${base}/${p}`;
}
export const KIT_IDS = KIT;
