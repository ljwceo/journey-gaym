type Child = Node | string | null | undefined | false;

export interface ElementProps {
  className?: string;
  text?: string;
  /** Plain attributes, e.g. `{ type: 'button', 'aria-label': '…' }`. */
  attrs?: Record<string, string>;
  onClick?: () => void;
}

/** Small helper to build DOM without innerHTML (no injection, no string templates). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.className) element.className = props.className;
  if (props.text !== undefined) element.textContent = props.text;
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) element.setAttribute(name, value);
  }
  const onClick = props.onClick;
  if (onClick) element.addEventListener('click', () => onClick());
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    element.append(child);
  }
  return element;
}

/** A menu button. `primary` gets the warm amber glow (style guide U2). */
export function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  return el('button', {
    className: primary ? 'ui-button ui-button-primary' : 'ui-button',
    text: label,
    attrs: { type: 'button' },
    onClick: () => onClick(),
  });
}

/**
 * A row of toggle buttons where one is selected, e.g. Auto / Low / Mid / High.
 * `onChange` receives the chosen value.
 */
export function segmented<T extends string>(
  options: readonly { value: T; label: string }[],
  selected: T,
  onChange: (value: T) => void,
): HTMLDivElement {
  const group = el('div', { className: 'ui-segmented', attrs: { role: 'radiogroup' } });
  for (const option of options) {
    const active = option.value === selected;
    group.append(
      el('button', {
        className: active ? 'ui-segment ui-segment-active' : 'ui-segment',
        text: option.label,
        attrs: { type: 'button', role: 'radio', 'aria-checked': String(active) },
        onClick: () => onChange(option.value),
      }),
    );
  }
  return group;
}
