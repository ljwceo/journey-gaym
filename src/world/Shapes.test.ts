import { describe, expect, it } from 'vitest';
import { boxContains, emptyBox, pointInShape, shapeBounds } from './Shapes';

describe('pointInShape', () => {
  it('handles circles, rects and polygons', () => {
    expect(pointInShape({ type: 'circle', x: 0, z: 0, radius: 2 }, 1, 1)).toBe(true);
    expect(pointInShape({ type: 'circle', x: 0, z: 0, radius: 2 }, 2, 2)).toBe(false);
    const rect = { type: 'rect', minX: -1, minZ: -1, maxX: 1, maxZ: 1 } as const;
    expect(pointInShape(rect, 1, 0)).toBe(true);
    expect(pointInShape(rect, 1.1, 0)).toBe(false);
    // An L-shaped polygon: the notch at (1.5, 1.5) is outside.
    const polygon = {
      type: 'polygon' as const,
      points: [
        [0, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 2],
        [0, 2],
      ] as [number, number][],
    };
    expect(pointInShape(polygon, 0.5, 1.5)).toBe(true);
    expect(pointInShape(polygon, 1.5, 1.5)).toBe(false);
  });
});

describe('shapeBounds', () => {
  it('computes bounding boxes', () => {
    expect(shapeBounds({ type: 'circle', x: 5, z: -5, radius: 1 }, emptyBox())).toEqual({
      minX: 4,
      maxX: 6,
      minZ: -6,
      maxZ: -4,
    });
    const box = shapeBounds(
      {
        type: 'polygon',
        points: [
          [0, 0],
          [3, 1],
          [1, 4],
        ],
      },
      emptyBox(),
    );
    expect(box).toEqual({ minX: 0, maxX: 3, minZ: 0, maxZ: 4 });
    expect(boxContains({ minX: -1, minZ: -1, maxX: 5, maxZ: 5 }, box)).toBe(true);
    expect(boxContains({ minX: 1, minZ: -1, maxX: 5, maxZ: 5 }, box)).toBe(false);
  });
});
