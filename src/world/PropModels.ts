import {
  type BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Placeholder models for scattered props (trees, rocks, bushes), one merged geometry each with
 * vertex colors, so one InstancedMesh draws all of a kind in one draw call.
 * Data names the model ("placeholder:tree"); real glTF models later replace only this factory.
 */
export function propGeometry(model: string, colors: readonly number[]): BufferGeometry {
  const color = (i: number): number => colors[Math.min(i, colors.length - 1)] ?? 0xffffff;
  switch (model) {
    case 'placeholder:tree':
      // Trunk (no caps: hidden by ground and crown) plus two stacked cones. About 7.5 m tall.
      return merge([
        painted(new CylinderGeometry(0.22, 0.32, 3, 6, 1, true).translate(0, 1.5, 0), color(0)),
        painted(new ConeGeometry(1.9, 4, 7).translate(0, 4.2, 0), color(1)),
        painted(new ConeGeometry(1.3, 3, 7).translate(0, 6, 0), color(1)),
      ]);
    case 'placeholder:rock':
      return painted(
        new DodecahedronGeometry(1, 0).scale(1, 0.65, 1.15).translate(0, 0.25, 0),
        color(0),
      );
    case 'placeholder:bush':
      return painted(
        new IcosahedronGeometry(0.75, 0).scale(1, 0.7, 1).translate(0, 0.35, 0),
        color(0),
      );
    default:
      throw new Error(`Unknown prop model: ${model}`);
  }
}

/** Gives every vertex of a geometry one color (linear RGB from a palette number). */
function painted(geometry: BufferGeometry, hex: number): BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const c = new Color(hex);
  const count = flat.getAttribute('position').count;
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    values[i * 3] = c.r;
    values[i * 3 + 1] = c.g;
    values[i * 3 + 2] = c.b;
  }
  flat.setAttribute('color', new Float32BufferAttribute(values, 3));
  flat.deleteAttribute('uv');
  return flat;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('Could not merge prop geometry');
  return merged;
}
