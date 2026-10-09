import { type Collider, colliderMaxX, colliderMaxZ, colliderMinX, colliderMinZ } from './Colliders';

/** Cell coordinates are offset by this so the key stays a positive integer. */
const CELL_OFFSET = 1 << 15;
const CELL_SPAN = 1 << 16;

/**
 * Uniform grid over the XZ plane for static colliders. Each collider is stored in every cell
 * its bounding box touches; a query returns each collider once. Chunks add their colliders
 * when they load and remove them when they unload (step 1.7).
 * Queries do not allocate: results go into a caller-owned array.
 */
export class SpatialHash {
  private readonly cells = new Map<number, Collider[]>();
  private stamp = 0;
  private count = 0;

  constructor(readonly cellSize = 8) {
    if (!(cellSize > 0)) throw new Error('cellSize must be positive');
  }

  /** Number of colliders stored. */
  get size(): number {
    return this.count;
  }

  /** Number of non-empty cells (for the debug overlay). */
  get cellCount(): number {
    return this.cells.size;
  }

  insert(collider: Collider): void {
    this.forCells(collider, (key) => {
      let list = this.cells.get(key);
      if (!list) {
        list = [];
        this.cells.set(key, list);
      }
      list.push(collider);
    });
    this.count++;
  }

  /** Removes a collider that was inserted with the same bounds. */
  remove(collider: Collider): void {
    let found = false;
    this.forCells(collider, (key) => {
      const list = this.cells.get(key);
      if (!list) return;
      const index = list.indexOf(collider);
      if (index < 0) return;
      found = true;
      // Order inside a cell does not matter: swap-remove.
      list[index] = list[list.length - 1] as Collider;
      list.pop();
      if (list.length === 0) this.cells.delete(key);
    });
    if (found) this.count--;
  }

  clear(): void {
    this.cells.clear();
    this.count = 0;
  }

  /**
   * Fills `out` with every collider whose cells touch the given box (a superset of the
   * colliders that actually overlap it). Returns `out`.
   */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: Collider[]): Collider[] {
    out.length = 0;
    const stamp = ++this.stamp;
    const x0 = this.cell(minX);
    const x1 = this.cell(maxX);
    const z0 = this.cell(minZ);
    const z1 = this.cell(maxZ);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(key(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const collider = list[i] as Collider;
          if (collider.queryStamp === stamp) continue;
          collider.queryStamp = stamp;
          out.push(collider);
        }
      }
    }
    return out;
  }

  private cell(value: number): number {
    return Math.floor(value / this.cellSize);
  }

  private forCells(collider: Collider, visit: (key: number) => void): void {
    const x0 = this.cell(colliderMinX(collider));
    const x1 = this.cell(colliderMaxX(collider));
    const z0 = this.cell(colliderMinZ(collider));
    const z1 = this.cell(colliderMaxZ(collider));
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) visit(key(cx, cz));
    }
  }
}

function key(cx: number, cz: number): number {
  return (cx + CELL_OFFSET) * CELL_SPAN + (cz + CELL_OFFSET);
}
