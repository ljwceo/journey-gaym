import { BoxGeometry, MeshBasicMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { PROP_STRIDE } from './ChunkBuilder';
import { PropLayer } from './PropLayer';

/** Prop data with `count` props whose local x is `tag * 100 + i`. */
function props(tag: number, count: number): Float32Array {
  const data = new Float32Array(count * PROP_STRIDE);
  for (let i = 0; i < count; i++) {
    data[i * PROP_STRIDE] = tag * 100 + i;
    data[i * PROP_STRIDE + 4] = 1;
  }
  return data;
}

/** Local x of every drawn instance (translation x minus base 0). */
function drawn(layer: PropLayer): number[] {
  const m = layer.mesh.instanceMatrix.array;
  const xs: number[] = [];
  for (let i = 0; i < layer.mesh.count; i++) xs.push(m[i * 16 + 12] as number);
  return xs.sort((a, b) => a - b);
}

describe('PropLayer', () => {
  it('keeps instances packed when chunks come and go', () => {
    const layer = new PropLayer(new BoxGeometry(), new MeshBasicMaterial(), 4, 8);
    layer.write(0, props(1, 3), 0, 3, 0, 0);
    layer.write(1, props(2, 5), 0, 5, 0, 0);
    layer.write(2, props(3, 2), 0, 2, 0, 0);
    expect(layer.mesh.count).toBe(10);
    layer.clear(1);
    expect(layer.mesh.count).toBe(5);
    expect(drawn(layer)).toEqual([100, 101, 102, 300, 301]);
    layer.write(3, props(4, 4), 0, 4, 0, 0);
    layer.clear(0);
    expect(drawn(layer)).toEqual([300, 301, 400, 401, 402, 403]);
    // Rewriting a chunk replaces its props instead of adding to them.
    layer.write(2, props(5, 1), 0, 1, 0, 0);
    expect(drawn(layer)).toEqual([400, 401, 402, 403, 500]);
    layer.clear(2);
    layer.clear(3);
    expect(layer.mesh.count).toBe(0);
  });

  it('moves every instance when the floating origin shifts', () => {
    const layer = new PropLayer(new BoxGeometry(), new MeshBasicMaterial(), 2, 4);
    layer.write(1, props(1, 2), 0, 2, 10, 20);
    layer.shift(64, -64);
    const m = layer.mesh.instanceMatrix.array;
    expect(m[12]).toBe(100 + 10 - 64);
    expect(m[14]).toBe(20 + 64);
  });
});
