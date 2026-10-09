import { type BufferGeometry, BoxGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { palette, terrainColors } from '../render/palette';
import { colored } from './StructureFactory';

/**
 * Placeholder models for monsters (monsters.json `model`). Same idea as NpcFactory: a few parts,
 * each one merged geometry with vertex colors, drawn as one InstancedMesh for all monsters with
 * that model. Heading 0 faces +z. Real glTF models replace this file later.
 */

export interface EnemyModel {
  parts: BufferGeometry[];
  /** Height (m) of the top: damage numbers start here. */
  height: number;
}

/** A training dummy: a wooden post with arms and a straw sack body and head. */
function dummy(): EnemyModel {
  const wood = palette.steengrijs;
  const straw = terrainColors.zandsteen;
  const geometry = colored([
    [new CylinderGeometry(0.07, 0.09, 1.9, 6), wood, 0, 0.95, 0],
    [new BoxGeometry(1.2, 0.09, 0.09), wood, 0, 1.35, 0],
    [new CylinderGeometry(0.3, 0.26, 0.75, 8), straw, 0, 1.15, 0],
    [new SphereGeometry(0.2, 8, 6), straw, 0, 1.75, 0],
    [new BoxGeometry(0.14, 0.03, 0.02), palette.nachtinkt, 0, 1.78, 0.19],
  ]);
  return { parts: [geometry], height: 2 };
}

const builders: Record<string, () => EnemyModel> = {
  'placeholder:dummy': dummy,
};

/** True when this factory can build the model named in monsters.json. */
export function hasEnemyModel(key: string): boolean {
  return key in builders;
}

/** Builds a placeholder monster model (new geometry; the caller disposes it). */
export function buildEnemyModel(key: string): EnemyModel {
  const builder = builders[key];
  if (!builder) throw new Error(`No placeholder monster model "${key}"`);
  return builder();
}
