import type { GameState } from './StateMachine';

/**
 * A game state whose code is downloaded only when it is first needed (or preloaded earlier),
 * so big scenes do not make the first download larger. Until the code has arrived the state
 * does nothing; then it enters the real state, unless the game already moved on.
 */
export class LazyState implements GameState {
  private state: GameState | null = null;
  private loading: Promise<GameState | null> | null = null;
  private active = false;
  private enteredFrom: string | null = null;
  private entered = false;

  constructor(
    private readonly load: () => Promise<GameState>,
    private readonly onError: (message: string) => void,
  ) {}

  /** Starts downloading the state's code without entering it. */
  preload(): Promise<GameState | null> {
    this.loading ??= this.load().then(
      (state) => (this.state = state),
      (error: unknown) => {
        this.loading = null; // allow a retry on the next enter
        this.onError(`could not load scene: ${String(error)}`);
        return null;
      },
    );
    return this.loading;
  }

  get isLoaded(): boolean {
    return this.state !== null;
  }

  enter(from: string | null): void {
    this.active = true;
    this.enteredFrom = from;
    if (this.state) {
      this.enterNow();
      return;
    }
    void this.preload().then(() => {
      if (this.active && !this.entered && this.state) this.enterNow();
    });
  }

  exit(to: string): void {
    this.active = false;
    if (this.entered) this.state?.exit?.(to);
    this.entered = false;
  }

  update(dt: number): void {
    if (this.entered) this.state?.update?.(dt);
  }

  render(alpha: number, frameSeconds: number): void {
    if (this.entered) this.state?.render?.(alpha, frameSeconds);
  }

  private enterNow(): void {
    this.entered = true;
    this.state?.enter?.(this.enteredFrom);
  }
}
