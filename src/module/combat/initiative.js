/** Pure helpers for the BR-14 campaign initiative rules. */

const HUNDRED = 100;

const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const integerOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isInteger(number) ? number : fallback;
};

const normaliseRace = (race) => String(race ?? '').trim().toLowerCase().replace(/[-_\s]/g, '');

/** Hobbit and Halfling receive the approved +1 initiative bonus. */
export function racialInitiativeBonus(race) {
  const key = normaliseRace(race);
  return key === 'hobbit' || key === 'halfling' ? 1 : 0;
}

/**
 * Calculate initiative using integer hundredths internally. The fractional
 * component of the original roll survives a minimum-of-one clamp.
 */
export function calculateInitiative({ rawRollHundredths, dexMod = 0, race = '', racialBonus, speed = 0 } = {}) {
  const raw = Number(rawRollHundredths);
  if (!Number.isInteger(raw) || raw < 100 || raw > 2099) {
    throw new Error('rawRollHundredths must be an integer from 100 through 2099');
  }
  const dex = integerOr(dexMod);
  const actionPenalty = integerOr(speed);
  const raceBonus = racialBonus == null ? racialInitiativeBonus(race) : integerOr(racialBonus);
  const unbounded = raw + (dex + raceBonus - actionPenalty) * HUNDRED;
  const fraction = ((unbounded % HUNDRED) + HUNDRED) % HUNDRED;
  const whole = Math.max(1, Math.floor(unbounded / HUNDRED));
  const initiativeHundredths = whole * HUNDRED + fraction;
  return {
    initiativeHundredths,
    initiative: initiativeHundredths / HUNDRED,
    displayInitiative: Math.floor(initiativeHundredths / HUNDRED),
    display: Math.floor(initiativeHundredths / HUNDRED),
    rawRollHundredths: raw,
    dexMod: dex,
    racialBonus: raceBonus,
    speed: actionPenalty,
  };
}

export const recalculateInitiative = calculateInitiative;
export const getRacialInitiativeBonus = racialInitiativeBonus;

const asItemArray = (items) => {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  if (typeof items.values === 'function') return [...items.values()];
  if (typeof items[Symbol.iterator] === 'function') return [...items];
  return Object.values(items);
};

const declarationIds = (declaration = {}) => {
  for (const key of ['selectedWeaponIds', 'selectedSpellIds', 'selectedItemIds', 'weaponIds', 'itemIds']) {
    if (declaration[key] != null) return Array.isArray(declaration[key]) ? declaration[key] : [declaration[key]];
  }
  for (const key of ['selectedSpellId', 'spellId', 'itemId']) {
    if (declaration[key] != null) return [declaration[key]];
  }
  return [];
};

const itemId = (item) => item?.id ?? item?._id ?? item?.uuid;
const itemSystem = (item) => item?.system ?? {};
const itemKind = (item) => String(item?.type ?? itemSystem(item).type ?? '').toLowerCase();

/** Resolve the declared action's speed penalty, rejecting stale item IDs. */
export function actionSpeed(declaration = {}, items = []) {
  const kind = String(declaration.kind ?? declaration.type ?? declaration.action ?? '').toLowerCase();
  if (['unarmed', 'other'].includes(kind)) return 0;
  if (kind && !['weapon', 'twoweapon', 'spell'].includes(kind)) throw new Error('Unknown initiative declaration');
  const ids = kind === 'spell' ? [declaration.selectedSpellId ?? declaration.spellId ?? declaration.itemId ?? declaration.selectedSpellIds?.[0] ?? declaration.selectedItemIds?.[0]] : declarationIds(declaration);
  if (!ids.length || ids.some(id => !id)) throw new Error('Initiative declaration is missing its selected item');
  if (new Set(ids).size !== ids.length) throw new Error('Initiative declaration contains duplicate item IDs');
  if (ids.length > 2 || kind === 'weapon' && ids.length !== 1 || kind === 'twoweapon' && ids.length !== 2 || kind === 'spell' && ids.length !== 1) throw new Error('Initiative declaration has the wrong number of selected items');
  const selected = ids.map(id => asItemArray(items).find(item => itemId(item) === id));
  if (selected.some(item => !item)) throw new Error('Initiative declaration references a missing item');
  if (kind === 'spell') {
    if (itemKind(selected[0]) !== 'spell') throw new Error('Initiative declaration references a non-spell item');
    const rawLevel = itemSystem(selected[0]).lvl ?? itemSystem(selected[0]).level;
    if (rawLevel === undefined || rawLevel === null || rawLevel === '') throw new Error('Spell initiative level is unavailable');
    const level = Number(rawLevel);
    if (!Number.isInteger(level) || level < 0) throw new Error('Spell initiative level is unavailable');
    return level;
  }
  if (selected.some(item => itemKind(item) !== 'weapon')) throw new Error('Initiative declaration references a non-weapon item');
  const speeds = selected.map(item => {
    const rawSpeed = itemSystem(item).speedFactor;
    if (rawSpeed === undefined || rawSpeed === null || rawSpeed === '') throw new Error('Weapon initiative speed is unavailable');
    const value = Number(rawSpeed);
    if (!Number.isInteger(value) || value < 0) throw new Error('Weapon initiative speed is unavailable');
    return value;
  });
  return Math.max(...speeds);
}

/** Assign separate, unique hidden tie keys without changing initiative values. */
export function assignInitiativeTieKeys(entries = [], random = Math.random) {
  const output = entries.map((entry, index) => ({ ...entry, _tieIndex: index }));
  const groups = new Map();
  for (const entry of output) {
    const value = entry.initiativeHundredths ?? Math.round(Number(entry.initiative) * HUNDRED);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(entry);
  }
  for (const group of groups.values()) {
    if (group.length < 2) {
      group[0].tieKey = null;
      continue;
    }
    const used = new Set();
    const max = Math.max(1, group.length * 4);
    for (const entry of group) {
      let key;
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const sample = numberOr(random(), 0);
        key = Math.floor(Math.max(0, Math.min(0.999999999999, sample)) * max);
        if (!used.has(key)) break;
        key = undefined;
      }
      if (key == null || used.has(key)) {
        key = 0;
        while (used.has(key)) key += 1;
      }
      used.add(key);
      entry.tieKey = key;
    }
  }
  return output.map(({ _tieIndex, ...entry }) => entry);
}

export const resolveInitiativeTies = assignInitiativeTieKeys;
export const assignTieKeys = assignInitiativeTieKeys;
