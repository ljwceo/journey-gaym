type Handler<T> = (payload: T) => void;

/**
 * Typed publish/subscribe bus. Systems talk through events instead of calling each other,
 * so later systems (quests, audio) can listen without changing existing code.
 *
 * `emit` does not allocate: handlers removed during an emit are nulled and compacted afterwards.
 */
export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, (Handler<never> | null)[]>();
  private emitDepth = 0;
  private dirty = false;

  /** Subscribes and returns an unsubscribe function. */
  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): () => void {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
    }
    list.push(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const index = list.indexOf(handler as Handler<never>);
    if (index < 0) return;
    if (this.emitDepth > 0) {
      list[index] = null;
      this.dirty = true;
    } else {
      list.splice(index, 1);
    }
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    this.emitDepth++;
    // Handlers added during this emit are not called until the next emit.
    const count = list.length;
    try {
      for (let i = 0; i < count; i++) {
        const handler = list[i] as Handler<Events[K]> | null | undefined;
        if (handler) handler(payload);
      }
    } finally {
      this.emitDepth--;
      if (this.emitDepth === 0 && this.dirty) this.compact();
    }
  }

  /** Number of active handlers for an event type (for tests and debugging). */
  count<K extends keyof Events>(type: K): number {
    const list = this.handlers.get(type);
    if (!list) return 0;
    let n = 0;
    for (const handler of list) if (handler) n++;
    return n;
  }

  clear(): void {
    this.handlers.clear();
  }

  private compact(): void {
    this.dirty = false;
    for (const list of this.handlers.values()) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (!list[i]) list.splice(i, 1);
      }
    }
  }
}
