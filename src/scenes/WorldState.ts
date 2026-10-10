import {
  type Camera,
  CircleGeometry,
  Color,
  Vector3,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NeutralToneMapping,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  type ToneMapping,
} from 'three';
import type { GameContext } from '../core/GameContext';
import { publicUrl } from '../data/DataLoader';
import { DayNightLighting, type ZoneLighting } from '../render/DayNightLighting';
import { createSkyDome } from '../render/toon/SkyDome';
import { MAX_LAMPS } from '../render/toon/ToonMaterial';
import type { SpawnWorld } from '../systems/Enemies';
import type { DayPhase } from '../services/DayNightService';
import type { Mover } from '../systems/Movement';
import { disposeSceneAssets, loadSceneAssets, type SceneAssets } from '../world/scene/SceneAssets';
import { buildPlayerModel, type ScenePlayerModel } from '../world/scene/ScenePlayerModel';
import { SceneZone } from '../world/scene/SceneZone';
import { pointInShape } from '../world/Shapes';
import { Input, type LookDelta } from '../core/Input';
import type { GameState } from '../core/StateMachine';
import type { GameData, QualityPreset } from '../data/types';
import { chosenLevel, presetFor } from '../render/quality';
import { dialogueLines, isAttackable, type Npc } from '../entities/Npc';
import { Player } from '../entities/Player';
import { PropLibrary } from '../entities/PropFactory';
import { CameraRig } from '../render/CameraRig';
import { NpcRenderer } from '../render/NpcRenderer';
import { colorTokens, palette, resolveColorToken } from '../render/palette';
import { Cheats, stepFlying } from '../systems/Cheats';
import {
  applyLevel,
  assistedHeading,
  inSwingArc,
  regenOutOfCombat,
  type SwordConfig,
  type SwordInput,
  type SwordResult,
  stepSword,
  swordConfig,
} from '../systems/Combat';
import { Enemies } from '../systems/Enemies';
import { EnemyRenderer } from '../render/EnemyRenderer';
import { DamageNumbers } from '../ui/DamageNumbers';
import { type Bounds, CollisionWorld } from '../systems/Collision';
import {
  type MoveCommand,
  type MovementConfig,
  movementConfig,
  screenToWorld,
  stepMovement,
} from '../systems/Movement';
import { type NpcWorld, Npcs } from '../systems/Npcs';
import { CheatPanel } from '../ui/CheatPanel';
import { Dialog } from '../ui/Dialog';
import { HUD } from '../ui/HUD';
import { StructureLabels } from '../ui/StructureLabels';
import { el } from '../ui/dom';
import { pausePanel } from '../ui/menus/PausePanel';
import { TouchControls } from '../ui/TouchControls';
import { Checkpoints, checkpointsOf } from '../world/Checkpoints';
import { ChunkDebug } from '../world/ChunkDebug';
import type { ConditionContext } from '../world/Conditions';
import { FloatingOrigin } from '../world/FloatingOrigin';
import { GroundedMover } from '../world/GroundedMover';
import type { InstanceHost } from '../world/Instances';
import { buildRiverWater } from '../world/RiverWater';
import { emptyBox, shapeBounds } from '../world/Shapes';
import { SpatialHash } from '../world/SpatialHash';
import { StructureLayer } from '../world/StructureLayer';
import { placeStructures } from '../world/StructurePlacement';
import { structureShape } from '../entities/StructureFactory';
import { buildWorldGenConfig } from '../world/terrainConfig';
import { TerrainField } from '../world/TerrainField';
import { Triggers } from '../world/Triggers';
import { type StreamerStats, WorldStreamer } from '../world/WorldStreamer';
import { ZoneLocator } from '../world/ZoneLocator';
import { normalizeAppearance } from './creator';
import type { SceneDef, Shape, Zone } from '../data/types';
import { placeAtStart } from './flow';

const DEG = Math.PI / 180;
const DEBUG_REFRESH_MS = 250;
/** Debug overlay lines this scene owns (removed again on exit). */
const DEBUG_KEYS = [
  'pos',
  'zone',
  'chunks',
  'places',
  'npcs',
  'energy',
  'combat',
  'camera',
  'daynight',
  'cheats',
] as const;
/** Light intensities of the open world's Three.js lights at the golden hour look. */
const HEMI_INTENSITY = 1.8;
const SUN_INTENSITY = 2;
/** Tone mapping in Blender-built zones (as in the Blender test page); restored on leaving. */
const SCENE_EXPOSURE = 1.05;
/** Arriving in a Blender-built zone from elsewhere: find the ground from high above. */
const ARRIVE_FROM_ABOVE = 10_000;
/** The sky dome sits just inside the camera's far plane. */
const SKY_FRACTION = 0.92;
/** Soft round shadow under the player in Blender-built zones (the toon shader has no shadows). */
const BLOB_RADIUS = 0.42;
const BLOB_OPACITY = 0.28;
/** The shadow camera sits this far (m) from the player towards the sun. */
const SUN_DISTANCE = 150;
/** No attack this step (while a dash finishes). */
const NO_SWORD_INPUT: SwordInput = { fast: false, heavy: false };
/** Seconds over which fog and sky change color after entering another zone. */
const FOG_SHARPNESS = 1.5;
/** The interaction icon stays this far (CSS px) from the screen edges. */
const ICON_MARGIN = 60;
/** The sea plane is this many times the view distance wide (it follows the player). */
const WATER_SCALE = 3;
/** The interaction icon floats this far (m) above an NPC's head. */
const ICON_ABOVE_HEAD = 0.35;
/** A conversation ends by itself when the player is this many interact ranges away. */
const TALK_BREAK_RANGES = 3;

/**
 * The open world: terrain chunks stream in around the player from a Web Worker (WorldStreamer),
 * with the low-detail far map underneath, sea, rivers, fog and scattered props. Placeholder
 * buildings and landmarks (StructureLayer) come and go with the chunks they stand on.
 * Walking and dashing follow the ground (slope limit, deep water blocks); zone changes are
 * seamless, show the zone name and autosave. Triggers explain places on the first visit,
 * checkpoints are set by walking past them, and the city gate checks its condition.
 * NPCs from npcs.json stand, wander or follow (Pringle); E or a tap talks to them (dialogue
 * window) or pets them. A floating origin keeps drawing precise far from (0, 0).
 *
 * Simulation (fixed 60 Hz): input → walking direction (none while talking) → Movement +
 * collision + NPCs pushing + ground → gate → triggers, checkpoints, zone → save position →
 * NPCs → interaction target. Rendering (every frame): streaming budget, origin, interpolated
 * player and NPCs, camera (kept in front of walls), HUD. Debug mode adds
 * chunk info, building labels and a cheat menu (F6) for faster testing.
 */
export class WorldState implements GameState, InstanceHost {
  readonly currentInstance: string | null = null;

  private scene: Scene | null = null;
  private worldRoot: Group | null = null;
  private rig: CameraRig | null = null;
  private player: Player | null = null;
  private collision: CollisionWorld | null = null;
  /** Walls and ground for walking: GroundedMover (open world) or the SceneZone. */
  private mover: Mover | null = null;
  /** A Blender-built zone being played (zones.json `scene`), or null in the open world. */
  private sceneZone: SceneZone | null = null;
  private sceneZoneDef: Zone | null = null;
  private sceneAssets: SceneAssets | null = null;
  private scenePlayer: ScenePlayerModel | null = null;
  private blob: Mesh | null = null;
  /** Day and night: shared light uniforms, Three.js lights, fog and sky follow it. */
  private lighting: DayNightLighting | null = null;
  private lightingMode: ZoneLighting = 'cycle';
  private hemi: HemisphereLight | null = null;
  private sky: Mesh | null = null;
  private loadingScreen: HTMLElement | null = null;
  private loadingFill: HTMLElement | null = null;
  /** Bumped on every (re)load, so a load that finishes after leaving is thrown away. */
  private loadToken = 0;
  /** Set while switching between a Blender-built zone and the open world (new position saved). */
  private travelling = false;
  private savedToneMapping: ToneMapping | null = null;
  /** Fog color of the zone you are in (open world), before day and night mix in. */
  private readonly zoneFog = new Color();
  private readonly dayPhase: DayPhase = { index: 0, id: '', label: '', remainingMs: 0 };
  /** Nearest lanterns this frame (indexes and squared distances), for real lights on High. */
  private readonly lampBest: number[] = new Array<number>(MAX_LAMPS).fill(0);
  private readonly lampBestD: number[] = new Array<number>(MAX_LAMPS).fill(0);
  /** What night spawning needs from the world (reused every step). */
  private readonly spawnWorld: SpawnWorld = {
    spawning: false,
    testAreas: false,
    heightAt: (x, z) => this.groundHeight(x, z),
    canStand: (x, z) => this.canStand(x, z),
  };
  private streamer: WorldStreamer | null = null;
  private props: PropLibrary | null = null;
  private chunkDebug: ChunkDebug | null = null;
  private structures: StructureLayer | null = null;
  private labels: StructureLabels | null = null;
  private triggers: Triggers | null = null;
  private checkpoints: Checkpoints | null = null;
  private hud: HUD | null = null;
  private npcs: Npcs | null = null;
  private npcRenderer: NpcRenderer | null = null;
  private npcWorld: NpcWorld | null = null;
  private enemies: Enemies | null = null;
  private enemyRenderer: EnemyRenderer | null = null;
  private damageNumbers: DamageNumbers | null = null;
  private sword: SwordConfig | null = null;
  /** Whether the HUD currently shows the fight bars (changes only on transitions). */
  private hudInCombat = false;
  private dialog: Dialog | null = null;
  /** The NPC in the open dialogue window, or null. */
  private talkingTo: Npc | null = null;
  /** The NPC that E / the icon would use now (nearest in range), or null. */
  private targetNpc: Npc | null = null;
  /** Cached icon label (made only when the target or the language changes). */
  private iconLabel = '';
  private iconLabelFor: Npc | 'rest' | null = null;
  private safeAreas: Map<string, Shape> | null = null;
  /** True while the closed city gate holds the player back (the message shows once). */
  private gateBlocked = false;
  private readonly fogTarget = new Color();
  private readonly conditionContext: ConditionContext = { level: 1, completedQuests: new Set() };
  private readonly placesInside: string[] = [];
  private readonly labelPoint = new Vector3();
  private water: Mesh | null = null;
  private sun: DirectionalLight | null = null;
  private origin: FloatingOrigin | null = null;
  private zones: ZoneLocator | null = null;
  private worldBounds: Bounds | null = null;
  private input: Input | null = null;
  private touch: TouchControls | null = null;
  private cheatPanel: CheatPanel | null = null;
  private readonly cheats = new Cheats();
  private surface: HTMLElement | null = null;
  private pauseButton: HTMLButtonElement | null = null;
  private lookHint: HTMLElement | null = null;
  private lookHintShown = false;
  /** Phones and tablets: no "click to look around" hint (there is no mouse). */
  private coarsePointer = false;
  private movement: MovementConfig | null = null;
  private baseWalkSpeed = 0;
  private preset: QualityPreset | null = null;
  private paused = false;
  /** Set after importing a save: leaving the world must not write the old state over it. */
  private keepSessionOnExit = false;
  private debugTimer = 0;
  private readonly unsubscribe: (() => void)[] = [];

  // Reused every step / frame (no allocations in the game loop).
  private readonly moveInput = { x: 0, y: 0 };
  private readonly moveWorld = { x: 0, z: 0 };
  private readonly command: MoveCommand = { x: 0, z: 0, dash: false };
  private readonly swordInput: SwordInput = { fast: false, heavy: false };
  private readonly swordResult: SwordResult = { landed: 'none', damage: 0, combo: false };
  private readonly look: LookDelta = { yaw: 0, pitch: 0, zoom: 1 };
  private readonly stats: StreamerStats = {
    near: 0,
    far: 0,
    loading: 0,
    workerMs: 0,
    applyMsMax: 0,
    colliders: 0,
  };

  constructor(private readonly ctx: GameContext) {}

  enter(): void {
    const { ctx } = this;
    const session = ctx.session;
    const data = ctx.data;
    if (!session || !data) {
      ctx.goto('title');
      return;
    }
    const isNew = session.world.zone === null;
    placeAtStart(session, data);
    // Waking up in a zone counts as entering it (autosave).
    if (isNew && session.world.zone) ctx.events.emit('zoneEntered', { zoneId: session.world.zone });

    const t = ctx.i18n.t.bind(ctx.i18n);
    this.movement = movementConfig(data.player);
    this.baseWalkSpeed = this.movement.walkSpeed;
    this.cheats.reset();

    // Input surface first, so the pause button and touch buttons lie on top of it.
    this.surface = el('div', { className: 'ui-world-input' });
    ctx.ui.append(this.surface);
    const camera = data.player.camera;
    const controls = data.player.controls;
    this.input = new Input(this.surface, {
      joystickRadiusPx: controls.joystickRadiusPx,
      joystickDeadZone: controls.joystickDeadZone,
      rotateRadiansPerPixelMouse: camera.rotateRadiansPerPixelMouse,
      rotateRadiansPerPixelTouch: camera.rotateRadiansPerPixelTouch,
      zoomStepPerWheelNotch: camera.zoomStepPerWheelNotch,
    });
    this.input.attach();
    // Escape releases the mouse (the browser does that itself); treat it like pausing.
    // While talking, Escape just ends the conversation.
    this.input.onPointerLockLost = () => {
      if (this.dialog?.isOpen) this.dialog.close();
      else this.pause();
    };
    this.touch = new TouchControls(this.input, this.touchLabels(), controls.joystickRadiusPx);
    ctx.ui.append(this.touch.root);

    this.travelling = false;
    const zone = data.zones.zones.find((entry) => entry.id === session.world.zone);
    // A Blender-built zone loads first (loading screen); the open world builds right away.
    if (zone?.scene) this.loadSceneZone(data, zone);
    else this.buildScene(data, null);
    this.paused = false;
    this.gateBlocked = false;
    if (this.labels) ctx.ui.append(this.labels.root);
    this.hud = new HUD(data.player.hud, data.player.lowHpThreshold, () => this.interact());
    ctx.ui.append(this.hud.root);
    this.dialog = new Dialog((key) => ctx.i18n.t(key));
    ctx.ui.append(this.dialog.root);
    this.damageNumbers = new DamageNumbers();
    ctx.ui.append(this.damageNumbers.root);
    this.hudInCombat = false;
    this.talkingTo = null;
    this.targetNpc = null;
    this.iconLabelFor = null;
    this.showZoneName(session.world.zone);

    this.cheatPanel = new CheatPanel(
      ctx,
      this.cheats,
      data.zones.zones.map((zone) => ({ id: zone.id, name: zone.name })),
      this.input,
      {
        teleport: (zoneId) => this.teleport(zoneId),
        changed: () => this.applyCheats(),
        exportSave: () => this.exportSave(),
        importSave: (code) => this.importSave(code),
        rerunBenchmark: () => this.rerunBenchmark(),
        nightMonsters: () => this.enemies?.nightAlive ?? 0,
      },
    );
    // Next to the UI layer (not inside it), so it can sit above the debug overlay.
    (ctx.ui.parentElement ?? ctx.ui).append(this.cheatPanel.root);
    this.cheatPanel.setDebugVisible(ctx.debug.isVisible);

    this.pauseButton = el('button', {
      className: 'ui-pause-button',
      text: 'II',
      attrs: { type: 'button', 'aria-label': t('pause.title') },
      onClick: () => this.pause(),
    });
    ctx.ui.append(this.pauseButton);
    // Mouse only: "click to look around" until the mouse is captured.
    this.lookHint = el('div', { className: 'ui-look-hint', text: t('controls.clickToLook') });
    this.lookHintShown = false;
    this.coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    ctx.ui.append(this.lookHint);
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.unsubscribe.push(
      ctx.events.on('languageChanged', () => {
        this.touch?.setLabels(this.touchLabels());
        this.pauseButton?.setAttribute('aria-label', ctx.i18n.t('pause.title'));
        if (this.lookHint) this.lookHint.textContent = ctx.i18n.t('controls.clickToLook');
        this.cheatPanel?.updateTexts();
        this.dialog?.updateTexts();
        this.iconLabelFor = null;
      }),
      // A new graphics preset changes view distance, chunk rings and shadows right away.
      ctx.events.on('qualityChanged', () => this.applyPreset()),
      ctx.events.on('qualityAutoChosen', ({ level, reason }) => {
        const quality = ctx.i18n.t(`settings.quality${level[0]?.toUpperCase()}${level.slice(1)}`);
        const key = reason === 'lowered' ? 'hud.qualityLowered' : 'hud.qualityChosen';
        this.hud?.showMessage(ctx.i18n.t(key, { quality }));
      }),
      // Hooks for later: music per zone listens to the same event.
      ctx.events.on('zoneEntered', ({ zoneId }) => this.showZoneName(zoneId)),
      ctx.events.on('placeFirstVisited', ({ triggerId }) => {
        const def = this.triggers?.defs.find((trigger) => trigger.id === triggerId);
        if (def?.firstVisitText) this.hud?.showMessage(ctx.i18n.t(def.firstVisitText));
      }),
      ctx.events.on('checkpointSet', () => this.hud?.showMessage(ctx.i18n.t('hud.checkpointSet'))),
    );
    this.debugTimer = window.setInterval(this.updateDebug, DEBUG_REFRESH_MS);
    // From now on frames count for the benchmark / auto-downgrade (not while a zone loads).
    ctx.quality.setMeasuring(this.loadingScreen === null);
  }

  exit(): void {
    this.ctx.quality.setMeasuring(false);
    // A zone still loading is thrown away when it arrives.
    this.loadToken++;
    this.hideLoading();
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.clearInterval(this.debugTimer);
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    for (const key of DEBUG_KEYS) this.ctx.debug.lines.delete(key);
    this.ctx.overlays.closeAll();
    if (!this.keepSessionOnExit) {
      // Travelling already put the destination in the save; the old position must not win.
      if (!this.travelling) this.syncSave();
      this.ctx.persist();
    }
    this.keepSessionOnExit = false;
    this.cheatPanel?.dispose();
    this.cheatPanel = null;
    this.cheats.reset();
    this.input?.detach();
    this.input = null;
    this.touch?.dispose();
    this.touch = null;
    this.surface?.remove();
    this.surface = null;
    this.pauseButton?.remove();
    this.pauseButton = null;
    this.lookHint?.remove();
    this.lookHint = null;
    this.hud?.dispose();
    this.hud = null;
    this.dialog?.dispose();
    this.dialog = null;
    this.damageNumbers?.dispose();
    this.damageNumbers = null;
    this.talkingTo = null;
    this.targetNpc = null;
    this.labels?.dispose();
    this.labels = null;
    this.ctx.renderer.setCamera(null);
    this.disposeScene();
  }

  update(dt: number): void {
    const { player, input, mover, movement, rig, streamer, sceneZone } = this;
    if (this.paused || this.travelling || !player || !input || !mover || !movement || !rig) return;
    if (!streamer && !sceneZone) return;
    const session = this.ctx.session;
    if (session) session.playTimeSeconds += dt;

    input.getMoveVector(this.moveInput);
    // Walking is relative to where the camera looks (W = away from the camera).
    screenToWorld(this.moveInput.x, this.moveInput.y, rig.orbit.yaw, this.moveWorld);
    this.command.x = this.moveWorld.x;
    this.command.z = this.moveWorld.z;
    if (this.dialog?.isOpen) {
      // Talking: you stand still; E, Space, Enter or a click shows the next line.
      this.command.x = 0;
      this.command.z = 0;
      const next = input.consumePressed('interact');
      const dash = input.consumePressed('dash');
      // A click both confirms and attacks; while talking it only shows the next line.
      input.consumePressed('attack');
      input.consumePressed('heavy');
      if (input.consumePressed('confirm') || next || dash) this.dialog.advance();
      this.swordInput.fast = false;
      this.swordInput.heavy = false;
    } else {
      input.consumePressed('confirm');
      // Interaction: E (or tapping the icon): talk to / pet an NPC, or rest at a checkpoint.
      if (input.consumePressed('interact')) this.interact();
      // Fast hit: left mouse button or the attack button (held = keeps attacking).
      this.swordInput.fast = input.consumePressed('attack') || input.isPressed('attack');
      this.swordInput.heavy = input.consumePressed('heavy');
    }

    player.beginStep();
    const s = player.state;
    const fromX = s.x;
    const fromZ = s.z;
    if (this.cheats.fly) {
      // Debug cheat: Space / ▲ up, Shift / ▼ down, through walls.
      input.consumePressed('dash');
      this.command.dash = false;
      const vertical = (input.isPressed('dash') ? 1 : 0) - (input.isPressed('down') ? 1 : 0);
      stepFlying(
        s,
        this.command,
        vertical,
        this.baseWalkSpeed * this.cheats.speed,
        dt,
        this.groundHeight,
        this.worldBounds,
      );
    } else {
      this.command.dash = input.consumePressed('dash');
      this.stepSwordAndMove(dt);
      // You cannot walk through people (or Treewardens, or monsters).
      if (this.npcs?.pushOut(s, movement.radius)) this.resolveCircle(s, movement.radius);
      if (this.enemies?.pushOut(s, movement.radius)) this.resolveCircle(s, movement.radius);
      this.checkGate(fromX, fromZ);
      if (sceneZone) {
        // Stairs, ledges and falling; under the water or off the map: back to the spawn.
        if (sceneZone.settle(s, dt) === 'lost') this.respawnInScene();
        sceneZone.setReferenceHeight(s.y);
      } else if (streamer) {
        s.y = streamer.heightAt(s.x, s.z);
      }
    }
    // Position first: entering a zone autosaves, and that save must have the new position.
    this.syncSave();
    if (sceneZone) {
      if (this.checkSceneExits()) return;
    } else if (this.checkZone()) {
      return;
    }
    if (session) {
      this.triggers?.update(s.x, s.z, session.visitedPlaces);
      this.checkpoints?.update(s.x, s.z, session.world);
    }
    this.updateNpcs(dt);
    // Monsters appear at dusk and at night; test areas only in debug mode.
    this.spawnWorld.spawning = this.ctx.dayNight?.spawning() ?? false;
    this.spawnWorld.testAreas = this.ctx.debug.isVisible;
    this.enemies?.stepSpawning(dt, s.x, s.z, this.spawnWorld);
    this.enemies?.step(dt, s.x, s.z, this.groundHeight, mover);
    this.updateCombatHud();
    this.hud?.rules.setEnergyFraction(s.energy / movement.maxEnergy);
    this.hud?.setBar('energy', s.energy / movement.maxEnergy);
  }

  /**
   * The sword and walking for one step. While a heavy hit winds up you walk slowly and cannot
   * dash. Starting an attack turns you towards the nearest enemy in front (aim assist). A hit
   * that lands damages every enemy in the swing arc.
   */
  private stepSwordAndMove(dt: number): void {
    const { player, movement, mover, sword, enemies } = this;
    const data = this.ctx.data;
    if (!player || !movement || !mover || !sword || !data) return;
    const s = player.state;
    const c = player.combat;
    const input = this.swordInput;
    const wants = input.fast || input.heavy || c.bufferedFast > 0 || c.bufferedHeavy > 0;
    const starting = wants && c.attackCooldown <= 0 && c.heavyWindup <= 0;
    if (starting && enemies && s.dashTime <= 0) {
      s.heading = assistedHeading(
        s.x,
        s.z,
        s.heading,
        enemies.shown,
        sword.aimRange,
        sword.aimHalfArc,
      );
    }
    // A dash in progress finishes first; attacks wait for it.
    const result =
      s.dashTime > 0
        ? stepSword(c, s, NO_SWORD_INPUT, sword, dt, this.swordResult)
        : stepSword(c, s, input, sword, dt, this.swordResult);
    if (result.landed !== 'none' && enemies) this.landHit(result);

    const windingUp = c.heavyWindup > 0;
    if (windingUp) this.command.dash = false;
    movement.walkSpeed =
      this.baseWalkSpeed * this.cheats.speed * (windingUp ? sword.heavyMoveFactor : 1);
    stepMovement(s, this.command, movement, dt, mover);
    regenOutOfCombat(c, data.player.regen.hpPerSecondOutOfCombat, dt);
  }

  /** Applies a landed swing to every enemy in its arc, with damage numbers. */
  private landHit(result: SwordResult): void {
    const { player, sword, enemies, enemyRenderer } = this;
    if (!player || !sword || !enemies) return;
    const s = player.state;
    let hitAny = false;
    for (let i = 0; i < enemies.shown.length; i++) {
      const e = enemies.shown[i];
      if (!e || !e.hittable) continue;
      if (!inSwingArc(s.x, s.z, s.heading, e.x, e.z, e.radius, sword.range, sword.halfArc)) {
        continue;
      }
      enemies.hit(e, result.damage);
      hitAny = true;
      const top = e.y + (enemyRenderer?.heightOf(e) ?? 1.5);
      const kind = result.landed === 'heavy' ? 'heavy' : result.combo ? 'combo' : 'normal';
      this.damageNumbers?.spawn(e.x, top, e.z, result.damage, kind);
    }
    if (hitAny) player.combat.sinceCombat = 0;
  }

  /** HP and mana bars, the "in a fight" rule and the low-HP rule (HUD rules from the concept). */
  private updateCombatHud(): void {
    const c = this.player?.combat;
    const hud = this.hud;
    if (!c || !hud) return;
    const fighting = c.inCombat;
    if (fighting !== this.hudInCombat) {
      this.hudInCombat = fighting;
      hud.rules.setCombat(fighting);
    }
    hud.setBar('hp', c.maxHp > 0 ? c.hp / c.maxHp : 0);
    hud.setBar('mana', c.maxMana > 0 ? c.mana / c.maxMana : 0);
    hud.rules.setHpFraction(c.maxHp > 0 ? c.hp / c.maxHp : 1);
  }

  private touchLabels(): { attack: string; heavy: string; dash: string } {
    const t = this.ctx.i18n;
    return {
      attack: t.t('controls.attack'),
      heavy: t.t('controls.heavy'),
      dash: t.t('controls.dash'),
    };
  }

  /** The closed city gate (condition false) holds the player back like a wall. */
  private checkGate(fromX: number, fromZ: number): void {
    const s = this.player?.state;
    if (!s || !this.triggers) return;
    const gate = this.triggers.blockingGate(s.x, s.z, this.conditionContext);
    if (!gate) {
      this.gateBlocked = false;
      return;
    }
    s.x = fromX;
    s.z = fromZ;
    s.dashTime = 0;
    if (!this.gateBlocked && gate.blockedText) {
      this.hud?.showMessage(this.ctx.i18n.t(gate.blockedText));
    }
    this.gateBlocked = true;
  }

  /** Instances (interiors, dungeons) come in a later phase; every entrance is still closed. */
  enterInstance(id: string): boolean {
    const exists = this.ctx.data?.zones.zones.some((zone) =>
      zone.instances.some((instance) => instance.id === id && instance.enabled),
    );
    if (exists) this.ctx.reportProblem(`Instance "${id}" is enabled but not built yet`);
    return false;
  }

  exitInstance(): void {
    // Nothing to leave yet: the player is always in the open world.
  }

  /** NPCs move, the conversation ends when you are far away, the interaction target updates. */
  private updateNpcs(dt: number): void {
    const { npcs, player, npcWorld } = this;
    if (!npcs || !player || !npcWorld) return;
    const s = player.state;
    npcs.update(dt, s.x, s.z, s.heading, npcWorld, this.talkingTo);
    const talking = this.talkingTo;
    if (talking) {
      const far = npcs.settings.interactRange * TALK_BREAK_RANGES + talking.solidRadius;
      if (!talking.shown || Math.hypot(talking.state.x - s.x, talking.state.z - s.z) > far) {
        this.dialog?.close();
      }
    }
    this.targetNpc = this.dialog?.isOpen ? null : npcs.nearestInteractable(s.x, s.z);
  }

  /**
   * E or a tap on the icon: talk to or pet the nearest NPC, otherwise rest at a checkpoint
   * (health and mana follow in phase 2).
   */
  private interact(): void {
    if (this.paused || this.dialog?.isOpen) return;
    const npc = this.targetNpc;
    if (npc) {
      this.interactWith(npc);
      return;
    }
    if (!this.checkpoints?.near) return;
    this.hud?.showMessage(this.ctx.i18n.t('hud.rested'));
  }

  private interactWith(npc: Npc): void {
    const { ctx } = this;
    const session = ctx.session;
    const data = ctx.data;
    if (!session || !data) return;
    if (!session.metNpcs.includes(npc.id)) {
      session.metNpcs.push(npc.id);
      ctx.events.emit('npcMet', { npcId: npc.id });
    }
    ctx.events.emit('npcTalked', { npcId: npc.id });
    if (npc.def.interaction === 'pet') {
      npc.hop = data.npcs.settings.petHopSeconds;
      if (npc.def.petText) this.hud?.showMessage(ctx.i18n.t(npc.def.petText));
      return;
    }
    const lines = dialogueLines(npc.def, data.triggers.conditions, this.conditionContext);
    this.talkingTo = npc;
    this.targetNpc = null;
    this.dialog?.open(npc.def.name, lines, () => {
      this.talkingTo = null;
    });
  }

  private showZoneName(zoneId: string | null): void {
    const zone = this.ctx.data?.zones.zones.find((entry: Zone) => entry.id === zoneId);
    if (!zone) return;
    this.hud?.showZone(zone.name);
    this.fogTarget.set(resolveColorToken(zone.fogColor));
  }

  render(alpha: number, frameSeconds: number): void {
    const { scene, rig, player, input, streamer, origin, worldRoot, sceneZone } = this;
    if (!scene || !rig || !player || !input || !origin || !worldRoot) {
      // Still loading a zone: only the loading screen shows.
      if (this.loadingScreen) this.ctx.renderer.clear();
      return;
    }
    // While paused the simulation stands still, so draw the last state without interpolating.
    const a = this.paused ? 1 : alpha;
    const s = player.state;

    if (streamer) {
      // Streaming: plan, request and build chunks within the frame budget.
      const dirX = s.moving ? Math.sin(s.heading) : 0;
      const dirZ = s.moving ? Math.cos(s.heading) : 0;
      streamer.update(s.x, s.z, dirX, dirZ);
      // Floating origin: the world is drawn shifted so the player stays near (0, 0, 0).
      // (A Blender-built zone is small and stays around its own origin.)
      origin.update(s.x, s.z);
    }
    worldRoot.position.set(-origin.x, 0, -origin.z);

    player.syncModel(a);
    if (this.sword) player.showSword(this.sword);
    this.npcRenderer?.update(a, this.ctx.data?.npcs.settings.petHopSeconds ?? 1);
    this.enemyRenderer?.update(a);
    input.consumeLook(this.look);
    const look = this.look;
    const turning = input.turningCamera || look.yaw !== 0 || look.pitch !== 0;
    const root = player.model.root;
    rig.orbit.update(
      this.paused ? 0 : frameSeconds,
      root.position.x,
      root.position.y,
      root.position.z,
      s.heading,
      s.moving,
      look,
      turning,
      this.ctx.session?.settings.cameraSensitivity ?? 1,
    );
    this.applyCamera();
    this.updateLighting(this.paused ? 0 : frameSeconds);
    this.updateSun(root.position.x - origin.x, root.position.y, root.position.z - origin.z);
    // The sea follows the player (one plane, always under the view).
    this.water?.position.set(root.position.x, this.water.position.y, root.position.z);
    // The sky stays around the camera.
    this.sky?.position.copy(rig.camera.position);
    if (sceneZone) this.updateLamps(s.x, s.y, s.z, origin.x, origin.z);
    this.touch?.update();
    this.updateLookHint(input);
    this.updateFog(scene, frameSeconds);
    this.updateInteraction(rig.camera, origin.x, origin.z, input.usedTouch || this.coarsePointer);
    this.labels?.update(
      this.ctx.debug.isVisible,
      rig.camera,
      window.innerWidth,
      window.innerHeight,
      origin.x,
      origin.z,
      s.x,
      s.z,
    );
    this.hud?.update(frameSeconds);
    this.damageNumbers?.update(
      this.paused ? 0 : frameSeconds,
      rig.camera,
      origin.x,
      origin.z,
      window.innerWidth,
      window.innerHeight,
    );
    this.ctx.renderer.render(scene, rig.camera);
  }

  /** Places the camera: kept above the terrain and in front of walls (open world or BVH). */
  private applyCamera(): void {
    const { rig, origin } = this;
    if (!rig || !origin) return;
    if (this.sceneZone) rig.apply(origin.x, origin.z, undefined, this.sceneZone);
    else rig.apply(origin.x, origin.z, this.streamer ?? undefined, this.structures ?? undefined);
  }

  /**
   * Fog and sky: in the open world they drift towards the color of the zone you are in, mixed
   * with the time of day; in a Blender-built zone they follow the time of day directly. The sky's
   * horizon always matches the fog, so the land fades into the sky.
   */
  private updateFog(scene: Scene, seconds: number): void {
    const fog = scene.fog as Fog;
    const lighting = this.lighting;
    if (this.sceneZone && lighting) {
      fog.color.copy(lighting.fog);
    } else {
      const amount = 1 - Math.exp(-FOG_SHARPNESS * seconds);
      this.zoneFog.lerp(this.fogTarget, amount);
      fog.color.copy(this.zoneFog);
      if (lighting) {
        fog.color.lerp(lighting.fog, lighting.worldFogMix);
        lighting.uniforms.skyHorizon.value.copy(fog.color);
      }
    }
    (scene.background as Color).copy(fog.color);
  }

  /**
   * Day and night for this frame: the shared uniforms (toon materials, sky) and the Three.js
   * lights of NPCs, monsters and the open world.
   */
  private updateLighting(seconds: number): void {
    const { lighting, hemi, sun } = this;
    const clock = this.ctx.dayNight;
    if (!lighting || !clock) return;
    lighting.update(clock, this.lightingMode, seconds);
    if (hemi) {
      hemi.color.copy(lighting.shadow);
      hemi.intensity = (HEMI_INTENSITY * lighting.shadowStrength) / lighting.refShadowStrength;
    }
    if (sun) {
      sun.color.copy(lighting.sun);
      sun.intensity = (SUN_INTENSITY * lighting.sunStrength) / lighting.refSunStrength;
    }
  }

  /**
   * High preset only: real lights at the lanterns nearest to the player (dusk and night), at most
   * `lanternLights.max` for the frame rate. Allocation-free: a small insertion sort.
   */
  private updateLamps(x: number, y: number, z: number, originX: number, originZ: number): void {
    const { lighting, sceneZone, preset } = this;
    if (!lighting || !sceneZone || !preset) return;
    const u = lighting.uniforms;
    const cfg = lighting.config.lanternLights;
    const max = Math.min(cfg.max, MAX_LAMPS);
    if (preset.id !== 'high' || !lighting.lanternsOn || max === 0) {
      u.lampCount.value = 0;
      return;
    }
    const best = this.lampBest;
    const bestD = this.lampBestD;
    let count = 0;
    const lanterns = sceneZone.lanterns;
    for (let i = 0; i < lanterns.length; i++) {
      const l = lanterns[i] as Vector3;
      const d = (l.x - x) ** 2 + (l.y - y) ** 2 + (l.z - z) ** 2;
      if (count === max && d >= (bestD[max - 1] as number)) continue;
      let k = count < max ? count++ : max - 1;
      while (k > 0 && (bestD[k - 1] as number) > d) {
        bestD[k] = bestD[k - 1] as number;
        best[k] = best[k - 1] as number;
        k--;
      }
      bestD[k] = d;
      best[k] = i;
    }
    for (let k = 0; k < count; k++) {
      const l = lanterns[best[k] as number] as Vector3;
      (u.lampPos.value[k] as Vector3).set(l.x - originX, l.y, l.z - originZ);
    }
    u.lampCount.value = count;
    const fade = Math.min(1, lighting.glow - cfg.minGlow + 0.2);
    u.lampCol.value.setHex(resolveColorToken(cfg.color)).multiplyScalar(cfg.strength * fade);
  }

  /** The interaction icon above the checkpoint you stand at (projected to the screen). */
  private updateInteraction(
    camera: Camera,
    originX: number,
    originZ: number,
    touch: boolean,
  ): void {
    const hud = this.hud;
    const npc = this.targetNpc;
    const near = npc ? null : this.checkpoints?.near;
    const data = this.ctx.data;
    if (!hud) return;
    if ((!npc && !near) || !data || this.paused || this.dialog?.isOpen) {
      hud.setInteraction(null, 0, 0, false);
      return;
    }
    let wx: number;
    let wy: number;
    let wz: number;
    if (npc) {
      wx = npc.state.x;
      wz = npc.state.z;
      wy = npc.state.y + (this.npcRenderer?.heightOf(npc) ?? 1.8) + ICON_ABOVE_HEAD;
    } else if (near) {
      wx = near.x;
      wz = near.z;
      wy = this.groundHeight(near.x, near.z) + data.player.hud.interactHeight;
    } else {
      return;
    }
    const p = this.labelPoint.set(wx - originX, wy, wz - originZ).project(camera);
    if (p.z > 1) {
      hud.setInteraction(null, 0, 0, false);
      return;
    }
    // Kept on screen (and in the upper half, away from the joystick and buttons), so it can
    // always be tapped.
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = Math.min(w - ICON_MARGIN, Math.max(ICON_MARGIN, ((p.x + 1) / 2) * w));
    const sy = Math.min(h * 0.5, Math.max(ICON_MARGIN * 2, ((1 - p.y) / 2) * h));
    hud.setInteraction(this.interactionLabel(npc), x, sy, !touch);
  }

  /** "Talk to Marco the Merchant", "Pet Pringle" or "Rest"; made only when it changes. */
  private interactionLabel(npc: Npc | null): string {
    const target = npc ?? 'rest';
    if (target === this.iconLabelFor) return this.iconLabel;
    const t = this.ctx.i18n;
    this.iconLabelFor = target;
    this.iconLabel = npc
      ? t.t(npc.def.interaction === 'pet' ? 'hud.pet' : 'hud.talkTo', { name: npc.def.name })
      : t.t('hud.rest');
    return this.iconLabel;
  }

  private readonly groundHeight = (x: number, z: number): number => {
    if (this.sceneZone) return this.sceneZone.heightAt(x, z);
    return this.streamer ? this.streamer.heightAt(x, z) : 0;
  };

  /** Pushes a circle out of walls: the open world's colliders or the Blender zone's BVH. */
  private resolveCircle(p: { x: number; z: number }, radius: number): void {
    if (this.sceneZone) this.sceneZone.resolve(p, radius);
    else this.collision?.resolve(p, radius);
  }

  /** Can a night monster appear here: on dry ground (not water, not off the map)? */
  private canStand(x: number, z: number): boolean {
    const zone = this.sceneZone;
    if (zone) return zone.hasGround(x, z) && zone.heightAt(x, z) > zone.waterY + 0.1;
    const terrain = this.ctx.data?.zones.world.terrain;
    return this.groundHeight(x, z) > (terrain?.seaLevel ?? 0) + 0.1;
  }

  /**
   * Seamless zone change: remember the zone and announce it (autosave, name banner). Walking
   * into a Blender-built zone loads it (loading screen); returns true then.
   */
  private checkZone(): boolean {
    const session = this.ctx.session;
    const player = this.player;
    if (!session || !player || !this.zones) return false;
    const s = player.state;
    const zone = this.zones.zoneAt(s.x, s.z);
    // Over the open sea (flying) there is no zone; keep the last one.
    if (!zone || zone.id === session.world.zone) return false;
    if (zone.scene) {
      // Arrive at the zone's spawn point nearest to where you walked in (e.g. the city gate).
      let best = zone.spawnPoints[0];
      let bestD = Infinity;
      for (const spawn of zone.spawnPoints) {
        const d = (spawn.x - s.x) ** 2 + (spawn.z - s.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = spawn;
        }
      }
      if (!best) return false;
      this.travel(zone.id, best.x, best.z, (best.headingDegrees ?? 0) * DEG);
      return true;
    }
    session.world.zone = zone.id;
    this.ctx.events.emit('zoneEntered', { zoneId: zone.id });
    return false;
  }

  /** Leaving a Blender-built zone through an exit (e.g. the land gate) loads the open world. */
  private checkSceneExits(): boolean {
    const def = this.sceneZoneDef?.scene;
    const player = this.player;
    if (!def || !player) return false;
    const s = player.state;
    for (const exit of def.exits) {
      if (!pointInShape(exit.shape, s.x, s.z)) continue;
      const to = this.zones?.zoneAt(exit.to.x, exit.to.z);
      const zoneId = to?.id ?? this.sceneZoneDef?.neighbors[0];
      if (!zoneId) return false;
      this.travel(zoneId, exit.to.x, exit.to.z, exit.to.headingDegrees * DEG);
      return true;
    }
    return false;
  }

  /**
   * Switches between a Blender-built zone and the open world: the destination goes into the save
   * (autosave, zone banner), then the world is built again for it, with a loading screen when
   * it is a Blender-built zone.
   */
  private travel(zoneId: string, x: number, z: number, heading: number): void {
    const session = this.ctx.session;
    if (!session || this.travelling) return;
    this.travelling = true;
    session.world.zone = zoneId;
    // A Blender-built zone finds its ground from above; the open world from its terrain.
    session.world.position = { x, y: ARRIVE_FROM_ABOVE, z };
    session.world.heading = heading;
    this.dialog?.close();
    this.ctx.events.emit('zoneEntered', { zoneId });
    this.ctx.persist();
    this.ctx.goto('world');
  }

  // ------------------------------------------------------------ loading a Blender-built zone

  /** Loads a Blender-built zone's files behind a loading screen, then builds the world. */
  private loadSceneZone(data: GameData, zone: Zone): void {
    const def = zone.scene;
    if (!def) return;
    const token = ++this.loadToken;
    this.showLoading(zone.name);
    loadSceneAssets(def, publicUrl(''), __BUILD_ID__, (fraction) => this.setLoading(fraction))
      .then((assets) => {
        if (token !== this.loadToken) {
          disposeSceneAssets(assets);
          return;
        }
        this.sceneAssets = assets;
        this.buildScene(data, zone);
        if (this.labels) this.ctx.ui.append(this.labels.root);
        this.hideLoading();
        // Building took a while; measuring frames for the auto preset starts now.
        this.ctx.quality.setMeasuring(!this.paused);
      })
      .catch((error: unknown) => {
        if (token !== this.loadToken) return;
        this.ctx.reportProblem(`could not load ${zone.name}: ${String(error)}`);
        this.showLoadError();
      });
  }

  private showLoading(zoneName: string): void {
    this.hideLoading();
    const t = this.ctx.i18n;
    this.loadingFill = el('div', { className: 'ui-loading-fill', attrs: { style: 'width: 0%' } });
    this.loadingScreen = el(
      'div',
      { className: 'ui-zone-loading', attrs: { role: 'status' } },
      el('h1', { className: 'ui-title', text: zoneName }),
      el('div', { className: 'ui-loading', attrs: { role: 'progressbar' } }, this.loadingFill),
      el('p', { className: 'ui-note', text: t.t('world.loading') }),
    );
    this.ctx.ui.append(this.loadingScreen);
  }

  private setLoading(fraction: number): void {
    if (this.loadingFill) this.loadingFill.style.width = `${Math.round(fraction * 100)}%`;
  }

  private showLoadError(): void {
    const screen = this.loadingScreen;
    if (!screen) return;
    const t = this.ctx.i18n;
    screen.append(
      el('p', { className: 'ui-text ui-error', text: t.t('world.loadFailed') }),
      el('button', {
        className: 'ui-button',
        text: t.t('pause.toTitle'),
        attrs: { type: 'button' },
        onClick: () => this.ctx.goto('title'),
      }),
    );
  }

  private hideLoading(): void {
    this.loadingScreen?.remove();
    this.loadingScreen = null;
    this.loadingFill = null;
  }

  /** Shows "click to look around" on mouse devices while the mouse is not captured. */
  private updateLookHint(input: Input): void {
    const show =
      !this.paused &&
      !input.usedTouch &&
      !input.pointerLocked &&
      !this.coarsePointer &&
      !this.dialog?.isOpen;
    if (show === this.lookHintShown || !this.lookHint) return;
    this.lookHintShown = show;
    this.lookHint.classList.toggle('ui-look-hint-visible', show);
  }

  /** Copies the player's position into the save (numbers only; no allocation). */
  private syncSave(): void {
    const world = this.ctx.session?.world;
    const player = this.player;
    if (!world || !player) return;
    const s = player.state;
    if (world.position) {
      world.position.x = s.x;
      world.position.y = s.y;
      world.position.z = s.z;
    } else {
      world.position = { x: s.x, y: s.y, z: s.z };
    }
    world.heading = s.heading;
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.ctx.quality.setMeasuring(false);
    this.input?.releasePointerLock();
    this.input?.releaseAll();
    this.hud?.setInteraction(null, 0, 0, false);
    this.syncSave();
    this.ctx.persist();
    this.ctx.overlays.open(
      pausePanel(this.ctx, () => {
        // Keys pressed in the menus (Space, E) must not act once the game resumes.
        this.input?.releaseAll();
        this.paused = false;
        this.ctx.quality.setMeasuring(true);
        // "Resume" is a click, so the mouse can be captured again straight away.
        if (this.input && !this.input.usedTouch) this.input.requestPointerLock();
      }),
    );
  }

  // ------------------------------------------------------------ cheats (debug only)

  /** Applies the cheat settings: walking speed, landing after flying, chunk borders. */
  private applyCheats(): void {
    const { movement, player } = this;
    if (movement) movement.walkSpeed = this.baseWalkSpeed * this.cheats.speed;
    if (player && (this.streamer || this.sceneZone) && !this.cheats.fly) {
      // Landing: back on the ground, pushed out of anything we flew into.
      this.resolveCircle(player.state, movement?.radius ?? 0.4);
      if (this.sceneZone) this.sceneZone.placeOnGround(player.state);
      else player.state.y = this.groundHeight(player.state.x, player.state.z);
    }
    this.input?.releaseAll();
    if (this.chunkDebug) {
      this.chunkDebug.lines.visible = this.cheats.chunkLines;
      if (this.cheats.chunkLines) this.chunkDebug.refresh();
    }
  }

  /**
   * Teleports to the first spawn point of a zone (debug cheat menu). Going into or out of a
   * Blender-built zone loads it (loading screen), like walking through its gate.
   */
  private teleport(zoneId: string): void {
    const data = this.ctx.data;
    const zone = data?.zones.zones.find((entry) => entry.id === zoneId);
    const spawn = zone?.spawnPoints[0];
    const { player, rig, origin } = this;
    if (!zone || !spawn || !player || !rig || !origin || !data) return;
    const heading = (spawn.headingDegrees ?? 0) * DEG;
    if (zone.scene || this.sceneZone) {
      if (zone.id !== this.sceneZoneDef?.id) {
        this.travel(zone.id, spawn.x, spawn.z, heading);
        return;
      }
      this.respawnInScene();
      this.syncSave();
      return;
    }
    player.place(spawn.x, this.groundHeight(spawn.x, spawn.z), spawn.z, player.state.heading);
    this.resolveCircle(player.state, data.player.movement.radius);
    player.state.y = this.groundHeight(player.state.x, player.state.z);
    player.place(player.state.x, player.state.y, player.state.z, player.state.heading);
    origin.reset(player.state.x, player.state.z);
    rig.orbit.snap(player.state.x, player.state.y, player.state.z, rig.orbit.yaw);
    this.dialog?.close();
    this.damageNumbers?.clear();
    if (this.npcWorld) {
      const s = player.state;
      this.npcs?.snapCompanions(s.x, s.z, s.heading, this.npcWorld);
    }
    this.syncSave();
    this.checkZone();
  }

  /** Debug: the save (with the current position) as a text code. */
  private exportSave(): string {
    const session = this.ctx.session;
    if (!session) return '';
    this.syncSave();
    this.ctx.persist();
    return this.ctx.saves.exportCode(session);
  }

  /**
   * Debug: replaces the save with an exported code and goes back to the title screen, where
   * Continue starts from the imported state.
   */
  private importSave(code: string): boolean {
    const { ctx } = this;
    const save = ctx.saves.importCode(code);
    if (!save) return false;
    ctx.session = save;
    ctx.persist();
    this.keepSessionOnExit = true;
    void ctx.i18n.setLanguage(save.language).then(() => {
      ctx.events.emit('languageChanged', { language: save.language });
    });
    ctx.events.emit('settingsChanged', {});
    ctx.goto('title');
    return true;
  }

  /** Debug: back to "Auto" without a chosen preset, so the benchmark runs again right away. */
  private rerunBenchmark(): void {
    const settings = this.ctx.session?.settings;
    if (!settings) return;
    settings.quality = 'auto';
    settings.autoQuality = null;
    this.ctx.persist();
    this.ctx.events.emit('settingsChanged', {});
  }

  // ------------------------------------------------------------ scene

  /**
   * Builds the world being played. `sceneZone` = a Blender-built zone whose assets are loaded
   * (Greyhaven): its meshes, BVH ground and walls, its own NPCs, places and monsters. Without it
   * the open world: streamed terrain, structures, sea and rivers, and everything outside
   * Blender-built zones. Player, camera, lights and day-night are the same for both.
   */
  private buildScene(data: GameData, sceneZone: Zone | null): void {
    const session = this.ctx.session;
    const zone = data.zones.zones.find((entry) => entry.id === session?.world.zone);
    const spawn = session?.world.position ?? { x: 0, y: 0, z: 0 };
    const preset = this.activePreset(data);
    this.preset = preset;
    const fogColor = resolveColorToken(zone?.fogColor ?? data.zones.world.outsideZoneFog);
    this.zoneFog.set(fogColor);
    const def = sceneZone?.scene ?? null;
    this.sceneZoneDef = sceneZone;
    this.lightingMode = (sceneZone ?? zone)?.lighting ?? 'cycle';

    const scene = new Scene();
    scene.background = new Color(fogColor);
    scene.fog = def
      ? new Fog(fogColor, def.fogNear, def.fogFar)
      : new Fog(fogColor, preset.fogFar * 0.35, preset.fogFar);
    // Day and night drive these lights, the fog, the sky and the toon materials.
    this.lighting = new DayNightLighting(data.daynight, resolveColorToken);
    const hemi = new HemisphereLight(palette.mistpaars, palette.schemerviolet, HEMI_INTENSITY);
    scene.add(hemi);
    this.hemi = hemi;
    const sun = new DirectionalLight(palette.zonsondergang, SUN_INTENSITY);
    scene.add(sun, sun.target);
    this.sun = sun;
    // Everything with world coordinates hangs under this group (shifted by the floating origin).
    const worldRoot = new Group();
    worldRoot.name = 'world';
    scene.add(worldRoot);

    const world = data.zones.world;
    const b = shapeBounds(world.bounds, emptyBox());
    this.worldBounds = b;
    this.zones = new ZoneLocator(data.zones.zones);
    this.origin = new FloatingOrigin(world.originShiftDistance, world.chunkSize);
    // A Blender-built zone is drawn around its own origin (never shifted while inside).
    this.origin.reset(def ? def.offset.x : spawn.x, def ? def.offset.z : spawn.z);
    // Places, checkpoints, NPCs and monsters of the world being played only.
    const playedZones = data.zones.zones.filter((entry) =>
      sceneZone ? entry.id === sceneZone.id : !entry.scene,
    );
    const playedIds = new Set(playedZones.map((entry) => entry.id));
    this.triggers = new Triggers(
      data.triggers.triggers.filter((trigger) => playedIds.has(trigger.zone)),
      data.triggers.conditions,
      this.ctx.events,
    );
    this.checkpoints = new Checkpoints(checkpointsOf(playedZones), this.ctx.events);
    this.fogTarget.set(fogColor);

    if (def && this.sceneAssets && this.lighting) {
      this.buildSceneZone(def, worldRoot);
    } else {
      this.buildOpenWorld(data, preset, worldRoot);
    }
    const viewDistance = def ? def.viewDistance : preset.fogFar + 20;
    this.sky = createSkyDome(this.lighting.uniforms, viewDistance * SKY_FRACTION);
    scene.add(this.sky);

    const appearance = normalizeAppearance(
      session?.character?.appearance ?? data.appearance.defaults,
      data.appearance,
    );
    const player = new Player(data.appearance, appearance);
    player.place(spawn.x, spawn.y, spawn.z, session?.world.heading ?? 0);
    // A save could put the player inside an obstacle (e.g. after the course changed).
    this.resolveCircle(player.state, data.player.movement.radius);
    if (this.sceneZone) {
      this.sceneZone.placeOnGround(player.state);
      if (!this.sceneZone.onMap(player.state.x, player.state.z)) this.placeAtSceneSpawn(player);
      player.place(player.state.x, player.state.y, player.state.z, player.state.heading);
      this.sceneZone.setReferenceHeight(player.state.y);
    } else {
      player.place(
        player.state.x,
        this.groundHeight(player.state.x, player.state.z),
        player.state.z,
        player.state.heading,
      );
    }
    player.state.energy = data.player.base.energy;
    player.state.sinceEnergySpent = data.player.regen.energyDelaySeconds;
    this.sword = swordConfig(data.player);
    const combat = player.combat;
    combat.lingerSeconds = this.sword.combatLingerSeconds;
    // Levels and saved HP come with XP in step 2.4; for now you start full at level 1.
    applyLevel(combat, data.player, 1);
    combat.hp = combat.maxHp;
    combat.mana = combat.maxMana;
    if (def && this.sceneAssets && this.lighting) {
      // The Blender character in the creator's colors; a soft round shadow under the feet.
      this.scenePlayer = buildPlayerModel(
        this.sceneAssets,
        def,
        this.lighting.uniforms,
        resolveColorToken,
        player.model.colors,
      );
      player.model.useModel(this.scenePlayer.root);
      const blob = new Mesh(
        new CircleGeometry(BLOB_RADIUS, 24),
        new MeshBasicMaterial({
          color: palette.nachtinkt,
          transparent: true,
          opacity: BLOB_OPACITY,
          depthWrite: false,
        }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.03;
      player.model.root.add(blob);
      this.blob = blob;
    } else {
      player.model.root.traverse((object) => {
        object.castShadow = true;
      });
    }
    worldRoot.add(player.model.root);
    this.player = player;

    this.npcWorld = {
      mover: this.mover as Mover,
      heightAt: this.groundHeight,
      resolve: (p, radius) => this.resolveCircle(p, radius),
    };
    this.npcs = new Npcs(data.npcs, this.ctx.seasons?.currentId() ?? '', resolveColorToken, (npc) =>
      playedIds.has(npc.zone),
    );
    this.npcRenderer = new NpcRenderer(this.npcs.list, worldRoot);
    // Monsters appear at the same distance as NPCs, on every graphics preset.
    this.enemies = new Enemies(
      playedZones,
      data.monsters,
      {
        showRadius: data.npcs.settings.showRadius,
        hideMargin: data.npcs.settings.hideMargin,
      },
      world.nightSpawning,
      world.seed,
    );
    this.enemyRenderer = new EnemyRenderer(this.enemies.list, worldRoot);
    this.safeAreas = new Map(
      data.zones.zones.flatMap((entry) => entry.areas.map((area) => [area.id, area.shape])),
    );

    this.rig = new CameraRig(data.player.camera, viewDistance);
    this.rig.orbit.snap(player.state.x, player.state.y, player.state.z, player.state.heading);
    this.applyCamera();
    this.ctx.renderer.setCamera(this.rig.camera);
    this.worldRoot = worldRoot;
    this.scene = scene;
    this.applyShadows(preset);
    this.updateLighting(0);
  }

  /** The open world: streamed terrain, placeholder structures, sea, rivers, chunk debug. */
  private buildOpenWorld(data: GameData, preset: QualityPreset, worldRoot: Group): void {
    const world = data.zones.world;
    const hash = new SpatialHash(8);
    this.collision = new CollisionWorld(hash, this.worldBounds);
    // Terrain: the same TerrainField runs in the worker (meshes) and here (unloaded ground).
    const genConfig = buildWorldGenConfig(data.zones, resolveColorToken, preset.density.props);
    const field = new TerrainField(genConfig.terrain);
    this.props = new PropLibrary(world.props.map((prop) => prop.model));
    const placed = placeStructures(
      data.zones.zones,
      (x, z) => field.heightAt(x, z),
      structureShape,
      world.chunkSize,
      world.terrain.structureSink,
    );
    this.structures = new StructureLayer(placed, worldRoot, hash, resolveColorToken);
    this.labels = new StructureLabels(this.structures);
    this.streamer = new WorldStreamer({
      config: genConfig,
      field,
      root: worldRoot,
      hash,
      props: this.props,
      propColliders: world.props.map((prop) => prop.colliderRadius),
      rings: preset.chunkRings,
      collisionRing: world.terrain.collisionRing,
      createWorker: () =>
        new Worker(new URL('../workers/terrain.worker.ts', import.meta.url), { type: 'module' }),
      listener: this.structures,
    });
    this.mover = new GroundedMover(this.collision, this.streamer, {
      maxRise: Math.tan(data.player.movement.slopeLimitDegrees * DEG),
      minHeight: world.terrain.seaLevel - world.terrain.deepWater,
    });

    const water = new Mesh(
      new PlaneGeometry(1, 1),
      new MeshLambertMaterial({ color: colorTokens.get('zeewater') ?? palette.nachtinkt }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = world.terrain.seaLevel;
    water.scale.set(preset.fogFar * WATER_SCALE, preset.fogFar * WATER_SCALE, 1);
    water.name = 'sea';
    worldRoot.add(water);
    this.water = water;

    const rivers = buildRiverWater(
      field,
      genConfig.terrain.rivers,
      world.terrain.riverWaterDrop,
      colorTokens.get('zeewater') ?? palette.nachtinkt,
    );
    if (rivers) worldRoot.add(rivers);

    const maxUnload = Math.max(...data.quality.presets.map((entry) => entry.chunkRings.unload));
    this.chunkDebug = new ChunkDebug(this.streamer, (maxUnload * 2 + 1) ** 2);
    this.chunkDebug.lines.visible = false;
    worldRoot.add(this.chunkDebug.lines);
  }

  /** A Blender-built zone from its loaded assets: meshes, collision, toon look. */
  private buildSceneZone(def: SceneDef, worldRoot: Group): void {
    const assets = this.sceneAssets;
    const lighting = this.lighting;
    const origin = this.origin;
    if (!assets || !lighting || !origin) return;
    const zone = new SceneZone(def, assets, lighting.uniforms, resolveColorToken);
    zone.setRenderOrigin(origin.x, origin.z);
    worldRoot.add(zone.group);
    lighting.uniforms.fogNear.value = def.fogNear;
    lighting.uniforms.fogFar.value = def.fogFar;
    lighting.uniforms.windowCol.value.setHex(resolveColorToken(def.windowColor));
    this.sceneZone = zone;
    this.mover = zone;
    // Tone mapping as in the Blender test page (lanterns glow without burning out).
    const three = this.ctx.renderer.three;
    this.savedToneMapping = three.toneMapping;
    three.toneMapping = NeutralToneMapping;
    three.toneMappingExposure = SCENE_EXPOSURE;
  }

  /** Puts the player at the zone's first spawn point (on the ground), e.g. after falling off. */
  private placeAtSceneSpawn(player: Player): void {
    const zone = this.sceneZoneDef;
    const spawn = zone?.spawnPoints[0];
    if (!spawn || !this.sceneZone) return;
    player.state.x = spawn.x;
    player.state.z = spawn.z;
    player.state.y = ARRIVE_FROM_ABOVE;
    player.state.heading = (spawn.headingDegrees ?? 0) * DEG;
    this.sceneZone.placeOnGround(player.state);
  }

  /** Under the water or off the map in a Blender-built zone: back at the spawn point. */
  private respawnInScene(): void {
    const { player, rig, sceneZone, npcWorld } = this;
    if (!player || !rig || !sceneZone) return;
    this.placeAtSceneSpawn(player);
    const s = player.state;
    player.place(s.x, s.y, s.z, s.heading);
    s.dashTime = 0;
    rig.orbit.snap(s.x, s.y, s.z, s.heading);
    this.damageNumbers?.clear();
    if (npcWorld) this.npcs?.snapCompanions(s.x, s.z, s.heading, npcWorld);
  }

  /** The graphics preset in use (chosen by the QualityManager). */
  private activePreset(data: GameData): QualityPreset {
    return (
      this.ctx.quality.preset ??
      presetFor(data.quality, chosenLevel(this.ctx.session?.settings ?? null, data.quality))
    );
  }

  /**
   * Shadows of the preset: none, small and crisp, or larger and softer. Only how it looks;
   * nothing in the gameplay depends on them (§2.3). A Blender-built zone uses the toon look
   * without shadow maps (a soft blob under the player instead).
   */
  private applyShadows(preset: QualityPreset): void {
    const sun = this.sun;
    if (!sun) return;
    const on = preset.shadows !== 'off' && preset.shadowDistance > 0 && !this.sceneZone;
    sun.castShadow = on;
    const shadow = sun.shadow;
    if (shadow.mapSize.x !== preset.shadowMapSize) {
      // A new size needs a new shadow map texture.
      shadow.map?.dispose();
      shadow.map = null;
      shadow.mapSize.set(preset.shadowMapSize, preset.shadowMapSize);
    }
    if (!on) return;
    const d = preset.shadowDistance;
    const cam = shadow.camera;
    cam.left = -d;
    cam.right = d;
    cam.top = d;
    cam.bottom = -d;
    cam.near = 1;
    cam.far = SUN_DISTANCE * 2;
    cam.updateProjectionMatrix();
    shadow.radius = preset.shadowSoftness;
    // Against "shadow acne" on the terrain; scaled to the size of one shadow texel.
    shadow.normalBias = (2 * d) / preset.shadowMapSize;
    shadow.bias = -0.0005;
  }

  /**
   * Keeps the light shining from the time of day's direction, and the shadow area centred on the
   * player (in drawing coordinates, after the floating origin). The centre moves in whole shadow
   * texels, so shadow edges do not crawl.
   */
  private updateSun(x: number, y: number, z: number): void {
    const sun = this.sun;
    const preset = this.preset;
    const dir = this.lighting?.uniforms.lightDir.value;
    if (!sun || !preset || !dir) return;
    const texel = sun.castShadow ? (2 * preset.shadowDistance) / preset.shadowMapSize : 1;
    const cx = Math.round(x / texel) * texel;
    const cz = Math.round(z / texel) * texel;
    sun.target.position.set(cx, y, cz);
    sun.position.set(
      cx + dir.x * SUN_DISTANCE,
      y + dir.y * SUN_DISTANCE,
      cz + dir.z * SUN_DISTANCE,
    );
  }

  /** Applies a changed graphics preset: fog, view distance, chunk rings, shadows, decoration. */
  private applyPreset(): void {
    const data = this.ctx.data;
    if (!data || !this.scene || !this.rig) return;
    const preset = this.activePreset(data);
    if (preset === this.preset) return;
    this.preset = preset;
    // A Blender-built zone keeps its own fog and view distance (one loaded city, no rings);
    // there the preset changes resolution, antialiasing and the lantern lights.
    if (this.streamer) {
      const fog = this.scene.fog as Fog;
      fog.near = preset.fogFar * 0.35;
      fog.far = preset.fogFar;
      this.rig.camera.far = preset.fogFar + 20;
      this.rig.camera.updateProjectionMatrix();
      this.sky?.scale.setScalar(1);
      if (this.sky) {
        this.sky.geometry.dispose();
        this.sky.geometry = new SphereGeometry((preset.fogFar + 20) * SKY_FRACTION, 32, 16);
      }
      this.water?.scale.set(preset.fogFar * WATER_SCALE, preset.fogFar * WATER_SCALE, 1);
      this.streamer.setRings(preset.chunkRings);
      this.streamer.setDecorDensity(preset.density.props);
    }
    this.applyShadows(preset);
  }

  private disposeScene(): void {
    this.player?.dispose();
    this.player = null;
    this.scenePlayer?.dispose();
    this.scenePlayer = null;
    this.blob?.geometry.dispose();
    (this.blob?.material as MeshBasicMaterial | undefined)?.dispose();
    this.blob = null;
    this.npcRenderer?.dispose();
    this.npcRenderer = null;
    this.enemyRenderer?.dispose();
    this.enemyRenderer = null;
    this.enemies = null;
    this.sword = null;
    this.npcs = null;
    this.npcWorld = null;
    this.safeAreas = null;
    this.chunkDebug?.dispose();
    this.chunkDebug = null;
    // The streamer first: unloading its chunks also takes the structures away.
    this.streamer?.dispose();
    this.streamer = null;
    this.structures?.dispose();
    this.structures = null;
    this.props?.dispose();
    this.props = null;
    // A Blender-built zone: its meshes, materials, textures and BVH.
    if (this.sceneZone && this.sceneAssets) this.sceneZone.dispose(this.sceneAssets);
    this.sceneZone = null;
    this.sceneAssets = null;
    this.sceneZoneDef = null;
    if (this.savedToneMapping !== null) {
      this.ctx.renderer.three.toneMapping = this.savedToneMapping;
      this.ctx.renderer.three.toneMappingExposure = 1;
      this.savedToneMapping = null;
    }
    // What is left: the rivers, the sea, the sky and the lights.
    this.scene?.traverse((object) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const material = object.material as MeshLambertMaterial | MeshLambertMaterial[];
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      }
      if (object instanceof InstancedMesh) object.dispose();
    });
    this.scene?.clear();
    this.sun?.shadow.dispose();
    this.sun = null;
    this.hemi = null;
    this.sky = null;
    this.lighting = null;
    this.scene = null;
    this.worldRoot = null;
    this.water = null;
    this.triggers = null;
    this.checkpoints = null;
    this.rig = null;
    this.collision = null;
    this.mover = null;
    this.origin = null;
    this.zones = null;
    this.preset = null;
  }

  private readonly updateDebug = (): void => {
    const debug = this.ctx.debug;
    this.cheatPanel?.setDebugVisible(debug.isVisible);
    this.cheatPanel?.sync();
    const { player, rig, streamer, origin, sceneZone } = this;
    if (this.cheats.chunkLines) this.chunkDebug?.refresh();
    if (!debug.isVisible || !player || !rig || !origin) return;
    const s = player.state;
    const o = rig.orbit;
    debug.lines.set(
      'pos',
      `${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)} · heading ${Math.round(s.heading / DEG)}°` +
        (this.cheats.fly ? ' · fly' : s.dashing ? ' · dash' : s.moving ? ' · walk' : ''),
    );
    debug.lines.set(
      'zone',
      `${this.ctx.session?.world.zone ?? '-'} · origin ${origin.x}, ${origin.z} (${origin.shifts} shifts)`,
    );
    if (streamer) {
      const st = streamer.stats(this.stats);
      debug.lines.set(
        'chunks',
        `near ${st.near} far ${st.far} loading ${st.loading} · worker ${st.workerMs.toFixed(1)} ms · apply max ${st.applyMsMax.toFixed(1)} ms · colliders ${st.colliders} · ${this.preset?.id ?? '?'}`,
      );
    } else if (sceneZone) {
      // Local position = Blender coordinates (x, -z, y), handy to compare with Blender.
      const def = sceneZone.def.offset;
      const lamps = this.lighting?.uniforms.lampCount.value ?? 0;
      debug.lines.set(
        'chunks',
        `scene · blender ${(s.x - def.x).toFixed(1)}, ${(def.z - s.z).toFixed(1)}, ${(s.y - def.y).toFixed(1)} · meshes ${sceneZone.meshCount} · lanterns ${sceneZone.lanterns.length} (${lamps} lit) · ${this.preset?.id ?? '?'}`,
      );
    }
    const near = this.checkpoints?.near;
    debug.lines.set(
      'places',
      `in ${this.triggers?.current(this.placesInside).join(', ') || '-'} · checkpoint ${this.ctx.session?.world.checkpoint ?? '-'}${near ? ' (here)' : ''} · structures ${this.structures?.active.length ?? 0} (${this.structures?.colliderCount ?? 0} colliders) · visited ${this.ctx.session?.visitedPlaces.length ?? 0}`,
    );
    debug.lines.set('npcs', this.npcDebugLine(s.x, s.z));
    debug.lines.set('energy', `${Math.round(s.energy)} · dash cd ${s.dashCooldown.toFixed(2)} s`);
    const c = player.combat;
    debug.lines.set(
      'combat',
      `hp ${Math.ceil(c.hp)}/${c.maxHp} · mana ${Math.round(c.mana)} · lvl ${c.level} · ` +
        `${c.heavyWindup > 0 ? 'heavy windup' : c.swing} · combo ${c.comboCount} · ` +
        `${c.inCombat ? 'in fight' : 'calm'} · enemies ${this.enemies?.shown.length ?? 0}/${this.enemies?.list.length ?? 0}`,
    );
    debug.lines.set(
      'camera',
      `yaw ${Math.round(o.yaw / DEG)}° pitch ${Math.round(o.pitch / DEG)}° dist ${o.distance.toFixed(1)} m · sens ${Math.round((this.ctx.session?.settings.cameraSensitivity ?? 1) * 100)}%`,
    );
    debug.lines.set('daynight', this.dayNightLine());
    debug.lines.set(
      'cheats',
      `speed ${this.cheats.speed}× · fly ${this.cheats.fly ? 'on' : 'off'} · F6 = cheat menu`,
    );
  };

  /** Debug: phase, time left, clock speed, lighting setting and night monsters. */
  private dayNightLine(): string {
    const clock = this.ctx.dayNight;
    if (!clock) return '-';
    const phase = clock.phase(this.dayPhase);
    const seconds = Math.ceil(phase.remainingMs / 1000);
    const left = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const speed = clock.overridden ? ` · test ${clock.speed}×` : '';
    const spawn = clock.spawning() ? 'spawning' : 'no spawning';
    return `${phase.id} · ${left} left${speed} · ${this.lightingMode} · ${spawn} · night monsters ${this.enemies?.nightAlive ?? 0}`;
  }

  /** Debug: NPCs shown, the target, met NPCs, Pringle's distance and nearby Treewardens. */
  private npcDebugLine(px: number, pz: number): string {
    const npcs = this.npcs;
    if (!npcs) return '-';
    const parts = [`npcs ${npcs.shownCount}/${npcs.list.length}`];
    if (this.talkingTo) parts.push(`talking ${this.talkingTo.id}`);
    else if (this.targetNpc) parts.push(`target ${this.targetNpc.id}`);
    parts.push(`met ${this.ctx.session?.metNpcs.length ?? 0}`);
    for (const npc of npcs.list) {
      if (!npc.shown) continue;
      const d = Math.hypot(npc.state.x - px, npc.state.z - pz);
      if (npc.companion) parts.push(`${npc.id} ${d.toFixed(1)} m`);
      else if (npc.def.monster && this.safeAreas) {
        const safe = !isAttackable(npc.def, npc.state.x, npc.state.z, this.safeAreas);
        parts.push(`${npc.id} ${Math.round(d)} m${safe ? ' safe' : ''}`);
      }
    }
    return parts.join(' · ');
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Overlays close themselves on Escape first; only an Escape with nothing open pauses.
    if (event.code === 'Escape' && !this.ctx.overlays.isOpen) {
      event.preventDefault();
      if (this.dialog?.isOpen) {
        this.dialog.close();
        return;
      }
      if (this.cheatPanel?.isOpen) {
        this.cheatPanel.toggle();
        return;
      }
      this.pause();
      return;
    }
    // F6: cheat menu (debug mode only). The mouse is released so the menu can be clicked.
    if (event.code === 'F6' && this.ctx.debug.isVisible && !this.paused) {
      event.preventDefault();
      this.cheatPanel?.setDebugVisible(true);
      if (!this.cheatPanel?.isOpen) this.input?.releasePointerLock();
      this.cheatPanel?.toggle();
    }
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.pause();
  };
}
