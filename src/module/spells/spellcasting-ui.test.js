import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ spellView: vi.fn(), changeSpellState: vi.fn(), resolveInterruptedSpell: vi.fn(), validateCastingFocus: vi.fn() }));
vi.mock('./spellcasting.js', () => api);
const attacks = vi.hoisted(() => ({ confirmAttackContext: vi.fn(), performSpellAttack: vi.fn() }));
vi.mock('../combat/combat-support-ui.js', () => ({ confirmAttackContext: attacks.confirmAttackContext }));
vi.mock('../progression/progression-authority.js', () => ({ recoverProgressionOperation: vi.fn() }));

let view;
beforeEach(() => {
  vi.resetModules();
  api.spellView.mockReset(); api.changeSpellState.mockReset(); api.resolveInterruptedSpell.mockReset();
  view = { context: { mode: 'arcane', focusPolicy: { kind: 'spellbook', classKey: 'magicuser', choices: ['wand', 'staff'], label: 'a Wand or Staff' }, focusIds: ['wand'], focusItems: [{ id: 'wand', name: 'Wand', img: 'wand.webp' }], bookIds: [], spells: { light: { id: 'light', name: 'Light', level: 1 } }, allLists: {} }, state: { focus: {}, books: {}, prepared: {}, known: {} } };
  api.spellView.mockImplementation(async () => view);
  api.changeSpellState.mockResolvedValue({ success: true });
  vi.stubGlobal('game', { user: { isGM: false } });
  vi.stubGlobal('ui', { notifications: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } });
  vi.stubGlobal('Dialog', class { constructor(options) { this.options = options; } render() { this.options.buttons?.ok?.callback?.([{ querySelector: () => ({ value: '1' }) }]); } });
});

describe('spellcasting entry controls', () => {
  it('coalesces repeated prepared-cast clicks while confirmation is pending', async () => {
    view.context.focusPolicy = { kind: 'innate', exempt: true };
    const { castPreparedSpell } = await import('./spellcasting-ui.js');
    await Promise.all([castPreparedSpell({ uuid: 'Actor.test' }, 'light'), castPreparedSpell({ uuid: 'Actor.test' }, 'light')]);
    expect(api.changeSpellState).toHaveBeenCalledTimes(1);
  });

  it('casts an at-will missile repeatedly without changing preparation or slots', async () => {
    const actor = { uuid: 'Actor.test', isOwner: true, sheet: { getHandler: () => attacks } };
    const target = { actor: { system: { aac: 14 } } };
    game.user.targets = new Set([target]);
    view.context.focusPolicy = { exempt: true };
    const spell = { id: 'missile', name: 'Lesser Magic Missile', atWill: true, range: '60’', damageFormula: '1d4' };
    view.context.spells.missile = spell;
    const attack = { attack: 1 };
    attacks.confirmAttackContext.mockResolvedValue(attack);
    attacks.performSpellAttack.mockClear();
    const { castPreparedSpell } = await import('./spellcasting-ui.js');
    await castPreparedSpell(actor, spell.id);
    await castPreparedSpell(actor, spell.id);
    expect(api.changeSpellState).not.toHaveBeenCalled();
    expect(attacks.performSpellAttack).toHaveBeenCalledTimes(2);
    expect(attacks.performSpellAttack).toHaveBeenLastCalledWith(spell, target, attack);
  });

  it('shows only unlocked orb colors and routes the chosen gemstone form to the attack', async () => {
    const actor = { uuid: 'Actor.orb', isOwner: true, sheet: { getHandler: () => attacks } };
    const target = { actor: { system: { aac: 14 } } };
    game.user.targets = new Set([target]);
    view.context.focusPolicy = { exempt: true };
    view.context.level = 1;
    const quartz = { level: 1, color: 'Clear', gem: 'Quartz', value: 5, damageFormula: '1d4', effect: 'Light' };
    view.context.spells.orb = { name: 'Lesser Chromatic Orb', atWill: true, range: '30’', orbColors: [quartz, { level: 2, color: 'Red', gem: 'Ruby', value: 25 }] };
    const attack = { attack: 0 };
    attacks.confirmAttackContext.mockResolvedValue(attack);
    vi.stubGlobal('Dialog', class {
      constructor(options) { this.options = options; }
      render() {
        expect(this.options.content).toContain('Quartz (5 gp)');
        expect(this.options.content).not.toContain('Ruby');
        this.options.buttons.ok.callback([{ querySelector: () => ({ value: 'Clear' }) }]);
      }
    });
    const { castPreparedSpell } = await import('./spellcasting-ui.js');
    await castPreparedSpell(actor, 'orb');
    expect(attacks.performSpellAttack).toHaveBeenLastCalledWith({ ...quartz, name: 'Lesser Chromatic Orb (Clear)' }, target, attack);
  });

  it('chooses the divine reversed form at casting', async () => {
    view.context.mode = 'divine';
    view.context.focusPolicy = { kind: 'innate', exempt: true };
    view.context.spells.light.reversed = { name: 'Darkness' };
    vi.stubGlobal('Dialog', class { constructor(options) { this.options = options; } render() { this.options.buttons.ok.callback([{ querySelector: () => ({ value: 'reverse' }) }]); } });
    const { castPreparedSpell } = await import('./spellcasting-ui.js');
    await castPreparedSpell({ uuid: 'Actor.test' }, 'light');
    expect(api.changeSpellState.mock.calls[0][1]).toMatchObject({ action: 'cast', reverse: true });
  });

  it('routes a matching spell item through prepared casting', async () => {
    view.context.focusPolicy = { kind: 'innate', exempt: true };
    const { castSpellItem } = await import('./spellcasting-ui.js');
    await castSpellItem({ uuid: 'Actor.test' }, { name: 'Light', id: 'item-light', type: 'spell' });
    expect(api.changeSpellState.mock.calls[0][1]).toMatchObject({ action: 'cast', spellId: 'light' });
  });

  it('casts an explicitly configured item source after one casting confirmation', async () => {
    view.context.allLists = { 'magic-user': [view.context.spells.light] };
    const { castSpellItem } = await import('./spellcasting-ui.js');
    await castSpellItem({ uuid: 'Actor.test' }, { name: 'Scroll of Light', id: 'scroll-a', type: 'item', system: { spellKey: 'light', spellClass: 'magic-user' } });
    expect(api.changeSpellState).toHaveBeenCalledWith({ uuid: 'Actor.test' }, { action: 'itemCast', sourceId: 'scroll-a', confirmed: true, focusHeldOrDisplayed: true });
  });

  it('rejects an invalid canonical item link before confirmation', async () => {
    const { castSpellItem } = await import('./spellcasting-ui.js');
    await expect(castSpellItem({ uuid: 'Actor.test' }, { name: 'Broken Scroll', id: 'scroll-b', type: 'item', system: { spellKey: 'missing', spellClass: 'magic-user' } })).rejects.toThrow('invalid canonical spell');
    expect(api.changeSpellState).not.toHaveBeenCalled();
  });

  it('does not infer a spell source from an unconfigured item name', async () => {
    const { castSpellItem } = await import('./spellcasting-ui.js');
    await expect(castSpellItem({ uuid: 'Actor.test' }, { name: 'Light', id: 'item-light', type: 'item' })).rejects.toThrow('not configured');
    expect(api.changeSpellState).not.toHaveBeenCalled();
  });

  it('does not export the removed spellcasting setup popup', async () => {
    const ui = await import('./spellcasting-ui.js');
    expect(ui.configureSpellcasting).toBeUndefined();
  });
});

describe('inline focus picker', () => {
  it('shows eligible choices and the selected artwork', async () => {
    const { spellbookFocusMarkup } = await import('./spellcasting-ui.js');
    const context = { focusPolicy: { classKey: 'magicuser', choices: ['wand', 'staff'] }, focusIds: ['wand'], focusItems: [{ id: 'wand', type: 'item', name: 'Wand', img: 'wand.webp' }, { id: 'oil', name: 'Oil Flask' }] };
    const picker = spellbookFocusMarkup(context, { focus: {} });
    expect(picker).toContain('value="wand"');
    expect(picker).not.toContain('Oil Flask');
    const selected = spellbookFocusMarkup(context, { focus: { itemId: 'wand', kind: 'wand', classKey: 'magicuser' } });
    expect(selected).toContain('src="wand.webp"');
    expect(selected).toContain('data-book-focus-change');
  });

  it('shows the empty and exempt focus policies', async () => {
    const { spellbookFocusMarkup } = await import('./spellcasting-ui.js');
    expect(spellbookFocusMarkup({ focusPolicy: { classKey: 'mage' }, focusIds: [], focusItems: [] }, { focus: {} })).toContain('No eligible focus items found');
    expect(spellbookFocusMarkup({ focusPolicy: { exempt: true } }, {})).toContain('No casting focus required');
  });

  it('disables the inline picker while an operation is pending', async () => {
    const { spellbookFocusMarkup } = await import('./spellcasting-ui.js');
    const markup = spellbookFocusMarkup({ focusPolicy: { classKey: 'mage' }, focusIds: ['wand'], focusItems: [{ id: 'wand', name: 'Wand' }] }, { focus: {} }, true, true);
    expect(markup).toContain('data-book-focus disabled');
  });
});

describe('spellcasting tab placement', () => {
  it('renders inline focus controls for divine and external casters without the setup entrypoint', async () => {
    const { renderSpellcastingTab } = await import('./spellcasting-ui.js');
    for (const mode of ['divine', 'external']) {
      view.context.mode = mode;
      view.context.focusPolicy = { classKey: 'mage', choices: ['wand'], label: 'a Wand' };
      view.context.focusIds = ['wand'];
      view.context.focusItems = [{ id: 'wand', type: 'item', name: 'Wand' }];
      view.context.slots = { 1: 1 };
      const slotEl = { innerHTML: '', querySelector: () => null };
      let rendered = '';
      const listEl = {
        set innerHTML(value) { rendered = value; },
        querySelector: selector => selector === '[data-spell-search]' || selector === '[data-spell-level]' ? { addEventListener: vi.fn() } : null,
        querySelectorAll: () => [],
      };
      const root = { querySelector: selector => selector === '.spell-slots-section' ? slotEl : selector === '.spell-list-content' ? listEl : null, querySelectorAll: () => [] };
      await renderSpellcastingTab({ actor: { uuid: `Actor.${mode}`, isOwner: true } }, root);
      expect(slotEl.innerHTML).not.toContain('data-spell-setup');
      expect(rendered).toContain('data-book-focus');
    }
  });

  it('reuses unchanged spell controls and updates only the result panes during search', async () => {
    const { renderSpellcastingTab } = await import('./spellcasting-ui.js');
    view.context.mode = 'divine';
    view.context.slots = { 1: 1 };
    const slotEl = { querySelector: () => null };
    const results = {};
    const search = { addEventListener: vi.fn() };
    const listEl = {
      querySelector: selector => ({
        '.spell-option-body': results,
        '[data-spell-search]': search,
        '[data-spell-level]': { addEventListener: vi.fn() },
      })[selector] ?? null,
      querySelectorAll: () => [],
    };
    results.querySelectorAll = () => [];
    const root = {
      querySelector: selector => ({
        '.spell-slots-section': slotEl,
        '.spell-list-content': listEl,
      })[selector] ?? null,
      querySelectorAll: () => [],
    };
    const sheet = { actor: { isOwner: true } };
    await renderSpellcastingTab(sheet, root);
    expect(listEl.innerHTML).toContain('Light');
    const initialMarkup = listEl.innerHTML;
    const initialSlots = slotEl.innerHTML;
    await renderSpellcastingTab(sheet, root);
    expect(search.addEventListener).toHaveBeenCalledTimes(1);
    expect(results.innerHTML).toBeUndefined();

    const onInput = search.addEventListener.mock.calls[0][1];
    onInput({ target: { value: 'xyz' } });
    await vi.waitFor(() => expect(results.innerHTML).toContain('No matching spells'));
    expect(listEl.innerHTML).toBe(initialMarkup);
    expect(slotEl.innerHTML).toBe(initialSlots);
    expect(search.addEventListener).toHaveBeenCalledTimes(1);
  });

  it('exposes pending recovery inline only to a GM', async () => {
    const { renderSpellcastingTab } = await import('./spellcasting-ui.js');
    view.context.mode = 'divine';
    view.context.slots = { 1: 1 };
    view.pending = { stage: 'applying', operationId: 'op-1' };
    vi.stubGlobal('game', { user: { isGM: true } });
    const slotEl = { innerHTML: '', querySelector: () => null };
    const listEl = { innerHTML: '', querySelector: selector => selector === '[data-spell-search]' || selector === '[data-spell-level]' ? { addEventListener: vi.fn() } : null, querySelectorAll: () => [] };
    const root = { querySelector: selector => selector === '.spell-slots-section' ? slotEl : selector === '.spell-list-content' ? listEl : null, querySelectorAll: () => [] };
    await renderSpellcastingTab({ actor: { uuid: 'Actor.pending', isOwner: true } }, root);
    expect(slotEl.innerHTML).toContain('data-spell-recover');
    vi.stubGlobal('game', { user: { isGM: false } });
    await renderSpellcastingTab({ actor: { uuid: 'Actor.pending-player', isOwner: true } }, root);
    expect(slotEl.innerHTML).not.toContain('data-spell-recover');
  });
});

describe('prepared slot indicators', () => {
  it('counts prepared copies by level, including reversed forms', async () => {
    const { preparedSlotsAtLevel } = await import('./spellcasting-ui.js');
    const context = { spells: { light: { level: 1 }, invisibility: { level: 2 } } };
    const state = { prepared: { 'light::normal': 1, 'light::reverse': 1, 'invisibility::normal': 1 } };
    expect(preparedSlotsAtLevel(state, context, 1)).toBe(2);
    expect(preparedSlotsAtLevel(state, context, 2)).toBe(1);
    state.prepared['light::normal'] = 0;
    expect(preparedSlotsAtLevel(state, context, 1)).toBe(1);
    expect(preparedSlotsAtLevel({ prepared: {} }, context, 1)).toBe(0);
  });
});

describe('add to spellbook picker', () => {
  it('confirms a copy without setup instructions', async () => {
    view.context.bookIds = ['book-a-1'];
    view.context.items = [{ id: 'book-a', name: 'The Green Grimoire', type: 'item', flags: { 'osp-houserules': { spellbook: true } } }];
    view.context.bookNames = { 'book-a-1': 'The Green Grimoire' };
    let popup;
    vi.stubGlobal('Dialog', class { constructor(options, config) { popup = { ...options, config }; } render() { popup.buttons.ok.callback([{ querySelector: () => ({ value: 'book-a-1' }) }]); } });
    const { chooseBook } = await import('./spellcasting-ui.js');
    await chooseBook({ uuid: 'Actor.test' }, 'copy', { id: 'light', name: 'Light', level: 1 });
    expect(popup.content).toContain('Choose Spellbook');
    expect(popup.config.classes).toContain('osp-choose-spellbook');
  });
});
