import { z } from 'zod';

/**
 * Schemas for every JSON file in public/data. They check the structure of a file (required
 * fields, types, number ranges); cross-file references are checked in DataValidator.
 * Objects are strict: an unknown (e.g. misspelled) field is an error.
 * The TypeScript types below are inferred from these schemas, so the two never drift apart.
 */

const id = z.string().regex(/^[a-z0-9_]+$/, 'ids use lowercase letters, digits and _');
/** A translation key, e.g. "npc.marco.1". Existence is checked against en.json. */
const textKey = z.string().regex(/^[a-zA-Z0-9_.]+$/, 'not a valid text key');
/** A color token name from docs/art-style/tokens.json. Existence is checked by the validator. */
const colorToken = z.string().min(1);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB');
const nonNegative = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const fraction = z.number().min(0).max(1);
const level = z.number().int().min(1).max(100);
const levelRange = z.tuple([level, level]);
const coord = z.number().finite().min(-100_000).max(100_000);

export const pointSchema = z.strictObject({ x: coord, z: coord });

export const shapeSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('circle'), x: coord, z: coord, radius: positive }),
  z.strictObject({ type: z.literal('rect'), minX: coord, minZ: coord, maxX: coord, maxZ: coord }),
  z.strictObject({ type: z.literal('polygon'), points: z.array(z.tuple([coord, coord])).min(3) }),
]);

const itemStack = z.strictObject({ item: id, count: z.number().int().positive() });

// ---------------------------------------------------------------- zones.json

const zoneSchema = z.strictObject({
  id,
  name: z.string().min(1),
  levelRange,
  /** Higher priority wins where zones overlap (e.g. the Citadel inside Morvath). */
  priority: z.number().int().optional(),
  /** Zone is only reachable in this season. */
  season: id.optional(),
  bounds: shapeSchema,
  terrainColor: colorToken,
  fogColor: colorToken,
  terrain: z.strictObject({
    baseHeight: z.number().min(-100).max(500),
    amplitude: nonNegative.max(500),
    /** Size (m) of the largest hills: bigger is smoother. */
    scale: z.number().min(20).max(5000),
  }),
  neighbors: z.array(id),
  spawnPoints: z.array(z.strictObject({ id, x: coord, z: coord })).min(1),
  checkpoint: z.strictObject({ id, kind: id, x: coord, z: coord }).optional(),
  npcs: z.array(id),
  areas: z.array(z.strictObject({ id, shape: shapeSchema })),
  instances: z.array(
    z.strictObject({ id, name: z.string().min(1), entrance: pointSchema, enabled: z.boolean() }),
  ),
  /** Props scattered over this zone: how many of each per chunk (before rejecting water etc.). */
  scatter: z.array(z.strictObject({ prop: id, perChunk: nonNegative })),
  /** Area ids of this zone where nothing is scattered (e.g. the city of Greyhaven). */
  scatterExclude: z.array(id),
});

/** A kind of scattered object (trees, rocks, bushes): drawn with one InstancedMesh. */
const propSchema = z.strictObject({
  id,
  /** Placeholder model id; real models replace only the factory behind it. */
  model: z.string().regex(/^placeholder:[a-z0-9_]+$/),
  /** Color tokens for the model's parts (e.g. trunk, crown). */
  colors: z.array(colorToken).min(1),
  /** Collider radius (m) at scale 1; 0 = no collider (walk through it). */
  colliderRadius: nonNegative.max(20),
  scale: z.tuple([positive, positive]),
  maxPerChunk: z.number().int().min(1).max(512),
  /** Never placed lower than this above the sea (m); negative allows it in shallow water. */
  minHeightAboveSea: z.number().min(-50).max(500),
  /** Decoration only: the graphics preset thins it out. Never has a collider. */
  decor: z.boolean(),
});

export const zonesFileSchema = z.strictObject({
  world: z.strictObject({
    seed: z.number().int().nonnegative(),
    bounds: shapeSchema,
    chunkSize: z.number().int().min(16).max(512),
    originShiftDistance: z.number().min(100).max(100_000),
    outsideZoneColor: colorToken,
    outsideZoneFog: colorToken,
    terrain: z.strictObject({
      /** Width (m) over which neighboring zones (and the coast) blend into each other. */
      blendWidth: z.number().min(1).max(1000),
      seaLevel: z.number().min(-100).max(100),
      /** Ground height outside every zone (the sea floor). */
      seaFloor: z.number().min(-500).max(100),
      /** Water deeper than this (m) blocks walking. */
      deepWaterDepth: nonNegative.max(50),
      /** How far (m) chunk edges hang down to hide cracks between detail levels. */
      skirtDepth: positive.max(100),
    }),
    props: z.array(propSchema),
  }),
  startZone: id,
  zones: z.array(zoneSchema).min(1),
});

// ---------------------------------------------------------------- npcs.json

const npcSchema = z.strictObject({
  id,
  name: z.string().min(1),
  role: id,
  zone: id,
  position: pointSchema,
  interaction: z.enum(['talk', 'pet', 'none']),
  behavior: z.enum(['static', 'follow', 'wander']),
  dialogue: z.array(textKey),
  follow: z.strictObject({ distance: positive, speed: positive.max(20) }).optional(),
  wander: z.strictObject({ radius: positive, speed: positive.max(20) }).optional(),
  petText: textKey.optional(),
  /** Stats come from this monster entry (e.g. Treewardens). */
  monster: id.optional(),
  /** Area ids (zones.json) where this NPC can never be attacked. */
  safeAreas: z.array(id).optional(),
  /** Only present in this season. */
  season: id.optional(),
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
  xpToNextLevel: z.array(z.number().int().positive()).min(1),
  regen: z.strictObject({
    hpPerSecondOutOfCombat: nonNegative,
    energyPerSecond: positive,
    energyDelaySeconds: nonNegative.max(10),
  }),
  movement: z.strictObject({
    walkSpeed: positive.max(20),
    slopeLimitDegrees: z.number().min(0).max(89),
    radius: positive.max(5),
    /** How fast the character turns towards where it walks. */
    turnSpeedDegrees: positive.max(10_000),
  }),
  dash: z.strictObject({
    energyCost: nonNegative,
    cooldownSeconds: nonNegative.max(30),
    distance: positive.max(30),
    durationSeconds: positive.max(2),
  }),
  /**
   * Third-person camera over the shoulder (like Genshin Impact). Sharpness values are per
   * second (higher = snappier). Pitch is the angle below the horizon; negative looks up.
   */
  camera: z.strictObject({
    fovDegrees: z.number().min(20).max(100),
    /** Point on the character the camera orbits and looks at, in meters above the feet. */
    targetHeight: nonNegative.max(5),
    pitchDegrees: z.number().min(-89).max(89),
    minPitchDegrees: z.number().min(-89).max(89),
    maxPitchDegrees: z.number().min(-89).max(89),
    distance: positive.max(100),
    minDistance: positive.max(100),
    maxDistance: positive.max(100),
    /** Looking up, the camera moves closer instead of going below this height. */
    minHeightAboveGround: nonNegative.max(10),
    followSharpness: positive.max(1000),
    zoomSharpness: positive.max(100),
    /** Walking sideways turns the camera this fast towards the walking direction. */
    strafeFollowDegreesPerSecond: nonNegative.max(720),
    /** Turning per moved/dragged pixel at 100% sensitivity. */
    rotateRadiansPerPixelMouse: positive.max(1),
    rotateRadiansPerPixelTouch: positive.max(1),
    /** Zoom change per mouse wheel notch, as a fraction of the distance. */
    zoomStepPerWheelNotch: positive.max(1),
    /** Range of the camera sensitivity setting (fractions; 1 = 100%). */
    sensitivity: z.strictObject({ min: positive.max(2), max: positive.max(2) }),
  }),
  controls: z.strictObject({
    /** How far (CSS px) the joystick knob can move from where the thumb went down. */
    joystickRadiusPx: positive.max(300),
    /** Joystick input below this fraction counts as standing still. */
    joystickDeadZone: fraction,
  }),
  sword: z.strictObject({
    fastHit: z.strictObject({
      damage: positive,
      energyCost: nonNegative,
      damagePerLevel: nonNegative,
      maxPerSecond: positive.max(10),
    }),
    heavyHit: z.strictObject({
      damage: positive,
      energyCost: nonNegative,
      damagePerLevel: nonNegative,
      windupSeconds: nonNegative.max(5),
    }),
    comboEveryNthHit: z.number().int().min(2),
    comboBonus: nonNegative.max(5),
  }),
  death: z.strictObject({ goldLossFraction: fraction }),
  lowHpThreshold: fraction,
  start: z.strictObject({
    zone: id,
    spawnPoint: id,
    gold: z.number().int().nonnegative(),
    items: z.array(itemStack),
    equipment: z.record(id, id),
  }),
});

// ---------------------------------------------------------------- monsters.json

const attackSchema = z.strictObject({
  id,
  name: z.string().min(1),
  damage: nonNegative,
  hits: z.number().int().positive(),
  minHits: z.number().int().positive().optional(),
  warningSeconds: nonNegative.max(5),
  recoverySeconds: nonNegative.max(10).optional(),
  onlyWhenEnraged: z.boolean().optional(),
});

const monsterSchema = z.strictObject({
  id,
  name: z.string().min(1),
  levelRange,
  hp: positive.max(1_000_000),
  damage: z.strictObject({ min: nonNegative, max: nonNegative }),
  speed: z.string().min(1),
  xp: z.number().int().nonnegative(),
  behavior: z.enum(['melee', 'ranged']),
  range: positive.optional(),
  rank: z.enum(['miniboss', 'boss']).optional(),
  neutral: z.boolean().optional(),
  groupSize: z
    .strictObject({ min: z.number().int().positive(), max: z.number().int().positive() })
    .optional(),
  splitsInto: z.strictObject({ monster: id, count: z.number().int().positive() }).optional(),
  transformsFrom: id.optional(),
  enrage: z.strictObject({ belowHpFraction: fraction, speedFactor: positive }).optional(),
  attacks: z.array(attackSchema).optional(),
  drops: z.array(
    z.strictObject({
      item: id,
      chance: fraction,
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
    }),
  ),
});

export const monstersFileSchema = z.strictObject({
  /** Meters per second for each speed class used in the concept ("slow", "fast", ...). */
  speedClasses: z.record(z.string(), positive.max(30)),
  monsters: z.array(monsterSchema),
});

// ---------------------------------------------------------------- items.json

const itemSchema = z.strictObject({
  id,
  name: z.string().min(1),
  type: z.enum(['currency', 'weapon', 'armor', 'crystal', 'potion', 'recipe', 'resource', 'quest']),
  slot: z.enum(['hat', 'mantle', 'amulet', 'ring']).optional(),
  rarity: id,
  tradeable: z.boolean(),
  weight: nonNegative.max(100).optional(),
  description: textKey.optional(),
  usesCharacterColor: z.boolean().optional(),
  season: id.optional(),
  dryTo: id.optional(),
  dryHours: positive.optional(),
  weapon: z
    .object({
      kind: z.enum(['sword', 'staff']),
      damageBonus: nonNegative,
      spellSlots: z.number().int().min(0).max(3).optional(),
      maxCrystalSize: id.optional(),
    })
    .optional(),
  crystal: z.strictObject({ elements: z.array(id).min(1), size: id }).optional(),
});

export const itemsFileSchema = z.strictObject({
  rarities: z.array(
    z.strictObject({
      id,
      color: colorToken,
      glowColor: colorToken.optional(),
      glowPx: nonNegative,
    }),
  ),
  crystalSizes: z.array(id).min(1),
  items: z.array(itemSchema),
});

// ---------------------------------------------------------------- appearance.json

const labelled = z.strictObject({ id, label: textKey });

export const appearanceFileSchema = z.strictObject({
  name: z.strictObject({ maxLength: z.number().int().min(1).max(64), pattern: z.string().min(1) }),
  bodyTypes: z.array(labelled.extend({ model: z.string().min(1) })).min(1),
  hairstyles: z.array(labelled.extend({ bodyType: id, model: z.string().min(1) })).min(1),
  hairColors: z.array(labelled.extend({ hex: hexColor })).min(1),
  skinTones: z.array(labelled.extend({ hex: hexColor })).min(1),
  mantleColors: z.array(labelled.extend({ color: colorToken, embroidery: colorToken })).min(1),
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
      pixelRatio: z.strictObject({ min: positive.max(4), max: positive.max(4) }),
      shadows: z.enum(['off', 'simple', 'soft']),
      shadowMapSize: z.number().int().min(0).max(8192),
      antialias: z.enum(['off', 'fxaa', 'msaa']),
      chunkRings: z.strictObject({
        active: z.number().int().min(1).max(8),
        preload: z.number().int().min(1).max(12),
        unload: z.number().int().min(1).max(16),
      }),
      fogFar: positive.max(5000),
      density: z.strictObject({ grass: fraction, props: fraction, effects: fraction }),
      fpsTarget: z.union([z.literal(60), z.literal(120)]),
      /** Chunks up to this ring use the detailed terrain mesh; further ones the coarse one. */
      lodRing: z.number().int().min(0).max(12),
      /** Terrain grid cells per chunk side for the detailed and the coarse mesh. */
      terrainSegments: z.strictObject({
        near: z.number().int().min(2).max(128),
        far: z.number().int().min(1).max(128),
      }),
    }),
  ),
  default: qualityLevelSchema,
  benchmark: z.strictObject({
    durationSeconds: positive.max(30),
    warmupSeconds: nonNegative.max(10),
    highMaxFrameMs: positive,
    midMaxFrameMs: positive,
  }),
  autoDowngrade: z.strictObject({
    belowFps: positive.max(240),
    windowSeconds: positive.max(60),
    graceSecondsAfterChange: nonNegative.max(60),
  }),
  /** Chunk loading limits (the same on every preset). */
  streaming: z.strictObject({
    /** Main-thread time (ms) per frame for putting finished chunks into the world. */
    frameBudgetMs: positive.max(16),
    maxAppliesPerFrame: z.number().int().min(1).max(16),
    maxJobsInFlight: z.number().int().min(1).max(32),
    maxWorkers: z.number().int().min(1).max(8),
    /** How strongly chunks in the walking direction go first (0 = by distance only). */
    directionBonus: nonNegative.max(4),
  }),
});

// ---------------------------------------------------------------- seasons.json

export const seasonsFileSchema = z.strictObject({
  order: z.array(id).min(1),
  firstWeekSeason: id,
  alwaysAvailable: z.array(id),
  seasons: z.array(
    z.strictObject({
      id,
      label: textKey,
      bonus: z.strictObject({ element: id, percent: z.number().min(0).max(1000) }),
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

const note = z.string().optional();
export const conditionSchema: z.ZodType<Condition> = z.lazy(() =>
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
  conditions: z.record(z.string().min(1), conditionSchema),
  triggers: z.array(
    z.strictObject({
      id,
      zone: id,
      kind: z.enum(['place', 'gate']),
      shape: shapeSchema,
      firstVisitText: textKey.optional(),
      condition: z.string().min(1).optional(),
      blockedText: textKey.optional(),
    }),
  ),
});

// ---------------------------------------------------------------- quests.json

const objectiveSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('talk'), npc: id }),
  z.strictObject({ type: z.literal('find'), item: id, count: z.number().int().positive() }),
  z.strictObject({ type: z.literal('kill'), monster: id, count: z.number().int().positive() }),
  z.strictObject({
    type: z.literal('deliver'),
    item: id,
    count: z.number().int().positive(),
    npc: id,
  }),
  z.strictObject({ type: z.literal('boss'), monster: id }),
]);

export const questsFileSchema = z.strictObject({
  quests: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      kind: z.enum(['main', 'side']),
      giver: id.optional(),
      description: textKey,
      objectives: z.array(objectiveSchema).min(1),
      requires: z.strictObject({
        level: level.optional(),
        quests: z.array(id).optional(),
        items: z.array(itemStack).optional(),
      }),
      rewards: z.strictObject({
        xp: z.number().int().nonnegative(),
        gold: z.number().int().nonnegative(),
        items: z.array(itemStack),
      }),
    }),
  ),
});

// ---------------------------------------------------------------- spells.json

const powerCurve = z
  .array(z.strictObject({ fromLevel: level, toLevel: level, factor: positive.max(10) }))
  .min(1);

export const spellsFileSchema = z.strictObject({
  elements: z.array(z.strictObject({ id, name: z.string().min(1), color: colorToken })).min(1),
  powerCurves: z.record(z.string(), powerCurve),
  maxSpellSlots: z.number().int().min(1).max(10),
  spells: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      element: id,
      manaCost: nonNegative,
      cooldownSeconds: nonNegative.max(120),
      damage: nonNegative,
      range: positive.max(100),
      usesPerLevel: z.number().int().positive(),
      perLevel: z.record(z.string(), z.number()),
    }),
  ),
});

// ---------------------------------------------------------------- skills.json

export const skillsFileSchema = z.strictObject({
  rules: z.strictObject({
    pointsPerLevel: z.strictObject({
      mage: z.number().int().min(0),
      sword: z.number().int().min(0),
    }),
    firstPointLevel: level,
    tierUnlockPoints: z.record(z.string(), z.number().int().nonnegative()),
    classChoiceLevel: level,
  }),
  core: z.strictObject({
    opposites: z.array(z.strictObject({ a: id, b: id, maxCombined: z.number().int().positive() })),
    stats: z.array(
      z.strictObject({
        id,
        name: z.string().min(1),
        maxPoints: z.number().int().positive(),
        stat: z.string().min(1),
        perPoint: z.number().positive(),
        mageOnly: z.boolean().optional(),
      }),
    ),
  }),
  branches: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      requires: z.enum(['sword', 'element', 'class', 'none']),
      element: id.optional(),
    }),
  ),
  skills: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      branch: id,
      tier: z.number().int().min(1).max(3),
      maxPoints: z.number().int().positive(),
    }),
  ),
  perks: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      path: z.enum(['sword', 'light', 'dark']).optional(),
      stat: z.string().min(1),
      value: z.number(),
    }),
  ),
});

// ---------------------------------------------------------------- combos.json

export const combosFileSchema = z.strictObject({
  rules: z.strictObject({
    windowSeconds: positive.max(10),
    targetCooldownSeconds: nonNegative.max(60),
    bossCrowdControlFactor: fraction,
  }),
  combos: z.array(
    z.strictObject({
      id,
      name: z.string().min(1),
      elements: z.tuple([id, id]),
      role: z.enum(['damage', 'control', 'support']),
      effect: z.string().min(1),
      value: z.number().nonnegative(),
      durationSeconds: nonNegative.max(60),
      radius: nonNegative.max(50),
      crowdControl: z.boolean().optional(),
    }),
  ),
});

// ---------------------------------------------------------------- cutscenes.json

export const cutscenesFileSchema = z.strictObject({
  cutscenes: z.array(
    z.strictObject({
      id,
      skippable: z.boolean(),
      playOnce: z.boolean().optional(),
      panels: z
        .array(
          z.strictObject({
            id,
            narration: textKey.optional(),
            lines: z
              .array(z.strictObject({ speaker: z.string().min(1), text: textKey }))
              .optional(),
            shake: z.boolean().optional(),
          }),
        )
        .min(1),
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
