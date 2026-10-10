import {
  type Camera,
  Color,
  Vector3,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
} from 'three';
import type { GameContext } from '../core/GameContext';
import { Random } from '../core/Random';
import { Input, type LookDelta } from '../core/Input';
import type { GameState } from '../core/StateMachine';
import type { GameData, ItemDef, NpcDef, QualityPreset, QuestDef } from '../data/types';
import { chosenLevel, presetFor } from '../render/quality';
import type { FollowTarget } from '../entities/Companion';
import type { Enemy } from '../entities/Enemy';
import { dialogueLines, type Npc } from '../entities/Npc';
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
import { Enemies, type EnemiesWorld } from '../systems/Enemies';
import {
  addItem,
  countItem,
  type DrinkResult,
  drinkPotion,
  GOLD_ITEM,
  type ItemStack,
  removeItem,
  rollDrops,
} from '../systems/Inventory';
import { QuestBook, type QuestEventKind } from '../systems/Quests';
import { addXp, deathGoldLoss, xpFraction, xpToNext } from '../systems/Progression';
import type { EnemyTarget } from '../systems/EnemyAI';
import { ARROW_HEIGHT, Projectiles, type ProjectileWorld } from '../systems/Projectiles';
import { EnemyRenderer } from '../render/EnemyRenderer';
import { ProjectileRenderer, WarningRenderer } from '../render/CombatEffects';
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
import { bagPanel } from '../ui/menus/BagPanel';
import { type BuyResult, shopPanel } from '../ui/menus/ShopPanel';
import { QuestTexts } from '../ui/questText';
import type { ChecklistRow } from '../ui/Dialog';
import { pausePanel } from '../ui/menus/PausePanel';
import type { Panel } from '../ui/Overlays';
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
import type { Zone } from '../data/types';
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
  'enemies',
  'quests',
  'camera',
  'cheats',
] as const;
/** Direction the sun shines from (normalized below); low and warm (style guide L1). */
const SUN_DIRECTION = new Vector3(-2, 3, 1.5).normalize();
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
/** "Protected here" shows at most this often (s) while you keep hitting a protected monster. */
const PROTECTED_MESSAGE_SECONDS = 4;
/** Arrows stop at colliders; this is their thickness (m) for that test. */
const ARROW_COLLIDE_RADIUS = 0.05;
/** Loot texts above a defeated monster stack this far (m) apart. */
const LOOT_TEXT_SPACING = 0.45;
/** What the cheat menu gives (debug only). */
const CHEAT_XP = 100;
const CHEAT_GOLD = 50;
const CHEAT_POTIONS = 5;
const CHEAT_SLIME_GEL = 3;
/** Not dying (the death timer is off). */
const NOT_DYING = -1;

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
  private mover: GroundedMover | null = null;
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
  private projectiles: Projectiles | null = null;
  private projectileRenderer: ProjectileRenderer | null = null;
  private warningRenderer: WarningRenderer | null = null;
  private enemiesWorld: EnemiesWorld | null = null;
  private projectileWorld: ProjectileWorld | null = null;
  /** HP reached 0 during this step; handled once the monsters finished their step. */
  private knockedOut = false;
  /** Seconds since dying started (fade to black, wake up, fade in); NOT_DYING otherwise. */
  private deathTimer = NOT_DYING;
  /** Gold lost by this death (taken from the save at once, shown when you wake up). */
  private deathGoldLost = 0;
  /** Where you wake up after dying. */
  private readonly respawn = { x: 0, z: 0 };
  private deathTitle = '';
  private deathText = '';
  /** Seconds until the next potion may be drunk. */
  private potionCooldown = 0;
  /** Rolls loot; a new seed every time the world is entered. */
  private lootRng = new Random(1);
  private items: ReadonlyMap<string, ItemDef> = new Map();
  /** Seconds until "protected here" may show again. */
  private protectedMessageTimer = 0;
  /** Seconds since the world was entered (drawing only: pulsing warnings). */
  private time = 0;
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
  /** True while the closed city gate holds the player back (the message shows once). */
  private gateBlocked = false;
  private readonly fogTarget = new Color();
  private readonly conditionContext: ConditionContext = { level: 1, completedQuests: new Set() };
  /** Quests from quests.json with the player's progress (changes the save in place). */
  private quests: QuestBook | null = null;
  private questTexts: QuestTexts | null = null;
  private readonly changedQuests: QuestDef[] = [];
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
  private bagButton: HTMLButtonElement | null = null;
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
  private readonly enemyTarget: EnemyTarget = { x: 0, z: 0, radius: 0.4, hostile: true };
  private readonly followTarget: FollowTarget = {
    x: 0,
    z: 0,
    heading: 0,
    moving: false,
    viewYaw: 0,
  };
  private readonly arrowProbe = { x: 0, z: 0 };
  private readonly drops: ItemStack[] = [];
  private readonly healed = { item: '', hp: 0, mana: 0 };
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

    this.buildScene(data);
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
    this.knockedOut = false;
    this.deathTimer = NOT_DYING;
    this.potionCooldown = 0;
    this.lootRng = new Random((Date.now() >>> 0) ^ 0x5eed);
    this.items = new Map(data.items.items.map((item) => [item.id, item]));
    this.quests = new QuestBook(data.quests.quests, session.quests);
    this.questTexts = new QuestTexts(data, t);
    this.conditionContext.completedQuests = this.quests.completed;
    this.applyWeapon();
    this.refreshQuestMarkers();
    this.hud.setGold(session.character?.gold ?? 0);
    this.hud.setXp(xpFraction(data.player, session.progress), false);
    this.refreshPotions();
    this.time = 0;
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
        grant: (kind) => this.grant(kind),
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
    this.bagButton = el('button', {
      className: 'ui-bag-button',
      attrs: { type: 'button', 'aria-label': t('bag.title') },
      onClick: () => this.openBag(),
    });
    ctx.ui.append(this.bagButton);
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
        this.bagButton?.setAttribute('aria-label', ctx.i18n.t('bag.title'));
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
      // Quests count what happens in the world.
      ctx.events.on('monsterDefeated', ({ monsterId }) => {
        this.recordQuest('kill', monsterId, 1);
        this.recordQuest('boss', monsterId, 1);
      }),
      ctx.events.on('playerRested', ({ checkpointId }) =>
        this.recordQuest('rest', checkpointId, 1),
      ),
      ctx.events.on('triggerEntered', ({ triggerId }) => this.recordQuest('visit', triggerId, 1)),
      ctx.events.on('itemBought', ({ itemId, count, npcId }) =>
        this.recordQuest('buy', itemId, count, npcId),
      ),
      ctx.events.on('itemsGained', ({ itemId, count }) => this.itemQuestProgress(itemId, count)),
      ctx.events.on('levelUp', () => this.refreshQuestMarkers()),
    );
    this.debugTimer = window.setInterval(this.updateDebug, DEBUG_REFRESH_MS);
    // From now on frames count for the benchmark / auto-downgrade.
    ctx.quality.setMeasuring(true);
  }

  exit(): void {
    this.ctx.quality.setMeasuring(false);
    window.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.clearInterval(this.debugTimer);
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    for (const key of DEBUG_KEYS) this.ctx.debug.lines.delete(key);
    this.ctx.overlays.closeAll();
    if (!this.keepSessionOnExit) {
      this.syncSave();
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
    this.bagButton?.remove();
    this.bagButton = null;
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
    this.quests = null;
    this.questTexts = null;
    this.labels?.dispose();
    this.labels = null;
    this.ctx.renderer.setCamera(null);
    this.disposeScene();
  }

  update(dt: number): void {
    const { player, input, mover, movement, rig, streamer } = this;
    if (this.paused || !player || !input || !mover || !movement || !rig || !streamer) return;
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
      input.consumePressed('potion');
      input.consumePressed('bag');
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
      if (input.consumePressed('potion')) this.drink(null);
      if (input.consumePressed('bag')) {
        this.openBag();
        return;
      }
    }
    this.potionCooldown = Math.max(0, this.potionCooldown - dt);
    if (this.deathTimer !== NOT_DYING) {
      // Dying: you can do nothing until you wake up at your checkpoint.
      this.command.x = 0;
      this.command.z = 0;
      input.consumePressed('dash');
      this.swordInput.fast = false;
      this.swordInput.heavy = false;
      this.stepDeath(dt);
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
      if (this.npcs?.pushOut(s, movement.radius)) this.collision?.resolve(s, movement.radius);
      if (this.enemies?.pushOut(s, movement.radius)) this.collision?.resolve(s, movement.radius);
      this.checkGate(fromX, fromZ);
      s.y = streamer.heightAt(s.x, s.z);
    }
    // Position first: entering a zone autosaves, and that save must have the new position.
    this.syncSave();
    this.checkZone();
    if (session) {
      this.triggers?.update(s.x, s.z, session.visitedPlaces);
      this.checkpoints?.update(s.x, s.z, session.world);
    }
    this.updateNpcs(dt);
    this.updateEnemies(dt);
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
      if (!e?.alive) continue;
      if (!inSwingArc(s.x, s.z, s.heading, e.x, e.z, e.radius, sword.range, sword.halfArc)) {
        continue;
      }
      if (!e.hittable) {
        this.showProtected(e);
        continue;
      }
      const defeated = enemies.hit(e, result.damage);
      hitAny = true;
      const top = e.y + (enemyRenderer?.heightOf(e) ?? 1.5);
      const kind = result.landed === 'heavy' ? 'heavy' : result.combo ? 'combo' : 'normal';
      this.damageNumbers?.spawn(e.x, top, e.z, result.damage, kind);
      if (defeated) this.defeated(e, top);
    }
    if (hitAny) player.combat.sinceCombat = 0;
  }

  /** "Treewarden is protected here." (elven city), not more often than every few seconds. */
  private showProtected(e: Enemy): void {
    if (this.protectedMessageTimer > 0) return;
    this.protectedMessageTimer = PROTECTED_MESSAGE_SECONDS;
    this.hud?.showMessage(this.ctx.i18n.t('hud.protected', { name: e.def.name }));
  }

  /**
   * Monsters and their arrows for one step. They only attack while the player can be attacked
   * (not with monsters switched off in the cheat menu).
   */
  private updateEnemies(dt: number): void {
    const { enemies, player, movement, enemiesWorld, projectiles, projectileWorld } = this;
    if (!enemies || !player || !movement || !enemiesWorld) return;
    const t = this.enemyTarget;
    t.x = player.state.x;
    t.z = player.state.z;
    t.radius = movement.radius;
    t.hostile = this.cheats.monsters && !this.cheats.fly && this.deathTimer === NOT_DYING;
    enemies.step(dt, t, enemiesWorld);
    if (projectiles && projectileWorld) projectiles.step(dt, t, projectileWorld, this.hurtPlayer);
    this.protectedMessageTimer = Math.max(0, this.protectedMessageTimer - dt);
    if (this.knockedOut) this.startDying();
  }

  /** A monster or an arrow hits the player: HP down, a red number and glow, maybe knocked out. */
  private readonly hurtPlayer = (damage: number): void => {
    const player = this.player;
    if (!player || damage <= 0) return;
    const c = player.combat;
    const s = player.state;
    if (this.knockedOut || this.deathTimer !== NOT_DYING) return;
    c.hp = Math.max(0, c.hp - damage);
    c.sinceCombat = 0;
    this.damageNumbers?.spawn(s.x, s.y + 2, s.z, damage, 'player');
    this.hud?.hurt();
    if (c.hp <= 0) this.knockedOut = true;
  };

  /**
   * HP reached 0 (concept "Doodgaan"): the screen fades to black, you lose 10% of your gold
   * (items, gear and resources stay), and you wake up at your last checkpoint with full HP
   * and mana. The monsters are back at full strength. The save gets the result at once (gold,
   * checkpoint, full health), so leaving or reloading during the black screen changes nothing.
   */
  private startDying(): void {
    this.knockedOut = false;
    const session = this.ctx.session;
    const data = this.ctx.data;
    const player = this.player;
    if (!session || !data || !player || this.deathTimer !== NOT_DYING) return;
    const t = this.ctx.i18n;
    this.deathTimer = 0;
    this.deathGoldLost = deathGoldLoss(
      session.character?.gold ?? 0,
      data.player.death.goldLossFraction,
    );
    if (session.character) session.character.gold -= this.deathGoldLost;
    // From now on the save holds where you will wake up (syncSave waits until then).
    const checkpoint = this.checkpoints?.byId(session.world.checkpoint);
    const zone = data.zones.zones.find((entry) => entry.id === data.player.start.zone);
    const start = zone?.spawnPoints.find((point) => point.id === data.player.start.spawnPoint);
    this.respawn.x = checkpoint?.x ?? start?.x ?? player.state.x;
    this.respawn.z = checkpoint?.z ?? start?.z ?? player.state.z;
    session.world.position = { x: this.respawn.x, y: 0, z: this.respawn.z };
    session.world.zone =
      this.zones?.zoneAt(this.respawn.x, this.respawn.z)?.id ?? session.world.zone;
    session.progress.hp = null;
    session.progress.mana = null;
    this.ctx.persist();
    this.deathTitle = t.t('death.title');
    this.deathText =
      this.deathGoldLost > 0
        ? t.t('death.goldLost', { amount: this.deathGoldLost, gold: this.goldName() })
        : t.t('death.wakeUp');
    this.dialog?.close();
  }

  /** One step of dying: fade out, (black) wake up at the checkpoint, fade back in. */
  private stepDeath(dt: number): void {
    const death = this.ctx.data?.player.death;
    if (!death) return;
    const before = this.deathTimer;
    this.deathTimer += dt;
    const wakeAt = death.fadeSeconds + death.blackSeconds;
    if (before < wakeAt && this.deathTimer >= wakeAt) this.wakeUpAfterDeath();
    if (this.deathTimer >= wakeAt + death.fadeSeconds) this.deathTimer = NOT_DYING;
  }

  private wakeUpAfterDeath(): void {
    const { player, enemies } = this;
    const session = this.ctx.session;
    const data = this.ctx.data;
    if (!player || !session || !data) return;
    enemies?.resetAll();
    this.projectiles?.clear();
    this.placePlayer(this.respawn.x, this.respawn.z);
    const c = player.combat;
    c.hp = c.maxHp;
    c.mana = c.maxMana;
    c.sinceCombat = Infinity;
    c.heavyWindup = 0;
    c.swing = 'none';
    player.state.energy = data.player.base.energy;
    const lost = this.deathGoldLost;
    if (session.character && lost > 0) {
      this.hud?.setGold(session.character.gold);
      this.hud?.rules.goldChanged();
    }
    this.ctx.events.emit('playerDied', { goldLost: lost });
    this.syncSave(true);
    this.ctx.persist();
  }

  /** The screen during dying (drawn every frame from the simulation's death timer). */
  private updateBlackout(): void {
    const death = this.ctx.data?.player.death;
    const hud = this.hud;
    if (!death || !hud) return;
    const time = this.deathTimer;
    if (time === NOT_DYING) {
      hud.setBlackout(0, '', '');
      return;
    }
    const fade = Math.max(1e-3, death.fadeSeconds);
    const wakeAt = death.fadeSeconds + death.blackSeconds;
    const opacity = time < wakeAt ? time / fade : 1 - (time - wakeAt) / fade;
    hud.setBlackout(opacity, this.deathTitle, this.deathText);
  }

  /**
   * The player defeated a monster: XP (maybe a level up) and its loot straight into the bag,
   * with short texts above the monster. Quests listen to `monsterDefeated`.
   */
  private defeated(e: Enemy, top: number): void {
    const data = this.ctx.data;
    const session = this.ctx.session;
    const player = this.player;
    if (!data || !session || !player) return;
    this.ctx.events.emit('monsterDefeated', { monsterId: e.def.id });
    let y = top + LOOT_TEXT_SPACING;
    if (e.def.xp > 0) {
      this.gainXp(e.def.xp);
      this.damageNumbers?.spawnText(e.x, y, e.z, `+${e.def.xp} XP`, 'xp');
      y += LOOT_TEXT_SPACING;
    }
    const drops = rollDrops(e.def, this.lootRng, this.drops);
    for (let i = 0; i < drops.length; i++) {
      const drop = drops[i] as ItemStack;
      this.gainItem(drop.item, drop.count);
      const name =
        drop.item === GOLD_ITEM ? this.goldName() : (this.items.get(drop.item)?.name ?? drop.item);
      this.damageNumbers?.spawnText(e.x, y, e.z, `+${drop.count} ${name}`, 'loot');
      y += LOOT_TEXT_SPACING;
    }
  }

  /** Adds XP; every new level gives more HP, mana and sword damage (and fills HP and mana). */
  private gainXp(amount: number): void {
    const data = this.ctx.data;
    const session = this.ctx.session;
    const player = this.player;
    if (!data || !session || !player || amount <= 0) return;
    const progress = session.progress;
    const levels = addXp(data.player, progress, amount);
    this.ctx.events.emit('xpGained', { amount });
    this.hud?.rules.xpGained();
    this.hud?.setXp(xpFraction(data.player, progress), levels > 0);
    if (levels <= 0) return;
    const c = player.combat;
    applyLevel(c, data.player, progress.level);
    if (data.player.levelUpRefill) {
      c.hp = c.maxHp;
      c.mana = c.maxMana;
    }
    this.conditionContext.level = progress.level;
    this.hud?.showMessage(this.ctx.i18n.t('hud.levelUp', { level: progress.level }));
    this.ctx.events.emit('levelUp', { level: progress.level });
    this.syncSave();
    this.ctx.persist();
  }

  /** Puts loot (or a reward) in the bag; gold goes to the gold counter (shown for a moment). */
  private gainItem(itemId: string, count: number): void {
    const character = this.ctx.session?.character;
    if (!character || count <= 0) return;
    if (itemId === GOLD_ITEM) {
      character.gold += count;
      this.hud?.setGold(character.gold);
      this.hud?.rules.goldChanged();
    } else {
      addItem(character.inventory, itemId, count);
      this.refreshPotions();
    }
    this.ctx.events.emit('itemsGained', { itemId, count });
  }

  /**
   * Drinks a potion: `itemId`, or with null the first one from player.json `potions.quickOrder`
   * (Q / the drink button). Says why when it cannot.
   */
  private drink(itemId: string | null): DrinkResult {
    const data = this.ctx.data;
    const character = this.ctx.session?.character;
    const player = this.player;
    if (!data || !character || !player || this.deathTimer !== NOT_DYING) return 'none';
    const order = itemId ? [itemId] : data.player.potions.quickOrder;
    const result = drinkPotion(
      character.inventory,
      order,
      this.items,
      player.combat,
      this.potionCooldown,
      this.healed,
    );
    const t = this.ctx.i18n;
    if (result === 'drunk') {
      this.potionCooldown = data.player.potions.cooldownSeconds;
      const s = player.state;
      if (this.healed.hp > 0)
        this.damageNumbers?.spawnText(s.x, s.y + 2, s.z, `+${Math.round(this.healed.hp)}`, 'heal');
      this.hud?.rules.healed();
      this.refreshPotions();
      this.ctx.events.emit('potionDrunk', { itemId: this.healed.item });
    } else if (result === 'none') {
      this.hud?.showMessage(t.t('hud.noPotion'));
    } else if (result === 'full') {
      this.hud?.showMessage(t.t('hud.alreadyFull'));
    }
    return result;
  }

  /** The number on the drink button: potions the drink key would use. */
  private refreshPotions(): void {
    const data = this.ctx.data;
    const bag = this.ctx.session?.character?.inventory;
    if (!data || !bag || !this.touch) return;
    let count = 0;
    for (const id of data.player.potions.quickOrder) count += countItem(bag, id);
    this.touch.setPotions(count);
  }

  /** "Gold" is a temporary name: it comes from items.json, not from the code. */
  private goldName(): string {
    return this.items.get(GOLD_ITEM)?.name ?? GOLD_ITEM;
  }

  /** "Level 3 · 40 / 220 XP" for the bag. */
  private xpLine(): string {
    const data = this.ctx.data;
    const progress = this.ctx.session?.progress;
    if (!data || !progress) return '';
    const need = xpToNext(data.player, progress.level);
    return this.ctx.i18n.t(Number.isFinite(need) ? 'bag.level' : 'bag.levelMax', {
      level: progress.level,
      xp: progress.xp,
      need,
    });
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

  private touchLabels(): { attack: string; heavy: string; dash: string; potion: string } {
    const t = this.ctx.i18n;
    return {
      attack: t.t('controls.attack'),
      heavy: t.t('controls.heavy'),
      dash: t.t('controls.dash'),
      potion: t.t('controls.potion'),
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
    const f = this.followTarget;
    f.x = s.x;
    f.z = s.z;
    f.heading = s.heading;
    f.moving = s.moving;
    f.viewYaw = this.rig?.orbit.yaw ?? s.heading;
    npcs.update(dt, f, npcWorld, this.talkingTo);
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
   * E or a tap on the icon: talk to or pet the nearest NPC, otherwise rest in the bed at a
   * checkpoint (full HP and mana, and a save).
   */
  private interact(): void {
    if (this.paused || this.dialog?.isOpen || this.deathTimer !== NOT_DYING) return;
    const npc = this.targetNpc;
    if (npc) {
      this.interactWith(npc);
      return;
    }
    const near = this.checkpoints?.near;
    const c = this.player?.combat;
    if (!near || !c) return;
    c.hp = c.maxHp;
    c.mana = c.maxMana;
    this.hud?.showMessage(this.ctx.i18n.t('hud.rested'));
    this.ctx.events.emit('playerRested', { checkpointId: near.id });
    this.syncSave();
    this.ctx.persist();
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
    // Talking counts for quests that send you to this NPC.
    this.recordQuest('talk', npc.id, 1);
    const talk = this.questConversation(npc.def);
    const lines =
      talk?.lines ?? dialogueLines(npc.def, data.triggers.conditions, this.conditionContext);
    this.talkingTo = npc;
    this.targetNpc = null;
    const shop = npc.def.shop;
    this.dialog?.open(
      npc.def.name,
      lines,
      (finished) => {
        this.talkingTo = null;
        // A merchant opens the shop after the last line (not after Escape or walking away).
        if (finished && shop) this.openShop(npc.def.name, npc.id, shop);
      },
      talk?.checklist ?? null,
    );
  }

  /**
   * What an NPC says about its quest, if it has one for you now: hand in a finished quest
   * (rewards right away), offer a new one (it starts right away), or say what is still missing.
   * Null = no quest; the NPC says its normal lines.
   */
  private questConversation(
    def: NpcDef,
  ): { lines: readonly string[]; checklist: (() => readonly ChecklistRow[]) | null } | null {
    const book = this.quests;
    const session = this.ctx.session;
    const bag = session?.character?.inventory;
    if (!book || !session || !bag) return null;
    const found = book.forNpc(def.id, session.progress.level, bag);
    const dialogue = found?.def.dialogue;
    if (!found || !dialogue) return null;
    const quest = found.def;
    const checklist = () => this.questTexts?.rows(book, quest, bag) ?? [];
    if (found.status === 'ready') {
      this.completeQuest(quest);
      return { lines: dialogue.complete, checklist: null };
    }
    if (found.status === 'available') {
      book.accept(quest.id);
      this.ctx.events.emit('questStarted', { questId: quest.id });
      // The giver's own "talk" objective counts now (e.g. listening to Old Bertha's tale).
      this.recordQuest('talk', def.id, 1, undefined, true);
      if (book.isReady(quest, bag)) {
        this.completeQuest(quest);
        return { lines: [...dialogue.offer, ...dialogue.complete], checklist: null };
      }
      this.hud?.showMessage(this.ctx.i18n.t('quest.ui.started', { name: quest.name }));
      this.refreshQuestMarkers();
      this.ctx.persist();
      return { lines: dialogue.offer, checklist };
    }
    return { lines: dialogue.progress, checklist };
  }

  /**
   * Counts something that happened for the running quests; says how far a quest is now, or
   * that it can be handed in. `quiet` counts without messages.
   */
  private recordQuest(
    kind: QuestEventKind,
    target: string,
    count: number,
    source?: string,
    quiet = false,
  ): void {
    const book = this.quests;
    if (!book) return;
    const changed = book.record(kind, target, count, this.changedQuests, source);
    if (changed.length === 0) return;
    if (!quiet) for (const def of changed) this.announceQuestProgress(def);
    this.refreshQuestMarkers();
    this.ctx.persist();
  }

  /** An item came into the bag: quests that need it say how far they are. */
  private itemQuestProgress(itemId: string, gained: number): void {
    const book = this.quests;
    if (!book) return;
    let any = false;
    const bag = this.ctx.session?.character?.inventory ?? [];
    for (const def of book.activeDefs()) {
      // Only while it was still needed: a 5th Slime Gel for a quest that wants 3 says nothing.
      const wants = def.objectives.some(
        (objective) =>
          (objective.type === 'find' || objective.type === 'deliver') &&
          objective.item === itemId &&
          countItem(bag, itemId) - gained < objective.count,
      );
      if (!wants) continue;
      this.announceQuestProgress(def);
      any = true;
    }
    if (any) this.refreshQuestMarkers();
  }

  /** "Steel and Slime · Bring Slime Gel to Hilda Ironhand 2/3", or "go back to Hilda". */
  private announceQuestProgress(def: QuestDef): void {
    const book = this.quests;
    const texts = this.questTexts;
    const bag = this.ctx.session?.character?.inventory;
    if (!book || !texts || !bag) return;
    const t = this.ctx.i18n;
    if (book.isReady(def, bag)) {
      this.hud?.showMessage(
        t.t('quest.ui.ready', { name: def.name, giver: texts.npcName(def.giver) }),
      );
      this.ctx.events.emit('questReady', { questId: def.id });
      return;
    }
    const objective = texts.firstOpenRow(book, def, bag);
    this.hud?.showMessage(t.t('quest.ui.progress', { name: def.name, objective }));
  }

  /**
   * Hands a quest in: delivered items leave the bag, then XP, gold, items, upgrades (Hilda's
   * sword) and unlocks (Rose's plot). Saved at once.
   */
  private completeQuest(def: QuestDef): void {
    const book = this.quests;
    const session = this.ctx.session;
    const character = session?.character;
    const player = this.player;
    if (!book || !session || !character || !player) return;
    if (!book.complete(def.id, character.inventory)) return;
    const t = this.ctx.i18n;
    this.hud?.showMessage(t.t('quest.ui.completed', { name: def.name }));
    const r = def.rewards;
    const s = player.state;
    let y = s.y + 2.2;
    if (r.xp > 0) {
      this.gainXp(r.xp);
      this.damageNumbers?.spawnText(s.x, y, s.z, `+${r.xp} XP`, 'xp');
      y += LOOT_TEXT_SPACING;
    }
    const gains = r.gold > 0 ? [{ item: GOLD_ITEM, count: r.gold }, ...r.items] : r.items;
    for (const stack of gains) {
      this.gainItem(stack.item, stack.count);
      const name = stack.item === GOLD_ITEM ? this.goldName() : this.itemName(stack.item);
      this.damageNumbers?.spawnText(s.x, y, s.z, `+${stack.count} ${name}`, 'loot');
      y += LOOT_TEXT_SPACING;
    }
    for (const upgrade of r.upgrades ?? []) {
      if (!removeItem(character.inventory, upgrade.from, 1)) continue;
      addItem(character.inventory, upgrade.to, 1);
      for (const [slot, itemId] of Object.entries(character.equipment)) {
        if (itemId === upgrade.from) character.equipment[slot] = upgrade.to;
      }
      this.hud?.showMessage(
        t.t('quest.ui.upgraded', {
          from: this.itemName(upgrade.from),
          to: this.itemName(upgrade.to),
        }),
      );
    }
    for (const unlock of r.unlocks ?? []) {
      if (!session.unlocks.includes(unlock)) session.unlocks.push(unlock);
    }
    this.applyWeapon();
    this.ctx.events.emit('questCompleted', { questId: def.id });
    this.refreshQuestMarkers();
    this.syncSave();
    this.ctx.persist();
  }

  /** The equipped weapon's damage bonus goes into every hit (Hilda's honed sword). */
  private applyWeapon(): void {
    const c = this.player?.combat;
    const weapon = this.ctx.session?.character?.equipment.weapon;
    if (!c) return;
    c.weaponBonus = (weapon && this.items.get(weapon)?.weapon?.damageBonus) || 0;
  }

  /** Gold diamonds above NPCs with a new quest, blue ones above NPCs to hand a quest in. */
  private refreshQuestMarkers(): void {
    const { npcs, quests } = this;
    const session = this.ctx.session;
    const bag = session?.character?.inventory;
    if (!npcs || !quests || !session || !bag) return;
    for (const npc of npcs.list) {
      const found = quests.forNpc(npc.id, session.progress.level, bag);
      npc.questMarker =
        found?.status === 'ready' ? 'handIn' : found?.status === 'available' ? 'offer' : 'none';
    }
  }

  /** Marco's shop: the game waits, gold shows at the top right (HUD rule "at a shop"). */
  private openShop(merchant: string, npcId: string, shop: NonNullable<NpcDef['shop']>): void {
    this.hud?.rules.setShop(true);
    this.openMenu((resume) =>
      shopPanel(
        this.ctx,
        merchant,
        shop,
        (itemId, price) => this.buy(itemId, price, npcId),
        () => {
          this.hud?.rules.setShop(false);
          resume();
        },
      ),
    );
  }

  /** Buys one item for `price` gold. */
  private buy(itemId: string, price: number, npcId: string): BuyResult {
    const character = this.ctx.session?.character;
    if (!character || character.gold < price) return 'notEnough';
    character.gold -= price;
    this.hud?.setGold(character.gold);
    this.hud?.rules.goldChanged();
    this.gainItem(itemId, 1);
    this.ctx.events.emit('itemBought', { itemId, count: 1, npcId });
    this.ctx.persist();
    return 'bought';
  }

  private itemName(itemId: string): string {
    return this.items.get(itemId)?.name ?? itemId;
  }

  private showZoneName(zoneId: string | null): void {
    const zone = this.ctx.data?.zones.zones.find((entry: Zone) => entry.id === zoneId);
    if (!zone) return;
    this.hud?.showZone(zone.name);
    this.fogTarget.set(resolveColorToken(zone.fogColor));
  }

  render(alpha: number, frameSeconds: number): void {
    const { scene, rig, player, input, streamer, origin, worldRoot } = this;
    if (!scene || !rig || !player || !input || !streamer || !origin || !worldRoot) return;
    // While paused the simulation stands still, so draw the last state without interpolating.
    const a = this.paused ? 1 : alpha;
    const s = player.state;

    // Streaming: plan, request and build chunks within the frame budget.
    const dirX = s.moving ? Math.sin(s.heading) : 0;
    const dirZ = s.moving ? Math.cos(s.heading) : 0;
    streamer.update(s.x, s.z, dirX, dirZ);

    // Floating origin: the world is drawn shifted so the player stays near (0, 0, 0).
    origin.update(s.x, s.z);
    worldRoot.position.set(-origin.x, 0, -origin.z);

    player.syncModel(a);
    if (this.sword) player.showSword(this.sword);
    this.npcRenderer?.update(a, this.ctx.data?.npcs.settings.petHopSeconds ?? 1);
    this.npcRenderer?.updateMarkers(a, this.time);
    if (!this.paused) this.time += frameSeconds;
    this.enemyRenderer?.update(a, this.time);
    if (this.enemies) this.warningRenderer?.update(this.enemies.shown, a);
    this.projectileRenderer?.update(a);
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
    rig.apply(origin.x, origin.z, streamer, this.structures ?? undefined);
    this.updateSun(root.position.x - origin.x, root.position.y, root.position.z - origin.z);
    // The sea follows the player (one plane, always under the view).
    this.water?.position.set(root.position.x, this.water.position.y, root.position.z);
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
    this.updateBlackout();
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

  /** Fog and sky drift towards the color of the zone you are in. */
  private updateFog(scene: Scene, seconds: number): void {
    const fog = scene.fog as Fog;
    const amount = 1 - Math.exp(-FOG_SHARPNESS * seconds);
    fog.color.lerp(this.fogTarget, amount);
    (scene.background as Color).copy(fog.color);
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
    if ((!npc && !near) || !data || this.paused || !this.streamer || this.dialog?.isOpen) {
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
      wy = this.streamer.heightAt(near.x, near.z) + data.player.hud.interactHeight;
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

  private readonly groundHeight = (x: number, z: number): number =>
    this.streamer ? this.streamer.heightAt(x, z) : 0;

  /** Seamless zone change: remember the zone and announce it (autosave, later name banner). */
  private checkZone(): void {
    const session = this.ctx.session;
    const player = this.player;
    if (!session || !player || !this.zones) return;
    const zone = this.zones.zoneAt(player.state.x, player.state.z);
    // Over the open sea (flying) there is no zone; keep the last one.
    if (!zone || zone.id === session.world.zone) return;
    session.world.zone = zone.id;
    this.ctx.events.emit('zoneEntered', { zoneId: zone.id });
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

  /** Copies the player's position, HP and mana into the save (numbers only; no allocation). */
  private syncSave(force = false): void {
    const world = this.ctx.session?.world;
    const player = this.player;
    if (!world || !player) return;
    // While dying the save already says where you wake up (see startDying).
    if (this.deathTimer !== NOT_DYING && !force) return;
    const s = player.state;
    if (world.position) {
      world.position.x = s.x;
      world.position.y = s.y;
      world.position.z = s.z;
    } else {
      world.position = { x: s.x, y: s.y, z: s.z };
    }
    world.heading = s.heading;
    const progress = this.ctx.session?.progress;
    if (progress) {
      progress.hp = player.combat.hp;
      progress.mana = player.combat.mana;
    }
  }

  private pause(): void {
    this.openMenu((resume) => pausePanel(this.ctx, resume));
  }

  /** The bag (I / B or the bag button); the game waits while it is open. */
  private openBag(): void {
    if (this.dialog?.isOpen || this.deathTimer !== NOT_DYING) return;
    this.openMenu((resume) =>
      bagPanel(
        this.ctx,
        (itemId) => {
          if (this.drink(itemId) === 'drunk') this.ctx.overlays.refreshTop();
        },
        () => this.xpLine(),
        () => {
          const bag = this.ctx.session?.character?.inventory ?? [];
          return this.quests && this.questTexts ? this.questTexts.summaries(this.quests, bag) : [];
        },
        resume,
      ),
    );
  }

  /** Pauses the game behind a menu panel; closing the panel resumes. */
  private openMenu(makePanel: (resume: () => void) => Panel): void {
    if (this.paused) return;
    this.paused = true;
    this.ctx.quality.setMeasuring(false);
    this.input?.releasePointerLock();
    this.input?.releaseAll();
    this.hud?.setInteraction(null, 0, 0, false);
    this.syncSave();
    this.ctx.persist();
    this.ctx.overlays.open(
      makePanel(() => {
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
    const { movement, player, streamer, collision } = this;
    if (movement) movement.walkSpeed = this.baseWalkSpeed * this.cheats.speed;
    if (player && streamer && collision && !this.cheats.fly) {
      // Landing: back on the ground, pushed out of anything we flew into.
      collision.resolve(player.state, movement?.radius ?? 0.4);
      player.state.y = streamer.heightAt(player.state.x, player.state.z);
    }
    this.input?.releaseAll();
    if (this.chunkDebug) {
      this.chunkDebug.lines.visible = this.cheats.chunkLines;
      if (this.cheats.chunkLines) this.chunkDebug.refresh();
    }
  }

  /** Teleports to the first spawn point of a zone (debug cheat menu). */
  private teleport(zoneId: string): void {
    const data = this.ctx.data;
    const zone = data?.zones.zones.find((entry) => entry.id === zoneId);
    const spawn = zone?.spawnPoints[0];
    if (!spawn) return;
    this.placePlayer(spawn.x, spawn.z);
  }

  /** Puts the player at (x, z) on the ground (teleport, waking up at the checkpoint). */
  private placePlayer(x: number, z: number): void {
    const data = this.ctx.data;
    const { player, streamer, collision, rig, origin } = this;
    if (!player || !streamer || !collision || !rig || !origin || !data) return;
    player.place(x, streamer.heightAt(x, z), z, player.state.heading);
    collision.resolve(player.state, data.player.movement.radius);
    player.state.y = streamer.heightAt(player.state.x, player.state.z);
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

  /** Debug: XP, gold or potions for testing levels, dying and drinking. */
  private grant(kind: 'xp' | 'gold' | 'potions' | 'slimeGel'): void {
    if (kind === 'xp') this.gainXp(CHEAT_XP);
    else if (kind === 'gold') this.gainItem(GOLD_ITEM, CHEAT_GOLD);
    else if (kind === 'slimeGel') this.gainItem('slime_gel', CHEAT_SLIME_GEL);
    else this.gainItem(this.ctx.data?.player.potions.quickOrder[0] ?? '', CHEAT_POTIONS);
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

  private buildScene(data: GameData): void {
    const session = this.ctx.session;
    const zone = data.zones.zones.find((entry) => entry.id === session?.world.zone);
    const spawn = session?.world.position ?? { x: 0, y: 0, z: 0 };
    const preset = this.activePreset(data);
    this.preset = preset;
    const fogColor = resolveColorToken(zone?.fogColor ?? data.zones.world.outsideZoneFog);

    const scene = new Scene();
    scene.background = new Color(fogColor);
    scene.fog = new Fog(fogColor, preset.fogFar * 0.35, preset.fogFar);
    // Warm low sun, cool twilight sky (style guide L1–L3).
    scene.add(new HemisphereLight(palette.mistpaars, palette.schemerviolet, 1.8));
    const sun = new DirectionalLight(palette.zonsondergang, 2);
    sun.position.copy(SUN_DIRECTION);
    scene.add(sun, sun.target);
    this.sun = sun;
    // Everything with world coordinates hangs under this group (shifted by the floating origin).
    const worldRoot = new Group();
    worldRoot.name = 'world';
    scene.add(worldRoot);

    const world = data.zones.world;
    const b = shapeBounds(world.bounds, emptyBox());
    this.worldBounds = b;
    const hash = new SpatialHash(8);
    this.collision = new CollisionWorld(hash, b);
    this.zones = new ZoneLocator(data.zones.zones);
    this.origin = new FloatingOrigin(world.originShiftDistance, world.chunkSize);
    this.origin.reset(spawn.x, spawn.z);

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
    this.triggers = new Triggers(data.triggers.triggers, data.triggers.conditions, this.ctx.events);
    this.checkpoints = new Checkpoints(checkpointsOf(data.zones.zones), this.ctx.events);
    this.fogTarget.set(fogColor);
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

    const appearance = normalizeAppearance(
      session?.character?.appearance ?? data.appearance.defaults,
      data.appearance,
    );
    const player = new Player(data.appearance, appearance);
    player.place(spawn.x, 0, spawn.z, session?.world.heading ?? 0);
    // A save could put the player inside an obstacle (e.g. after the course changed).
    this.collision.resolve(player.state, data.player.movement.radius);
    player.place(
      player.state.x,
      field.heightAt(player.state.x, player.state.z),
      player.state.z,
      player.state.heading,
    );
    player.state.energy = data.player.base.energy;
    player.state.sinceEnergySpent = data.player.regen.energyDelaySeconds;
    this.sword = swordConfig(data.player);
    const combat = player.combat;
    combat.lingerSeconds = this.sword.combatLingerSeconds;
    // Level, HP and mana from the save (null = full).
    const progress = session?.progress;
    const level = Math.min(data.player.maxLevel, Math.max(1, progress?.level ?? 1));
    applyLevel(combat, data.player, level);
    combat.hp = Math.min(combat.maxHp, progress?.hp ?? combat.maxHp);
    combat.mana = Math.min(combat.maxMana, progress?.mana ?? combat.maxMana);
    // Waking up with 0 HP would be dying again at once.
    if (combat.hp <= 0) combat.hp = combat.maxHp;
    this.conditionContext.level = level;
    player.model.root.traverse((object) => {
      object.castShadow = true;
    });
    worldRoot.add(player.model.root);
    this.player = player;

    const collision = this.collision;
    this.npcWorld = {
      mover: this.mover,
      heightAt: this.groundHeight,
      resolve: (p, radius) => collision.resolve(p, radius),
    };
    this.npcs = new Npcs(data.npcs, this.ctx.seasons?.currentId() ?? '', resolveColorToken);
    this.npcRenderer = new NpcRenderer(this.npcs.list, worldRoot, {
      offer: resolveColorToken('zonlicht'),
      handIn: resolveColorToken('magieblauw'),
    });
    const safeAreas = new Map(
      data.zones.zones.flatMap((entry) => entry.areas.map((area) => [area.id, area.shape])),
    );
    // Monsters appear at the same distance as NPCs, on every graphics preset.
    this.enemies = new Enemies(
      data.zones.zones,
      data.monsters,
      { showRadius: data.npcs.settings.showRadius, hideMargin: data.npcs.settings.hideMargin },
      safeAreas,
    );
    this.enemyRenderer = new EnemyRenderer(this.enemies.list, worldRoot);
    this.warningRenderer = new WarningRenderer(worldRoot, this.groundHeight);
    const projectiles = new Projectiles();
    this.projectiles = projectiles;
    this.projectileRenderer = new ProjectileRenderer(projectiles.list, worldRoot);
    const enemies = this.enemies;
    const mover = this.mover;
    this.enemiesWorld = {
      mover,
      heightAt: this.groundHeight,
      hitPlayer: (_e, damage) => this.hurtPlayer(damage),
      shoot: (e, tx, tz, speed, damage) =>
        projectiles.fire(
          e.x,
          e.y + ARROW_HEIGHT * (e.def.scale ?? 1),
          e.z,
          tx,
          tz,
          speed,
          damage,
          e.def.ai?.attack.range ?? 12,
        ),
      alert: (e) => enemies.alert(e),
    };
    const probe = this.arrowProbe;
    this.projectileWorld = {
      heightAt: this.groundHeight,
      blocked: (x, z) => {
        probe.x = x;
        probe.z = z;
        collision.resolve(probe, ARROW_COLLIDE_RADIUS);
        return probe.x !== x || probe.z !== z;
      },
    };

    this.rig = new CameraRig(data.player.camera, preset.fogFar + 20);
    this.rig.orbit.snap(player.state.x, player.state.y, player.state.z, player.state.heading);
    this.rig.apply(this.origin.x, this.origin.z, this.streamer, this.structures);
    this.ctx.renderer.setCamera(this.rig.camera);
    this.worldRoot = worldRoot;
    this.scene = scene;
    this.applyShadows(preset);
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
   * nothing in the gameplay depends on them (§2.3).
   */
  private applyShadows(preset: QualityPreset): void {
    const sun = this.sun;
    if (!sun) return;
    const on = preset.shadows !== 'off' && preset.shadowDistance > 0;
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
   * Keeps the shadow area centred on the player (in drawing coordinates, after the floating
   * origin). The centre moves in whole shadow texels, so shadow edges do not crawl.
   */
  private updateSun(x: number, y: number, z: number): void {
    const sun = this.sun;
    const preset = this.preset;
    if (!sun || !preset || !sun.castShadow) return;
    const texel = (2 * preset.shadowDistance) / preset.shadowMapSize;
    const cx = Math.round(x / texel) * texel;
    const cz = Math.round(z / texel) * texel;
    sun.target.position.set(cx, y, cz);
    sun.position.set(
      cx + SUN_DIRECTION.x * SUN_DISTANCE,
      y + SUN_DIRECTION.y * SUN_DISTANCE,
      cz + SUN_DIRECTION.z * SUN_DISTANCE,
    );
  }

  /** Applies a changed graphics preset: fog, view distance, chunk rings, shadows, decoration. */
  private applyPreset(): void {
    const data = this.ctx.data;
    if (!data || !this.scene || !this.rig || !this.streamer) return;
    const preset = this.activePreset(data);
    if (preset === this.preset) return;
    this.preset = preset;
    const fog = this.scene.fog as Fog;
    fog.near = preset.fogFar * 0.35;
    fog.far = preset.fogFar;
    this.rig.camera.far = preset.fogFar + 20;
    this.rig.camera.updateProjectionMatrix();
    this.water?.scale.set(preset.fogFar * WATER_SCALE, preset.fogFar * WATER_SCALE, 1);
    this.streamer.setRings(preset.chunkRings);
    this.streamer.setDecorDensity(preset.density.props);
    this.applyShadows(preset);
  }

  private disposeScene(): void {
    this.player?.dispose();
    this.player = null;
    this.npcRenderer?.dispose();
    this.npcRenderer = null;
    this.enemyRenderer?.dispose();
    this.enemyRenderer = null;
    this.warningRenderer?.dispose();
    this.warningRenderer = null;
    this.projectileRenderer?.dispose();
    this.projectileRenderer = null;
    this.projectiles = null;
    this.enemies = null;
    this.enemiesWorld = null;
    this.projectileWorld = null;
    this.sword = null;
    this.npcs = null;
    this.npcWorld = null;
    this.chunkDebug?.dispose();
    this.chunkDebug = null;
    // The streamer first: unloading its chunks also takes the structures away.
    this.streamer?.dispose();
    this.streamer = null;
    this.structures?.dispose();
    this.structures = null;
    this.props?.dispose();
    this.props = null;
    // What is left: the rivers, the sea and the lights.
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
    const { player, rig, streamer, origin } = this;
    if (this.cheats.chunkLines) this.chunkDebug?.refresh();
    if (!debug.isVisible || !player || !rig || !streamer || !origin) return;
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
    const st = streamer.stats(this.stats);
    debug.lines.set(
      'chunks',
      `near ${st.near} far ${st.far} loading ${st.loading} · worker ${st.workerMs.toFixed(1)} ms · apply max ${st.applyMsMax.toFixed(1)} ms · colliders ${st.colliders} · ${this.preset?.id ?? '?'}`,
    );
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
      `hp ${Math.ceil(c.hp)}/${c.maxHp} · mana ${Math.round(c.mana)} · lvl ${c.level} ` +
        `(${this.ctx.session?.progress.xp ?? 0} xp) · gold ${this.ctx.session?.character?.gold ?? 0} · ` +
        `${this.deathTimer !== NOT_DYING ? 'dying · ' : ''}` +
        `${c.heavyWindup > 0 ? 'heavy windup' : c.swing} · combo ${c.comboCount} · ` +
        `${c.inCombat ? 'in fight' : 'calm'}`,
    );
    debug.lines.set('enemies', this.enemyDebugLine(s.x, s.z));
    const quests = this.ctx.session?.quests;
    debug.lines.set(
      'quests',
      quests
        ? `active ${quests.active.map((q) => `${q.id}[${q.counts.join(',')}]`).join(' ') || '-'} · ` +
            `done ${quests.completed.length} · unlocks ${this.ctx.session?.unlocks.join(',') || '-'} · ` +
            `weapon +${c.weaponBonus}`
        : '-',
    );
    debug.lines.set(
      'camera',
      `yaw ${Math.round(o.yaw / DEG)}° pitch ${Math.round(o.pitch / DEG)}° dist ${o.distance.toFixed(1)} m · sens ${Math.round((this.ctx.session?.settings.cameraSensitivity ?? 1) * 100)}%`,
    );
    debug.lines.set(
      'cheats',
      `speed ${this.cheats.speed}× · fly ${this.cheats.fly ? 'on' : 'off'} · F6 = cheat menu`,
    );
  };

  /** Debug: monsters shown / in the world / in the pool, fighting, arrows, the nearest one. */
  private enemyDebugLine(px: number, pz: number): string {
    const enemies = this.enemies;
    if (!enemies) return '-';
    const near = enemies.nearest(px, pz);
    const nearText = near
      ? ` · nearest ${near.def.id} ${Math.hypot(near.x - px, near.z - pz).toFixed(1)} m ${near.mode}${near.mode === 'windup' && near.attackKind === 'special' ? ' (special)' : ''}${near.safe ? ' (safe)' : ''} ${Math.ceil(near.hp)}/${near.maxHp}`
      : '';
    return (
      `${enemies.shown.length} shown / ${enemies.activeCount} in world / ${enemies.list.length} pool · ` +
      `fighting ${enemies.engagedCount} · arrows ${this.projectiles?.activeCount ?? 0}` +
      `${this.cheats.monsters ? '' : ' · OFF (cheat)'}${nearText}`
    );
  }

  /** Debug: NPCs shown, the target, met NPCs and Pringle's distance. */
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
