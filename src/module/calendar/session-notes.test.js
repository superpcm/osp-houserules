import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SECONDS_PER_DAY as DAY, dateToSeconds } from './calendar.js';

const SCOPE = 'osp-houserules';
const date = (day, month = 1) => dateToSeconds({ year: 742, month, day });
let notes, sessionNotes, hooks;

function makeDocument(data) {
  const document = { id: `note${notes.size}`, ...structuredClone(data), getFlag(scope, key) { return this.flags?.[scope]?.[key]; },
    async update(update) { for (const [path, value] of Object.entries(update)) { const keys = path.split('.'); const last = keys.pop(); const parent = keys.reduce((object, key) => object[key] ||= {}, this); parent[last] = structuredClone(value); } return this; },
    async delete() { notes.delete(this.id); } };
  notes.set(document.id, document); return document;
}

beforeEach(async () => {
  vi.resetModules(); notes = new Map(); hooks = vi.fn();
  const gm = { id: 'gm', isGM: true }, player = { id: 'player', isGM: false };
  globalThis.game = { user: gm, world: { id: 'notes-test' }, users: Object.assign(new Map([['gm', gm], ['player', player]]), { activeGM: gm }), journal: notes, time: { worldTime: 12345, advance: vi.fn(), set: vi.fn() } };
  game.journal.documentClass = { create: async data => makeDocument(data) };
  globalThis.Hooks = { callAll: hooks };
  sessionNotes = await import('./session-notes.js');
});

describe('calendar session notes', () => {
  it('normalizes title, day-start date, visibility, and plaintext body without HTML parsing', () => {
    const note = sessionNotes.normalizeSessionNote({ title: '  Recap  ', body: '<b>Keep this literal</b>', date: date(3) + 8 * 3600, visibility: 'public' });
    expect(note).toEqual({ title: 'Recap', body: '<b>Keep this literal</b>', date: date(3), visibility: 'public' });
    expect(sessionNotes.normalizeSessionNote({ body: 'Note', date: date(1) }).title).toBe('Session note');
    expect(() => sessionNotes.normalizeSessionNote({ body: ' ', date: date(1) })).toThrow();
    expect(() => sessionNotes.normalizeSessionNote({ body: 'x'.repeat(10001), date: date(1) })).toThrow();
    expect(() => sessionNotes.normalizeSessionNote({ body: 'x' })).toThrow();
  });
  it('creates, updates, lists newest first, and deletes separate journal entries', async () => {
    const old = await sessionNotes.createSessionNote({ body: 'Old', date: date(2) });
    const newer = await sessionNotes.createSessionNote({ title: 'Public', body: 'New', date: date(3), visibility: 'public' });
    expect(sessionNotes.listSessionNotes().map(note => note.id)).toEqual([newer.id, old.id]);
    const updated = await sessionNotes.updateSessionNote(old.id, { body: 'Changed', date: date(4) }, 0);
    expect(updated).toMatchObject({ body: 'Changed', date: date(4), revision: 1 });
    await sessionNotes.deleteSessionNote(newer.id, 0);
    expect(notes.has(newer.id)).toBe(false);
    expect(hooks).toHaveBeenCalledTimes(4);
    expect(game.time.advance).not.toHaveBeenCalled(); expect(game.time.set).not.toHaveBeenCalled();
  });
  it('keeps private notes DM-only and uses native ownership', async () => {
    const secret = await sessionNotes.createSessionNote({ body: 'Secret', date: date(1) });
    const pub = await sessionNotes.createSessionNote({ body: 'Visible', date: date(2), visibility: 'public' });
    expect(notes.get(secret.id).ownership).toEqual({ default: 0 });
    expect(notes.get(secret.id).name).toBe('Calendar — DM session note');
    expect(notes.get(pub.id).ownership).toEqual({ default: 2 });
    game.user = game.users.get('player');
    expect(sessionNotes.listSessionNotes().map(note => note.title)).toEqual(['Session note']);
  });
  it('guards mutations to the active DM and rejects stale revisions', async () => {
    const note = await sessionNotes.createSessionNote({ body: 'Note', date: date(1) });
    await expect(sessionNotes.updateSessionNote(note.id, { body: 'Stale' }, 1)).rejects.toThrow('changed');
    await expect(sessionNotes.deleteSessionNote(note.id, 1)).rejects.toThrow('changed');
    game.user = { id: 'other-gm', isGM: true };
    await expect(sessionNotes.createSessionNote({ body: 'Nope', date: date(1) })).rejects.toThrow('active DM');
    game.user = game.users.get('player');
    await expect(sessionNotes.createSessionNote({ body: 'Nope', date: date(1) })).rejects.toThrow('active DM');
    await expect(sessionNotes.updateSessionNote(note.id, { body: 'Nope' }, 0)).rejects.toThrow('active DM');
    await expect(sessionNotes.deleteSessionNote(note.id, 0)).rejects.toThrow('active DM');
  });
});

it('keeps session notes out of event occurrences and removes public visibility when made private', async () => {
  const note = await sessionNotes.createSessionNote({ body: 'A public recap', date: date(3), visibility: 'public' });
  const authority = await import('./calendar-authority.js');
  expect(authority.listCalendarEvents()).toEqual([]);
  expect(authority.calendarOccurrences(date(1), date(10))).toEqual([]);
  await sessionNotes.updateSessionNote(note.id, { visibility: 'private' }, 0);
  expect(notes.get(note.id).ownership).toEqual({ default: 0 });
  game.user = game.users.get('player');
  expect(sessionNotes.listSessionNotes()).toEqual([]);
});
