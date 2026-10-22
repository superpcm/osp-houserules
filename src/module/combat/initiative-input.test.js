import { describe, expect, it } from 'vitest';
import { parsePhysicalDieInteger } from '../dice.js';
describe('physical initiative entry', () => {
  it.each(['1.5','10x','',' ','Infinity','NaN'])('rejects %j rather than truncating it', raw => expect(Number.isNaN(parsePhysicalDieInteger(raw))).toBe(true));
  it.each(['1',' 20 ','10'])('accepts the exact whole result %j', raw => expect(parsePhysicalDieInteger(raw)).toBe(Number(raw)));
});
