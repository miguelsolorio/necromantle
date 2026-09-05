import { Vector3 } from '@babylonjs/core';
import type { AssetId } from '@/assets/registry';

export type NpcAction = 'heal' | 'gift' | 'none';

/** A townsperson: a body, a spot, a name, some lines, and what talking to them does. */
export interface NpcDef { model: AssetId; pos: Vector3; yaw: number; name: string; title: string; lines: string[]; action: NpcAction; anim?: string }
