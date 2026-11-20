import { getInnDocument, INN_SCOPE } from './inn.js';

const FLAG = 'innPrivate';
const copy = value => structuredClone(value);
const documents = () => game.journal?.contents ?? [...(game.journal?.values?.() ?? [])];
const empty = () => ({ revision: 0, notes: '', rumors: [] });
const raw = document => document.getFlag?.(INN_SCOPE, FLAG);
const privateDocument = innId => documents().find(document => {
  const data = raw(document);
  return data?.version === 1 && data.innId === innId;
});

/** Private material lives in a separate, GM-only document, never the public inn flag. */
export function getInnPrivate(innId) {
  if (!globalThis.game?.user?.isGM || !innId || !getInnDocument(innId)) return empty();
  const data = raw(privateDocument(innId) ?? {});
  if (!data) return empty();
  return copy({ revision: data.revision ?? 0, notes: data.notes ?? '', rumors: data.rumors ?? [] });
}

function validate(data) {
  if (!data || typeof data.notes !== 'string' || data.notes.length > 20000 || !Array.isArray(data.rumors) || data.rumors.length > 50) return 'GM notes support up to 20,000 characters and 50 rumors.';
  const ids = new Set();
  for (const rumor of data.rumors) {
    if (!rumor || typeof rumor.id !== 'string' || !rumor.id || rumor.id.length > 100 || ids.has(rumor.id) || typeof rumor.text !== 'string' || rumor.text.length > 1000 || typeof rumor.revealed !== 'boolean') return 'Each rumor needs a unique identifier and up to 1,000 characters of text.';
    ids.add(rumor.id);
  }
  return null;
}

export async function saveInnPrivate(innId, data) {
  if (!globalThis.game?.user?.isGM) return { success: false, reason: 'Only the GM can save establishment notes.' };
  if (!getInnDocument(innId)) return { success: false, reason: 'Save the establishment before saving its GM notes.' };
  const error = validate(data); if (error) return { success: false, reason: error };
  const document = privateDocument(innId);
  const previous = document ? raw(document) : { revision: 0 };
  if (data.revision != null && data.revision !== previous.revision) return { success: false, reason: 'GM notes changed elsewhere. Reload before saving.' };
  if (!document && !data.notes && !data.rumors.length) return { success: true, data: empty() };
  const next = { version: 1, innId, revision: previous.revision + 1, notes: data.notes, rumors: data.rumors.map(({ id, text, revealed }) => ({ id, text, revealed })) };
  // Replace ownership as well as contents so this document can never inherit party access.
  if (document) await document.update({ ownership: { default: 0 }, [`flags.${INN_SCOPE}.${FLAG}`]: next }, { recursive: false });
  else {
    const Document = game.journal?.documentClass ?? globalThis.JournalEntry;
    if (!Document?.create) return { success: false, reason: 'GM note documents are unavailable.' };
    await Document.create({ name: 'Establishment GM notes', ownership: { default: 0 }, flags: { [INN_SCOPE]: { [FLAG]: next } } });
  }
  return { success: true, data: copy({ revision: next.revision, notes: next.notes, rumors: next.rumors }) };
}
