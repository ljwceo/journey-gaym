import type { GameContext } from '../core/GameContext';
import type { GameState } from '../core/StateMachine';
import { LANGUAGES, type Language } from '../i18n/I18n';
import { createNewSave } from '../save/SaveData';
import { button, el } from '../ui/dom';
import { Screen } from '../ui/Screen';

/**
 * Very first screen without a save: pick English or Nederlands. Choosing creates the save,
 * so the choice is remembered (and can be changed later in Settings).
 */
export class LanguageSelectState implements GameState {
  private readonly screen: Screen;

  constructor(private readonly ctx: GameContext) {
    this.screen = new Screen(ctx, 'ui-language', () => this.build());
  }

  enter(): void {
    this.ctx.renderer.clear();
    this.screen.mount();
  }

  exit(): void {
    this.screen.unmount();
  }

  private async choose(language: Language): Promise<void> {
    const { ctx } = this;
    if (language !== ctx.i18n.language) {
      await ctx.i18n.setLanguage(language);
      ctx.events.emit('languageChanged', { language });
    }
    ctx.session = createNewSave(language);
    ctx.persist();
    ctx.events.emit('settingsChanged', {});
    ctx.goto('title');
  }

  private build(): (Node | null)[] {
    const { t } = { t: this.ctx.i18n.t.bind(this.ctx.i18n) };
    return [
      el(
        'div',
        { className: 'ui-panel ui-menu' },
        el('h2', { className: 'ui-heading', text: t('language.choose') }),
        ...LANGUAGES.map((language) =>
          button(t(`language.${language}`), () => void this.choose(language), true),
        ),
      ),
    ];
  }
}
