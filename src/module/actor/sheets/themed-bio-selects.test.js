import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import jquery from 'jquery';
import { RaceClassHandler } from './handlers/race-class-handler.js';
import { activateThemedBioSelects } from './themed-bio-selects.js';

// Exercise the production handler with the actual template's class inventory.
const template = readFileSync(new URL('../../../../templates/actors/character-sheet.html', import.meta.url), 'utf8');
const classMarkup = template.match(/<select\b[^>]*id="char-class"[^>]*>([\s\S]*?)<\/select>/)[1];
const allClasses = Array.from(classMarkup.matchAll(/<option\s+value="([^"]+)"/g), (match) => match[1]);
const eligible = {
  Dwarf: ['Assassin', 'Cleric', 'Dwarf', 'Fighter', 'Thief'],
  Elf: ['Assassin', 'Cleric', 'Druid', 'Elf', 'Fighter', 'Knight', 'Magic-User', 'Ranger', 'Thief'],
  Gnome: ['Assassin', 'Cleric', 'Fighter', 'Gnome', 'Illusionist', 'Thief'],
  Hobbit: ['Druid', 'Fighter', 'Hobbit', 'Thief'],
  'Half-Orc': ['Assassin', 'Cleric', 'Fighter', 'Half-Orc', 'Thief'],
  'Half-Elf': ['Assassin', 'Bard', 'Cleric', 'Druid', 'Fighter', 'Half-Elf', 'Knight', 'Magic-User', 'Paladin', 'Ranger', 'Thief'],
  Human: ['Assassin', 'Barbarian', 'Bard', 'Beast Master', 'Cleric', 'Druid', 'Fighter', 'Illusionist', 'Knight', 'Mage', 'Magic-User', 'Paladin', 'Ranger', 'Thief', 'Warden'],
};
const fixtures = [];

function mount(race = 'Half-Orc', characterClass = 'Fighter') {
  const options = (values) => values.map((value) => `<option value="${value}">${value}</option>`).join('');
  const dom = new JSDOM(`<form><div class="tab" data-tab="bio">
    <div class="race-group"><select class="cs-race-select" name="system.race">${options(Object.keys(eligible))}</select></div>
    <div class="class-group"><select class="cs-class-select" name="system.class">${options(allClasses)}</select></div>
    <span class="cs-background-select">Read-only background</span>
    <select class="cs-sex-field" disabled><option>M</option></select>
  </div></form>`);
  const $ = jquery(dom.window);
  vi.stubGlobal('$', $);
  const root = dom.window.document.querySelector('form');
  const raceSelect = root.querySelector('[name="system.race"]');
  const classSelect = root.querySelector('[name="system.class"]');
  raceSelect.value = race;
  classSelect.value = characterClass;
  const handler = new RaceClassHandler($(root), {}, null);
  handler.initialize();
  const fixture = {
    dom, root, raceSelect, classSelect, handler,
    cleanup: activateThemedBioSelects(root),
    trigger: (group) => root.querySelector(`.${group}-group .cs-themed-select-trigger`),
    buttons: (group) => Array.from(root.querySelectorAll(`.${group}-group .cs-themed-select-option`)),
    shownClasses: () => fixture.buttons('class').map((button) => button.dataset.value),
    nativeClasses: () => Array.from(classSelect.options, (option) => option.value),
    pick(group, value) {
      fixture.trigger(group).click();
      const button = fixture.buttons(group).find((entry) => entry.dataset.value === value);
      expect(button, `Missing ${group} option ${value}`).toBeDefined();
      button.click();
    },
  };
  fixtures.push(fixture);
  return fixture;
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) {
    fixture.cleanup();
    fixture.handler.destroy();
    fixture.dom.window.close();
  }
  vi.unstubAllGlobals();
});

describe('themed Bio dropdowns and race eligibility', () => {
  it.each(Object.entries(eligible))('updates immediately to the existing %s rules without a sheet render', (race, expected) => {
    const f = mount();
    f.pick('race', race);
    expect(f.shownClasses()).toEqual(expected);
    expect(f.shownClasses()).toEqual(f.nativeClasses());
    expect(f.classSelect.value).toBe('Fighter');
    expect(f.trigger('class').textContent).toBe('Fighter');
  });

  it('refreshes repeatedly from Half-Orc to Elf to Human and back', () => {
    const f = mount();
    for (const race of ['Elf', 'Human', 'Gnome', 'Hobbit', 'Half-Orc']) {
      f.pick('race', race);
      expect(f.shownClasses()).toEqual(eligible[race]);
    }
  });

  it('displays the native Fighter fallback without emitting an extra class change', () => {
    const f = mount('Gnome', 'Illusionist');
    const classChanged = vi.fn();
    f.classSelect.addEventListener('change', classChanged);
    f.pick('race', 'Half-Orc');
    expect(f.classSelect.value).toBe('Fighter');
    expect(f.trigger('class').textContent).toBe('Fighter');
    expect(f.buttons('class').filter((button) => button.getAttribute('aria-selected') === 'true').map((button) => button.dataset.value)).toEqual(['Fighter']);
    expect(classChanged).not.toHaveBeenCalled();
    expect(new f.dom.window.FormData(f.root).get('system.class')).toBe('Fighter');
  });

  it('selects a newly eligible class through the normal native input/change events', () => {
    const f = mount();
    const input = vi.fn();
    const change = vi.fn();
    f.classSelect.addEventListener('input', input);
    f.classSelect.addEventListener('change', change);
    f.pick('race', 'Elf');
    f.pick('class', 'Magic-User');
    expect(f.classSelect.value).toBe('Magic-User');
    expect(f.trigger('class').textContent).toBe('Magic-User');
    expect(input).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('rejects an old menu button after its class becomes ineligible', () => {
    const f = mount('Gnome');
    const stale = f.buttons('class').find((button) => button.dataset.value === 'Illusionist');
    f.pick('race', 'Half-Orc');
    const change = vi.fn();
    f.classSelect.addEventListener('change', change);
    stale.click();
    expect(f.classSelect.value).toBe('Fighter');
    expect(change).not.toHaveBeenCalled();
    expect(f.shownClasses()).toEqual(eligible['Half-Orc']);
  });

  it('observes options rebuilt programmatically without a DOM change event', async () => {
    const f = mount();
    f.raceSelect.value = 'Elf';
    f.handler.filterClassOptions();
    await Promise.resolve();
    expect(f.shownClasses()).toEqual(eligible.Elf);
  });

  it('updates labels and disabled/hidden state when native options change', async () => {
    const f = mount();
    f.classSelect.options[0].label = 'Assassin (custom label)';
    f.classSelect.options[1].disabled = true;
    f.classSelect.options[3].hidden = true;
    await Promise.resolve();
    expect(f.buttons('class')[0].textContent).toBe('Assassin (custom label)');
    expect(f.buttons('class')[1].disabled).toBe(true);
    expect(f.shownClasses()).not.toContain('Half-Orc');
    f.classSelect.disabled = true;
    await Promise.resolve();
    expect(f.trigger('class').disabled).toBe(true);
  });

  it('reads programmatic selection changes when opening and closes on Escape/outside click', () => {
    const f = mount();
    f.classSelect.value = 'Thief';
    const trigger = f.trigger('class');
    trigger.click();
    expect(trigger.textContent).toBe('Thief');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    trigger.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    f.root.click();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('cleans up and reactivates without duplicate controls or native change listeners', () => {
    const f = mount();
    expect(f.root.querySelectorAll('.cs-themed-select')).toHaveLength(2);
    f.cleanup();
    expect(f.root.querySelectorAll('.cs-themed-select')).toHaveLength(0);
    expect(f.root.querySelectorAll('.cs-themed-select-native')).toHaveLength(0);
    f.cleanup = activateThemedBioSelects(f.root);
    expect(f.root.querySelectorAll('.cs-themed-select')).toHaveLength(2);
    const change = vi.fn();
    f.classSelect.addEventListener('change', change);
    f.pick('race', 'Elf');
    f.pick('class', 'Magic-User');
    expect(change).toHaveBeenCalledTimes(1);
    expect(f.shownClasses()).toEqual(eligible.Elf);
  });
});
