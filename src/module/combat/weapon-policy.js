/** Central weapon policy for BR-10.
 *
 * The catalog supplies weapon facts.  Class profiles supply proficiency; every
 * character may attempt an unlisted weapon, but does so at -2 to hit and may
 * not deal more than their class hit die.  Physical race restrictions remain
 * separate from proficiency.
 */

const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const tags = (item) => { const result = new Set(item?.system?.tags ?? []); if (item?.system?.wieldMode === 'twoHanded') result.add('two-handed'); return result; };
const weaponName = (item) => {
  const name = norm(String(item?.name ?? '').replace(/\s*[+-]\d+\s*$/, ''));
  return name === 'magesstaff' ? 'staff' : name;
};
export const isBluntWeapon = (item) => item?.system?.damageType === 'B' || tags(item).has('blunt');
export const requiresTwoHands = (item) => tags(item).has('two-handed');

export function findClassProfile(profiles = [], className) {
  const key = norm(className);
  return profiles.find((profile) => norm(profile.id) === key || norm(profile.name) === key) ?? null;
}

export function isWeaponProficient(item, permissions = []) {
  if (permissions.includes('Any')) return true;
  const s = item?.system ?? {};
  const itemTags = tags(item);
  const name = weaponName(item);
  const blunt = s.damageType === 'B' || itemTags.has('blunt');
  if (permissions.includes('Blunt weapons only')) return blunt;
  if (permissions.includes('Melee weapons only')) return !!s.melee || itemTags.has('melee');
  if (permissions.includes('Missile weapons')) {
    if (s.missile || itemTags.has('missile')) return true;
  }
  if (permissions.includes('One-handed melee weapons') && (s.melee || itemTags.has('melee')) && !itemTags.has('two-handed')) return true;
  if (permissions.includes('Small-size weapons')) return s.size === 'S';
  if (permissions.includes('Small/normal weapons')) return s.size !== 'L';

  const keywords = new Set(['Any', 'Missile weapons', 'One-handed melee weapons', 'Blunt weapons only',
    'Melee weapons only', 'Small-size weapons', 'Small/normal weapons', 'No longbows', 'No two-handed swords']);
  const named = permissions.filter((permission) => !keywords.has(permission)).map((permission) => norm(permission.replace(/\s+optional$/i, '')));
  if (!named.length) return false;
  return named.some((entry) => {
    if (entry === 'sword') return itemTags.has('sword') || itemTags.has('swords');
    if (entry === 'dagger') return itemTags.has('dagger') || name === 'dagger';
    return name === entry;
  });
}

export function physicalWeaponRestriction(item, raceProfile, strength = null) {
  const text = (raceProfile?.racialAbilities ?? []).map((ability) => `${ability.name ?? ''} ${ability.effect ?? ''}`).join(' ').toLowerCase();
  const s = item?.system ?? {};
  const itemTags = tags(item);
  if ((text.includes('longbow') && weaponName(item) === 'longbow') ||
      (text.includes('two-handed swords') && (itemTags.has('sword') || itemTags.has('swords')) && itemTags.has('two-handed'))) {
    return { allowed: false, reason: `${raceProfile.name ?? 'This race'} cannot use ${item.name}.` };
  }
  if (text.includes('small or normal-sized weapons') && s.size === 'L') {
    return { allowed: false, reason: `${raceProfile.name ?? 'This race'} cannot use large weapons.` };
  }
  if (Number(s.minStr) > 0 && (strength == null || strength === '' || !Number.isFinite(Number(strength)) || Number(strength) < Number(s.minStr))) {
    return { allowed: false, reason: `${item.name} requires Strength ${s.minStr}.` };
  }
  return { allowed: true };
}

export function evaluateWeaponPolicy({ item, classProfile, raceProfile, hitDie, strength = null } = {}) {
  const physical = physicalWeaponRestriction(item, raceProfile, strength);
  if (!physical.allowed) return { ...physical, proficient: false, attackPenalty: 0, damageCapHD: null };
  const permissions = classProfile?.weaponPermissions;
  if (!Array.isArray(permissions)) return { allowed: false, proficient: false, attackPenalty: 0, damageCapHD: null, reason: 'Weapon proficiency data is unavailable for this class.' };
  // These profile clauses describe physical limits, not training.
  const itemTags = tags(item);
  if ((permissions.includes('Small-size weapons') && item?.system?.size !== 'S') ||
      (permissions.includes('Small/normal weapons') && item?.system?.size === 'L') ||
      (permissions.includes('No longbows') && weaponName(item) === 'longbow') ||
      (permissions.includes('No two-handed swords') && (itemTags.has('sword') || itemTags.has('swords')) && itemTags.has('two-handed'))) {
    return { allowed: false, reason: 'This weapon exceeds the character’s physical weapon limits.' };
  }
  const proficient = isWeaponProficient(item, permissions);
  const die = Number(hitDie ?? String(classProfile.hitDie ?? '').match(/d(\d+)/i)?.[1]);
  if (!proficient && (!Number.isFinite(die) || die <= 0)) return { allowed: false, reason: 'Class hit die is unavailable; cannot calculate the non-proficiency damage cap.' };
  return {
    allowed: true,
    proficient,
    attackPenalty: proficient ? 0 : -2,
    damageCapHD: proficient ? null : die,
    reason: proficient ? undefined : 'This weapon is outside the class proficiency list.'
  };
}

export function weaponDamageFormula(item, wieldMode = 'oneHanded', sizeMode = 'normal') {
  const damage = item?.system?.damage;
  if (typeof damage === 'string') return damage;
  if (!damage || typeof damage !== 'object') return null;
  return damage?.[wieldMode]?.[sizeMode] ?? damage?.oneHanded?.normal ?? null;
}

/** Approved cap: final total, including all bonuses and critical dice. */
export function applyWeaponDamageCap(total, cap) {
  const value = Math.max(0, Number(total) || 0);
  if (cap == null) return { total: value, capped: false };
  const ceiling = Number(cap);
  if (!Number.isFinite(ceiling) || ceiling <= 0) throw new Error('Invalid weapon damage cap');
  return { total: Math.min(value, ceiling), capped: value > ceiling };
}

export async function loadWeaponProfiles() {
  const responses = await Promise.all([
    fetch('systems/osp-houserules/data/class_profiles.json'),
    fetch('systems/osp-houserules/data/race_profiles.json')
  ]);
  if (responses.some(response => response.ok === false)) throw new Error('Weapon profile data unavailable');
  const [classes, races] = await Promise.all(responses.map(response => response.json()));
  return { classes: classes.classProfiles || [], races: races.raceProfiles || [] };
}
