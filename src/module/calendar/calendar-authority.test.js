import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_DATE, dateToSeconds, SECONDS_PER_DAY as DAY } from './calendar.js';
const INITIAL = dateToSeconds(INITIAL_DATE), SCOPE = 'osp-houserules';
let calendar, messages, settingData, hooks, heal, spells, actor, operationCalls;
function assignPath(object, path, value) { const keys = path.split('.'); const last = keys.pop(); const parent = keys.reduce((o, k) => o[k] ||= {}, object); parent[last] = structuredClone(value); }
function makeDocument(data) {
  const document = { id: `doc${game.journal.size}`, ...structuredClone(data), getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(update) { for (const [path, value] of Object.entries(update)) assignPath(this, path, value); return this; }, async delete() { game.journal.delete(this.id); } };
  game.journal.set(document.id, document); return document;
}
const event = (hours = 3, rest = {}) => calendar.createCalendarEvent({ title: 'Caravan arrives', start: INITIAL + hours * 3600, ...rest });
beforeEach(async () => {
  vi.resetModules(); messages = []; settingData = new Map(); hooks = new Map(); operationCalls = new Set();
  const gm = { id: 'gm', isGM: true }, player = { id: 'player', isGM: false };
  actor = { id: 'hero', name: 'Aldric', type: 'character', hp: 3, maxHp: 20, spells: 0 };
  globalThis.game = { user: gm, system: { id: SCOPE }, world: { id: 'calendar-test' }, users: Object.assign(new Map([['gm', gm], ['player', player]]), { activeGM: gm }), actors: [actor], journal: new Map(), settings: { register: vi.fn(), get: (_scope, key) => settingData.get(key), set: async (_scope, key, value) => { settingData.set(key, structuredClone(value)); } }, time: { worldTime: 12345, advance: vi.fn(async (delta) => { game.time.worldTime += delta; return game.time.worldTime; }), set: vi.fn(async time => { game.time.worldTime = time; return time; }) } };
  game.journal.documentClass = { create: async data => makeDocument(data) };
  globalThis.Hooks = { on: (name, handler) => hooks.set(name, handler), callAll: vi.fn() };
  globalThis.ui = { notifications: { info: vi.fn(), warn: vi.fn() } };
  globalThis.ChatMessage = { create: vi.fn(async data => { messages.push(structuredClone(data)); return data; }) };
  calendar = await import('./calendar-authority.js'); calendar.registerCalendar(); await calendar.initializeCalendar();
  heal = vi.fn(async (a, _command, id) => { expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/); if (!operationCalls.has(id)) { a.hp += 2; operationCalls.add(id); } return { success: true }; });
  spells = vi.fn(async (a, _command, id) => { expect(id).toMatch(/^[A-Za-z0-9_-]{1,128}$/); if (!operationCalls.has(id)) { a.spells++; operationCalls.add(id); } return { success: true }; });
  calendar.registerAwardRestServices({ snapshot: a => ({ hp: a.hp, maxHp: a.maxHp, dead: false }), heal, spells });
});
describe('calendar authority', () => {
  it('anchors once without changing existing world time', async () => {
    expect(calendar.currentCalendarLabel()).toBe('Crownday, Longnight the 4th, 742 · 8:00 AM');
    expect(game.time.worldTime).toBe(12345); expect(game.time.advance).not.toHaveBeenCalled();
    await calendar.advanceCalendarTime(600); await calendar.initializeCalendar();
    expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL + 600);
  });
  it('business time-of-day uses the calendar offset for arbitrary existing timestamps', () => {
    expect(calendar.calendarMinuteOfDay(12345)).toBe(480);
    expect(calendar.calendarMinuteOfDay(12345 + 7200)).toBe(600);
    expect(calendar.calendarSecondsToWorldTime(INITIAL + 7200)).toBe(19545);
  });
  it('stores only the anchor in shared settings and protects pending state/history', async () => {
    await event(); await calendar.advanceCalendarTime(8 * 3600);
    expect(Object.keys(settingData.get('calendarState'))).toEqual(['anchor']);
    expect(JSON.stringify([...settingData.values()])).not.toContain('Caravan');
    const control = [...game.journal.values()].find(d => d.getFlag(SCOPE, 'calendarControl'));
    expect(control.ownership).toEqual({ default: 0 });
    game.user = game.users.get('player');
    expect(calendar.getCalendarState()).toEqual({ pendingAdvance: null, history: [] });
    expect(calendar.listCalendarEvents({ includePrivate: true })).toEqual([]);
  });
  it('uses native ownership and defaults to private with a generic document name', async () => {
    const secret = await event(); const pub = await event(4, { title: 'Market', visibility: 'public' });
    expect(game.journal.get(secret.id).ownership).toEqual({ default: 0 });
    expect(game.journal.get(secret.id).name).toBe('Calendar — DM event');
    expect(game.journal.get(pub.id).ownership).toEqual({ default: 2 });
    game.user = game.users.get('player'); expect(calendar.listCalendarEvents({ includePrivate: true }).map(e => e.title)).toEqual(['Market']);
  });
  it('rejects player and inactive GM mutations', async () => {
    game.user = game.users.get('player'); await expect(calendar.advanceCalendarTime(600)).rejects.toThrow('active DM');
    await expect(event()).rejects.toThrow('active DM');
    game.user = { id: 'other', isGM: true }; await expect(event()).rejects.toThrow('active DM');
    expect(game.time.advance).not.toHaveBeenCalled();
  });
  it('stops at the next reminder and resumes exactly the remaining duration', async () => {
    await event(); const result = await calendar.advanceCalendarTime(8 * 3600);
    expect(result.stopped).toBe(true); expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL + 3 * 3600);
    expect(calendar.getCalendarState().pendingAdvance.target).toBe(INITIAL + 8 * 3600);
    await calendar.resumePendingAdvance(); expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL + 8 * 3600);
    expect(calendar.getCalendarState().pendingAdvance).toBeNull();
  });
  it('batches public and private reminders at one stop without leaking titles to public chat', async () => {
    await event(3, { title: '<script>Secret</script>' }); await event(3, { title: 'Public market', visibility: 'public' });
    await calendar.advanceCalendarTime(8 * 3600);
    expect(calendar.getCalendarState().pendingAdvance.waiting).toHaveLength(2);
    const publicMessages = messages.filter(m => !m.whisper);
    expect(publicMessages).toHaveLength(1); expect(publicMessages[0].content).not.toContain('Secret');
    expect(messages.find(m => m.whisper)?.content).toContain('&lt;script&gt;Secret&lt;/script&gt;');
    await calendar.resumePendingAdvance(); expect(calendar.getCalendarState().pendingAdvance).toBeNull();
  });
  it('handles earlier reminders, recurring occurrences, and an event exactly at now', async () => {
    await event(1, { reminderOffsets: [3600], recurrence: { unit: 'days', interval: 1 } });
    await calendar.advanceCalendarTime(2 * DAY); expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL);
    await calendar.resumePendingAdvance(); expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL + 3600);
    await calendar.resumePendingAdvance(); expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL + DAY);
  });
  it('keeps recovery untouched on interrupted rest, then grants it once on completion', async () => {
    await event(); await calendar.startAwardRest(8);
    expect(actor.hp).toBe(3); expect(actor.spells).toBe(0);
    await calendar.resumePendingAdvance(); expect(actor.hp).toBe(5); expect(actor.spells).toBe(1);
    await calendar.resumePendingAdvance(); expect(heal).toHaveBeenCalledTimes(1); expect(spells).toHaveBeenCalledTimes(1);
  });
  it('cancels an interrupted rest without granting recovery and retains elapsed time', async () => {
    await event(); await calendar.startAwardRest(8); await calendar.cancelPendingAdvance();
    expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL + 3 * 3600);
    expect(actor.hp).toBe(3); expect(heal).not.toHaveBeenCalled(); expect(calendar.getCalendarState().pendingAdvance).toBeNull();
  });
  it('retains recoverable completion after a spell failure and never repeats successful healing', async () => {
    spells.mockResolvedValueOnce({ success: false, reason: 'Temporary failure' });
    await expect(calendar.startAwardRest(8)).rejects.toThrow('Temporary failure');
    expect(calendar.getCalendarState().pendingAdvance.stage).toBe('error'); expect(actor.hp).toBe(5);
    await expect(calendar.cancelPendingAdvance()).rejects.toThrow('already started');
    await calendar.resumePendingAdvance(); expect(heal).toHaveBeenCalledTimes(1); expect(actor.hp).toBe(5); expect(actor.spells).toBe(1);
  });
  it('does not duplicate effects if a health response fails after committing', async () => {
    const baseHeal = heal.getMockImplementation();
    heal.mockImplementationOnce(async (...args) => { await baseHeal(...args); throw new Error('Lost health response'); });
    await expect(calendar.startAwardRest(8)).rejects.toThrow('Lost health response');
    expect(actor.hp).toBe(5); await calendar.resumePendingAdvance(); expect(actor.hp).toBe(5); expect(actor.spells).toBe(1);
    expect(heal.mock.calls[0][2]).toBe(heal.mock.calls[1][2]);
  });
  it('guards pending time, corrections, and event revisions', async () => {
    const e = await event(); await calendar.updateCalendarEvent(e.id, { title: 'Renamed' }, 0);
    await expect(calendar.updateCalendarEvent(e.id, { title: 'Stale' }, 0)).rejects.toThrow('changed');
    await calendar.advanceCalendarTime(8 * 3600);
    await expect(calendar.advanceCalendarTime(600)).rejects.toThrow('pending');
    await expect(calendar.correctCalendarDate(INITIAL)).rejects.toThrow('pending');
  });
  it('backward corrections preserve recovery and acknowledgements until explicitly reset', async () => {
    const e = await event(1); await calendar.startAwardRest(2); await calendar.resumePendingAdvance();
    await calendar.correctCalendarDate(INITIAL, 'Correct a mistaken advance');
    expect(actor.hp).toBe(5); expect(calendar.getCalendarState().history.at(-1).reason).toContain('mistaken');
    await calendar.advanceCalendarTime(2 * 3600); expect(calendar.getCalendarState().pendingAdvance).toBeNull();
    await calendar.correctCalendarDate(INITIAL); await calendar.resetCalendarEventReminders(e.id); await calendar.advanceCalendarTime(2 * 3600);
    expect(calendar.getCalendarState().pendingAdvance).not.toBeNull();
  });
  it('forward corrections respect reminder stops', async () => { await event(); await calendar.correctCalendarDate(INITIAL + 8 * 3600, 'Fix forward'); expect(calendar.worldTimeToCalendarSeconds()).toBe(INITIAL + 3 * 3600); });
  it('replays a completed operation ID without moving time twice', async () => { await calendar.advanceCalendarTime(600, { operationId: 'same' }); await calendar.advanceCalendarTime(600, { operationId: 'same' }); expect(game.time.worldTime).toBe(12345 + 600); });
  it('accepts fractional hours without floating-point rounding errors', async () => {
    await calendar.startAwardRest(1.1);
    expect(game.time.worldTime).toBe(12345 + 3960);
    expect(heal).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid or reused identifiers before changing time', async () => {
    for (const id of ['bad:id', '__proto__', 'constructor', '', 'a'.repeat(101)]) await expect(calendar.advanceCalendarTime(600, { operationId: id })).rejects.toThrow();
    expect(game.time.advance).not.toHaveBeenCalled();
    await calendar.advanceCalendarTime(600, { operationId: 'valid_id' });
    await expect(calendar.advanceCalendarTime(1200, { operationId: 'valid_id' })).rejects.toThrow('different time advance');
    expect(game.time.worldTime).toBe(12345 + 600);
  });
  it('rejects zero/negative/fractional advances, empty rest duration, and invalid corrections', async () => {
    for (const delta of [0, -1, 0.5, '']) await expect(calendar.advanceCalendarTime(delta)).rejects.toThrow();
    await expect(calendar.startAwardRest('')).rejects.toThrow(); await expect(calendar.correctCalendarDate(-1)).rejects.toThrow();
  });
});
