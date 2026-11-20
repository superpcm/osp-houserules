import { INITIAL_DATE, SECONDS_PER_DAY, dateToSeconds, secondsToDate, formatDate, minuteOfDay, safeInteger, normalizeEvent, occurrencesInRange, earliestReminders } from './calendar.js';
export { normalizeEvent } from './calendar.js';
const SCOPE = 'osp-houserules', SETTING = 'calendarState', EVENT = 'calendarEvent', CONTROL = 'calendarControl';
const copy = value => structuredClone(value);
const values = collection => collection?.contents ?? (collection?.values ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const rawFlag = (doc, key) => doc?.getFlag?.(SCOPE, key) ?? doc?.flags?.[SCOPE]?.[key];
const now = () => safeInteger(Math.floor(Number(globalThis.game?.time?.worldTime ?? 0)), 'World time');
const isGM = () => Boolean(globalThis.game?.user?.isGM);
export const isCalendarAuthority = () => isGM() && globalThis.game?.users?.activeGM?.id === game.user.id;
function assertGM() { if (!isCalendarAuthority()) throw new Error('The active DM must make this calendar change.'); }
let queue = Promise.resolve(), registered = false, restServices = null;
function serialized(work) {
  const run = queue.catch(() => {}).then(async () => {
    assertGM();
    const locks = globalThis.navigator?.locks;
    return locks?.request ? locks.request(`osp-calendar-${game.world?.id || 'world'}`, { mode: 'exclusive' }, async () => { assertGM(); return work(); }) : work();
  });
  queue = run.catch(() => {}); return run;
}
const uid = prefix => `${prefix}_${globalThis.crypto?.randomUUID?.().replaceAll('-', '') || Math.random().toString(36).slice(2) + Date.now().toString(36)}`;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function anchorSetting() { try { return game.settings.get(SCOPE, SETTING)?.anchor || null; } catch { return null; } }
export function getAnchor() { return anchorSetting() || { worldTime: now(), calendarSeconds: dateToSeconds(INITIAL_DATE) }; }
export function worldTimeToCalendarSeconds(at = now()) { const anchor = getAnchor(); return safeInteger(anchor.calendarSeconds + safeInteger(at) - anchor.worldTime, 'Calendar time'); }
export function calendarSecondsToWorldTime(seconds) { secondsToDate(seconds); const anchor = getAnchor(); return safeInteger(anchor.worldTime + seconds - anchor.calendarSeconds, 'World time'); }
export function currentCalendarDate() { return secondsToDate(worldTimeToCalendarSeconds()); }
export function currentCalendarLabel() { return formatDate(worldTimeToCalendarSeconds()); }
/** Existing business timestamps remain elapsed world seconds; only time-of-day uses the anchor. */
export function calendarMinuteOfDay(at = now()) { return minuteOfDay(anchorSetting() ? worldTimeToCalendarSeconds(Math.floor(Number(at))) : Math.floor(Number(at))); }
export function currentMinuteOfDay() { return calendarMinuteOfDay(); }
export function formatWorldCalendarDate(at) { return anchorSetting() ? formatDate(worldTimeToCalendarSeconds(Math.floor(Number(at)))) : `Day ${Math.floor(Number(at) / SECONDS_PER_DAY) + 1}, ${String(Math.floor(calendarMinuteOfDay(at) / 60)).padStart(2, '0')}:${String(calendarMinuteOfDay(at) % 60).padStart(2, '0')}`; }
function controlDocument() { return isGM() ? values(game.journal).find(doc => rawFlag(doc, CONTROL)?.version === 1) : null; }
const emptyState = () => ({ version: 1, revision: 0, pendingAdvance: null, history: [], receipts: {} });
export function getCalendarState() { return isGM() ? copy(rawFlag(controlDocument(), CONTROL) || emptyState()) : { pendingAdvance: null, history: [] }; }
async function createJournal(data) {
  const Document = game.journal?.documentClass || globalThis.JournalEntry;
  if (!Document?.create) throw new Error('Calendar documents are unavailable. Reload the game and try again.');
  return Document.create(data);
}
async function writeState(state) {
  assertGM(); let document = controlDocument();
  if (!document) document = await createJournal({ name: 'Calendar — DM controls', ownership: { default: 0 }, flags: { [SCOPE]: { [CONTROL]: emptyState() } } });
  if ((rawFlag(document, CONTROL)?.revision ?? 0) !== state.revision) throw new Error('The calendar changed in another window. Reopen it before continuing.');
  const next = { ...copy(state), revision: state.revision + 1 };
  try { await document.update({ [`flags.${SCOPE}.${CONTROL}`]: next, ownership: { default: 0 } }, { recursive: false }); }
  catch (error) { if (rawFlag(document, CONTROL)?.revision !== next.revision) throw error; }
  if (rawFlag(document, CONTROL)?.revision !== next.revision) throw new Error('The calendar change was not acknowledged. Reopen it and retry.');
  notifyTimeChanged(); return next;
}
export function registerCalendarSettings() {
  game.settings.register(SCOPE, SETTING, { scope: 'world', config: false, type: Object, default: {}, onChange: () => notifyTimeChanged() });
}
export function registerCalendar() {
  if (registered) return; registered = true; registerCalendarSettings();
  Hooks.on('updateWorldTime', (worldTime, delta, options = {}) => {
    notifyTimeChanged();
    if (!options.ospCalendarMutation && delta > 0 && isCalendarAuthority()) {
      void serialized(async () => {
        const end = worldTimeToCalendarSeconds(Math.floor(worldTime)), from = Math.max(0, end - Math.floor(delta));
        const reminders = earliestReminders(listCalendarEvents(), from, end);
        if (!reminders.length) return;
        // External systems have already applied their changes; never rewind them to simulate a stop.
        await announce(reminders, true);
        ui.notifications?.warn?.('Another game tool advanced time across a calendar reminder. Review it in Calendar; that time change has already completed.');
      }).catch(error => console.error('OSP calendar: external time update', error));
    }
  });
}
export async function initializeCalendar() {
  if (!anchorSetting() && isCalendarAuthority()) await serialized(async () => {
    if (!anchorSetting()) await game.settings.set(SCOPE, SETTING, { anchor: { worldTime: now(), calendarSeconds: dateToSeconds(INITIAL_DATE) } });
  });
  notifyTimeChanged();
}
export function notifyTimeChanged() { globalThis.Hooks?.callAll?.('ospCalendarTimeChanged'); }
function eventDocuments() { return values(globalThis.game?.journal).filter(doc => rawFlag(doc, EVENT)?.version === 1); }
function eventData(document) { const data = rawFlag(document, EVENT); return data ? { ...copy(data), id: document.id } : null; }
export function listCalendarEvents({ includePrivate = isGM() } = {}) {
  return eventDocuments().map(eventData).filter(event => event && (event.visibility === 'public' || isGM() && includePrivate));
}
function findEvent(id) { const doc = eventDocuments().find(candidate => candidate.id === id); if (!doc) throw new Error('That calendar event is no longer available.'); return doc; }
export function newCalendarEvent(input = {}) { return normalizeEvent({ ...input, start: input.start ?? worldTimeToCalendarSeconds() }); }
export function createCalendarEvent(input) { return serialized(async () => {
  const event = { version: 1, ...normalizeEvent(input), revision: 0, acknowledged: {} };
  const document = await createJournal({ name: event.visibility === 'public' ? event.title : 'Calendar — DM event', ownership: { default: event.visibility === 'public' ? 2 : 0 }, flags: { [SCOPE]: { [EVENT]: event } } });
  notifyTimeChanged(); return eventData(document);
}); }
export function updateCalendarEvent(id, input, expectedRevision) { return serialized(async () => {
  const document = findEvent(typeof id === 'string' ? id : id.id), previous = eventData(document);
  if (expectedRevision != null && previous.revision !== expectedRevision) throw new Error('This event changed in another window. Reopen it before saving.');
  const next = { version: 1, ...normalizeEvent({ ...previous, ...input }), revision: previous.revision + 1, acknowledged: previous.acknowledged || {} };
  await document.update({ name: next.visibility === 'public' ? next.title : 'Calendar — DM event', ownership: { default: next.visibility === 'public' ? 2 : 0 }, [`flags.${SCOPE}.${EVENT}`]: next }, { recursive: false });
  notifyTimeChanged(); return eventData(document);
}); }
export function deleteCalendarEvent(id, expectedRevision) { return serialized(async () => {
  const document = findEvent(typeof id === 'string' ? id : id.id);
  if (expectedRevision != null && eventData(document).revision !== expectedRevision) throw new Error('This event changed. Reopen it before deleting.');
  await document.delete(); notifyTimeChanged(); return { success: true };
}); }
export function resetCalendarEventReminders(id) { return serialized(async () => {
  const document = findEvent(id), event = eventData(document); delete event.id;
  await document.update({ [`flags.${SCOPE}.${EVENT}`]: { ...event, acknowledged: {}, revision: event.revision + 1 } }, { recursive: false });
  notifyTimeChanged(); return { success: true };
}); }
export function calendarOccurrences(from, to, { limit = 200 } = {}) {
  return listCalendarEvents().flatMap(event => occurrencesInRange(event, from, to, limit)).sort((a, b) => a.occurrenceStart - b.occurrenceStart).slice(0, limit);
}
export function upcomingCalendarEvents({ limit = 12 } = {}) {
  const current = worldTimeToCalendarSeconds();
  return listCalendarEvents().flatMap(event => occurrencesInRange(event, current, Math.min(Number.MAX_SAFE_INTEGER, current + 360 * SECONDS_PER_DAY * 10000), limit)).sort((a, b) => a.occurrenceStart - b.occurrenceStart).slice(0, limit);
}
async function acknowledge(reminders) {
  const grouped = Map.groupBy ? Map.groupBy(reminders, r => r.eventId) : reminders.reduce((m, r) => m.set(r.eventId, [...(m.get(r.eventId) || []), r]), new Map());
  for (const [eventId, batch] of grouped) {
    const document = eventDocuments().find(doc => doc.id === eventId); if (!document) continue;
    const event = eventData(document); delete event.id;
    const acknowledged = { ...event.acknowledged };
    for (const reminder of batch) acknowledged[reminder.key] = true;
    await document.update({ [`flags.${SCOPE}.${EVENT}`]: { ...event, acknowledged, revision: event.revision + 1 } }, { recursive: false });
  }
}
async function announce(reminders, crossed = false) {
  if (!globalThis.ChatMessage?.create) return;
  const groups = [reminders.filter(r => r.visibility === 'public'), reminders.filter(r => r.visibility !== 'public')];
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].length) continue;
    const batch = groups[i];
    const data = { content: `<section class="osp-calendar-reminder"><h3>${crossed ? 'Calendar reminder crossed' : 'Calendar reminder'}</h3><ul>${batch.map(r => `<li><strong>${escape(r.title)}</strong> — ${escape(formatDate(r.due))}${r.offset ? ` (${r.offset / 60} minutes before)` : ''}</li>`).join('')}</ul>${crossed ? '' : '<p>Time advancement is paused. The DM can continue from Calendar.</p>'}</section>` };
    if (i === 1) data.whisper = values(game.users).filter(user => user.isGM).map(user => user.id);
    await ChatMessage.create(data);
  }
}
function record(state, pending, status = 'complete') {
  state.history = [...state.history, { id: pending.id, kind: pending.kind, old: pending.from, new: worldTimeToCalendarSeconds(), reason: pending.reason || '', status, userId: game.user.id, timestamp: Date.now() }].slice(-100);
  state.receipts = { ...state.receipts, [pending.id]: { target: pending.target, from: pending.from, kind: pending.kind, requestKey: pending.requestKey, status } };
  // Keep operation deduplication for the lifetime of the campaign; history is only the recent display.
  state.pendingAdvance = null; return state;
}
async function moveTo(target) {
  assertGM(); const current = worldTimeToCalendarSeconds(), delta = safeInteger(target - current, 'Time advance');
  if (delta < 0) throw new Error('Time changed elsewhere. Cancel this advance or use Correct Date & Time.');
  if (delta) await game.time.advance(delta, { ospCalendarMutation: true });
  if (worldTimeToCalendarSeconds() !== target) throw new Error('The world clock changed elsewhere. Review the pending advance before continuing.');
  notifyTimeChanged();
}
async function finishRest(state) {
  if (!restServices) throw new Error('Rest recovery is unavailable. Reload the game before retrying.');
  const pending = state.pendingAdvance; pending.stage = 'completing'; state = await writeState(state);
  for (const actorId of pending.rest.actorIds) {
    const actor = values(game.actors).find(entry => entry.id === actorId);
    const progress = state.pendingAdvance.rest.progress[actorId] ||= {};
    if (!actor) { progress.health = true; progress.spells = true; state = await writeState(state); continue; }
    if (!progress.health) {
      const snapshot = restServices.snapshot(actor);
      if (!snapshot.dead && !snapshot.bleed && snapshot.hp < snapshot.maxHp) {
        const id = `${pending.id}_hp_${actor.id}`;
        let result = await restServices.heal(actor, { action: 'naturalHealing', confirmed: true }, id);
        if (!result?.success && (result?.recoveryRequired || result?.targetRecoveryRequired) && restServices.recover) result = await restServices.recover(id);
        if (!result?.success) throw new Error(`${actor.name}: ${result?.reason || 'Healing needs recovery. Retry the rest from Calendar.'}`);
      }
      progress.health = true; state = await writeState(state);
    }
    if (!progress.spells) {
      if (!restServices.snapshot(actor).dead) {
        const id = `${pending.id}_sp_${actor.id}`;
        let result = await restServices.spells(actor, { action: 'rest', confirmed: true }, id);
        if (!result?.success && (result?.recoveryRequired || result?.targetRecoveryRequired) && restServices.recover) result = await restServices.recover(id);
        if (!result?.success) throw new Error(`${actor.name}: ${result?.reason || 'Spell recovery needs recovery. Retry the rest from Calendar.'}`);
      }
      state.pendingAdvance.rest.progress[actorId].spells = true; state = await writeState(state);
    }
  }
  await writeState(record(state, pending));
  ui.notifications?.info?.('Award Rest complete — eligible characters received natural healing and spell recovery.');
}
async function drive(state) {
  let pending = state.pendingAdvance;
  try {
    if (worldTimeToCalendarSeconds() > pending.target) throw new Error('Another tool moved time beyond this advance. Cancel it and review the calendar.');
    if (pending.stage === 'completing' || pending.stage === 'error' && pending.rest && worldTimeToCalendarSeconds() === pending.target && !pending.waiting?.length) { await finishRest(state); return { success: true, stopped: false }; }
    const waiting = earliestReminders(listCalendarEvents(), worldTimeToCalendarSeconds(), pending.target);
    const stop = waiting[0]?.due ?? pending.target;
    pending.stage = 'advancing'; pending.plannedTo = stop; state = await writeState(state);
    await moveTo(stop);
    state = getCalendarState(); pending = state.pendingAdvance;
    if (waiting.length) {
      pending.stage = 'waiting'; pending.waiting = waiting; state = await writeState(state);
      await announce(waiting);
      return { success: true, stopped: true, pending: copy(state.pendingAdvance) };
    }
    if (pending.kind === 'rest') await finishRest(state);
    else await writeState(record(state, pending));
    return { success: true, stopped: false };
  } catch (error) {
    const current = getCalendarState();
    if (current.pendingAdvance?.id === pending.id) {
      current.pendingAdvance.stage = 'error'; current.pendingAdvance.error = error.message;
      try { await writeState(current); } catch { /* Preserve the last durable checkpoint if persistence itself failed. */ }
    }
    throw error;
  }
}
async function beginAdvance(target, { kind = 'manual', reason = '', operationId = uid(kind), rest = null, requestKey = `target_${target}` } = {}) {
  if (!anchorSetting()) throw new Error('The calendar is still initializing. Try again in a moment.');
  const state = getCalendarState(), from = worldTimeToCalendarSeconds();
  secondsToDate(target);
  if (typeof operationId !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(operationId) || Object.hasOwn(Object.prototype, operationId)) throw new Error('Use a unique operation identifier containing only letters, digits, underscores, or hyphens (up to 100 characters).');
  if (!['manual', 'rest', 'correction'].includes(kind) || kind === 'rest' && !rest) throw new Error('Unknown calendar operation.');
  if (Object.hasOwn(state.receipts, operationId)) {
    if (state.receipts[operationId].requestKey !== requestKey) throw new Error('This operation identifier belongs to a different time advance.');
    return { success: true, duplicate: true };
  }
  if (state.pendingAdvance?.id === operationId && state.pendingAdvance.requestKey === requestKey) return { success: true, duplicate: true, stopped: true, pending: state.pendingAdvance };
  if (state.pendingAdvance) throw new Error('Resume or cancel the pending time advance first.');
  if (target <= from) throw new Error('Choose a future time. Use Correct Date & Time to move backward.');
  state.pendingAdvance = { id: operationId, kind, from, target, requestKey, reason: String(reason).slice(0, 500), stage: 'advancing', waiting: [], ...(rest ? { rest } : {}) };
  return drive(await writeState(state));
}
export function advanceCalendarTime(delta, options = {}) { return serialized(async () => {
  const seconds = safeInteger(delta, 'Duration'); if (seconds <= 0) throw new Error('Choose a duration greater than zero.');
  return beginAdvance(safeInteger(worldTimeToCalendarSeconds() + seconds), { ...options, requestKey: `duration_${seconds}` });
}); }
export function advanceCalendarTo(target, options = {}) { return serialized(() => beginAdvance(safeInteger(target), options)); }
export function resumePendingAdvance() { return serialized(async () => {
  let state = getCalendarState(); const pending = state.pendingAdvance;
  if (!pending) return { success: true, resumed: false };
  await acknowledge(pending.waiting || []);
  pending.waiting = []; delete pending.error;
  state = await writeState(state); return drive(state);
}); }
export function cancelPendingAdvance() { return serialized(async () => {
  let state = getCalendarState(), pending = state.pendingAdvance;
  if (!pending) return { success: true };
  if (pending.stage === 'completing' || pending.rest && Object.values(pending.rest.progress || {}).some(p => p.health || p.spells)) throw new Error('Rest recovery has already started. Retry completion so characters are not left partially recovered.');
  await acknowledge(pending.waiting || []);
  await writeState(record(state, pending, 'cancelled'));
  return { success: true, cancelled: true };
}); }
export function registerAwardRestServices(services) { restServices = services; }
export function startAwardRest(hours = 8) { return serialized(() => {
  const duration = Math.round(Number(hours) * 3600);
  if (!Number.isSafeInteger(duration) || duration <= 0) throw new Error('Enter a positive rest duration in hours, to the nearest second.');
  if (!restServices) throw new Error('Rest recovery is unavailable. Reload the game and try again.');
  const actorIds = values(game.actors).filter(actor => actor.type === 'character').map(actor => actor.id);
  return beginAdvance(safeInteger(worldTimeToCalendarSeconds() + duration), { kind: 'rest', operationId: uid('calrest'), rest: { actorIds, progress: {} } });
}); }
export function correctCalendarDate(target, reason = '') { return serialized(async () => {
  secondsToDate(target); let state = getCalendarState();
  if (state.pendingAdvance) throw new Error('Resume or cancel the pending advance before correcting the date.');
  const from = worldTimeToCalendarSeconds();
  if (target > from) return beginAdvance(target, { kind: 'correction', reason });
  if (target === from) throw new Error('Choose a different date or time.');
  const pending = { id: uid('correction'), kind: 'correction', from, target, reason: String(reason).slice(0, 500), stage: 'correcting', waiting: [] };
  state.pendingAdvance = pending; state = await writeState(state);
  await game.time.set(calendarSecondsToWorldTime(target), { ospCalendarMutation: true });
  if (worldTimeToCalendarSeconds() !== target) throw new Error('The world clock changed elsewhere. Review the correction.');
  await writeState(record(getCalendarState(), pending)); return { success: true };
}); }
export function acknowledgeReminder(eventId, occurrenceStart, offset = 0) { return serialized(() => acknowledge([{ eventId, key: `${occurrenceStart}_${offset}` }])); }
