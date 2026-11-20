import { SECONDS_PER_DAY, dateToSeconds, safeInteger, secondsToDate } from './calendar.js';
import { isCalendarAuthority } from './calendar-authority.js';

const SCOPE = 'osp-houserules';
const FLAG = 'sessionNote';
const LOCK = 'osp-calendar-';
const copy = value => structuredClone(value);
const values = collection => collection?.contents ?? (collection?.values ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const rawFlag = (document, key = FLAG) => document?.getFlag?.(SCOPE, key) ?? document?.flags?.[SCOPE]?.[key];
const isGM = () => Boolean(globalThis.game?.user?.isGM);
const assertAuthority = () => { if (!isCalendarAuthority()) throw new Error('The active DM must make this calendar change.'); };
let queue = Promise.resolve();

function serialized(work) {
  const run = queue.catch(() => {}).then(async () => {
    assertAuthority();
    const locks = globalThis.navigator?.locks;
    const worldId = globalThis.game?.world?.id || 'world';
    return locks?.request ? locks.request(`${LOCK}${worldId}`, { mode: 'exclusive' }, async () => { assertAuthority(); return work(); }) : work();
  });
  queue = run.catch(() => {});
  return run;
}

export function normalizeSessionNote(input = {}) {
  const title = input.title == null ? 'Session note' : typeof input.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 160) throw new Error('Session note titles support 1–160 characters.');
  if (typeof input.body !== 'string' || !input.body.trim()) throw new Error('Session notes require a nonblank body.');
  if (input.body.length > 10000) throw new Error('Session note bodies support up to 10,000 characters.');
  if (input.date == null) throw new Error('Choose a date for the session note.');
  const seconds = safeInteger(typeof input.date === 'number' ? input.date : dateToSeconds(input.date), 'Session note date');
  secondsToDate(seconds);
  const date = Math.floor(seconds / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  return { title, body: input.body, date, visibility: input.visibility === 'public' ? 'public' : 'private' };
}

function noteDocuments() { return values(globalThis.game?.journal).filter(document => rawFlag(document)?.version === 1); }
function noteData(document) { const data = rawFlag(document); return data ? { ...copy(data), id: document.id } : null; }
export function listSessionNotes() {
  return noteDocuments().map(noteData).filter(note => note && (note.visibility === 'public' || isGM())).sort((a, b) => b.date - a.date);
}
function findNote(id) { const document = noteDocuments().find(candidate => candidate.id === id); if (!document) throw new Error('That session note is no longer available.'); return document; }
async function createJournal(data) {
  const Document = globalThis.game?.journal?.documentClass || globalThis.JournalEntry;
  if (!Document?.create) throw new Error('Session note documents are unavailable. Reload the game and try again.');
  return Document.create(data);
}
export function createSessionNote(input) { return serialized(async () => {
  const note = { ...normalizeSessionNote(input), version: 1, revision: 0 };
  const document = await createJournal({ name: note.visibility === 'public' ? note.title : 'Calendar — DM session note', ownership: { default: note.visibility === 'public' ? 2 : 0 }, flags: { [SCOPE]: { [FLAG]: note } } });
  globalThis.Hooks?.callAll?.('ospCalendarTimeChanged');
  return noteData(document);
}); }

export function updateSessionNote(id, input = {}, expectedRevision) { return serialized(async () => {
  const document = findNote(typeof id === 'string' ? id : id.id), previous = noteData(document);
  if (expectedRevision != null && previous.revision !== expectedRevision) throw new Error('This session note changed in another window. Reopen it before saving.');
  const next = { ...normalizeSessionNote({ ...previous, ...input }), version: 1, revision: previous.revision + 1 };
  await document.update({ name: next.visibility === 'public' ? next.title : 'Calendar — DM session note', ownership: { default: next.visibility === 'public' ? 2 : 0 }, [`flags.${SCOPE}.${FLAG}`]: next }, { recursive: false });
  globalThis.Hooks?.callAll?.('ospCalendarTimeChanged');
  return noteData(document);
}); }

export function deleteSessionNote(id, expectedRevision) { return serialized(async () => {
  const document = findNote(typeof id === 'string' ? id : id.id), note = noteData(document);
  if (expectedRevision != null && note.revision !== expectedRevision) throw new Error('This session note changed in another window. Reopen it before deleting.');
  await document.delete();
  globalThis.Hooks?.callAll?.('ospCalendarTimeChanged');
  return { success: true };
}); }
