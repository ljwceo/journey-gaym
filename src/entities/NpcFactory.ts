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

/**
 * Biscuit: a donkey with saddlebags. Body, legs, neck and long ears are tinted; the muzzle,
 * mane, hooves and the bags are not (the bags show it is a pack animal).
 */
function donkey(): NpcModel {
  const leg = (): BufferGeometry => new CylinderGeometry(0.07, 0.06, 0.62, 6);
  const ear = (): BufferGeometry => new ConeGeometry(0.06, 0.32, 5);
  const fur = colored([
    [new CapsuleGeometry(0.3, 0.75, 4, 10).rotateX(Math.PI / 2), WHITE, 0, 0.92, 0],
    [new CylinderGeometry(0.13, 0.19, 0.55, 8).rotateX(0.7), WHITE, 0, 1.22, 0.52],
    [new BoxGeometry(0.24, 0.26, 0.42), WHITE, 0, 1.42, 0.78],
    [ear(), WHITE, -0.08, 1.68, 0.66],
    [ear(), WHITE, 0.08, 1.68, 0.66],
    [leg(), WHITE, -0.17, 0.31, 0.38],
    [leg(), WHITE, 0.17, 0.31, 0.38],
    [leg(), WHITE, -0.17, 0.31, -0.38],
    [leg(), WHITE, 0.17, 0.31, -0.38],
    [new CylinderGeometry(0.03, 0.02, 0.4, 5).rotateX(-0.4), WHITE, 0, 0.92, -0.62],
  ]);
  const bag = (): BufferGeometry => new BoxGeometry(0.16, 0.34, 0.46);
  const hoof = (): BufferGeometry => new CylinderGeometry(0.065, 0.075, 0.07, 6);
  const eye = (): BufferGeometry => new SphereGeometry(0.025, 6, 4);
  const gear = colored([
    [new BoxGeometry(0.22, 0.18, 0.2), 0xd8cfc2, 0, 1.36, 0.98],
    [new BoxGeometry(0.06, 0.2, 0.5).rotateX(0.7), palette.nachtinkt, 0, 1.36, 0.5],
    [eye(), EYES, -0.125, 1.5, 0.86],
    [eye(), EYES, 0.125, 1.5, 0.86],
    [new BoxGeometry(0.66, 0.06, 0.6), palette.schemerviolet, 0, 1.21, 0],
    [bag(), 0x8a6a48, -0.38, 0.98, 0],
    [bag(), 0x8a6a48, 0.38, 0.98, 0],
    [hoof(), palette.nachtinkt, -0.17, 0.035, 0.38],
    [hoof(), palette.nachtinkt, 0.17, 0.035, 0.38],
    [hoof(), palette.nachtinkt, -0.17, 0.035, -0.38],
    [hoof(), palette.nachtinkt, 0.17, 0.035, -0.38],
  ]);
  return {
    parts: [
      { geometry: fur, tinted: true },
      { geometry: gear, tinted: false },
    ],
    height: 1.85,
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
  'placeholder:donkey': donkey,
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
