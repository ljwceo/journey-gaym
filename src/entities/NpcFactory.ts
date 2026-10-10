import {
  type BufferGeometry,
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  SphereGeometry,
} from 'three';
import { palette } from '../render/palette';
import { catmanParts } from './EnemyFactory';
import { colored } from './StructureFactory';

/**
 * Placeholder models for NPCs (npcs.json `roles[].model`). A model is a few parts; every part
 * is one merged geometry with vertex colors, drawn as one InstancedMesh for all NPCs using that
 * model. A tinted part is multiplied by the NPC's role color (white parts take the role color
 * exactly); other parts keep their own colors (skin, eyes).
 * Heading 0 faces +z, like the player. Real glTF models replace this file later.
 */

export interface NpcModelPart {
  geometry: BufferGeometry;
  tinted: boolean;
}

export interface NpcModel {
  parts: NpcModelPart[];
  /** Height (m) of the top of the head: the interaction icon floats above it. */
  height: number;
}

const WHITE = 0xffffff;
const SKIN = 0xd9a77e;
const EYES = palette.nachtinkt;

/** A person: tinted robe and shoulders, untinted head with eyes and a nose (shows facing). */
function humanoid(): NpcModel {
  const body = colored([
    [new CapsuleGeometry(0.3, 0.75, 4, 12), WHITE, 0, 0.72, 0],
    [new ConeGeometry(0.42, 0.7, 12, 1, true), WHITE, 0, 0.35, 0],
    [new BoxGeometry(0.72, 0.14, 0.32), 0xd8d4dc, 0, 1.2, 0],
  ]);
  const eye = (): BufferGeometry => new SphereGeometry(0.03, 6, 4);
  const head = colored([
    [new SphereGeometry(0.21, 14, 10), SKIN, 0, 1.52, 0],
    [eye(), EYES, -0.075, 1.55, 0.19],
    [eye(), EYES, 0.075, 1.55, 0.19],
    [new BoxGeometry(0.05, 0.07, 0.08), 0xc28f68, 0, 1.49, 0.21],
  ]);
  return {
    parts: [
      { geometry: body, tinted: true },
      { geometry: head, tinted: false },
    ],
    height: 1.75,
  };
}

/** Pringle: a small cat. The fur is tinted; eyes, nose and inner ears are not. */
function cat(): NpcModel {
  const leg = (): BufferGeometry => new CylinderGeometry(0.035, 0.035, 0.18, 5);
  const ear = (): BufferGeometry => new ConeGeometry(0.05, 0.1, 4);
  const tail = new CylinderGeometry(0.03, 0.025, 0.42, 5).rotateX(-0.9);
  const fur = colored([
    [new CapsuleGeometry(0.11, 0.26, 3, 8).rotateX(Math.PI / 2), WHITE, 0, 0.27, 0],
    [new SphereGeometry(0.12, 10, 8), WHITE, 0, 0.4, 0.22],
    [ear(), WHITE, -0.065, 0.53, 0.22],
    [ear(), WHITE, 0.065, 0.53, 0.22],
    [leg(), WHITE, -0.07, 0.09, 0.12],
    [leg(), WHITE, 0.07, 0.09, 0.12],
    [leg(), WHITE, -0.07, 0.09, -0.12],
    [leg(), WHITE, 0.07, 0.09, -0.12],
    [tail, WHITE, 0, 0.43, -0.32],
  ]);
  const eye = (): BufferGeometry => new SphereGeometry(0.02, 6, 4);
  const face = colored([
    [eye(), palette.zonlicht, -0.045, 0.43, 0.33],
    [eye(), palette.zonlicht, 0.045, 0.43, 0.33],
    [new SphereGeometry(0.015, 5, 4), 0xc46d6d, 0, 0.39, 0.34],
  ]);
  return {
    parts: [
      { geometry: fur, tinted: true },
      { geometry: face, tinted: false },
    ],
    height: 0.6,
  };
}

/** Sultan after his fight: the same cat man as the boss, not tinted. */
function catman(): NpcModel {
  return { parts: [{ geometry: colored(catmanParts()), tinted: false }], height: 2.1 };
}

const builders: Record<string, () => NpcModel> = {
  'placeholder:npc_humanoid': humanoid,
  'placeholder:cat': cat,
  'placeholder:catman': catman,
};

/** True when this factory can build the model named in npcs.json. */
export function hasNpcModel(key: string): boolean {
  return key in builders;
}

export function npcModelNames(): string[] {
  return Object.keys(builders);
}

/** Builds a placeholder NPC model (new geometry; the caller disposes it). */
export function buildNpcModel(key: string): NpcModel {
  const builder = builders[key];
  if (!builder) throw new Error(`No placeholder NPC model "${key}"`);
  return builder();
}
