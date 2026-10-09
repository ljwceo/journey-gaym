import type { GameContext } from '../core/GameContext';
import type { Input } from '../core/Input';
import { CHEAT_SPEEDS, type Cheats } from '../systems/Cheats';
import { el } from './dom';

export interface CheatPanelHandlers {
  teleport(zoneId: string): void;
  /** A cheat setting changed (speed, fly or chunk borders). */
  changed(): void;
}

/**
 * Debug-only cheat menu for quick testing: walk faster, fly through walls, teleport to a zone,
 * show chunk borders. Opens with F6 or the "Cheats" button (both only in debug mode). It is a
 * small panel at the side, so the game keeps running behind it. While flying on a touch screen,
 * ▲ / ▼ buttons appear next to the dash button.
 */
export class CheatPanel {
  readonly root: HTMLElement;
  private readonly openButton: HTMLButtonElement;
  private readonly flyButtons: HTMLElement;
  private panel: HTMLElement | null = null;
  private debugVisible = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly cheats: Cheats,
    private readonly zones: readonly { id: string; name: string }[],
    private readonly input: Input,
    private readonly handlers: CheatPanelHandlers,
  ) {
    this.openButton = el('button', {
      className: 'ui-cheats-button',
      attrs: { type: 'button' },
      onClick: () => this.toggle(),
    });
    const up = this.holdButton('ui-fly-up', '▲', 'dash');
    const down = this.holdButton('ui-fly-down', '▼', 'down');
    this.flyButtons = el('div', { className: 'ui-fly-buttons' }, up, down);
    this.root = el('div', { className: 'ui-cheats-layer' }, this.openButton, this.flyButtons);
    this.updateTexts();
    this.sync();
  }

  get isOpen(): boolean {
    return this.panel !== null;
  }

  /** Debug mode switched on or off; leaving debug mode switches every cheat off. */
  setDebugVisible(visible: boolean): void {
    if (visible === this.debugVisible) return;
    this.debugVisible = visible;
    if (!visible) {
      this.close();
      if (this.cheats.active || this.cheats.chunkLines) {
        this.cheats.reset();
        this.handlers.changed();
      }
    }
    this.sync();
  }

  toggle(): void {
    if (this.panel) this.close();
    else if (this.debugVisible) this.open();
  }

  /** Rebuilds the texts after a language change. */
  updateTexts(): void {
    const t = this.ctx.i18n.t.bind(this.ctx.i18n);
    this.openButton.textContent = t('cheats.open');
    const [up, down] = this.flyButtons.children;
    up?.setAttribute('aria-label', t('cheats.flyUp'));
    down?.setAttribute('aria-label', t('cheats.flyDown'));
    if (this.panel) this.rebuild();
  }

  dispose(): void {
    this.close();
    this.root.remove();
  }

  private open(): void {
    this.panel = this.build();
    this.root.append(this.panel);
  }

  private close(): void {
    this.panel?.remove();
    this.panel = null;
  }

  private rebuild(): void {
    if (!this.panel) return;
    const next = this.build();
    this.panel.replaceWith(next);
    this.panel = next;
  }

  private changed(): void {
    this.handlers.changed();
    this.sync();
    this.rebuild();
  }

  /** Shows the open button in debug mode, and on touch screens the ▲ / ▼ buttons while flying. */
  sync(): void {
    this.openButton.hidden = !this.debugVisible;
    this.flyButtons.hidden = !(this.debugVisible && this.cheats.fly && this.isTouch());
  }

  private build(): HTMLElement {
    const t = this.ctx.i18n.t.bind(this.ctx.i18n);
    const { cheats } = this;
    const chip = (label: string, active: boolean, onClick: () => void): HTMLButtonElement =>
      el('button', {
        className: active ? 'ui-chip ui-chip-active' : 'ui-chip',
        text: label,
        attrs: { type: 'button', 'aria-pressed': String(active) },
        onClick,
      });
    const toggle = (value: boolean, set: (on: boolean) => void): HTMLElement =>
      el(
        'div',
        { className: 'ui-chips' },
        chip(t('cheats.off'), !value, () => set(false)),
        chip(t('cheats.on'), value, () => set(true)),
      );
    const section = (label: string, ...content: (HTMLElement | null)[]): HTMLElement =>
      el(
        'div',
        { className: 'ui-cheats-section' },
        el('p', { className: 'ui-label', text: label }),
        ...content,
      );

    return el(
      'div',
      {
        className: 'ui-panel ui-cheats',
        attrs: { role: 'dialog', 'aria-label': t('cheats.title') },
      },
      el('h2', { className: 'ui-heading', text: t('cheats.title') }),
      el('p', { className: 'ui-note', text: t('cheats.note') }),
      section(
        t('cheats.speed'),
        el(
          'div',
          { className: 'ui-chips' },
          ...CHEAT_SPEEDS.map((speed) =>
            chip(`${speed}×`, cheats.speed === speed, () => {
              cheats.speed = speed;
              this.changed();
            }),
          ),
        ),
      ),
      section(
        t('cheats.fly'),
        toggle(cheats.fly, (on) => {
          cheats.fly = on;
          this.changed();
        }),
        cheats.fly
          ? el('p', {
              className: 'ui-note',
              text: t(this.isTouch() ? 'cheats.flyHintTouch' : 'cheats.flyHintKeys'),
            })
          : null,
      ),
      section(
        t('cheats.chunkLines'),
        toggle(cheats.chunkLines, (on) => {
          cheats.chunkLines = on;
          this.changed();
        }),
      ),
      section(
        t('cheats.teleport'),
        el(
          'div',
          { className: 'ui-chips' },
          // Zone names stay English in both languages (CLAUDE.md §2.6).
          ...this.zones.map((zone) =>
            chip(zone.name, false, () => this.handlers.teleport(zone.id)),
          ),
        ),
      ),
      el('button', {
        className: 'ui-button',
        text: t('cheats.close'),
        attrs: { type: 'button' },
        onClick: () => this.close(),
      }),
    );
  }

  private isTouch(): boolean {
    return this.input.usedTouch || window.matchMedia('(pointer: coarse)').matches;
  }

  /** A touch button that holds an input action while pressed. */
  private holdButton(className: string, label: string, action: 'dash' | 'down'): HTMLButtonElement {
    const button = el('button', {
      className: `ui-touch-button ui-fly-button ${className}`,
      text: label,
      attrs: { type: 'button' },
    });
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.input.press(action);
    });
    const release = (): void => this.input.release(action);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    return button;
  }
}
