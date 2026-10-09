import type { ZonesFile } from '../data/types';
import { emptyBox, shapeBounds } from './Shapes';
import type { TerrainConfig } from './TerrainField';

/** One scatter rule of one zone, flattened for the worker. */
export interface ScatterRule {
  /** Zone rectangle the props may stand in. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Index into `ScatterConfig.props`. */
  prop: number;
  perHectare: number;
  minScale: number;
  maxScale: number;
}

export interface ScatterConfig {
  seed: number;
  /** Prop ids in data order; results come back per prop index. */
  props: string[];
  rules: ScatterRule[];
  /** No props in these circles: [x, z, radius] triples (spawn points, checkpoints, entrances). */
  clearings: number[];
  /** Props never stand in water shallower than this above sea level. */
  minHeight: number;
  /** Quality density (0–1) multiplies `perHectare`. */
  density: number;
}

/** Everything the terrain worker needs, as plain data (structured-cloned into the worker). */
export interface WorldGenConfig {
  terrain: TerrainConfig;
  scatter: ScatterConfig;
  chunkSize: number;
  lodSegments: [number, number];
  skirtDepth: number;
  farGridSpacing: number;
}

/** Builds the worker config from zones.json. `color` turns a color token into 0xRRGGBB. */
export function buildWorldGenConfig(
  zones: ZonesFile,
  color: (token: string) => number,
  propDensity: number,
): WorldGenConfig {
  const world = zones.world;
  const t = world.terrain;
  const worldBox = shapeBounds(world.bounds, emptyBox());
  const box = emptyBox();
  const props = world.props.map((prop) => prop.id);
  const rules: ScatterRule[] = [];
  const clearings: number[] = [];
  const terrainZones = zones.zones.map((zone) => {
    shapeBounds(zone.bounds, box);
    for (const rule of zone.scatter ?? []) {
      rules.push({
        minX: box.minX,
        minZ: box.minZ,
        maxX: box.maxX,
        maxZ: box.maxZ,
        prop: props.indexOf(rule.prop),
        perHectare: rule.perHectare,
        minScale: rule.minScale,
        maxScale: rule.maxScale,
      });
    }
    for (const spawn of zone.spawnPoints) clearings.push(spawn.x, spawn.z, t.clearingRadius);
    if (zone.checkpoint) clearings.push(zone.checkpoint.x, zone.checkpoint.z, t.clearingRadius);
    for (const instance of zone.instances) {
      clearings.push(instance.entrance.x, instance.entrance.z, t.clearingRadius);
    }
    return {
      id: zone.id,
      priority: zone.priority ?? 0,
      minX: box.minX,
      minZ: box.minZ,
      maxX: box.maxX,
      maxZ: box.maxZ,
      baseHeight: zone.terrain.baseHeight,
      amplitude: zone.terrain.amplitude,
      color: color(zone.terrainColor),
    };
  });
  return {
    terrain: {
      seed: world.seed,
      minX: worldBox.minX,
      minZ: worldBox.minZ,
      maxX: worldBox.maxX,
      maxZ: worldBox.maxZ,
      seaFloor: t.seaFloor,
      coastWidth: t.coastWidth,
      blendWidth: t.blendWidth,
      wavelength: t.wavelength,
      octaves: t.octaves,
      seaColor: color(world.outsideZoneColor),
      zones: terrainZones,
    },
    scatter: {
      seed: world.seed,
      props,
      rules,
      clearings,
      minHeight: t.seaLevel + 0.3,
      density: propDensity,
    },
    chunkSize: world.chunkSize,
    lodSegments: [t.lodSegments[0], t.lodSegments[1]],
    skirtDepth: t.skirtDepth,
    farGridSpacing: t.farGridSpacing,
  };
}
