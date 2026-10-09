import type { GameContext } from '../../core/GameContext';
import { button, el } from '../dom';
import type { Panel } from '../Overlays';
import { bindT } from './ConfirmPanel';
import { settingsPanel } from './SettingsPanel';

/** Pause menu: resume, settings, or save and go back to the title screen. */
export function pausePanel(ctx: GameContext, onClose: () => void): Panel {
  return {
    build: () => {
      const { t } = bindT(ctx);
      return el(
        'div',
        { className: 'ui-panel ui-menu', attrs: { role: 'dialog' } },
        el('h2', { className: 'ui-heading', text: t('pause.title') }),
        button(t('pause.resume'), () => ctx.overlays.close(), true),
        button(t('pause.settings'), () => ctx.overlays.open(settingsPanel(ctx))),
        button(t('pause.toTitle'), () => {
          ctx.persist();
          ctx.overlays.closeAll();
          ctx.goto('title');
        }),
      );
    },
    onClose,
  };
}
