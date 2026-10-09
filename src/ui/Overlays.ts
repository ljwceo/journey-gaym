import type { GameEventBus } from '../core/events';
import { el } from './dom';

/** A panel shown on top of a screen (Pause, Settings, a confirm question). */
export interface Panel {
  /** Builds the panel's content; called again when the language changes. */
  build(): HTMLElement;
  /** Called when the panel is closed (also when closed by Escape or `closeAll`). */
  onClose?(): void;
}

/**
 * Stack of overlay panels above the current screen. Escape closes the top panel.
 * Panels rebuild their text when the language changes.
 */
export class Overlays {
  private readonly stack: { panel: Panel; element: HTMLElement }[] = [];

  constructor(
    private readonly layer: HTMLElement,
    events: GameEventBus,
  ) {
    events.on('languageChanged', () => this.rebuildAll());
    window.addEventListener('keydown', this.onKeyDown);
  }

  get isOpen(): boolean {
    return this.stack.length > 0;
  }

  open(panel: Panel): void {
    const element = this.wrap(panel);
    this.stack.push({ panel, element });
    this.layer.append(element);
    element.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  /** Closes the top panel. */
  close(): void {
    const top = this.stack.pop();
    if (!top) return;
    top.element.remove();
    top.panel.onClose?.();
  }

  /** Closes every panel, e.g. when leaving a scene. */
  closeAll(): void {
    while (this.stack.length > 0) this.close();
  }

  /** Rebuilds the top panel, e.g. after a setting changed. */
  refreshTop(): void {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    const element = this.wrap(top.panel);
    top.element.replaceWith(element);
    top.element = element;
  }

  private rebuildAll(): void {
    for (const entry of this.stack) {
      const element = this.wrap(entry.panel);
      entry.element.replaceWith(element);
      entry.element = element;
    }
  }

  private wrap(panel: Panel): HTMLElement {
    return el('div', { className: 'ui-overlay' }, panel.build());
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Escape' && this.stack.length > 0) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    }
  };
}
