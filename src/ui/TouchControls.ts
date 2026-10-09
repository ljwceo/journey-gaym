import type { Action, Input } from '../core/Input';
import { el } from './dom';

export interface TouchLabels {
  attack: string;
  heavy: string;
  dash: string;
}

/**
 * On-screen controls for touch screens: the joystick (drawn where the thumb went down, lower
 * left) and the attack, heavy-hit and dash buttons (lower right). Both sit in fixed safe zones that the HUD must
 * never cover (see --joystick-zone-* and --button-zone-* in ui.css).
 * The touch input itself is handled by Input; this class only draws it.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly dash: HTMLButtonElement;
  private readonly attack: HTMLButtonElement;
  private readonly heavy: HTMLButtonElement;
  private shownJoystick = false;
  private shownButtons = false;
  private knobX = Number.NaN;
  private knobY = Number.NaN;

  constructor(
    private readonly input: Input,
    labels: TouchLabels,
    private readonly radiusPx: number,
  ) {
    this.knob = el('div', { className: 'ui-joystick-knob' });
    this.base = el(
      'div',
      { className: 'ui-joystick', attrs: { 'aria-hidden': 'true' } },
      this.knob,
    );
    this.base.style.width = this.base.style.height = `${radiusPx * 2}px`;
    this.attack = this.actionButton('ui-attack-button', 'attack');
    this.heavy = this.actionButton('ui-heavy-button', 'heavy');
    this.dash = this.actionButton('ui-dash-button', 'dash');
    this.setLabels(labels);
    this.root = el(
      'div',
      { className: 'ui-touch-controls' },
      this.base,
      this.attack,
      this.heavy,
      this.dash,
    );
    // Phones and tablets show the buttons from the start; other devices after the first touch.
    this.shownButtons = window.matchMedia('(pointer: coarse)').matches;
    this.root.classList.toggle('ui-touch-visible', this.shownButtons);
  }

  setLabels(labels: TouchLabels): void {
    const set = (button: HTMLButtonElement, label: string): void => {
      button.textContent = label;
      button.setAttribute('aria-label', label);
    };
    set(this.attack, labels.attack);
    set(this.heavy, labels.heavy);
    set(this.dash, labels.dash);
  }

  /** Call once per rendered frame; only touches the DOM when something changed. */
  update(): void {
    if (!this.shownButtons && this.input.usedTouch) {
      this.shownButtons = true;
      this.root.classList.add('ui-touch-visible');
    }
    const j = this.input.joystick;
    if (j.active !== this.shownJoystick) {
      this.shownJoystick = j.active;
      this.base.classList.toggle('ui-joystick-active', j.active);
      if (j.active) {
        this.base.style.left = `${j.originX - this.radiusPx}px`;
        this.base.style.top = `${j.originY - this.radiusPx}px`;
      }
    }
    if (j.active && (j.knobX !== this.knobX || j.knobY !== this.knobY)) {
      this.knobX = j.knobX;
      this.knobY = j.knobY;
      this.knob.style.transform = `translate(${j.knobX}px, ${j.knobY}px)`;
    }
  }

  dispose(): void {
    this.root.remove();
  }

  /**
   * A round button that holds an input action while pressed. pointerdown instead of click: no
   * delay, and it works while the other thumb is on the stick.
   */
  private actionButton(className: string, action: Action): HTMLButtonElement {
    const button = el('button', {
      className: `ui-touch-button ${className}`,
      attrs: { type: 'button' },
    });
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.input.usedTouch = true;
      this.input.press(action);
    });
    const release = (): void => this.input.release(action);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    return button;
  }
}
