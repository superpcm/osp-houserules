const ABILITIES = new Set(['str', 'int', 'wis', 'dex', 'con', 'cha']);

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function flattenChanges(changes, prefix = '', output = []) {
  if (!isObject(changes)) return output;
  for (const [rawKey, value] of Object.entries(changes)) {
    const deletion = rawKey.split('.').some(segment => segment.startsWith('-='));
    const key = rawKey.startsWith('-=') ? rawKey.slice(2) : rawKey;
    const path = prefix ? `${prefix}.${key}` : key;
    if (deletion) output.push({ path, value, deleted: true });
    else if (isObject(value) && !Array.isArray(value)) flattenChanges(value, path, output);
    else output.push({ path, value, deleted: false });
  }
  return output;
}

function abilityPath(path) {
  const parts = String(path).split('.').filter(Boolean).map(part => part.toLowerCase().replace(/^-=/, ''));
  if (parts[0] !== 'system') return [];
  if (parts.length === 1 || parts[1] === 'attributes' && parts.length === 2) return [...ABILITIES];
  if (parts[1] !== 'attributes' || !ABILITIES.has(parts[2])) return [];
  if (parts.length === 3 || (parts.length === 4 && parts[3] === 'value')) return [parts[2]];
  return [];
}

function currentAbilityValue(system, ability) {
  return system?.attributes?.[ability]?.value;
}

function sameScoreValue(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (left !== '' && right !== '' && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  return Object.is(left, right);
}

/** Return ability score value changes that a non-GM update must not make. */
export function getUnauthorizedAbilityScoreChanges(changes, system = {}) {
  return flattenChanges(changes)
    .flatMap(change => abilityPath(change.path).map(ability => ({ ...change, ability })))
    .filter(change => change.deleted || change.path.split('.').filter(Boolean).length < 4 || !sameScoreValue(change.value, currentAbilityValue(system, change.ability)));
}

export function hasUnauthorizedAbilityScoreChange(changes, system = {}) {
  return getUnauthorizedAbilityScoreChanges(changes, system).length > 0;
}
