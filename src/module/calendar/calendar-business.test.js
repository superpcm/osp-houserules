import { beforeEach, describe, expect, it } from 'vitest';
import { innOpeningStatus } from '../inventory/inn.js';
import { stableOpeningStatus } from '../inventory/stable.js';
import { dateToSeconds, INITIAL_DATE } from './calendar.js';
const anchor = { worldTime: 12345, calendarSeconds: dateToSeconds(INITIAL_DATE) };
beforeEach(() => { globalThis.game = { time: { worldTime: 12345 }, settings: { get: (_s, key) => key === 'calendarState' ? { anchor } : undefined } }; });
describe('calendar business integration', () => {
  it.each([['inn', innOpeningStatus], ['stable', stableOpeningStatus]])('%s opening hours use the anchored time even for a timestamp other than now', (_label, status) => {
    const business = { openingHours: { enabled: true, openMinute: 480, closeMinute: 540, override: 'auto' } };
    expect(status(business, 12345).open).toBe(true);
    expect(status(business, 12345 + 3600).open).toBe(false);
    expect(status(business, 12345 - 60).open).toBe(false);
  });
});
