import { z } from 'zod';
import { qualityLevelSchema } from '../data/schemas';
import { LANGUAGES, type Language } from '../i18n/I18n';

/** Current save format. Bump it and add `migrations[old]` whenever the shape changes. */
export const SAVE_VERSION = 2;

/** Camera sensitivity for new saves (1 = 100%); the allowed range is in player.json. */
export const DEFAULT_CAMERA_SENSITIVITY = 0.7;

const id = z.string().min(1);
const finite = z.number().finite();

export const saveDataSchema = z.object({
  version: z.literal(SAVE_VERSION),
  createdAt: z.string(),
  updatedAt: z.string(),
  language: z.enum(LANGUAGES),
  settings: z.object({
    /** What the player picked: 'auto' lets the game choose (and lower) the preset. */
    quality: z.enum(['auto', 'low', 'mid', 'high']),
    /** Preset the benchmark / auto-downgrade chose; null until the first benchmark ran. */
    autoQuality: qualityLevelSchema.nullable(),
    fpsCap: z.enum(['auto', '60', '120']),
    volume: z.number().min(0).max(1),
    /** How fast dragging turns the camera, as a fraction (0.3 = 30%). */
    cameraSensitivity: z.number().min(0.05).max(2),
    debug: z.boolean(),
  }),
  /** Null until the character creator is finished (New Game). */
  character: z
    .object({
      name: z.string().min(1),
      appearance: z.object({
        bodyType: id,
        hairstyle: id,
        hairColor: id,
        skinTone: id,
        mantleColor: id,
      }),
      gold: z.number().int().nonnegative(),
      inventory: z.array(z.object({ item: id, count: z.number().int().positive() })),
      equipment: z.record(z.string(), id),
    })
    .nullable(),
  /** Chosen in the main quest "Your Resolve" (phase 3); null until then. */
  path: z.enum(['sword', 'light', 'dark']).nullable(),
  world: z.object({
    zone: id.nullable(),
    position: z.object({ x: finite, y: finite, z: finite }).nullable(),
    heading: finite,
    checkpoint: id.nullable(),
  }),
  visitedPlaces: z.array(id),
  metNpcs: z.array(id),
  playTimeSeconds: z.number().nonnegative(),
});

export type SaveData = z.infer<typeof saveDataSchema>;
export type SaveSettings = SaveData['settings'];
export type SaveCharacter = NonNullable<SaveData['character']>;

/** A fresh save, created right after the language choice (character comes later). */
export function createNewSave(language: Language, now: Date = new Date()): SaveData {
  const stamp = now.toISOString();
  return {
    version: SAVE_VERSION,
    createdAt: stamp,
    updatedAt: stamp,
    language,
    settings: {
      quality: 'auto',
      autoQuality: null,
      fpsCap: 'auto',
      volume: 0.8,
      cameraSensitivity: DEFAULT_CAMERA_SENSITIVITY,
      debug: false,
    },
    character: null,
    path: null,
    world: { zone: null, position: null, heading: 0, checkpoint: null },
    visitedPlaces: [],
    metNpcs: [],
    playTimeSeconds: 0,
  };
}

/** Upgrades a raw save object from version `v` to `v + 1`. */
export type Migration = (save: Record<string, unknown>) => Record<string, unknown>;

/**
 * Save migrations: `migrations[v]` turns a version-v save into version v+1.
 * Example for a future v2: `1: (save) => ({ ...save, version: 2, mount: null })`.
 */
export const migrations: Readonly<Record<number, Migration>> = {
  // v2 (step 1.6): camera sensitivity setting.
  1: (save) => {
    const settings = (save.settings ?? {}) as Record<string, unknown>;
    return {
      ...save,
      version: 2,
      settings: { ...settings, cameraSensitivity: DEFAULT_CAMERA_SENSITIVITY },
    };
  },
};

export type MigrateResult =
  | { ok: true; save: Record<string, unknown> }
  | { ok: false; reason: 'invalid' | 'newer' | 'missingMigration'; version?: number };

/** Runs migrations one version at a time until the save reaches `target`. Pure function. */
export function migrate(
  raw: unknown,
  table: Readonly<Record<number, Migration>> = migrations,
  target: number = SAVE_VERSION,
): MigrateResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, reason: 'invalid' };
  }
  let save = raw as Record<string, unknown>;
  const start = save.version;
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 1) {
    return { ok: false, reason: 'invalid' };
  }
  if (start > target) return { ok: false, reason: 'newer', version: start };
  for (let version = start; version < target; version++) {
    const step = table[version];
    if (!step) return { ok: false, reason: 'missingMigration', version };
    save = step(save);
    if (save.version !== version + 1) {
      throw new Error(`Migration ${version} must set version to ${version + 1}`);
    }
  }
  return { ok: true, save };
}
