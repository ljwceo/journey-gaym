import { el } from './dom';

type Translate = (key: string) => string;

/** One row of "what is still missing": a translated text and whether it is done. */
export interface ChecklistRow {
  text: string;
  done: boolean;
}

/**
 * The simple dialogue window: the speaker's name and one line at a time (text keys, so a
 * language change mid-talk just redraws). E, Space, Enter, a click or a tap goes to the next
 * line; after the last line it closes. Escape closes it straight away.
 * It sits at the bottom center, above the touch button zone, and never takes keyboard focus,
 * so the game keeps its keys. With a checklist (a quest that is not done yet) the last line
 * also shows what is still missing ("Slime Gel 2/3").
 */
export class Dialog {
  readonly root: HTMLElement;
  private readonly nameEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly moreEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private checklist: (() => readonly ChecklistRow[]) | null = null;
  private speaker = '';
  private lines: readonly string[] = [];
  private index = 0;
  private onClose: ((finished: boolean) => void) | null = null;

  constructor(private readonly t: Translate) {
    this.nameEl = el('div', { className: 'ui-dialog-name' });
    this.textEl = el('p', { className: 'ui-dialog-text' });
    this.moreEl = el('div', { className: 'ui-dialog-more' });
    this.listEl = el('ul', { className: 'ui-dialog-list' });
    this.root = el(
      'div',
      { className: 'ui-dialog', attrs: { role: 'dialog', 'aria-live': 'polite' } },
      this.nameEl,
      this.textEl,
      this.listEl,
      this.moreEl,
    );
    // pointerdown: no click delay on phones; the tap must not turn the camera.
    this.root.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.advance();
    });
  }

  get isOpen(): boolean {
    return this.onClose !== null;
  }

  /**
   * Opens the window with `lines` (text keys). Names stay English (never translated).
   * `checklist` (already translated rows) is shown with the last line.
   */
  open(
    speaker: string,
    lines: readonly string[],
    onClose: (finished: boolean) => void,
    checklist: (() => readonly ChecklistRow[]) | null = null,
  ): void {
    if (lines.length === 0) {
      onClose(true);
      return;
    }
    this.checklist = checklist;
    this.speaker = speaker;
    this.lines = lines;
    this.index = 0;
    this.onClose = onClose;
    this.root.classList.add('ui-dialog-open');
    this.render();
  }

  /** Next line, or close after the last one. */
  advance(): void {
    if (!this.isOpen) return;
    this.index++;
    if (this.index >= this.lines.length) this.close(true);
    else this.render();
  }

  /** Closes the window; `finished` = the last line was read (not Escape or walking away). */
  close(finished = false): void {
    const done = this.onClose;
    if (!done) return;
    this.onClose = null;
    this.checklist = null;
    this.root.classList.remove('ui-dialog-open');
    done(finished);
  }

  /** Redraws in the current language. */
  updateTexts(): void {
    if (this.isOpen) this.render();
  }

  dispose(): void {
    this.onClose = null;
    this.root.remove();
  }

  private render(): void {
    const last = this.index >= this.lines.length - 1;
    this.nameEl.textContent = this.speaker;
    this.textEl.textContent = this.t(this.lines[this.index] as string);
    const counter = this.lines.length > 1 ? `${this.index + 1}/${this.lines.length} · ` : '';
    this.moreEl.textContent = `${counter}${this.t(last ? 'dialog.close' : 'dialog.next')} ▸`;
    const rows = last && this.checklist ? this.checklist() : [];
    this.listEl.replaceChildren(
      ...rows.map((row) =>
        el('li', {
          className: row.done ? 'ui-dialog-check ui-dialog-check-done' : 'ui-dialog-check',
          text: `${row.done ? '✓' : '✗'} ${row.text}`,
        }),
      ),
    );
    this.listEl.hidden = rows.length === 0;
  }
}
