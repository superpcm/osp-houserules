import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getInnPrivate, saveInnPrivate } from './inn-private.js';

let journal, publicInn, create;
const data = () => ({ revision: 0, notes: 'The owner hides a smuggling ledger.', rumors: [{ id: 'one', text: 'The old bridge is haunted.', revealed: true }, { id: 'two', text: 'The cellar has a hidden door.', revealed: false }] });
function document(id, values) {
  return { id, ...structuredClone(values), getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, update: vi.fn(async function (changes) {
    this.ownership = changes.ownership;
    for (const [key, value] of Object.entries(changes)) if (key.startsWith('flags.')) { const [, scope, flag] = key.split('.'); this.flags[scope][flag] = structuredClone(value); }
  }) };
}
beforeEach(() => {
  publicInn = document('inn', { name: 'Public Inn', ownership: { default: 2 }, flags: { 'osp-houserules': { inn: { version: 1, accessible: true } } } });
  journal = new Map([['inn', publicInn]]);
  create = vi.fn(async values => { const result = document('private', values); journal.set(result.id, result); return result; });
  journal.documentClass = { create };
  globalThis.game = { user: { isGM: true }, journal };
});
afterEach(() => { delete globalThis.game; });

it('stores notes and unrevealed rumors only in a separate GM-only document', async () => {
  const before = structuredClone(publicInn.flags);
  expect(await saveInnPrivate('inn', data())).toMatchObject({ success: true, data: { revision: 1 } });
  expect(create).toHaveBeenCalledWith(expect.objectContaining({ ownership: { default: 0 } }));
  expect(publicInn.flags).toEqual(before);
  expect(JSON.stringify(publicInn.flags)).not.toContain('smuggling');
  expect(getInnPrivate('inn')).toMatchObject({ revision: 1, notes: data().notes, rumors: data().rumors });
  const stored = journal.get('private');
  stored.ownership = { default: 2, player: 3 };
  expect(await saveInnPrivate('inn', { ...data(), revision: 1 })).toMatchObject({ success: true, data: { revision: 2 } });
  expect(stored.ownership).toEqual({ default: 0 });
});

it('rejects player reads and writes before accessing private data', async () => {
  await saveInnPrivate('inn', data());
  const privateDoc = journal.get('private'); privateDoc.getFlag = vi.fn(() => { throw new Error('Must not read'); });
  game.user.isGM = false;
  expect(getInnPrivate('inn')).toEqual({ revision: 0, notes: '', rumors: [] });
  expect(await saveInnPrivate('inn', data())).toMatchObject({ success: false });
  expect(privateDoc.getFlag).not.toHaveBeenCalled();
});

it('rejects stale edits, malformed rumors, and links to non-inn journals', async () => {
  expect((await saveInnPrivate('missing', data())).success).toBe(false);
  expect((await saveInnPrivate('inn', { ...data(), rumors: [data().rumors[0], data().rumors[0]] })).success).toBe(false);
  expect(create).not.toHaveBeenCalled();
  await saveInnPrivate('inn', data());
  expect(await saveInnPrivate('inn', data())).toMatchObject({ success: false, reason: expect.stringContaining('changed elsewhere') });
  expect(getInnPrivate('inn').revision).toBe(1);
});

it('does not create empty private records or send notes through shared authority', async () => {
  expect(await saveInnPrivate('inn', { notes: '', rumors: [] })).toMatchObject({ success: true });
  expect(create).not.toHaveBeenCalled();
  expect(publicInn.update).not.toHaveBeenCalled();
});
