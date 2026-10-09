import type { Shape } from '../data/types';

/** Axis-aligned box in the XZ plane. */
export interface Box {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** True when (x, z) lies inside or on the edge of the shape. Allocation-free. */
export function pointInShape(shape: Shape, x: number, z: number): boolean {
  switch (shape.type) {
    case 'circle': {
      const dx = x - shape.x;
      const dz = z - shape.z;
      return dx * dx + dz * dz <= shape.radius * shape.radius;
    }
    case 'rect':
      return x >= shape.minX && x <= shape.maxX && z >= shape.minZ && z <= shape.maxZ;
    case 'polygon': {
      // Ray casting: count edge crossings of a ray from the point towards +X.
      const points = shape.points;
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, zi] = points[i] as [number, number];
        const [xj, zj] = points[j] as [number, number];
        if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      return inside;
    }
  }
}

/** Bounding box of a shape. Writes into `out` to avoid allocating. */
export function shapeBounds(shape: Shape, out: Box): Box {
  switch (shape.type) {
    case 'circle':
      out.minX = shape.x - shape.radius;
      out.maxX = shape.x + shape.radius;
      out.minZ = shape.z - shape.radius;
      out.maxZ = shape.z + shape.radius;
      break;
    case 'rect':
      out.minX = shape.minX;
      out.maxX = shape.maxX;
      out.minZ = shape.minZ;
      out.maxZ = shape.maxZ;
      break;
    case 'polygon':
      out.minX = Infinity;
      out.maxX = -Infinity;
      out.minZ = Infinity;
      out.maxZ = -Infinity;
      for (const [x, z] of shape.points) {
        if (x < out.minX) out.minX = x;
        if (x > out.maxX) out.maxX = x;
        if (z < out.minZ) out.minZ = z;
        if (z > out.maxZ) out.maxZ = z;
      }
      break;
  }
  return out;
}

/** True when the whole bounding box of `inner` lies inside `outer`'s box. */
export function boxContains(outer: Box, inner: Box): boolean {
  return (
    inner.minX >= outer.minX &&
    inner.maxX <= outer.maxX &&
    inner.minZ >= outer.minZ &&
    inner.maxZ <= outer.maxZ
  );
}

export function emptyBox(): Box {
  return { minX: 0, minZ: 0, maxX: 0, maxZ: 0 };
}
