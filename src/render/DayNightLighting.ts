import { Color } from 'three';
import type { DayLook, DayNightFile } from '../data/types';
import type { DayNightService, LookBlend } from '../services/DayNightService';
import { createSharedLightUniforms, type SharedLightUniforms } from './toon/ToonMaterial';

const DEG = Math.PI / 180;
/** Id of the look used by zones with `"lighting": "goldenHour"`. */
export const GOLDEN_HOUR_LOOK = 'golden_hour';

/** Deep water color (style guide); darker when the light is weak (night). */
const WATER_TOKEN = 'zeewater';

export type ZoneLighting = 'cycle' | 'goldenHour';

/** A look from daynight.json with its colors resolved (linear, ready for shaders). */
interface ResolvedLook {
  skyTop: Color;
  skyHorizon: Color;
  sun: Color;
  shadow: Color;
  fog: Color;
  def: DayLook;
}

/**
 * Turns the time of day into light: every frame it mixes the two looks of the current blend
 * (DayNightService) and writes the result into the shared uniforms (toon materials, sky) and into
 * plain colors for the open world's Three.js lights and fog. A zone on `goldenHour` always gets
 * the golden hour look. Allocation-free per frame.
 */
export class DayNightLighting {
  readonly uniforms: SharedLightUniforms = createSharedLightUniforms();
  /** Mixed values of this frame (also in the uniforms), for Three.js lights. */
  readonly sun = new Color();
  readonly shadow = new Color();
  readonly fog = new Color();
  sunStrength = 1;
  shadowStrength = 1;
  worldFogMix = 0;
  glow = 1;
  /**
   * Strengths of the golden hour look: the open world's Three.js lights have their old
   * intensity at the golden hour and scale from there.
   */
  readonly refSunStrength: number;
  readonly refShadowStrength: number;
  private readonly byPhase: ResolvedLook[];
  private readonly golden: ResolvedLook;
  private readonly blend: LookBlend = { a: 0, b: 0, t: 0 };
  private readonly waterBase: Color;

  constructor(
    readonly config: DayNightFile,
    color: (token: string) => number,
  ) {
    const resolve = (def: DayLook): ResolvedLook => ({
      skyTop: new Color(color(def.skyTop)),
      skyHorizon: new Color(color(def.skyHorizon)),
      sun: new Color(color(def.sun)),
      shadow: new Color(color(def.shadow)),
      fog: new Color(color(def.fog)),
      def,
    });
    const looks = new Map(config.looks.map((def) => [def.id, resolve(def)]));
    this.byPhase = config.phases.map((phase) => {
      const look = looks.get(phase.id);
      if (!look) throw new Error(`daynight.json: no look for phase "${phase.id}"`);
      return look;
    });
    const golden = looks.get(GOLDEN_HOUR_LOOK);
    if (!golden) throw new Error(`daynight.json: no look "${GOLDEN_HOUR_LOOK}"`);
    this.golden = golden;
    this.refSunStrength = golden.def.sunStrength || 1;
    this.refShadowStrength = golden.def.shadowStrength || 1;
    const u = this.uniforms;
    u.windowCol.value.setHex(color(config.lanternLights.color));
    u.lampCol.value.setHex(color(config.lanternLights.color));
    u.lampRange.value = config.lanternLights.rangeMeters;
    this.waterBase = new Color(color(WATER_TOKEN));
  }

  /** Mixes the looks for now (or the golden hour) and updates every uniform. */
  update(clock: DayNightService, lighting: ZoneLighting, seconds: number): void {
    let a: ResolvedLook;
    let b: ResolvedLook;
    let t: number;
    if (lighting === 'goldenHour') {
      a = b = this.golden;
      t = 0;
    } else {
      const blend = clock.blend(this.blend);
      a = this.byPhase[blend.a] ?? this.golden;
      b = this.byPhase[blend.b] ?? this.golden;
      t = blend.t;
    }
    const u = this.uniforms;
    const da = a.def;
    const db = b.def;
    this.sunStrength = mix(da.sunStrength, db.sunStrength, t);
    this.shadowStrength = mix(da.shadowStrength, db.shadowStrength, t);
    this.worldFogMix = mix(da.worldFogMix, db.worldFogMix, t);
    this.glow = mix(da.glow, db.glow, t);
    this.sun.copy(a.sun).lerp(b.sun, t);
    this.shadow.copy(a.shadow).lerp(b.shadow, t);
    this.fog.copy(a.fog).lerp(b.fog, t);
    u.sunCol.value.copy(this.sun).multiplyScalar(this.sunStrength);
    u.shadowCol.value.copy(this.shadow).multiplyScalar(this.shadowStrength);
    u.fogCol.value.copy(this.fog);
    u.waterCol.value.copy(this.waterBase).multiplyScalar(0.4 + 0.6 * Math.min(1, this.sunStrength));
    u.skyTop.value.copy(a.skyTop).lerp(b.skyTop, t);
    u.skyHorizon.value.copy(a.skyHorizon).lerp(b.skyHorizon, t);
    u.sunDisk.value = mix(da.sunDisk, db.sunDisk, t);
    u.moonDisk.value = mix(da.moonDisk, db.moonDisk, t);
    u.stars.value = mix(da.stars, db.stars, t);
    u.glow.value = this.glow;
    u.windowGlow.value = mix(da.windowGlow, db.windowGlow, t);
    u.time.value += seconds;

    // Light direction: elevation and azimuth mixed separately (the shortest way round).
    const elevation = mix(da.lightElevationDegrees, db.lightElevationDegrees, t) * DEG;
    let turn = (db.lightAzimuthDegrees - da.lightAzimuthDegrees) % 360;
    if (turn > 180) turn -= 360;
    else if (turn < -180) turn += 360;
    const azimuth = (da.lightAzimuthDegrees + turn * t) * DEG;
    const flat = Math.cos(elevation);
    u.lightDir.value.set(flat * Math.sin(azimuth), Math.sin(elevation), flat * Math.cos(azimuth));
  }

  /** True when lanterns glow enough for real lights (High preset, dusk and night). */
  get lanternsOn(): boolean {
    return this.glow >= this.config.lanternLights.minGlow;
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
