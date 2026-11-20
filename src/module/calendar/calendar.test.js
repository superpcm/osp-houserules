import { describe, expect, it } from 'vitest';
import { CALENDAR, EVENT_CATEGORIES, INITIAL_DATE, SECONDS_PER_DAY as DAY, dateToSeconds, secondsToDate, formatDate, normalizeEvent, occurrencesInRange, earliestReminders, eventCategory, moonPhase, seasonForDate } from './calendar.js';
const date = (day, hour = 8, month = 12, year = 742) => dateToSeconds({ year, month, day, hour });
const event = overrides => ({ id: 'event', ...normalizeEvent({ title: 'Festival', start: date(4), ...overrides }), acknowledged: {} });
describe('custom calendar', () => {
  it('uses exactly the agreed weekdays and twelve month names', () => {
    expect(CALENDAR.weekdays).toEqual(['Dawnday', 'Forgeday', 'Wyrmday', 'Crownday', 'Veilday']);
    expect(CALENDAR.months).toEqual(['Frostveil', 'Emberwane', 'Thawborn', 'Rainweald', 'Thornbloom', 'Suncrest', 'Dragonflame', 'Goldfield', 'Harvestmere', 'Duskhollow', 'Ravenfall', 'Longnight']);
  });
  it('starts on Crownday, Longnight 4, 742 at 8 AM', () => expect(formatDate(dateToSeconds(INITIAL_DATE))).toBe('Crownday, Longnight the 4th, 742 · 8:00 AM'));
  it('has 30 days per month and 360 days per year without leap exceptions', () => {
    expect(secondsToDate(date(30, 23) + 3600)).toMatchObject({ year: 743, month: 1, day: 1, hour: 0, weekday: 'Dawnday' });
    expect(dateToSeconds({ year: 743, month: 1, day: 1 }) - dateToSeconds({ year: 742, month: 1, day: 1 })).toBe(360 * DAY);
    expect(secondsToDate(date(30, 12, 2))).toMatchObject({ month: 2, day: 30, hour: 12 });
  });
  it('rejects impossible dates, blank values, fractional seconds, and overflow', () => {
    for (const d of [{ year: 0, month: 1, day: 1 }, { year: 1, month: 1, day: 31 }, { year: '', month: 1, day: 1 }, { year: Number.MAX_SAFE_INTEGER, month: 1, day: 1 }]) expect(() => dateToSeconds(d)).toThrow();
    expect(() => secondsToDate(0.5)).toThrow();
  });
  it.each([['days', 1], ['weeks', 5], ['months', 30], ['years', 360]])('expands %s recurrence arithmetically', (unit, days) => {
    const e = event({ recurrence: { unit, interval: 2 } });
    const from = e.start + 10000 * days * 2 * DAY;
    const occurrences = occurrencesInRange(e, from, from + 2 * days * DAY);
    expect(occurrences.map(o => o.occurrenceStart)).toEqual([from, from + 2 * days * DAY]);
  });
  it('includes ongoing multi-day events but excludes a finished event at its exclusive end', () => {
    const e = event({ start: date(4, 0), end: date(7, 0), kind: 'all-day' });
    expect(occurrencesInRange(e, date(6, 0), date(7, 0))).toHaveLength(1);
    expect(occurrencesInRange(e, date(7, 0), date(8, 0))).toHaveLength(0);
  });
  it('finds earlier reminders and batches everything at the same instant', () => {
    const e = event({ start: date(4, 12), reminderOffsets: [3600] });
    const other = { ...event({ start: date(4, 11) }), id: 'other' };
    expect(earliestReminders([e, other], date(4, 8), date(4, 16)).map(r => [r.eventId, r.due])).toEqual([['event', date(4, 11)], ['other', date(4, 11)]]);
  });
  it('all-day reminders fire at 8 AM on the first day, with earlier offsets from that morning', () => {
    const e = event({ start: date(5, 14), kind: 'all-day', end: date(8, 0), reminderOffsets: [DAY] });
    expect(e.start).toBe(date(5, 0));
    expect(earliestReminders([e], date(4, 7), date(6, 0))[0].due).toBe(date(4, 8));
  });
  it('acknowledges occurrences independently and never loops on a reminder at now', () => {
    const e = event({ recurrence: { unit: 'days', interval: 1 } });
    e.acknowledged[`${e.start}_0`] = true;
    expect(earliestReminders([e], e.start, e.start + DAY)[0].due).toBe(e.start + DAY);
  });
  it('validates recurrence and event durations instead of silently discarding errors', () => {
    expect(() => event({ end: date(3) })).toThrow();
    expect(() => event({ recurrence: { unit: 'weeks', interval: 0 } })).toThrow();
    expect(() => event({ reminderOffsets: [-60] })).toThrow();
  });
  it('defines the stable event category metadata', () => {
    expect(EVENT_CATEGORIES).toEqual([
      { value: 'general', label: 'General', icon: 'fa-calendar-day' },
      { value: 'market', label: 'Market', icon: 'fa-scale-balanced' },
      { value: 'festival', label: 'Festival', icon: 'fa-champagne-glasses' },
      { value: 'religious', label: 'Religious', icon: 'fa-place-of-worship' },
      { value: 'quest', label: 'Quest', icon: 'fa-compass' },
      { value: 'deadline', label: 'Deadline', icon: 'fa-hourglass-end' }
    ]);
  });
  it('persists explicit categories and infers legacy categories', () => {
    expect(eventCategory({ title: 'Festival', category: 'quest' })).toBe('quest');
    expect(normalizeEvent({ title: 'Festival', category: 'quest', start: date(4) }).category).toBe('quest');
    expect(normalizeEvent({ title: 'Cleansing of the shrine', start: date(4) }).category).toBe('religious');
    expect(normalizeEvent({ title: 'Market day', start: date(4) }).category).toBe('market');
    expect(normalizeEvent({ title: 'Festival of Embers', start: date(4) }).category).toBe('festival');
    expect(normalizeEvent({ title: 'Gathering', description: 'New beginnings', start: date(4) }).category).toBe('religious');
    expect(normalizeEvent({ title: 'Gathering', start: date(4) }).category).toBe('general');
    expect(() => normalizeEvent({ title: 'Gathering', category: 'unknown', start: date(4) })).toThrow('Unknown event category');
  });
  it('calculates canonical eight-phase moon ages across month and year boundaries', () => {
    const expected = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    expect([0, 2, 6, 10, 15, 19, 23, 27].map(age => moonPhase({ year: 742, month: 12, day: age + 1 }).name)).toEqual(expected);
    expect(moonPhase({ year: 742, month: 12, day: 30, hour: 23 }).age).toBe(29);
    expect(moonPhase({ year: 743, month: 1, day: 1 }).age).toBe(0);
    expect(moonPhase({ year: 742, month: 12, day: 1, hour: 23 })).toEqual(moonPhase({ year: 742, month: 12, day: 1 }));
    expect(moonPhase({ year: 742, month: 12, day: 1 })).toMatchObject({ index: 0, illumination: 0, waxing: true });
    expect(moonPhase({ year: 742, month: 12, day: 16 })).toMatchObject({ index: 4, illumination: 100, waxing: false });
  });
  it.each([[12, 'Winter', 'fa-snowflake'], [1, 'Winter', 'fa-snowflake'], [2, 'Winter', 'fa-snowflake'], [3, 'Spring', 'fa-seedling'], [5, 'Spring', 'fa-seedling'], [6, 'Summer', 'fa-sun'], [8, 'Summer', 'fa-sun'], [9, 'Autumn', 'fa-leaf'], [11, 'Autumn', 'fa-leaf']])('maps month %s to %s', (month, name, icon) => expect(seasonForDate({ year: 742, month, day: 1 })).toEqual({ name, icon }));
});

 it.each([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [22, '22nd'], [23, '23rd'], [30, '30th']])('formats day %s with its ordinal suffix', (day, ordinal) => { expect(formatDate({ ...INITIAL_DATE, day }, { includeTime: false })).toContain(`Longnight the ${ordinal}, 742`); });
