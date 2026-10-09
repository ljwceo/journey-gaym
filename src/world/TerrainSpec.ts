import { Color } from 'three';
import type { GameData } from '../data/types';
import { resolveColorToken } from '../render/palette';
import { emptyBox, shapeBounds } from './Shapes';
import type { TerrainSpec } from './TerrainField';

/** Linear RGB of a color token (vertex colors are linear; the material does the sRGB output). */
function linear(token: string): [number, number, number] {
  const color = new Color(resolveColorToken(token));
  return [color.r, color.g, color.b];
}

/** Turns zones.json into the plain TerrainSpec the terrain worker and TerrainField use. */
export function buildTerrainSpec(data: GameData): TerrainSpec {
  const world = data.zones.world;
  const props = world.props;
  return {
    seed: world.seed,
    worldBounds: shapeBounds(world.bounds, emptyBox()),
    chunkSize: world.chunkSize,
    blendWidth: world.terrain.blendWidth,
    seaLevel: world.terrain.seaLevel,
    seaFloor: world.terrain.seaFloor,
    deepWaterDepth: world.terrain.deepWaterDepth,
    skirtDepth: world.terrain.skirtDepth,
    outsideColor: linear(world.outsideZoneColor),
    zones: data.zones.zones.map((zone) => ({
      id: zone.id,
      priority: zone.priority ?? 0,
      bounds: zone.bounds,
      baseHeight: zone.terrain.baseHeight,
      amplitude: zone.terrain.amplitude,
      scale: zone.terrain.scale,
      color: linear(zone.terrainColor),
      scatter: props.map(
        (prop) => zone.scatter.find((entry) => entry.prop === prop.id)?.perChunk ?? 0,
      ),
      exclude: zone.areas
        .filter((area) => zone.scatterExclude.includes(area.id))
        .map((area) => area.shape),
    })),
    props: props.map((prop) => ({
      id: prop.id,
      colliderRadius: prop.colliderRadius,
      scaleMin: prop.scale[0],
      scaleMax: prop.scale[1],
      maxPerChunk: prop.maxPerChunk,
      minHeightAboveSea: prop.minHeightAboveSea,
      decor: prop.decor,
    })),
  };
}
