/** One game state (scene), e.g. Boot, Title or World. */
export interface GameState {
  /** Called when the machine switches to this state. */
  enter?(from: string | null): void;
  /** Called when leaving; must release everything the state created (meshes, listeners, DOM). */
  exit?(to: string): void;
  /** Fixed-step simulation update. */
  update?(dt: number): void;
  /** Per-frame render with interpolation factor. */
  render?(alpha: number, frameSeconds: number): void;
}

/**
 * Switches between game states. A requested change is applied at the start of the next
 * update, so a state never exits halfway through its own update or render.
 */
export class StateMachine<Id extends string = string> {
  private readonly states = new Map<Id, GameState>();
  private currentId: Id | null = null;
  private current: GameState | null = null;
  private pendingId: Id | null = null;

  constructor(private readonly onChange?: (from: Id | null, to: Id) => void) {}

  get id(): Id | null {
    return this.currentId;
  }

  register(id: Id, state: GameState): this {
    if (this.states.has(id)) throw new Error(`State already registered: ${id}`);
    this.states.set(id, state);
    return this;
  }

  /** Requests a change; it happens before the next update (or call `applyPending()` yourself). */
  change(id: Id): void {
    if (!this.states.has(id)) throw new Error(`Unknown state: ${id}`);
    this.pendingId = id;
  }

  /** Applies a requested change now. Returns whether the state changed. */
  applyPending(): boolean {
    const nextId = this.pendingId;
    if (nextId === null) return false;
    this.pendingId = null;
    const next = this.states.get(nextId);
    if (!next) return false;

    const fromId = this.currentId;
    this.current?.exit?.(nextId);
    this.currentId = nextId;
    this.current = next;
    next.enter?.(fromId);
    this.onChange?.(fromId, nextId);
    return true;
  }

  update(dt: number): void {
    this.applyPending();
    this.current?.update?.(dt);
  }

  render(alpha: number, frameSeconds: number): void {
    this.current?.render?.(alpha, frameSeconds);
  }
}
