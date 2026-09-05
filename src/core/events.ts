import type { Vector3 } from '@babylonjs/core';

export interface GameEvents {
  'enemy:damaged': { pos: Vector3; amount: number; crit: boolean; element: string; killed: boolean };
  'enemy:killed': { pos: Vector3; xp: number; elite: boolean; id: string; burning: boolean };
  'player:damaged': { amount: number };
  'player:healed': { amount: number };
  'player:levelup': { level: number };
  'ability:cast': { id: string };
  'ability:denied': { id: string; reason: 'cooldown' | 'energy' | 'locked' };
  'pickup:globe': { pos: Vector3 };
  'boss:phase': { phase: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private map = new Map<keyof GameEvents, Set<Handler<any>>>();
  on<K extends keyof GameEvents>(key: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(key);
    if (!set) { set = new Set(); this.map.set(key, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }
  emit<K extends keyof GameEvents>(key: K, payload: GameEvents[K]): void {
    this.map.get(key)?.forEach((fn) => fn(payload));
  }
}
