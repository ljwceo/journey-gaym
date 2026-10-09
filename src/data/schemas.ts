import { z } from 'zod/mini';
import en from 'zod/v4/locales/en.js';

// zod/mini ships without error texts ("Invalid input"); load the English ones for the error list.
z.config(en());

/**
 * Schemas for every JSON file in public/data. They check the structure of a file (required
 * fields, types, number ranges); cross-file references are checked in DataValidator.
 * Objects are strict: an unknown (e.g. misspelled) field is an error.
 * The TypeScript types below are inferred from these schemas, so the two never drift apart.
 * Written with zod/mini (functional checks instead of method chains): same checks, ~4× smaller.
 */

const id = z.string().check(z.regex(/^[a-z0-9_]+$/, 'ids use lowercase letters, digits and _'));
/** A translation key, e.g. "npc.marco.1". Existence is checked against en.json. */
const textKey = z.string().check(z.regex(/^[a-zA-Z0-9_.]+$/, 'not a valid text key'));
/** A color token name from docs/art-style/tokens.json. Existence is checked by the validator. */
const colorToken = z.string().check(z.minLength(1));
const hexColor = z.string().check(z.regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB'));
const name = z.string().check(z.minLength(1));
// zod 4 numbers are always finite (no Infinity / NaN).
const nonNegative = z.number().check(z.nonnegative());
const positive = z.number().check(z.positive());
const posInt = z.int().check(z.positive());
const nonNegInt = z.int().check(z.nonnegative());
const fraction = range(0, 1);
const level = z.int().check(z.minimum(1), z.maximum(100));
const levelRange = z.tuple([level, level]);
const coord = range(-100_000, 100_000);
const optional = z.optional;

/** A number from min to max (inclusive). */
function range(min: number, max: number) {
  return z.number().check(z.minimum(min), z.maximum(max));
}
/** An integer from min to max (inclusive). */
function intRange(min: number, max: number) {
  return z.int().check(z.minimum(min), z.maximum(max));
}
/** `schema` with an extra upper limit, e.g. `max(positive, 20)`. */
function max(schema: typeof positive, limit: number) {
  return schema.check(z.maximum(limit));
}
/** `array` with at least `n` entries. */
function atLeast<T extends z.ZodMiniArray>(array: T, n = 1): T {
  return array.check(z.minLength(n));
}

export const pointSchema = z.strictObject({ x: coord, z: coord });

export const shapeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('circle'), x: coord, z: coord, radius: positive }),
  z.strictObject({ type: z.literal('rect'), minX: coord, minZ: coord, maxX: coord, maxZ: coord }),
  z.strictObject({
    type: z.literal('polygon'),
    points: atLeast(z.array(z.tuple([coord, coord])), 3),
  }),
]);

const itemStack = z.strictObject({ item: id, count: posInt });

// ---------------------------------------------------------------- zones.json

/**
 * A building or landmark. `model` names a placeholder shape (later a glTF file); `size` is
 * [width (x), height, depth (z)] in meters before rotation. It stands on the ground (sunk in,
 * so it never floats on a slope) unless `elevation` lifts it, e.g. a hut on top of a platform
 * with the same center. A bridge gives `connects` (two structure ids) instead of x / z: it
 * spans from the top of one to the top of the other.
 */
const structureSchema = z.strictObject({
  id,
  /** Shown above the block in debug mode (English; names are never translated). */
  name: optional(name),
  model: name,
  x: optional(coord),
  z: optional(coord),
  size: z.tuple([max(positive, 500), max(positive, 500), max(nonNegative, 500)]),
  /** Degrees around the vertical axis; a box collider needs a multiple of 90. */
  rotation: optional(range(-360, 360)),
  color: optional(colorToken),
  elevation: optional(range(0, 200)),
  /** Absolute height of the base instead of the ground (e.g. piers just above the sea). */
  y: optional(range(-200, 1000)),
  /** box = the footprint, circle = round footprint, posts = four corner posts, none = walk through. */
  collider: z.enum(['box', 'circle', 'posts', 'none']),
  connects: optional(z.tuple([id, id])),
});

/** A river: a line of points (from the source to the mouth) carved into the terrain. */
const riverSchema = z.strictObject({
  id,
  /** Width (m) of the water; the banks slope up over `bank` meters on both sides. */
  width: range(1, 200),
  bank: range(0.5, 100),
  /** How deep (m) the bed lies below the land; the water stays shallow enough to wade. */
  depth: range(0.2, 20),
  points: atLeast(z.array(z.tuple([coord, coord])), 2),
});

const zoneSchema = z.strictObject({
  id,
  name,
  levelRange,
  /** Higher priority wins where zones overlap (e.g. the Citadel inside Morvath). */
  priority: optional(z.int()),
  /** Zone is only reachable in this season. */
  season: optional(id),
  bounds: shapeSchema,
  terrainColor: colorToken,
  fogColor: colorToken,
  terrain: z.strictObject({
    baseHeight: range(-100, 500),
    amplitude: max(nonNegative, 500),
  }),
  neighbors: z.array(id),
  spawnPoints: atLeast(z.array(z.strictObject({ id, x: coord, z: coord }))),
  /** Walking within `radius` meters makes this your checkpoint (and lets you rest there). */
  checkpoint: optional(
    z.strictObject({ id, kind: id, x: coord, z: coord, radius: max(positive, 100) }),
  ),
  npcs: z.array(id),
  /** Named parts of a zone; `noScatter` keeps trees and rocks out (e.g. inside the city walls). */
  areas: z.array(z.strictObject({ id, shape: shapeSchema, noScatter: optional(z.boolean()) })),
  /** Placeholder buildings and landmarks (later real models), loaded with the chunks they touch. */
  structures: optional(z.array(structureSchema)),
  instances: z.array(z.strictObject({ id, name, entrance: pointSchema, enabled: z.boolean() })),
  /** Props (trees, rocks) scattered over the zone; `perHectare` before the quality density. */
  scatter: optional(
    z.array(
      z.strictObject({
        prop: id,
        perHectare: max(nonNegative, 2000),
        minScale: max(positive, 20),
        maxScale: max(positive, 20),
      }),
    ),
  ),
});

/** A kind of scattered prop; `model` is a placeholder model name (later a glTF file). */
const propSchema = z.strictObject({
  id,
  model: name,
  /** Trunk/stone collider radius at scale 1 (0 = walk through, e.g. reeds). */
  colliderRadius: max(nonNegative, 20),
});

export const zonesFileSchema = z.strictObject({
  world: z.strictObject({
    seed: nonNegInt,
    bounds: shapeSchema,
    chunkSize: intRange(16, 512),
    originShiftDistance: range(100, 100_000),
    outsideZoneColor: colorToken,
    outsideZoneFog: colorToken,
    terrain: z.strictObject({
      /** Water surface height; deeper than `deepWater` below it cannot be walked. */
      seaLevel: range(-100, 100),
      deepWater: range(0, 50),
      seaFloor: range(-200, 100),
      /** Meters over which the land sinks into the sea at the world edge. */
      coastWidth: range(1, 2000),
      /** Meters over which two neighboring zones blend. */
      blendWidth: range(1, 1000),
      /** Largest hills (m) and the number of finer detail layers. */
      wavelength: range(10, 5000),
      octaves: intRange(1, 8),
      /** Grid cells per chunk side: [near (active ring), far (preload ring)]. */
      lodSegments: z.tuple([intRange(2, 128), intRange(1, 128)]),
      /** Edges hang down this far, so LOD seams never show a gap. */
      skirtDepth: range(0, 100),
      /**
       * Chunks within this ring around the player have colliders. The same on every graphics
       * preset (gameplay must not depend on it); each preset's active ring must be at least this.
       */
      collisionRing: intRange(1, 8),
      /** Grid spacing (m) of the low-detail map under the whole world (shown before chunks load). */
      farGridSpacing: range(4, 512),
      /** No props within this distance of spawn points, checkpoints and instance entrances. */
      clearingRadius: range(0, 500),
      /** River water surface, in meters below the land along the river's center line. */
      riverWaterDrop: range(0, 10),
      /** Buildings are sunk this far below the lowest ground under them (never floating). */
      structureSink: range(0, 20),
    }),
    props: z.array(propSchema),
    rivers: optional(z.array(riverSchema)),
  }),
  startZone: id,
  zones: atLeast(z.array(zoneSchema)),
});

// ---------------------------------------------------------------- npcs.json

const npcSchema = z.strictObject({
  id,
  name,
  role: id,
  zone: id,
  position: pointSchema,
  interaction: z.enum(['talk', 'pet', 'none']),
  behavior: z.enum(['static', 'follow', 'wander']),
  dialogue: z.array(textKey),
  follow: optional(z.strictObject({ distance: positive, speed: max(positive, 20) })),
  wander: optional(z.strictObject({ radius: positive, speed: max(positive, 20) })),
  petText: optional(textKey),
  /** Stats come from this monster entry (e.g. Treewardens). */
  monster: optional(id),
  /** Area ids (zones.json) where this NPC can never be attacked. */
  safeAreas: optional(z.array(id)),
  /** Only present in this season. */
  season: optional(id),
});

export const npcsFileSchema = z.strictObject({
  roles: z.array(z.strictObject({ id, color: colorToken })),
  npcs: z.array(npcSchema),
});

// ---------------------------------------------------------------- player.json

export const playerFileSchema = z.strictObject({
  base: z.strictObject({ hp: positive, mana: nonNegative, energy: positive }),
  perLevel: z.strictObject({ hp: nonNegative, mana: nonNegative }),
  maxLevel: level,
  xpToNextLevel: atLeast(z.array(posInt)),
  regen: z.strictObject({
    hpPerSecondOutOfCombat: nonNegative,
    energyPerSecond: positive,
    energyDelaySeconds: max(nonNegative, 10),
  }),
  movement: z.strictObject({
    walkSpeed: max(positive, 20),
    slopeLimitDegrees: range(0, 89),
    radius: max(positive, 5),
    /** How fast the character turns towards where it walks. */
    turnSpeedDegrees: max(positive, 10_000),
  }),
  dash: z.strictObject({
    energyCost: nonNegative,
    cooldownSeconds: max(nonNegative, 30),
    distance: max(positive, 30),
    durationSeconds: max(positive, 2),
  }),
  /**
   * Third-person camera over the shoulder (like Genshin Impact). Sharpness values are per
   * second (higher = snappier). Pitch is the angle below the horizon; negative looks up.
   */
  camera: z.strictObject({
    fovDegrees: range(20, 100),
    /** Point on the character the camera orbits and looks at, in meters above the feet. */
    targetHeight: max(nonNegative, 5),
    pitchDegrees: range(-89, 89),
    minPitchDegrees: range(-89, 89),
    maxPitchDegrees: range(-89, 89),
    distance: max(positive, 100),
    minDistance: max(positive, 100),
    maxDistance: max(positive, 100),
    /** Looking up, the camera moves closer instead of going below this height. */
    minHeightAboveGround: max(nonNegative, 10),
    followSharpness: max(positive, 1000),
    zoomSharpness: max(positive, 100),
    /** Walking sideways turns the camera this fast towards the walking direction. */
    strafeFollowDegreesPerSecond: max(nonNegative, 720),
    /** Turning per moved/dragged pixel at 100% sensitivity. */
    rotateRadiansPerPixelMouse: max(positive, 1),
    rotateRadiansPerPixelTouch: max(positive, 1),
    /** Zoom change per mouse wheel notch, as a fraction of the distance. */
    zoomStepPerWheelNotch: max(positive, 1),
    /** Range of the camera sensitivity setting (fractions; 1 = 100%). */
    sensitivity: z.strictObject({ min: max(positive, 2), max: max(positive, 2) }),
  }),
  controls: z.strictObject({
    /** How far (CSS px) the joystick knob can move from where the thumb went down. */
    joystickRadiusPx: max(positive, 300),
    /** Joystick input below this fraction counts as standing still. */
    joystickDeadZone: fraction,
  }),
  sword: z.strictObject({
    fastHit: z.strictObject({
      damage: positive,
      energyCost: nonNegative,
      damagePerLevel: nonNegative,
      maxPerSecond: max(positive, 10),
    }),
    heavyHit: z.strictObject({
      damage: positive,
      energyCost: nonNegative,
      damagePerLevel: nonNegative,
      windupSeconds: max(nonNegative, 5),
    }),
    comboEveryNthHit: z.int().check(z.minimum(2)),
    comboBonus: max(nonNegative, 5),
  }),
  death: z.strictObject({ goldLossFraction: fraction }),
  lowHpThreshold: fraction,
  /** Subtle HUD (seconds): things fade in when needed and fade out again. */
  hud: z.strictObject({
    fadeSeconds: max(nonNegative, 5),
    zoneBannerSeconds: max(positive, 30),
    /** A message stays min + perCharacter × length seconds, at most max. */
    messageMinSeconds: max(positive, 30),
    messagePerCharacterSeconds: max(nonNegative, 1),
    messageMaxSeconds: max(positive, 60),
    /** Bars stay this long after they are no longer needed (e.g. energy full again). */
    barLingerSeconds: max(nonNegative, 30),
    /** After a defeated enemy: the XP bar (and the other bars) stay this long. */
    xpShowSeconds: max(positive, 30),
    goldShowSeconds: max(positive, 30),
    /** The interaction icon floats this high (m) above the ground at the object. */
    interactHeight: max(nonNegative, 20),
  }),
  start: z.strictObject({
    zone: id,
    spawnPoint: id,
    gold: nonNegInt,
    items: z.array(itemStack),
    equipment: z.record(id, id),
  }),
});

// ---------------------------------------------------------------- monsters.json

const attackSchema = z.strictObject({
  id,
  name,
  damage: nonNegative,
  hits: posInt,
  minHits: optional(posInt),
  warningSeconds: max(nonNegative, 5),
  recoverySeconds: optional(max(nonNegative, 10)),
  onlyWhenEnraged: optional(z.boolean()),
});

const monsterSchema = z.strictObject({
  id,
  name,
  levelRange,
  hp: max(positive, 1_000_000),
  damage: z.strictObject({ min: nonNegative, max: nonNegative }),
  speed: name,
  xp: nonNegInt,
  behavior: z.enum(['melee', 'ranged']),
  range: optional(positive),
  rank: optional(z.enum(['miniboss', 'boss'])),
  neutral: optional(z.boolean()),
  groupSize: optional(z.strictObject({ min: posInt, max: posInt })),
  splitsInto: optional(z.strictObject({ monster: id, count: posInt })),
  transformsFrom: optional(id),
  enrage: optional(z.strictObject({ belowHpFraction: fraction, speedFactor: positive })),
  attacks: optional(z.array(attackSchema)),
  drops: z.array(
    z.strictObject({
      item: id,
      chance: fraction,
      min: nonNegInt,
      max: nonNegInt,
    }),
  ),
});

export const monstersFileSchema = z.strictObject({
  /** Meters per second for each speed class used in the concept ("slow", "fast", ...). */
  speedClasses: z.record(z.string(), max(positive, 30)),
  monsters: z.array(monsterSchema),
});

// ---------------------------------------------------------------- items.json

const itemSchema = z.strictObject({
  id,
  name,
  type: z.enum(['currency', 'weapon', 'armor', 'crystal', 'potion', 'recipe', 'resource', 'quest']),
  slot: optional(z.enum(['hat', 'mantle', 'amulet', 'ring'])),
  rarity: id,
  tradeable: z.boolean(),
  weight: optional(max(nonNegative, 100)),
  description: optional(textKey),
  usesCharacterColor: optional(z.boolean()),
  season: optional(id),
  dryTo: optional(id),
  dryHours: optional(positive),
  weapon: optional(
    z.object({
      kind: z.enum(['sword', 'staff']),
      damageBonus: nonNegative,
      spellSlots: optional(intRange(0, 3)),
      maxCrystalSize: optional(id),
    }),
  ),
  crystal: optional(z.strictObject({ elements: atLeast(z.array(id)), size: id })),
});

export const itemsFileSchema = z.strictObject({
  rarities: z.array(
    z.strictObject({
      id,
      color: colorToken,
      glowColor: optional(colorToken),
      glowPx: nonNegative,
    }),
  ),
  crystalSizes: atLeast(z.array(id)),
  items: z.array(itemSchema),
});

// ---------------------------------------------------------------- appearance.json

const labelled = z.strictObject({ id, label: textKey });

export const appearanceFileSchema = z.strictObject({
  name: z.strictObject({ maxLength: intRange(1, 64), pattern: name }),
  bodyTypes: atLeast(z.array(z.extend(labelled, { model: name }))),
  hairstyles: atLeast(z.array(z.extend(labelled, { bodyType: id, model: name }))),
  hairColors: atLeast(z.array(z.extend(labelled, { hex: hexColor }))),
  skinTones: atLeast(z.array(z.extend(labelled, { hex: hexColor }))),
  mantleColors: atLeast(z.array(z.extend(labelled, { color: colorToken, embroidery: colorToken }))),
  defaults: z.strictObject({
    bodyType: id,
    hairstyle: id,
    hairColor: id,
    skinTone: id,
    mantleColor: id,
  }),
});

// ---------------------------------------------------------------- quality.json

export const qualityLevels = ['low', 'mid', 'high'] as const;
export const qualityLevelSchema = z.enum(qualityLevels);

export const qualityFileSchema = z.strictObject({
  presets: z.array(
    z.strictObject({
      id: qualityLevelSchema,
      pixelRatio: z.strictObject({ min: max(positive, 4), max: max(positive, 4) }),
      shadows: z.enum(['off', 'simple', 'soft']),
      shadowMapSize: intRange(0, 8192),
      antialias: z.enum(['off', 'fxaa', 'msaa']),
      chunkRings: z.strictObject({
        active: intRange(1, 8),
        preload: intRange(1, 12),
        unload: intRange(1, 16),
      }),
      fogFar: max(positive, 5000),
      density: z.strictObject({ grass: fraction, props: fraction, effects: fraction }),
      lodBias: max(positive, 4),
      fpsTarget: z.union([z.literal(60), z.literal(120)]),
    }),
  ),
  default: qualityLevelSchema,
  benchmark: z.strictObject({
    durationSeconds: max(positive, 30),
    warmupSeconds: max(nonNegative, 10),
    highMaxFrameMs: positive,
    midMaxFrameMs: positive,
  }),
  autoDowngrade: z.strictObject({
    belowFps: max(positive, 240),
    windowSeconds: max(positive, 60),
    graceSecondsAfterChange: max(nonNegative, 60),
  }),
});

// ---------------------------------------------------------------- seasons.json

export const seasonsFileSchema = z.strictObject({
  order: atLeast(z.array(id)),
  firstWeekSeason: id,
  alwaysAvailable: z.array(id),
  seasons: z.array(
    z.strictObject({
      id,
      label: textKey,
      bonus: z.strictObject({ element: id, percent: range(0, 1000) }),
      resources: z.array(id),
      extra: textKey,
    }),
  ),
});

// ---------------------------------------------------------------- triggers.json

/** Data-driven conditions, e.g. "after quest X and level 5". Kept small; grows with later phases. */
export type Condition =
  | { type: 'always'; note?: string | undefined }
  | { type: 'never'; note?: string | undefined }
  | { type: 'level'; min: number; note?: string | undefined }
  | { type: 'questCompleted'; quest: string; note?: string | undefined }
  | { type: 'all'; of: Condition[]; note?: string | undefined }
  | { type: 'any'; of: Condition[]; note?: string | undefined };

const note = optional(z.string());
export const conditionSchema: z.ZodMiniType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('always'), note }),
    z.strictObject({ type: z.literal('never'), note }),
    z.strictObject({ type: z.literal('level'), min: level, note }),
    z.strictObject({ type: z.literal('questCompleted'), quest: id, note }),
    z.strictObject({ type: z.literal('all'), of: z.array(conditionSchema), note }),
    z.strictObject({ type: z.literal('any'), of: z.array(conditionSchema), note }),
  ]),
);

export const triggersFileSchema = z.strictObject({
  conditions: z.record(name, conditionSchema),
  triggers: z.array(
    z.strictObject({
      id,
      zone: id,
      kind: z.enum(['place', 'gate']),
      shape: shapeSchema,
      firstVisitText: optional(textKey),
      condition: optional(name),
      blockedText: optional(textKey),
    }),
  ),
});

// ---------------------------------------------------------------- quests.json

const objectiveSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('talk'), npc: id }),
  z.strictObject({ type: z.literal('find'), item: id, count: posInt }),
  z.strictObject({ type: z.literal('kill'), monster: id, count: posInt }),
  z.strictObject({
    type: z.literal('deliver'),
    item: id,
    count: posInt,
    npc: id,
  }),
  z.strictObject({ type: z.literal('boss'), monster: id }),
]);

export const questsFileSchema = z.strictObject({
  quests: z.array(
    z.strictObject({
      id,
      name,
      kind: z.enum(['main', 'side']),
      giver: optional(id),
      description: textKey,
      objectives: atLeast(z.array(objectiveSchema)),
      requires: z.strictObject({
        level: optional(level),
        quests: optional(z.array(id)),
        items: optional(z.array(itemStack)),
      }),
      rewards: z.strictObject({
        xp: nonNegInt,
        gold: nonNegInt,
        items: z.array(itemStack),
      }),
    }),
  ),
});

// ---------------------------------------------------------------- spells.json

const powerCurve = atLeast(
  z.array(z.strictObject({ fromLevel: level, toLevel: level, factor: max(positive, 10) })),
);

export const spellsFileSchema = z.strictObject({
  elements: atLeast(z.array(z.strictObject({ id, name, color: colorToken }))),
  powerCurves: z.record(z.string(), powerCurve),
  maxSpellSlots: intRange(1, 10),
  spells: z.array(
    z.strictObject({
      id,
      name,
      element: id,
      manaCost: nonNegative,
      cooldownSeconds: max(nonNegative, 120),
      damage: nonNegative,
      range: max(positive, 100),
      usesPerLevel: posInt,
      perLevel: z.record(z.string(), z.number()),
    }),
  ),
});

// ---------------------------------------------------------------- skills.json

export const skillsFileSchema = z.strictObject({
  rules: z.strictObject({
    pointsPerLevel: z.strictObject({
      mage: z.int().check(z.minimum(0)),
      sword: z.int().check(z.minimum(0)),
    }),
    firstPointLevel: level,
    tierUnlockPoints: z.record(z.string(), nonNegInt),
    classChoiceLevel: level,
  }),
  core: z.strictObject({
    opposites: z.array(z.strictObject({ a: id, b: id, maxCombined: posInt })),
    stats: z.array(
      z.strictObject({
        id,
        name,
        maxPoints: posInt,
        stat: name,
        perPoint: positive,
        mageOnly: optional(z.boolean()),
      }),
    ),
  }),
  branches: z.array(
    z.strictObject({
      id,
      name,
      requires: z.enum(['sword', 'element', 'class', 'none']),
      element: optional(id),
    }),
  ),
  skills: z.array(
    z.strictObject({
      id,
      name,
      branch: id,
      tier: intRange(1, 3),
      maxPoints: posInt,
    }),
  ),
  perks: z.array(
    z.strictObject({
      id,
      name,
      path: optional(z.enum(['sword', 'light', 'dark'])),
      stat: name,
      value: z.number(),
    }),
  ),
});

// ---------------------------------------------------------------- combos.json

export const combosFileSchema = z.strictObject({
  rules: z.strictObject({
    windowSeconds: max(positive, 10),
    targetCooldownSeconds: max(nonNegative, 60),
    bossCrowdControlFactor: fraction,
  }),
  combos: z.array(
    z.strictObject({
      id,
      name,
      elements: z.tuple([id, id]),
      role: z.enum(['damage', 'control', 'support']),
      effect: name,
      value: nonNegative,
      durationSeconds: max(nonNegative, 60),
      radius: max(nonNegative, 50),
      crowdControl: optional(z.boolean()),
    }),
  ),
});

// ---------------------------------------------------------------- cutscenes.json

export const cutscenesFileSchema = z.strictObject({
  cutscenes: z.array(
    z.strictObject({
      id,
      skippable: z.boolean(),
      playOnce: optional(z.boolean()),
      panels: atLeast(
        z.array(
          z.strictObject({
            id,
            narration: optional(textKey),
            lines: optional(z.array(z.strictObject({ speaker: name, text: textKey }))),
            shake: optional(z.boolean()),
          }),
        ),
      ),
    }),
  ),
});

// ---------------------------------------------------------------- manifest

/** Every data file the game loads at boot, keyed by name (file = public/data/<name>.json). */
export const dataSchemas = {
  zones: zonesFileSchema,
  npcs: npcsFileSchema,
  player: playerFileSchema,
  monsters: monstersFileSchema,
  items: itemsFileSchema,
  appearance: appearanceFileSchema,
  quality: qualityFileSchema,
  seasons: seasonsFileSchema,
  triggers: triggersFileSchema,
  quests: questsFileSchema,
  spells: spellsFileSchema,
  skills: skillsFileSchema,
  combos: combosFileSchema,
  cutscenes: cutscenesFileSchema,
} as const;

export type DataFileName = keyof typeof dataSchemas;
export const dataFileNames = Object.keys(dataSchemas) as DataFileName[];
