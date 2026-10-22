const NUMBER_PATTERN = /[^a-z0-9]/g;

export function spellClassKey(value) {
  return String(value?.id ?? value?.name ?? value ?? '').trim().toLowerCase().replace(NUMBER_PATTERN, '');
}

const RACIAL_SPELL_CLASSES = new Set(['elf', 'gnome', 'halfelf', 'drow']);

export function spellFocusPolicy(profile, actor = {}) {
  const key = spellClassKey(profile);
  if (RACIAL_SPELL_CLASSES.has(key)) return { kind: 'innate', label: 'racial genetics', exempt: true, classKey: key };
  const policies = {
    magicuser: { kind: 'physical-focus', label: 'a Wand or Staff', choices: ['wand', 'staff'] },
    illusionist: { kind: 'physical-focus', label: 'a Wand or Staff', choices: ['wand', 'staff'] },
    mage: { kind: 'physical-focus', label: 'a Wand or Staff', choices: ['wand', 'staff'] },
    cleric: { kind: 'holy-symbol', label: 'a Holy Symbol' },
    paladin: { kind: 'holy-symbol', label: 'a Holy Symbol' },
    druid: { kind: 'mistletoe', label: 'a sprig of mistletoe' },
    bard: { kind: 'instrument', label: 'their instrument' },
    ranger: { kind: 'ranger-token', label: 'a personally carved wooden token depicting a forest animal native to the area they range, made from dead wood of a special tree; it is never cut from a living tree' },
  };
  return { ...(policies[key] ?? { kind: 'manual', label: 'the class focus' }), classKey: key, exempt: false, race: actor?.race ?? actor?.system?.race };
}

export function externalFocusPolicy(command = {}) {
  if (command.sourceKind === 'innate' && command.sourceRacial === true) return { kind: 'innate', exempt: true, label: 'racial genetics' };
  if (['scroll', 'wand', 'staff', 'item'].includes(command.sourceKind)) return { kind: 'source', exempt: false, label: 'the spell source itself' };
  return { kind: 'manual', exempt: false, label: 'the caster class focus' };
}

export function physicalFocusItemTypes() {
  return ['weapon', 'armor', 'item', 'container', 'coin', 'clothing', 'ammunition', 'instrument'];
}

const FOCUS_NAME_ALIASES = new Map([
  ['wand', 'wand'],
  ['magicwand', 'wand'],
  ['staff', 'staff'],
  ['magestaff', 'staff'],
  ['magesstaff', 'staff'],
  ['holysymbol', 'holy-symbol'],
  ['religioussymbol', 'holy-symbol'],
  ['mistletoe', 'mistletoe'],
  ['instrument', 'instrument'],
  ['bardinstrument', 'instrument'],
  ['animaltotem', 'ranger-token'],
  ['rangertoken', 'ranger-token'],
  ['rangerfocusfox', 'ranger-token'],
]);

function normalizedFocusText(value) { return String(value ?? '').trim().toLowerCase().replace(NUMBER_PATTERN, ''); }
function itemTags(item) {
  const tags = item?.system?.tags ?? item?.system?.tag ?? [];
  return (Array.isArray(tags) ? tags : String(tags).split(/[,\s]+/)).map(normalizedFocusText).filter(Boolean);
}
function explicitFocusKind(item) {
  const flags = item?.flags?.['osp-houserules'] ?? {};
  const raw = item?.system?.focusKind ?? item?.system?.focus_kind ?? flags.focusKind ?? flags.focus_kind;
  const normalized = normalizedFocusText(raw);
  return FOCUS_NAME_ALIASES.get(normalized) ?? (['ranger-token', 'holy-symbol', 'mistletoe', 'instrument', 'wand', 'staff'].includes(String(raw)) ? raw : undefined);
}

export function focusKindForItem(item) {
  if (!item || !physicalFocusItemTypes().includes(item.type)) return undefined;
  if (normalizedFocusText(item.name) === 'staffsling') return undefined;
  const explicit = explicitFocusKind(item);
  if (explicit) return explicit;
  const name = FOCUS_NAME_ALIASES.get(normalizedFocusText(item.name));
  const tags = new Set(itemTags(item));
  if (name) return name;
  if (tags.has('wand')) return 'wand';
  if (tags.has('staff')) return 'staff';
  if (tags.has('instrument')) return 'instrument';
  if (tags.has('animal-totem') || tags.has('animaltotem') || tags.has('ranger-token') || tags.has('rangertoken')) return 'ranger-token';
  if (tags.has('mistletoe')) return 'mistletoe';
  if (tags.has('holy-symbol') || tags.has('holysymbol')) return 'holy-symbol';
  if (tags.has('focus') && tags.has('druid')) return 'mistletoe';
  if (tags.has('focus') && tags.has('ranger')) return 'ranger-token';
  if (tags.has('focus') && tags.has('religious')) return 'holy-symbol';
  if (tags.has('focus') && tags.has('mage') && item.type === 'weapon') return 'staff';
  return undefined;
}

export function focusKindsForPolicy(policy = {}) {
  return policy.choices ?? (policy.kind && !policy.exempt && policy.kind !== 'manual' ? [policy.kind] : []);
}

export function isEligibleFocusItem(item, policy = {}) {
  const kind = focusKindForItem(item);
  return Boolean(kind && focusKindsForPolicy(policy).includes(kind));
}

export function matchesPhysicalFocusKind(item, kind) {
  return focusKindForItem(item) === kind;
}

function text(value) { return String(value ?? '').toLowerCase(); }

export function spellMode(profile) {
  const casting = profile?.spellcasting;
  if (!casting) return 'none';
  if (text(casting.type) === 'arcane-special' || text(profile?.name) === 'mage') return 'external';
  const summary = text(casting.summary);
  if (summary.includes('arcane')) return 'arcane';
  if (summary.includes('divine')) return 'divine';
  return 'none';
}

function validInteger(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum) throw new RangeError(`${label} must be an integer >= ${minimum}`);
  return number;
}

function actorLevel(system) { return validInteger(system?.level, 'actor level', 1); }

function ability(system, key) {
  const number = Number(system?.attributes?.[key.toLowerCase()]?.value);
  if (!Number.isFinite(number)) throw new RangeError(`${key} score must be a number`);
  return number;
}

function copyRow(row) {
  return Object.fromEntries(Object.entries(row ?? {}).map(([level, slots]) => [String(level), Number(slots) || 0]));
}

function firstCastingRow(casting) {
  const levels = Object.keys(casting?.spellProgression ?? {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  return levels.map((level) => casting.spellProgression[String(level)]).find((row) => Object.keys(row ?? {}).length > 0) ?? {};
}

export function baseSpellSlots(system, profile) {
  const casting = profile?.spellcasting;
  const mode = spellMode(profile);
  if (!casting || mode === 'none' || mode === 'external') return {};
  const level = actorLevel(system);
  const progression = casting.spellProgression ?? {};
  const startsAt = Number(casting.startsAtLevel ?? Object.keys(progression).map(Number).sort((a, b) => a - b)[0]);
  if (!Number.isInteger(startsAt) || startsAt < 1) throw new RangeError('spellcasting start level must be a positive integer');
  const key = spellClassKey(profile);
  const wisdom = (key === 'cleric' || key === 'paladin' || key === 'ranger') ? ability(system, 'WIS') : 0;
  if (key === 'cleric' && level === 1 && wisdom >= 15) return copyRow(firstCastingRow(casting));
  if ((key === 'paladin' || key === 'ranger') && wisdom > 15) {
    const earlyStart = Math.max(1, startsAt - (wisdom - 15));
    if (level < earlyStart) return {};
    if (level < startsAt) return copyRow(firstCastingRow(casting));
  }
  return copyRow(progression[String(level)]);
}

function bonusRow(table, score) {
  return (Array.isArray(table) ? table : []).find((row) => {
    const match = String(row?.prime_requisite ?? '').match(/(\d+)\s*-\s*(\d+)/);
    return match && score >= Number(match[1]) && score <= Number(match[2]);
  });
}

export function canCastClassSpellsAtLevel(system, profile) {
  const casting = profile?.spellcasting;
  if (!casting) return false;
  if (spellMode(profile) === 'external') {
    const level = Number(system?.level);
    const startsAt = Number(casting.startsAtLevel ?? 1);
    return Number.isInteger(level) && Number.isInteger(startsAt) && level >= startsAt;
  }
  return Object.values(baseSpellSlots(system, profile)).some(slots => slots > 0);
}

export function bonusSpellSlots(system, profile, houseSpells) {
  const base = baseSpellSlots(system, profile);
  const result = { ...base };
  const key = spellClassKey(profile);
  const configuredExclusions = (houseSpells?.bonus_spells?.does_not_apply_to ?? []).map(spellClassKey);
  if (new Set(['bard', 'paladin', 'ranger', ...configuredExclusions]).has(key)) return result;
  const mode = spellMode(profile);
  const requisite = mode === 'arcane' ? ability(system, 'INT') : mode === 'divine' ? ability(system, 'WIS') : 0;
  const row = bonusRow(houseSpells?.bonus_spells?.table ?? houseSpells?.spells?.bonus_spells?.table, requisite);
  if (!row || requisite < 13) return result;
  for (const [name, bonus] of Object.entries(row)) {
    const match = name.match(/^spell_level_(\d+)$/);
    const level = match?.[1];
    const amount = Number(bonus);
    if (level && amount > 0 && Number(base[level]) > 0) result[level] = Number(base[level]) + amount;
  }
  return result;
}

export function spellFormKey(spellId, reversed = false) { return `${spellId}::${reversed ? 'reverse' : 'normal'}`; }

export function wildMagicOutcome(natural) {
  if (!Number.isInteger(natural) || natural < 1 || natural > 20) throw new RangeError('natural must be an integer from 1 to 20');
  if (natural === 1) return 'Bane';
  if (natural === 20) return 'Boon';
  return 'Normal';
}

export function spellBookPages(spell) {
  const level = Number(typeof spell === 'object' ? spell?.level ?? spell?.spellLevel : spell);
  if (!Number.isInteger(level) || level <= 0) throw new RangeError('spell level must be a positive integer');
  return level;
}

export function copyingChance(intelligence) {
  const score = validInteger(intelligence, 'INT score', 3);
  if (score <= 3) return 20;
  if (score <= 5) return 30;
  if (score <= 7) return 35;
  if (score <= 9) return 40;
  if (score <= 12) return 50;
  if (score <= 14) return 70;
  if (score <= 16) return 75;
  if (score === 17) return 85;
  return 90;
}

export function beginningSpellAllowance(intelligence) {
  const score = validInteger(intelligence, 'INT score', 3);
  if (score <= 3) return 1;
  if (score <= 5) return 1;
  if (score <= 7) return 2;
  if (score <= 9) return 2;
  if (score <= 12) return 3;
  if (score <= 14) return 3;
  if (score <= 16) return 4;
  if (score === 17) return 4;
  return 5;
}

export function canRetryCopy(currentLevel, failedAtLevel) {
  const current = validInteger(currentLevel, 'current level', 1);
  if (failedAtLevel === null || failedAtLevel === undefined) return true;
  const failed = validInteger(failedAtLevel, 'failed level', 1);
  return current > failed;
}
