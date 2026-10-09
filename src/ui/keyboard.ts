/**
 * On-screen keyboard handling (mainly iPhone Safari). Safari keeps the keyboard open while
 * the text field has focus, even when you tap a button elsewhere, and after the keyboard
 * closes it can leave the page scrolled up. These helpers close the keyboard on purpose and
 * put the page back.
 */

/** iOS animates the keyboard away in about 250 ms; reset again after that. */
const KEYBOARD_ANIMATION_MS = 350;

/** Scrolls the page back to the top (the game never scrolls the page itself). */
export function resetViewportScroll(): void {
  if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0);
  const scroller = document.scrollingElement;
  if (scroller && scroller.scrollTop !== 0) scroller.scrollTop = 0;
}

/** Closes the on-screen keyboard (if a text field has focus) and resets the page scroll. */
export function dismissKeyboard(): void {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) active.blur();
  resetViewportScroll();
}

/**
 * Makes a text field behave on touch screens:
 * - Enter / "Done" and Escape close the keyboard;
 * - tapping anywhere else inside `root` closes it (Safari does not do that for buttons);
 * - when the keyboard has closed, the page scroll is reset so nothing stays shifted.
 * Returns a cleanup function.
 */
export function guardTextInput(input: HTMLInputElement, root: HTMLElement): () => void {
  let timer = 0;

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault();
      // Escape here only closes the keyboard; it must not also leave the screen.
      event.stopPropagation();
      input.blur();
    }
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.target !== input && document.activeElement === input) input.blur();
  };

  const onBlur = (): void => {
    window.clearTimeout(timer);
    resetViewportScroll();
    timer = window.setTimeout(resetViewportScroll, KEYBOARD_ANIMATION_MS);
  };

  // The visual viewport grows back to full height when the keyboard is gone.
  const viewport = window.visualViewport;
  const onViewportResize = (): void => {
    if (document.activeElement !== input) resetViewportScroll();
  };

  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('blur', onBlur);
  root.addEventListener('pointerdown', onPointerDown, true);
  viewport?.addEventListener('resize', onViewportResize);

  return () => {
    window.clearTimeout(timer);
    input.removeEventListener('keydown', onKeyDown);
    input.removeEventListener('blur', onBlur);
    root.removeEventListener('pointerdown', onPointerDown, true);
    viewport?.removeEventListener('resize', onViewportResize);
    if (document.activeElement === input) dismissKeyboard();
  };
}
