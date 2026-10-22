const key = value => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

export function normalizeKey(value) { return key(value); }

function integer(value, label, minimum = 0) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < minimum) throw new RangeError(`${label} must be an integer >= ${minimum}`);
  return n;
}

function number(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new RangeError(`${label} must be numeric`);
  return n;
}

const lightArmor = new Set(['leather', 'padded', 'hide']);
const d6ArmorPenalized = new Set(['climbsheersurfaces', 'climbsheer', 'movesilently']);

export function d6Target(base, { armorName = '', skill = '', victimLevel = 0 } = {}) {
  const training = Math.max(1, Math.min(5, integer(base, 'training base', 0)));
  const armor = String(armorName ?? '').trim();
  const skillKey = key(skill);
  let target = training;
  if (armor && d6ArmorPenalized.has(skillKey) && !lightArmor.has(key(armor))) target -= 1;
  if (skillKey === 'pickpockets') target -= Math.floor(integer(victimLevel, 'victim level', 0) / 3);
  return Math.max(0, Math.min(5, target));
}

export function d6Outcome(roll, target, skill = '') {
  const die = integer(roll, 'd6 roll', 1);
  if (die > 6) throw new RangeError('d6 roll must be an integer from 1 to 6');
  const chance = integer(target, 'd6 target', 0);
  if (chance > 5) throw new RangeError('d6 target must be an integer from 0 to 5');
  return { success: die <= chance, noticed: key(skill) === 'pickpockets' && die === 6 };
}

const mageSkillCodes = { detectmagic: 'DM', openclose: 'OC', rally: 'RY', rallyfear: 'RY', readmagic: 'RM', suggestion: 'SU', dm: 'DM', oc: 'OC', ry: 'RY', rm: 'RM', su: 'SU' };

export function mageChance(house, level, intelligence, skillId) {
  const lvl = integer(level, 'Mage level', 1);
  const intScore = integer(intelligence, 'INT score', 0);
  const mage = house?.custom_classes?.Mage?.mage_skills;
  const codes = mage?.chance_fields ?? ['level', 'DM', 'OC', 'RY', 'RM', 'SU'];
  const code = mageSkillCodes[key(skillId)];
  if (!code) throw new RangeError(`Unknown Mage skill: ${skillId}`);
  const index = codes.indexOf(code);
  const row = (mage?.chance_of_success ?? []).find(entry => Number(entry?.[0]) === lvl);
  if (!row || index < 1 || row[index] === undefined) throw new RangeError('Mage skill table has no requested level or skill');
  return Number(row[index]) + intScore;
}

function trackingTable(house) {
  const table = house?.custom_classes?.Warden?.tracking_chance;
  if (!Array.isArray(table)) throw new RangeError('Warden tracking table is missing');
  return table;
}

export function trackingChance(profile, house, level, wisdom) {
  const lvl = integer(level, 'tracking level', 1);
  const wis = number(wisdom, 'WIS score');
  const row = trackingTable(house).find(entry => {
    const label = String(entry?.level ?? '');
    return label === '10+' ? lvl >= 10 : Number(label) === lvl;
  });
  if (!row) throw new RangeError('Tracking table has no requested level');
  return Number(String(row.chance).replace('%', '')) + wis;
}

export function percentileOutcome(roll, rawTarget) {
  const die = integer(roll, 'percentile roll', 1);
  if (die > 100) throw new RangeError('percentile roll must be an integer from 1 to 100');
  const target = number(rawTarget, 'percentile target');
  return { success: die <= target, roll: die, target };
}

export function bardUses(level) {
  const lvl = integer(level, 'Bard level', 1);
  return { inspiring: 1 + Math.floor((lvl - 1) / 3), mockery: lvl < 3 ? 0 : Math.min(3, 1 + Math.floor((lvl - 3) / 3)) };
}

export function beastCompanionLimits(level, companions) {
  const lvl = integer(level, 'Beast Master level', 1);
  if (!Array.isArray(companions)) throw new TypeError('companions must be an array');
  const hds = companions.map((companion, index) => number(companion?.hd ?? companion, `companion ${index + 1} HD`));
  if (hds.some(hd => hd <= 0)) throw new RangeError('companion HD must be positive');
  const totalHD = hds.reduce((sum, hd) => sum + hd, 0);
  return { allowed: hds.length <= lvl && totalHD <= lvl, count: hds.length, totalHD, maxCount: lvl, maxHD: lvl };
}

export function assassinationPenalty(level) {
  const lvl = integer(level, 'Assassin level', 1);
  if (lvl <= 3) return 0;
  if (lvl <= 5) return -1;
  if (lvl <= 7) return -2;
  if (lvl <= 9) return -3;
  if (lvl <= 11) return -4;
  if (lvl <= 13) return -5;
  return -6;
}
