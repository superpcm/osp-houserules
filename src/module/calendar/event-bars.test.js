import { describe, expect, it } from 'vitest';
import { layoutEventBars } from './event-bars.js';

const DAY = 86400;
const event = (id, start, end, title = id) => ({ id, title, occurrenceStart: start, occurrenceEnd: end });

describe('event bar layout', () => {
  it('lays out half-open multi-day spans and midnight endings correctly', () => {
    const result = layoutEventBars([event('a', 0, 6 * DAY), event('b', 2 * DAY, 2 * DAY)], 0);
    expect(result.segments.find(segment => segment.id === 'a')).toMatchObject({ week: 0, startColumn: 1, span: 5, multiDay: true, startsHere: true, endsHere: false, continuesAfter: true });
    expect(result.segments.find(segment => segment.id === 'a' && segment.week === 1)).toMatchObject({ startColumn: 1, span: 1, startsHere: false, endsHere: true, continuesBefore: true, continuesAfter: false });
    expect(result.segments.find(segment => segment.id === 'b')).toMatchObject({ span: 1, multiDay: false, startsHere: true, endsHere: true });
  });
  it('clips month edges and splits across all six five-day weeks', () => {
    const result = layoutEventBars([event('long', -2 * DAY, 32 * DAY)], 0);
    expect(result.segments).toHaveLength(6);
    expect(result.segments.map(segment => segment.span)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(result.segments[0]).toMatchObject({ startsHere: false, continuesBefore: true });
    expect(result.segments.at(-1)).toMatchObject({ endsHere: false, continuesAfter: true });
  });
  it('assigns deterministic lanes and counts overflow for every covered day', () => {
    const input = [event('z', 0, 2 * DAY, 'Same'), event('a', 0, 2 * DAY, 'Same'), event('overflow', DAY, 3 * DAY, 'Later')];
    const before = structuredClone(input);
    const result = layoutEventBars(input, 0);
    expect(result.segments.map(segment => segment.id)).toEqual(['a', 'z']);
    expect(result.segments.map(segment => segment.lane)).toEqual([0, 1]);
    expect(result.overflowByDay).toEqual([0, 1, 1, ...Array(27).fill(0)]);
    expect(input).toEqual(before);
    const overflow = layoutEventBars([event('a', 0, 2 * DAY), event('b', 0, 2 * DAY), event('c', 0, 2 * DAY)], 0);
    expect(overflow.segments).toHaveLength(2);
    expect(overflow.overflowByDay.slice(0, 2)).toEqual([1, 1]);
  });
  it('prefers a continuing occurrence lane in the next week when available', () => {
    const result = layoutEventBars([event('carry', 4 * DAY, 7 * DAY), event('other', 5 * DAY, 6 * DAY)], 0);
    expect(result.segments.find(segment => segment.id === 'carry' && segment.week === 0).lane).toBe(0);
    expect(result.segments.find(segment => segment.id === 'carry' && segment.week === 1).lane).toBe(0);
  });
  it('keeps expanded recurrences independent when IDs repeat at different starts', () => {
    const result = layoutEventBars([event('repeat', 0, DAY), event('repeat', 2 * DAY, 3 * DAY)], 0);
    expect(result.segments).toHaveLength(2);
    expect(new Set(result.segments.map(segment => segment.key)).size).toBe(2);
  });
});

it('includes both dates for timed midnight crossings but excludes exact midnight endings', () => {
  const from = 742 * 360 * DAY;
  const crossing = layoutEventBars([event('crossing', from + 23 * 3600, from + DAY + 3600)], from);
  expect(crossing.segments[0]).toMatchObject({ startColumn: 1, span: 2, multiDay: true });
  const midnight = layoutEventBars([event('midnight', from + 23 * 3600, from + DAY)], from);
  expect(midnight.segments[0]).toMatchObject({ startColumn: 1, span: 1, multiDay: false });
});
