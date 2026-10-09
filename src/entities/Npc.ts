import { Color } from 'three';
import { hashSeed, Random } from '../core/Random';
import type { Condition, NpcDef, NpcsFile, Shape } from '../data/types';
import { angleDelta } from '../systems/Movement';
import { Wander, type WalkerState } from '../systems/NpcBehavior';
import { type ConditionContext, evaluateCondition } from '../world/Conditions';
import { pointInShape } from '../world/Shapes';
import { Companion } from './Companion';

const DEG = Math.PI / 180;
/** Followers and wanderers keep at least this radius against walls while walking. */
const MIN_BODY_RADIUS = 0.25;

export type NpcRole = NpcsFile['roles'][number];
export type NpcSettings = NpcsFile['settings'];

/**
 * One NPC from npcs.json: its data, simulation state (fixed step) and the previous step for
 * smooth drawing. Behavior comes from data: `static` NPCs stand still and turn towards a player
 * who comes close, `wander` NPCs roam around their spot, `follow` NPCs (Pringle) follow the
 * player. A new NPC is only data.
 */
export class Npc {
  readonly state: WalkerState & { y: number };
  readonly color: Color;
  /** Collision radius against the player (0 = walk through). */
  readonly solidRadius: number;
  readonly homeHeading: number;
  readonly wander: Wander | null;
  readonly companion: Companion | null;
  /** Drawn and simulated right now (near the player, see Npcs). */
  shown = false;
  /** Seconds left of the little hop after petting (drawing only). */
  hop = 0;
  private prevX = 0;
  private prevY = 0;
  private prevZ = 0;
  private prevHeading = 0;

  constructor(
    readonly def: NpcDef,
    readonly role: NpcRole,
    settings: NpcSettings,
    color: number,
  ) {
    this.color = new Color(color);
    this.solidRadius = role.radius;
    this.homeHeading = (def.heading ?? 0) * DEG;
    this.state = { x: def.position.x, y: 0, z: def.position.z, heading: this.homeHeading };
    const turnSpeed = settings.turnDegreesPerSecond * DEG;
    const bodyRadius = Math.max(MIN_BODY_RADIUS, role.radius);
    const [pauseMin, pauseMax] = settings.wanderPauseSeconds;
    this.wander =
      def.behavior === 'wander' && def.wander
        ? new Wander(
            {
              homeX: def.position.x,
              homeZ: def.position.z,
              radius: def.wander.radius,
              speed: def.wander.speed,
              pauseMin,
              pauseMax,
              turnSpeed,
              bodyRadius,
            },
            new Random(hashSeed(...Array.from(def.id, (c) => c.charCodeAt(0)))),
          )
        : null;
    this.companion =
      def.behavior === 'follow' && def.follow
        ? new Companion({
            distance: def.follow.distance,
            speed: def.follow.speed,
            teleportDistance: settings.followTeleportDistance,
            turnSpeed,
            bodyRadius,
          })
        : null;
    this.place(this.state.x, this.state.y, this.state.z, this.state.heading);
  }

  get id(): string {
    return this.def.id;
  }

  get canInteract(): boolean {
    return this.def.interaction !== 'none';
  }

  /** Puts the NPC somewhere without interpolating from the old spot. */
  place(x: number, y: number, z: number, heading: number): void {
    const s = this.state;
    s.x = this.prevX = x;
    s.y = this.prevY = y;
    s.z = this.prevZ = z;
    s.heading = this.prevHeading = heading;
  }

  /** Call before each simulation step. */
  beginStep(): void {
    this.prevX = this.state.x;
    this.prevY = this.state.y;
    this.prevZ = this.state.z;
    this.prevHeading = this.state.heading;
  }

  drawX(alpha: number): number {
    return this.prevX + (this.state.x - this.prevX) * alpha;
  }

  drawY(alpha: number): number {
    return this.prevY + (this.state.y - this.prevY) * alpha;
  }

  drawZ(alpha: number): number {
    return this.prevZ + (this.state.z - this.prevZ) * alpha;
  }

  drawHeading(alpha: number): number {
    return this.prevHeading + angleDelta(this.prevHeading, this.state.heading) * alpha;
  }
}

/**
 * The lines an NPC says now: the first `dialogueWhen` entry whose named condition holds,
 * otherwise its normal `dialogue`. Quests hook in here later through conditions.
 */
export function dialogueLines(
  def: NpcDef,
  conditions: Readonly<Record<string, Condition>>,
  ctx: ConditionContext,
): readonly string[] {
  for (const entry of def.dialogueWhen ?? []) {
    const condition = conditions[entry.condition];
    if (condition && evaluateCondition(condition, ctx)) return entry.lines;
  }
  return def.dialogue;
}

/**
 * Whether the NPC may be attacked at (x, z): never inside one of its safe areas (e.g.
 * Treewardens in the elven city), never if it is not a monster. Used by combat in phase 2.
 */
export function isAttackable(
  def: NpcDef,
  x: number,
  z: number,
  areas: ReadonlyMap<string, Shape>,
): boolean {
  if (!def.monster) return false;
  for (const id of def.safeAreas ?? []) {
    const shape = areas.get(id);
    if (shape && pointInShape(shape, x, z)) return false;
  }
  return true;
}
