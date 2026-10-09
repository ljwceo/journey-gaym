import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/StateMachine';
import { button, el } from '../ui/dom';
import { confirmPanel } from '../ui/menus/ConfirmPanel';
import { settingsPanel } from '../ui/menus/SettingsPanel';
import { Screen } from '../ui/Screen';
import { canContinue } from './flow';

/** Title screen: Continue (when there is progress), New Game and Settings. */
export class TitleState implements GameState {
  private readonly screen: Screen;

  constructor(private readonly ctx: GameContext) {
    this.screen = new Screen(ctx, 'ui-title-screen', () => this.build());
  }

  enter(): void {
    this.ctx.renderer.clear();
    this.screen.mount();
  }

  exit(): void {
    this.ctx.overlays.closeAll();
    this.screen.unmount();
  }

  private newGame(): void {
    const { ctx } = this;
    // The creator makes the new save when the character is done, so Back keeps the old one.
    const begin = (): void => ctx.goto('create');
    if (canContinue(ctx.session))
      ctx.overlays.open(confirmPanel(ctx, 'title.overwriteQuestion', begin));
    else begin();
  }

  private build(): (Node | null)[] {
    const { ctx } = this;
    const t = ctx.i18n.t.bind(ctx.i18n);
    const showContinue = canContinue(ctx.session);
    return [
      el('h1', { className: 'ui-title', text: t('game.title') }),
      el(
        'div',
        { className: 'ui-menu' },
        showContinue ? button(t('title.continue'), () => ctx.goto('world'), true) : null,
        button(t('title.newGame'), () => this.newGame(), !showContinue),
        button(t('title.settings'), () => ctx.overlays.open(settingsPanel(ctx))),
      ),
    ];
  }
}
