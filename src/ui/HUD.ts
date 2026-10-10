import { el } from './dom';
import { type HudBars, type HudConfig, HudRules, HudVisibility } from './HudVisibility';

type BarId = 'hp' | 'mana' | 'energy' | 'xp';
const BAR_IDS: readonly BarId[] = ['hp', 'mana', 'energy', 'xp'];

/** One faded HUD element: its DOM node and why it is visible. */
class HudPart {
  readonly visibility = new HudVisibility();
  private shown = false;

  constructor(readonly element: HTMLElement) {}

  update(dt: number): void {
    this.visibility.update(dt);
    const visible = this.visibility.visible;
    if (visible === this.shown) return;
    this.shown = visible;
    this.element.classList.toggle('ui-hud-shown', visible);
  }
}

/**
 * The subtle in-game HUD (concept: "usually you see nothing"). Every element fades in when
 * there is a reason and fades out again (see HudVisibility / HudRules):
 * - zone name banner when entering a zone (top center),
 * - messages: first-visit texts, checkpoint, blocked gate, ... (one at a time, queued),
 * - HP / mana / energy / XP bars (top left) and gold (top right), following the HUD rules,
 * - the interaction icon above the nearest object you can use (tap it on a phone).
 * Everything sits at the top of the screen, so it never covers the joystick or the buttons
 * (their safe zones are the lower corners). Times come from player.json `hud`.
 */
/** Seconds the red edge glow stays on after a hit (then it fades out). */
const HURT_SECONDS = 0.12;

export class HUD {
  readonly root: HTMLElement;
  readonly rules: HudRules;
  private readonly banner: HudPart;
  private readonly message: HudPart;
  private readonly interact: HudPart;
  private readonly bars: Record<BarId, HudPart>;
  private readonly fills: Record<BarId, HTMLElement>;
  private readonly fillValues: Record<BarId, number> = { hp: 1, mana: 1, energy: 1, xp: 0 };
  private readonly gold: HudPart;
  private readonly goldValue: HTMLElement;
  private readonly interactLabel: HTMLElement;
  private readonly interactKey: HTMLElement;
  private readonly queue: string[] = [];
  /** Seconds until the next queued message may appear (lets the previous one fade out). */
  private messageGap = 0;
  private interactX = Number.NaN;
  private interactY = Number.NaN;
  /** Red glow at the screen edges when the player is hit. */
  private readonly hurtGlow: HTMLElement;
  private hurtTime = 0;
  private hurtShown = false;

  constructor(
    private readonly cfg: HudConfig,
    lowHpFraction: number,
    onInteract: () => void,
  ) {
    const part = (className: string, ...children: HTMLElement[]): HudPart =>
      new HudPart(el('div', { className: `ui-hud-part ${className}` }, ...children));

    this.banner = part('ui-hud-banner');
    this.message = part('ui-hud-message');

    this.interactKey = el('span', { className: 'ui-hud-interact-key', text: 'E' });
    this.interactLabel = el('span', { className: 'ui-hud-interact-label' });
    const interactButton = el(
      'button',
      { className: 'ui-hud-part ui-hud-interact', attrs: { type: 'button' } },
      this.interactKey,
      this.interactLabel,
    );
    // pointerdown: no click delay on phones; the event must not reach the camera surface.
    interactButton.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      if (this.interact.visibility.visible) onInteract();
    });
    this.interact = new HudPart(interactButton);

    const fills = {} as Record<BarId, HTMLElement>;
    const bars = {} as Record<BarId, HudPart>;
    const barStack = el('div', { className: 'ui-hud-bars' });
    for (const id of BAR_IDS) {
      fills[id] = el('div', { className: 'ui-hud-bar-fill' });
      bars[id] = part(`ui-hud-bar ui-hud-bar-${id}`, fills[id]);
      barStack.append(bars[id].element);
    }
    this.fills = fills;
    this.bars = bars;
    for (const id of BAR_IDS) this.applyFill(id, this.fillValues[id]);

    this.goldValue = el('span', { className: 'ui-hud-gold-value', text: '0' });
    this.gold = part('ui-hud-gold', el('span', { className: 'ui-hud-gold-coin' }), this.goldValue);

    this.hurtGlow = el('div', { className: 'ui-hud-hurt' });
    this.root = el(
      'div',
      { className: 'ui-hud', attrs: { 'aria-live': 'polite' } },
      this.hurtGlow,
      this.banner.element,
      this.message.element,
      barStack,
      this.gold.element,
      this.interact.element,
    );
    this.root.style.setProperty('--hud-fade', `${cfg.fadeSeconds}s`);

    const visibility: HudBars = {
      hp: bars.hp.visibility,
      mana: bars.mana.visibility,
      energy: bars.energy.visibility,
      xp: bars.xp.visibility,
      gold: this.gold.visibility,
    };
    this.rules = new HudRules(visibility, cfg, lowHpFraction);
  }

  /** The zone name, big and calm, for a few seconds. */
  showZone(name: string): void {
    this.banner.element.textContent = name;
    this.banner.visibility.show('zone', this.cfg.zoneBannerSeconds);
  }

  /** Queues a short message (shown one at a time). The same text twice in a row is skipped. */
  showMessage(text: string): void {
    if (this.queue[this.queue.length - 1] === text) return;
    if (this.message.visibility.visible && this.message.element.textContent === text) return;
    this.queue.push(text);
  }

  /** Bar fill 0–1 (only touches the DOM when the value really changed). */
  setBar(id: BarId, fraction: number): void {
    const value = Math.min(1, Math.max(0, fraction));
    if (Math.abs(value - this.fillValues[id]) < 0.005) return;
    this.fillValues[id] = value;
    this.applyFill(id, value);
  }

  setGold(amount: number): void {
    const text = String(amount);
    if (this.goldValue.textContent !== text) this.goldValue.textContent = text;
  }

  /**
   * Shows the interaction icon at screen position (CSS px) with a label, or hides it (null).
   * `keyHint` false hides the "E" (touch screens: you tap the icon instead).
   */
  setInteraction(label: string | null, x: number, y: number, keyHint: boolean): void {
    if (label === null) {
      this.interact.visibility.hide('near');
      return;
    }
    this.interact.visibility.show('near');
    if (this.interactLabel.textContent !== label) this.interactLabel.textContent = label;
    this.interactKey.hidden = !keyHint;
    // Whole pixels: no sub-pixel jitter and fewer style writes.
    const px = Math.round(x);
    const py = Math.round(y);
    if (px === this.interactX && py === this.interactY) return;
    this.interactX = px;
    this.interactY = py;
    this.interact.element.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`;
  }

  /** Call every rendered frame with real seconds (fades and timers are fps-independent). */
  /** A short red glow at the screen edges: the player was hit. */
  hurt(): void {
    this.hurtTime = HURT_SECONDS;
  }

  update(seconds: number): void {
    this.updateMessages(seconds);
    this.hurtTime = Math.max(0, this.hurtTime - seconds);
    const hurt = this.hurtTime > 0;
    if (hurt !== this.hurtShown) {
      this.hurtShown = hurt;
      this.hurtGlow.classList.toggle('ui-hud-hurt-on', hurt);
    }
    this.banner.update(seconds);
    this.message.update(seconds);
    this.interact.update(seconds);
    this.gold.update(seconds);
    for (let i = 0; i < BAR_IDS.length; i++) this.bars[BAR_IDS[i] as BarId].update(seconds);
  }

  dispose(): void {
    this.root.remove();
    this.queue.length = 0;
  }

  private updateMessages(seconds: number): void {
    if (this.message.visibility.visible) return;
    if (this.messageGap > 0) {
      this.messageGap -= seconds;
      return;
    }
    const text = this.queue.shift();
    if (text === undefined) return;
    const cfg = this.cfg;
    const duration = Math.min(
      cfg.messageMaxSeconds,
      cfg.messageMinSeconds + text.length * cfg.messagePerCharacterSeconds,
    );
    this.message.element.textContent = text;
    this.message.visibility.show('message', duration);
    this.messageGap = cfg.fadeSeconds;
  }

  private applyFill(id: BarId, value: number): void {
    this.fills[id].style.transform = `scaleX(${value})`;
  }
}
