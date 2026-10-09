import { Color, Fog, Mesh, MeshLambertMaterial, PlaneGeometry, type Scene } from 'three';
import type { GameData, QualityPreset } from '../data/types';
import { resolveColorToken } from '../render/palette';
import { CollisionWorld } from '../systems/Collision';
import { ChunkDebug } from './ChunkDebug';
import { ringArea } from './ChunkPlanner';
import { FloatingOrigin } from './FloatingOrigin';
import { emptyBox, shapeBounds } from './Shapes';
import { SpatialHash } from './SpatialHash';
import type { TerrainField } from './TerrainField';
import { TerrainJobRunner } from './TerrainJobs';
import { buildTerrainSpec } from './TerrainSpec';
import { type StreamPreset, type StreamStats, WorldStreamer } from './WorldStreamer';

const DEG = Math.PI / 180;
/** Spatial hash cell size (m) for static colliders. */
const COLLIDER_CELL = 8;
/** How fast fog color follows a zone change (per second). */
const FOG_SHARPNESS = 1.2;
/** Fog starts at this share of the view distance. */
const FOG_NEAR = 0.35;
/** The sea plane reaches this many view distances around the camera. */
const SEA_REACH = 1.6;
const DEBUG_REFRESH_SECONDS = 0.25;

/** Streaming settings of a graphics preset. */
export function streamPreset(preset: QualityPreset): StreamPreset {
  return {
    rings: { ...preset.chunkRings, lodRing: preset.lodRing },
    segmentsNear: preset.terrainSegments.near,
    segmentsFar: preset.terrainSegments.far,
    decorDensity: preset.density.props,
  };
}

/**
 * The open world: terrain from zones.json, chunk streaming, colliders, the sea, fog per zone
 * and the floating origin. The scene owns the player and the camera; this owns the ground.
 *
 * Coordinates: the simulation, colliders and saves use world meters. Everything drawn is
 * placed relative to `origin` (see FloatingOrigin).
 */
export class World {
  readonly field: TerrainField;
  readonly origin: FloatingOrigin;
  readonly collision: CollisionWorld;
  readonly streamer: WorldStreamer;
  readonly debug: ChunkDebug;
  private readonly zoneIds: string[];
  private readonly fogColors: Color[];
  private readonly outsideFog: Color;
  private readonly fog: Fog;
  private readonly fogColor: Color;
  private readonly sea: Mesh;
  private zoneIndex = -2;
  private debugTimer = 0;
  private readonly statsOut: StreamStats = {
    records: 0,
    shown: 0,
    active: 0,
    queued: 0,
    inFlight: 0,
    tiles: 0,
    props: 0,
    colliders: 0,
    mode: 'worker',
    applyMaxMs: 0,
    applied: 0,
  };

  constructor(
    private readonly scene: Scene,
    data: GameData,
    private preset: QualityPreset,
    reportProblem: (message: string) => void,
  ) {
    const world = data.zones.world;
    const spec = buildTerrainSpec(data);
    const runner = new TerrainJobRunner(spec);
    this.field = runner.field;
    this.origin = new FloatingOrigin(world.originShiftDistance, world.chunkSize);
    this.collision = new CollisionWorld(
      new SpatialHash(COLLIDER_CELL),
      shapeBounds(world.bounds, emptyBox()),
      this.field,
      Math.tan(data.player.movement.slopeLimitDegrees * DEG),
    );

    const presets = data.quality.presets;
    const capacity = ringArea(Math.max(...presets.map((p) => p.chunkRings.unload)));
    const maxSegments = Math.max(
      ...presets.map((p) => Math.max(p.terrainSegments.near, p.terrainSegments.far)),
    );
    this.streamer = new WorldStreamer(
      runner,
      world.props.map((prop) => ({
        model: prop.model,
        colors: prop.colors.map(resolveColorToken),
      })),
      this.collision.hash,
      this.origin,
      streamPreset(preset),
      data.quality.streaming,
      capacity,
      maxSegments,
      reportProblem,
    );
    scene.add(this.streamer.group);

    this.zoneIds = spec.zones.map((zone) => zone.id);
    this.fogColors = data.zones.zones.map((zone) => new Color(resolveColorToken(zone.fogColor)));
    this.outsideFog = new Color(resolveColorToken(world.outsideZoneFog));
    this.fogColor = this.outsideFog.clone();
    this.fog = new Fog(this.fogColor.getHex(), preset.fogFar * FOG_NEAR, preset.fogFar);
    scene.fog = this.fog;
    scene.background = this.fogColor;

    const seaMaterial = new MeshLambertMaterial({
      color: resolveColorToken('zeewater'),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.sea = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), seaMaterial);
    this.sea.name = 'sea';
    this.sea.renderOrder = 1;
    this.resizeSea();
    scene.add(this.sea);

    this.debug = new ChunkDebug(this.streamer.planner, this.field, this.origin);
    scene.add(this.debug.lines);
  }

  /** View distance (m) of the current preset; the camera's far plane follows it. */
  get viewDistance(): number {
    return this.preset.fogFar;
  }

  /** Index into zones.json of the zone the player is in (-1 = none). */
  get currentZone(): string | null {
    return this.zoneIndex >= 0 ? (this.zoneIds[this.zoneIndex] ?? null) : null;
  }

  /**
   * Puts the player into the world at (x, z): origin there, nearby chunks built right away,
   * fog straight to that zone's color.
   */
  start(x: number, z: number): void {
    this.origin.reset(x, z);
    this.streamer.loadNow(x, z);
    this.zoneIndex = this.field.zoneIndexAt(x, z);
    this.fogColor.copy(this.zoneFog(this.zoneIndex));
    this.fog.color.copy(this.fogColor);
  }

  /**
   * Simulation step: which zone the player is in. Returns the zone id when it changed (a new
   * zone was entered), else null.
   */
  trackZone(x: number, z: number): string | null {
    const index = this.field.zoneIndexAt(x, z);
    if (index === this.zoneIndex) return null;
    this.zoneIndex = index;
    return index >= 0 ? (this.zoneIds[index] ?? null) : null;
  }

  /**
   * Every frame: streaming, floating origin, sea and fog.
   * @param x, z player position (m, world)
   * @param dirX, dirZ walking direction
   * @param seconds real time since the last frame
   * @param showDebug draw the chunk grid
   * @returns true when the floating origin moved this frame
   */
  frame(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    seconds: number,
    showDebug: boolean,
  ): boolean {
    const shifted = this.origin.update(x, z);
    if (shifted) this.streamer.onOriginShift(this.origin.shiftX, this.origin.shiftZ);
    this.streamer.update(x, z, dirX, dirZ, seconds);

    this.sea.position.set(x - this.origin.x, this.field.spec.seaLevel, z - this.origin.z);
    const target = this.zoneFog(this.zoneIndex);
    this.fogColor.lerp(target, 1 - Math.exp(-FOG_SHARPNESS * seconds));
    this.fog.color.copy(this.fogColor);

    this.debug.lines.visible = showDebug;
    if (showDebug) {
      this.debugTimer -= seconds;
      if (this.debugTimer <= 0) {
        this.debugTimer = DEBUG_REFRESH_SECONDS;
        this.debug.refresh();
      }
    }
    return shifted;
  }

  setPreset(preset: QualityPreset, x: number, z: number): void {
    this.preset = preset;
    this.streamer.setPreset(streamPreset(preset), x, z);
    this.fog.near = preset.fogFar * FOG_NEAR;
    this.fog.far = preset.fogFar;
    this.resizeSea();
  }

  /** One line for the debug overlay. */
  debugLine(): string {
    const s = this.streamer.stats(this.statsOut);
    const r = this.streamer.rings;
    return (
      `${s.shown}/${s.records} shown · ${s.active} active · ${s.queued} queued · ` +
      `${s.inFlight} building · ${s.tiles} tiles\n` +
      `         rings ${r.active}/${r.preload}/${r.unload} lod ${r.lodRing} · ${s.mode} · ` +
      `apply max ${s.applyMaxMs.toFixed(2)} ms · ${s.applied} built\n` +
      `         props ${s.props} · colliders ${s.colliders} · origin ` +
      `${this.origin.x}, ${this.origin.z} (${this.origin.shifts} shifts)`
    );
  }

  dispose(): void {
    this.streamer.dispose();
    this.debug.dispose();
    this.sea.geometry.dispose();
    (this.sea.material as MeshLambertMaterial).dispose();
    this.scene.remove(this.streamer.group, this.sea, this.debug.lines);
  }

  private zoneFog(index: number): Color {
    return index >= 0 ? (this.fogColors[index] ?? this.outsideFog) : this.outsideFog;
  }

  private resizeSea(): void {
    const size = this.preset.fogFar * SEA_REACH * 2;
    this.sea.scale.set(size, 1, size);
  }
}
