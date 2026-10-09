/**
 * Static colliders in the XZ plane (1 unit = 1 m). The player and other movers are circles
 * that get pushed out of these shapes, which makes them slide along walls.
 * Everything here is allocation-free so it can run every simulation step.
 */

export interface CircleCollider {
  readonly kind: 'circle';
  x: number;
  z: number;
  radius: number;
  /** Used by SpatialHash.query to report each collider once per query. */
  queryStamp: number;
}

/** Axis-aligned rectangle (buildings, walls). Rotated shapes can be added when needed. */
export interface BoxCollider {
  readonly kind: 'box';
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  queryStamp: number;
}

export type Collider = CircleCollider | BoxCollider;

export function circleCollider(x: number, z: number, radius: number): CircleCollider {
  return { kind: 'circle', x, z, radius, queryStamp: 0 };
}

export function boxCollider(minX: number, minZ: number, maxX: number, maxZ: number): BoxCollider {
  return { kind: 'box', minX, minZ, maxX, maxZ, queryStamp: 0 };
}

/** Box around center (x, z) with full width (x) and depth (z). */
export function boxColliderAt(x: number, z: number, width: number, depth: number): BoxCollider {
  return boxCollider(x - width / 2, z - depth / 2, x + width / 2, z + depth / 2);
}

export function colliderMinX(c: Collider): number {
  return c.kind === 'circle' ? c.x - c.radius : c.minX;
}
export function colliderMinZ(c: Collider): number {
  return c.kind === 'circle' ? c.z - c.radius : c.minZ;
}
export function colliderMaxX(c: Collider): number {
  return c.kind === 'circle' ? c.x + c.radius : c.maxX;
}
export function colliderMaxZ(c: Collider): number {
  return c.kind === 'circle' ? c.z + c.radius : c.maxZ;
}

/** A position that collision code moves in place. */
export interface PointXZ {
  x: number;
  z: number;
}

/**
 * Pushes a circle at `p` with `radius` out of `collider`. Returns true when it overlapped.
 * The push is along the shortest way out, so walking into a wall at an angle slides along it.
 */
export function pushOutOf(p: PointXZ, radius: number, collider: Collider): boolean {
  if (collider.kind === 'circle') {
    const dx = p.x - collider.x;
    const dz = p.z - collider.z;
    const min = radius + collider.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq >= min * min) return false;
    const dist = Math.sqrt(distSq);
    if (dist < 1e-6) {
      // Exactly in the center: any direction works; pick +x so the result is deterministic.
      p.x = collider.x + min;
      return true;
    }
    const scale = min / dist;
    p.x = collider.x + dx * scale;
    p.z = collider.z + dz * scale;
    return true;
  }

  // Closest point on the box to the circle center.
  const cx = p.x < collider.minX ? collider.minX : p.x > collider.maxX ? collider.maxX : p.x;
  const cz = p.z < collider.minZ ? collider.minZ : p.z > collider.maxZ ? collider.maxZ : p.z;
  const dx = p.x - cx;
  const dz = p.z - cz;
  const distSq = dx * dx + dz * dz;
  if (distSq > 1e-12) {
    // Center outside the box.
    if (distSq >= radius * radius) return false;
    const dist = Math.sqrt(distSq);
    const scale = radius / dist;
    p.x = cx + dx * scale;
    p.z = cz + dz * scale;
    return true;
  }
  // Center inside the box: leave through the nearest side.
  const left = p.x - collider.minX;
  const right = collider.maxX - p.x;
  const top = p.z - collider.minZ;
  const bottom = collider.maxZ - p.z;
  const nearest = Math.min(left, right, top, bottom);
  if (nearest === left) p.x = collider.minX - radius;
  else if (nearest === right) p.x = collider.maxX + radius;
  else if (nearest === top) p.z = collider.minZ - radius;
  else p.z = collider.maxZ + radius;
  return true;
}

/** Keeps a circle inside a rectangle (world or zone edge). Returns true when it was moved. */
export function keepInside(
  p: PointXZ,
  radius: number,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
): boolean {
  let moved = false;
  if (p.x < minX + radius) {
    p.x = minX + radius;
    moved = true;
  } else if (p.x > maxX - radius) {
    p.x = maxX - radius;
    moved = true;
  }
  if (p.z < minZ + radius) {
    p.z = minZ + radius;
    moved = true;
  } else if (p.z > maxZ - radius) {
    p.z = maxZ - radius;
    moved = true;
  }
  return moved;
}
