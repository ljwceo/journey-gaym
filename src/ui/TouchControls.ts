import type { Input } from '../core/Input';
import { el } from './dom';

/**
 * On-screen controls for touch screens: the joystick (drawn where the thumb went down, lower
 * left) and the dash button (lower right). Both sit in fixed safe zones that the HUD must
 * never cover (see --joystick-zone-* and --button-zone-* in ui.css).
 * The touch input itself is handled by Input; this class only draws it.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly dash: HTMLButtonElement;
  private shownJoystick = false;
  private shownButtons = false;
  private knobX = Number.NaN;
  private knobY = Number.NaN;

  constructor(
    private readonly input: Input,
    dashLabel: string,
    private readonly radiusPx: number,
  ) {
    this.knob = el('div', { className: 'ui-joystick-knob' });
    this.base = el(
      'div',
      { className: 'ui-joystick', attrs: { 'aria-hidden': 'true' } },
      this.knob,
    );
    this.base.style.width = this.base.style.height = `${radiusPx * 2}px`;
    this.dash = el('button', {
      className: 'ui-touch-button ui-dash-button',
      text: dashLabel,
      attrs: { type: 'button', 'aria-label': dashLabel },
    });
    // pointerdown instead of click: no delay, and it works while the other thumb is on the stick.
    this.dash.addEventListener('pointerdown', this.onDashDown);
    this.dash.addEventListener('pointerup', this.onDashUp);
    this.dash.addEventListener('pointercancel', this.onDashUp);
    this.dash.addEventListener('contextmenu', (event) => event.preventDefault());
    this.root = el('div', { className: 'ui-touch-controls' }, this.base, this.dash);
    // Phones and tablets show the buttons from the start; other devices after the first touch.
    this.shownButtons = window.matchMedia('(pointer: coarse)').matches;
    this.root.classList.toggle('ui-touch-visible', this.shownButtons);
  }

  setDashLabel(label: string): void {
    this.dash.textContent = label;
    this.dash.setAttribute('aria-label', label);
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

  private readonly onDashDown = (event: PointerEvent): void => {
    event.preventDefault();
    this.input.usedTouch = true;
    this.input.press('dash');
  };

  private readonly onDashUp = (): void => {
    this.input.release('dash');
  };
}
