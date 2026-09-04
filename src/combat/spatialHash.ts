import type { Vector3 } from '@babylonjs/core';

/** Uniform-grid neighbour lookup for enemies, pickups and projectiles. */
export class SpatialHash<T extends { position: Vector3 }> {
  private cells = new Map<number, T[]>();
  constructor(private cell = 3) {}
  private key(x: number, z: number): number { return (Math.floor(x / this.cell) + 32768) * 65536 + (Math.floor(z / this.cell) + 32768); }
  clear(): void { this.cells.clear(); }
  insert(item: T): void {
    const k = this.key(item.position.x, item.position.z);
    let arr = this.cells.get(k);
    if (!arr) { arr = []; this.cells.set(k, arr); }
    arr.push(item);
  }
  query(p: Vector3, radius: number, out: T[] = []): T[] {
    out.length = 0;
    const r2 = radius * radius;
    const x0 = Math.floor((p.x - radius) / this.cell), x1 = Math.floor((p.x + radius) / this.cell);
    const z0 = Math.floor((p.z - radius) / this.cell), z1 = Math.floor((p.z + radius) / this.cell);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const arr = this.cells.get((x + 32768) * 65536 + (z + 32768));
      if (!arr) continue;
      for (const it of arr) { const dx = it.position.x - p.x, dz = it.position.z - p.z; if (dx * dx + dz * dz <= r2) out.push(it); }
    }
    return out;
  }
}
