import {
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  type Object3D,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  BoxGeometry,
} from 'three';
import type { AppearanceFile } from '../data/types';
import { hexToNumber, palette, resolveColorToken } from '../render/palette';
import type { Appearance } from '../scenes/creator';

/**
 * Placeholder character models (capsule body, sphere head, simple hair shapes, a mantle with
 * gold embroidery). appearance.json names a model per body type and hairstyle
 * ("placeholder:hair_bob"); this factory turns those names into shapes. When real glTF models
 * arrive, only this file changes: the rest of the game keeps calling `setAppearance`.
 *
 * Sizes in meters; the feet stand at y = 0 and the character faces +z.
 */

const HEAD_Y = 1.5;
const HEAD_RADIUS = 0.2;

/** The materials a part may use; colors change live without new objects. */
interface Materials {
  skin: MeshLambertMaterial;
  hair: MeshLambertMaterial;
  mantle: MeshLambertMaterial;
  embroidery: MeshLambertMaterial;
  tunic: MeshLambertMaterial;
  gear: MeshLambertMaterial;
  eyes: MeshLambertMaterial;
}

type PartBuilder = (m: Materials) => Object3D;

function mesh(geometry: BufferGeometry, material: MeshLambertMaterial, x = 0, y = 0, z = 0): Mesh {
  const result = new Mesh(geometry, material);
  result.position.set(x, y, z);
  return result;
}

function group(...children: Object3D[]): Group {
  const result = new Group();
  result.add(...children);
  return result;
}

// ---------------------------------------------------------------- bodies

function body(radius: number, length: number, shoulder: number): PartBuilder {
  return (m) => {
    const torso = mesh(new CapsuleGeometry(radius, length, 6, 16), m.tunic, 0, radius + length / 2);
    const hand = new SphereGeometry(0.07, 10, 8);
    const handY = 0.78;
    return group(
      torso,
      mesh(hand, m.skin, -shoulder, handY, 0.04),
      mesh(hand, m.skin, shoulder, handY, 0.04),
    );
  };
}

// ---------------------------------------------------------------- hair

/** The top of the head; tilted back so the forehead stays free and the back is covered. */
function cap(m: Materials, tilt = -0.3): Mesh {
  const result = mesh(
    new SphereGeometry(HEAD_RADIUS * 1.08, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42),
    m.hair,
    0,
    HEAD_Y,
    0,
  );
  result.rotation.x = tilt;
  return result;
}

/** A shell around the head with an opening for the face (sphere phi π/2 points to +z). */
function shell(m: Materials, depth: number): Mesh {
  const gap = 0.65;
  const geometry = new SphereGeometry(
    HEAD_RADIUS * 1.12,
    20,
    12,
    Math.PI / 2 + gap,
    Math.PI * 2 - gap * 2,
    0,
    Math.PI * depth,
  );
  return mesh(geometry, m.hair, 0, HEAD_Y, 0);
}

const hairBuilders: Record<string, PartBuilder> = {
  'placeholder:hair_short': (m) => group(cap(m)),
  'placeholder:hair_swept': (m) => {
    const back = mesh(new SphereGeometry(0.12, 12, 8), m.hair, 0, HEAD_Y + 0.12, -0.14);
    back.scale.set(1.3, 0.7, 1.4);
    return group(cap(m, -0.5), back);
  },
  'placeholder:hair_messy': (m) => {
    const tuft = new SphereGeometry(0.07, 8, 6);
    // Fixed spots on top of the head (not random, so it looks the same every time).
    const spots: [number, number, number][] = [
      [0.1, 0.17, 0.06],
      [-0.09, 0.18, 0.04],
      [0.02, 0.21, -0.06],
      [-0.12, 0.12, -0.1],
      [0.13, 0.1, -0.09],
    ];
    return group(cap(m), ...spots.map(([x, y, z]) => mesh(tuft, m.hair, x, HEAD_Y + y, z)));
  },
  'placeholder:hair_long': (m) => {
    const back = mesh(
      new CylinderGeometry(0.21, 0.24, 0.5, 16, 1, true, Math.PI / 2, Math.PI),
      m.hair,
      0,
      HEAD_Y - 0.2,
      -0.02,
    );
    return group(cap(m), back);
  },
  'placeholder:hair_ponytail': (m) => {
    const tail = mesh(new CapsuleGeometry(0.06, 0.28, 4, 8), m.hair, 0, HEAD_Y - 0.12, -0.27);
    tail.rotation.x = 0.35;
    return group(
      cap(m),
      mesh(new SphereGeometry(0.06, 10, 8), m.hair, 0, HEAD_Y + 0.04, -0.22),
      tail,
    );
  },
  'placeholder:hair_bob': (m) => group(cap(m), shell(m, 0.62)),
  'placeholder:hair_braid': (m) => {
    const bead = new SphereGeometry(0.055, 10, 8);
    const beads: Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      beads.push(mesh(bead, m.hair, 0, HEAD_Y - 0.05 - i * 0.09, -0.22 - i * 0.01));
    }
    return group(cap(m), ...beads);
  },
  'placeholder:hair_bun': (m) =>
    group(cap(m), mesh(new SphereGeometry(0.1, 14, 10), m.hair, 0, HEAD_Y + 0.17, -0.12)),
};

const bodyBuilders: Record<string, PartBuilder> = {
  'placeholder:body_male': body(0.25, 0.8, 0.32),
  'placeholder:body_female': body(0.215, 0.82, 0.28),
};

/** True when this factory can build the model named in appearance.json. */
export function hasPlaceholderModel(key: string): boolean {
  return key in hairBuilders || key in bodyBuilders;
}

// ---------------------------------------------------------------- fixed parts

/** Head with two small eyes, so you can see which way the character faces. */
function head(m: Materials): Object3D {
  const eye = new SphereGeometry(0.025, 8, 6);
  return group(
    mesh(new SphereGeometry(HEAD_RADIUS, 20, 14), m.skin, 0, HEAD_Y, 0),
    mesh(eye, m.eyes, -0.07, HEAD_Y + 0.01, HEAD_RADIUS * 0.93),
    mesh(eye, m.eyes, 0.07, HEAD_Y + 0.01, HEAD_RADIUS * 0.93),
  );
}

/**
 * The travel mantle: an open cone over the back and sides, gold hem and collar, and a gold
 * four-pointed star on the back (style guide: always gold embroidery).
 */
function mantle(m: Materials): Object3D {
  const top = 0.2;
  const bottom = 0.42;
  const height = 1.05;
  const centerY = 0.8;
  // Theta 0 points to +z (front); leave the front open.
  const thetaStart = Math.PI * 0.4;
  const thetaLength = Math.PI * 1.2;
  const cloth = mesh(
    new CylinderGeometry(top, bottom, height, 24, 1, true, thetaStart, thetaLength),
    m.mantle,
    0,
    centerY,
  );
  const hem = mesh(
    new CylinderGeometry(bottom * 0.985, bottom * 1.01, 0.06, 24, 1, true, thetaStart, thetaLength),
    m.embroidery,
    0,
    centerY - height / 2 + 0.03,
  );
  const collar = mesh(
    new TorusGeometry(top + 0.01, 0.03, 6, 20),
    m.embroidery,
    0,
    centerY + height / 2,
  );
  collar.rotation.x = Math.PI / 2;
  const starY = 0.9;
  const radiusAtStar = bottom + (top - bottom) * ((starY - (centerY - height / 2)) / height);
  const star = mesh(new OctahedronGeometry(0.09), m.embroidery, 0, starY, -radiusAtStar - 0.012);
  star.scale.set(1, 1.3, 0.15);
  return group(cloth, hem, collar, star);
}

/** The old sword from the start items, at the left hip. */
function sword(m: Materials): Object3D {
  const blade = mesh(new BoxGeometry(0.04, 0.62, 0.015), m.gear, 0, -0.3, 0);
  const guard = mesh(new BoxGeometry(0.16, 0.03, 0.03), m.gear, 0, 0.02, 0);
  const hilt = mesh(new BoxGeometry(0.03, 0.12, 0.03), m.tunic, 0, 0.09, 0);
  const result = group(blade, guard, hilt);
  result.name = 'sword';
  // Y before X: the blade first tilts (X), then sweeps around the body (Y) in a swing.
  result.rotation.order = 'YXZ';
  setSwordPose(result, 'rest', 0);
  return result;
}

/** How the sword is held: at the hip, slashing, winding up over the head, or chopping down. */
export type SwordPose = 'rest' | 'fast' | 'windup' | 'heavy';

/** Puts the sword in a pose; `t` (0–1) is how far along the swing is. */
function setSwordPose(sword: Object3D, pose: SwordPose, t: number): void {
  const e = t * t * (3 - 2 * t);
  switch (pose) {
    case 'rest':
      sword.position.set(-0.3, 0.72, 0.05);
      sword.rotation.set(0.2, 0, -0.25);
      break;
    case 'fast':
      // Blade forward at chest height, sweeping from the right side to the left.
      sword.position.set(0, 1.0, 0.28);
      sword.rotation.set(-Math.PI / 2, -1.3 + 2.6 * e, 0);
      break;
    case 'windup':
      // Raised further and further over the head, blade pointing back.
      sword.position.set(-0.1, 0.9 + 0.55 * e, 0.1);
      sword.rotation.set(0.2 + (Math.PI * 0.85 - 0.2) * e, 0, 0);
      break;
    case 'heavy':
      // Chop from over the head down in front.
      sword.position.set(0, 1.45 - 0.4 * e, 0.1 + 0.25 * e);
      sword.rotation.set(Math.PI * 0.85 - Math.PI * 1.2 * e, 0, 0);
      break;
  }
}

// ---------------------------------------------------------------- model

/** A placeholder character whose look follows an Appearance. */
export class CharacterModel {
  readonly root = new Group();
  private readonly materials: Materials;
  /** Built on first use and kept, so switching back and forth is instant. */
  private readonly variants = new Map<string, Object3D>();
  private body: Object3D | null = null;
  private hair: Object3D | null = null;
  private readonly sword: Object3D;

  constructor(private readonly data: AppearanceFile) {
    const material = (color: number) => new MeshLambertMaterial({ color });
    this.materials = {
      skin: material(palette.zonsondergang),
      hair: material(palette.steengrijs),
      mantle: material(palette.nachtinkt),
      embroidery: material(palette.ornamentgoud),
      tunic: material(palette.steengrijs),
      gear: material(palette.mistpaars),
      eyes: material(palette.nachtinkt),
    };
    // Open shapes (mantle, long hair, bob) are seen from inside too.
    this.materials.mantle.side = DoubleSide;
    this.materials.hair.side = DoubleSide;
    this.sword = sword(this.materials);
    this.root.add(head(this.materials), mantle(this.materials), this.sword);
    this.root.name = 'character';
  }

  setAppearance(appearance: Appearance): void {
    const d = this.data;
    const bodyType = d.bodyTypes.find((entry) => entry.id === appearance.bodyType);
    const hairstyle = d.hairstyles.find((entry) => entry.id === appearance.hairstyle);
    this.body = this.swap(this.body, bodyType?.model ?? 'placeholder:body_male', bodyBuilders);
    this.hair = this.swap(this.hair, hairstyle?.model ?? 'placeholder:hair_short', hairBuilders);

    const m = this.materials;
    const hairColor = d.hairColors.find((entry) => entry.id === appearance.hairColor);
    const skin = d.skinTones.find((entry) => entry.id === appearance.skinTone);
    const mantleColor = d.mantleColors.find((entry) => entry.id === appearance.mantleColor);
    if (hairColor) m.hair.color.setHex(hexToNumber(hairColor.hex));
    if (skin) m.skin.color.setHex(hexToNumber(skin.hex));
    if (mantleColor) {
      m.mantle.color.setHex(resolveColorToken(mantleColor.color));
      m.embroidery.color.setHex(resolveColorToken(mantleColor.embroidery));
    }
  }

  /** Shows a sword swing (`t` 0–1 along the swing); 'rest' puts it back at the hip. */
  setSwordPose(pose: SwordPose, t: number): void {
    setSwordPose(this.sword, pose, t);
  }

  /** Frees every geometry and material (call when the model leaves the scene). */
  dispose(): void {
    const geometries = new Set<BufferGeometry>();
    const collect = (object: Object3D) =>
      object.traverse((child) => {
        if (child instanceof Mesh) geometries.add(child.geometry as BufferGeometry);
      });
    collect(this.root);
    // Variants that are not attached right now still own geometry.
    for (const variant of this.variants.values()) collect(variant);
    for (const geometry of geometries) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.variants.clear();
    this.root.removeFromParent();
    this.root.clear();
  }

  private swap(
    current: Object3D | null,
    key: string,
    builders: Record<string, PartBuilder>,
  ): Object3D {
    let next = this.variants.get(key);
    if (!next) {
      const builder = builders[key];
      if (!builder) throw new Error(`No placeholder model "${key}"`);
      next = builder(this.materials);
      this.variants.set(key, next);
    }
    if (current !== next) {
      current?.removeFromParent();
      this.root.add(next);
    }
    return next;
  }
}
