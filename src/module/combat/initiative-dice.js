import { ospRoll } from '../dice.js';

/** Roll the visible whole-number d20 and add a hidden 00–99 fraction. */
export async function rollInitiativeD20({ label = 'Initiative', random = Math.random } = {}) {
  const result = await ospRoll('1d20', { label, strictIntegers: true });
  if (result?.cancelled) return { cancelled: true };
  const d20 = Number(result?.dice?.[0]?.results?.[0] ?? result?.naturalD20 ?? result?.total);
  if (!Number.isInteger(d20) || d20 < 1 || d20 > 20) throw new Error('Initiative d20 result must be an integer from 1 through 20');
  const sample = Number(random());
  if (!Number.isFinite(sample)) throw new Error('Initiative fraction source must be finite');
  const randomHundredths = Math.max(0, Math.min(99, Math.floor(Math.max(0, Math.min(0.999999999999, sample)) * 100)));
  return {
    cancelled: false,
    d20,
    randomHundredths,
    rawRollHundredths: d20 * 100 + randomHundredths,
  };
}

export const rollInitiative = rollInitiativeD20;

