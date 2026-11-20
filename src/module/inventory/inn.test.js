import { afterEach, describe, expect, it } from 'vitest';
import { availableInnQuantity, emptyInn, quoteInn, normalizeInn, innSpecialtyReservations, innOfferingPrice, innOpeningStatus, __test } from './inn.js';

const inn = () => ({ ...emptyInn('Roadhouse'), revision: 3, offerings: [
  { id: 'meal', name: 'Stew', kind: 'meal', priceCp: 4, quantity: 10, capacity: 1, enabled: true },
  { id: 'room', name: 'Private Room', kind: 'room', priceCp: 25, quantity: 2, capacity: 2, enabled: true },
  { id: 'stable', name: 'Stabling', kind: 'stabling', priceCp: 10, quantity: 3, capacity: 1, enabled: true },
] });

describe('inn offers', () => {
  it('quotes food and lodging with nightly pricing and guest capacity', () => {
    const result = quoteInn(inn(), [{ offeringId: 'meal', quantity: 2, nights: 1 }, { offeringId: 'room', quantity: 1, nights: 2, guestIds: ['a', 'b'] }]);
    expect(result).toMatchObject({ success: true, totalCp: 58, revision: 3 });
  });

  it('does not oversell active lodging bookings', () => {
    const data = inn(); data.bookings = [{ id: 'b', endsAt: 200, checkedOut: false, lines: [{ offeringId: 'room', quantity: 2 }] }];
    expect(availableInnQuantity(data, 'room', 100)).toBe(0);
    expect(quoteInn(data, [{ offeringId: 'room', quantity: 1, nights: 1, guestIds: ['a'] }], { now: 100 }).success).toBe(false);
    expect(availableInnQuantity(data, 'room', 200)).toBe(2);
  });

  it('rejects disabled, malformed, and over-capacity lines', () => {
    const data = inn(); data.offerings[0].enabled = false;
    expect(quoteInn(data, [{ offeringId: 'meal', quantity: 1 }]).success).toBe(false);
    data.offerings[0].enabled = true;
    expect(quoteInn(data, [{ offeringId: 'room', quantity: 1, nights: 1, guestIds: ['a', 'b', 'c'] }]).success).toBe(false);
    expect(quoteInn(data, [{ offeringId: 'room', quantity: 1, nights: 0 }]).success).toBe(false);
  });

  it('applies only an enabled meal special and preserves original price metadata', () => {
    const data = inn(); data.todaySpecial = { offeringId: 'meal', discountPercent: 25 };
    expect(innOfferingPrice(data, 'meal')).toBe(3);
    expect(quoteInn(data, [{ offeringId: 'meal', quantity: 1 }]).lines[0]).toMatchObject({ unitPriceCp: 3, originalUnitPriceCp: 4, discountPercent: 25 });
    expect(innOfferingPrice(data, 'room')).toBe(25);
    data.offerings[0].enabled = false; expect(innOfferingPrice(data, 'meal')).toBe(4);
  });

  it('normalizes legacy inns with safe utility defaults', () => {
    const data = normalizeInn({ name: 'Old House', offerings: [] });
    expect(data).toMatchObject({ todaySpecial: { offeringId: null, discountPercent: 0 }, openingHours: { enabled: false, openMinute: 480, closeMinute: 1380, override: 'auto' }, revealedRumors: [] });
  });

  it('handles disabled, overnight, exact-close, negative, and override hours', () => {
    const data = normalizeInn({ ...emptyInn(), openingHours: { enabled: true, openMinute: 480, closeMinute: 1380, override: 'auto' } });
    expect(innOpeningStatus(data, 480 * 60).open).toBe(true);
    expect(innOpeningStatus(data, 1380 * 60).open).toBe(false);
    expect(innOpeningStatus(data, -60).open).toBe(false);
    const overnight = { ...data, openingHours: { enabled: true, openMinute: 1320, closeMinute: 120, override: 'auto' } };
    expect(innOpeningStatus(overnight, 23 * 3600).open).toBe(true);
    expect(innOpeningStatus(overnight, 2 * 3600).open).toBe(false);
    expect(innOpeningStatus({ ...data, openingHours: { ...data.openingHours, override: 'open' } }, 0).open).toBe(true);
    expect(innOpeningStatus({ ...data, openingHours: { ...data.openingHours, override: 'closed' } }, 0).open).toBe(false);
    expect(innOpeningStatus({ ...data, openingHours: { ...data.openingHours, enabled: false } }, 0).open).toBe(true);
  });

  it('validates specials and hours against the saved offering set', () => {
    const data = { ...emptyInn('Validated'), offerings: [{ id: 'meal', name: 'Stew', kind: 'meal', priceCp: 4, quantity: 1, capacity: 1, enabled: true }] };
    expect(__test.validateInnInput({ ...data, todaySpecial: { offeringId: 'missing', discountPercent: 10 } })).toMatch(/enabled meal/);
    expect(__test.validateInnInput({ ...data, todaySpecial: { offeringId: 'meal', discountPercent: 101 } })).toMatch(/special/);
    expect(__test.validateInnInput({ ...data, openingHours: { enabled: true, openMinute: 1440, closeMinute: 60, override: 'auto' } })).toMatch(/Opening hours/);
  });
});


describe('exclusive inn specialties', () => {
  afterEach(() => { delete globalThis.game; });
  const specialty = (key = 'recipe-one', name = 'Mara’s supper') => ({ id: 'special', sourceId: key, specialtyKey: key, signature: true, name, description: 'Roast roots with sage.', kind: 'meal', priceCp: 20, quantity: 4, capacity: 1, managed: true });
  const document = (id, offerings) => ({ id, getFlag: () => ({ ...emptyInn(id), offerings }) });
  it('persists specialty metadata and reserves even closed establishments', () => {
    const offering = specialty();
    expect(normalizeInn({ ...emptyInn(), offerings: [offering] }).offerings[0]).toMatchObject({ signature: true, specialtyKey: 'recipe-one' });
    globalThis.game = { journal: new Map([['other', document('other', [offering])]]) };
    expect(innSpecialtyReservations()).toEqual({ reservedSpecialtyKeys: ['recipe-one'], reservedSpecialtyNames: ['Mara’s supper'] });
    expect(innSpecialtyReservations('other').reservedSpecialtyKeys).toEqual([]);
  });
  it('rejects duplicate recipe keys and names but permits shared ordinary fare', () => {
    globalThis.game = { journal: new Map([['other', document('other', [specialty()])]]) };
    expect(__test.validateSpecialties({ offerings: [specialty('recipe-one', 'Different name')] })).toMatch(/already served/);
    expect(__test.validateSpecialties({ offerings: [specialty('different', '  MARA’S SUPPER ')] })).toMatch(/already served/);
    expect(__test.validateSpecialties({ offerings: [{ ...specialty(), signature: false, specialtyKey: null, sourceId: 'stew' }] })).toBeNull();
    expect(__test.validateSpecialties({ offerings: [specialty('new', 'Another supper')] })).toBeNull();
  });
  it('preserves existing duplicate specialties until explicitly regenerated', () => {
    const previous = { offerings: [specialty()] };
    globalThis.game = { journal: new Map([['other', document('other', [specialty()])]]) };
    expect(__test.validateSpecialties(previous, 'self', previous)).toBeNull();
    expect(__test.validateSpecialties({ offerings: [specialty('recipe-one', 'Renamed')] }, 'self', previous)).toMatch(/already served/);
  });
});
