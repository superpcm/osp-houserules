import { forecastWeather, weatherAt } from './weather.js';
import { isCalendarAuthority, worldTimeToCalendarSeconds } from './calendar-authority.js';

const SCOPE = 'osp-houserules';
const CONTROL = 'weatherControl';
const CURRENT = 'weatherCurrent';
const SLOT = 3 * 3600;
const copy = value => structuredClone(value);
const values = collection => collection?.contents ?? (collection?.values ? [...collection.values()] : Array.isArray(collection) ? collection : []);
const rawFlag = (document, key) => document?.getFlag?.(SCOPE, key) ?? document?.flags?.[SCOPE]?.[key];
const isGM = () => Boolean(globalThis.game?.user?.isGM);
const activeGM = () => isCalendarAuthority();
const currentSeconds = () => worldTimeToCalendarSeconds();
const currentSlot = seconds => Math.floor(seconds / SLOT) * SLOT;

let queue = Promise.resolve();
let registered = false;

function documents() { return values(globalThis.game?.journal); }
function findDocument(flag) { return documents().find(document => rawFlag(document, flag)?.version === 1) || null; }
function createJournal(data) {
  const Document = globalThis.game?.journal?.documentClass || globalThis.JournalEntry;
  if (!Document?.create) throw new Error('Weather journals are unavailable. Reload the game and try again.');
  return Document.create(data);
}
function seedValue() {
  return globalThis.crypto?.randomUUID?.() || `weather-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
function lockName() { return `osp-calendar-${globalThis.game?.world?.id || 'world'}`; }

async function ensureSeed() {
  let document = findDocument(CONTROL);
  if (!document) {
    const control = { version: 1, seed: seedValue() };
    document = await createJournal({ name: 'Calendar — DM weather', ownership: { default: 0 }, flags: { [SCOPE]: { [CONTROL]: control } } });
    return control.seed;
  }
  const control = rawFlag(document, CONTROL);
  if (typeof control.seed === 'string' && control.seed) return control.seed;
  const seed = seedValue();
  await document.update({ [`flags.${SCOPE}.${CONTROL}`]: { version: 1, seed }, ownership: { default: 0 } }, { recursive: false });
  return seed;
}

function publicSnapshot() { return findDocument(CURRENT); }
function publicWeather(document) {
  const data = rawFlag(document, CURRENT);
  return data?.version === 1 && data.current ? copy(data.current) : null;
}
function sameWeather(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

async function refreshLocked() {
  if (!activeGM()) return null;
  const seconds = currentSeconds();
  const seed = await ensureSeed();
  const current = weatherAt(seconds, seed);
  let document = publicSnapshot();
  if (document && sameWeather(publicWeather(document), current)) return current;
  const data = { version: 1, current };
  if (!document) document = await createJournal({ name: 'Current weather', ownership: { default: 2 }, flags: { [SCOPE]: { [CURRENT]: data } } });
  else await document.update({ name: 'Current weather', ownership: { default: 2 }, [`flags.${SCOPE}.${CURRENT}`]: data }, { recursive: false });
  globalThis.Hooks?.callAll?.('ospWeatherChanged');
  return current;
}

function serialized(work) {
  const run = queue.catch(() => {}).then(async () => {
    if (!activeGM()) return null;
    const locks = globalThis.navigator?.locks;
    const execute = async () => activeGM() ? work() : null;
    return locks?.request ? locks.request(lockName(), { mode: 'exclusive' }, execute) : execute();
  });
  queue = run.catch(() => {});
  return run.catch(error => { console.error('OSP weather authority', error); return null; });
}

export function registerWeather() {
  if (registered) return;
  registered = true;
  const refresh = () => { if (activeGM()) void refreshWeatherForCurrentTime(); };
  for (const event of ['ospCalendarTimeChanged', 'updateWorldTime', 'userConnected', 'updateUser']) globalThis.Hooks?.on?.(event, refresh);
}

export async function initializeWeather() { return refreshWeatherForCurrentTime(); }

export function refreshWeatherForCurrentTime() { return serialized(refreshLocked); }

export function getCurrentWeather() {
  const seconds = currentSeconds();
  if (isGM()) {
    try {
      const document = findDocument(CONTROL);
      const seed = rawFlag(document, CONTROL)?.seed;
      return typeof seed === 'string' && seed ? weatherAt(seconds, seed) : null;
    } catch (error) { console.error('OSP weather authority', error); return null; }
  }
  const current = publicWeather(publicSnapshot());
  return current && current.periodStart === currentSlot(seconds) ? current : null;
}

export function getDMForecast() {
  if (!isGM()) return [];
  try {
    const document = findDocument(CONTROL);
    const seed = rawFlag(document, CONTROL)?.seed;
    return typeof seed === 'string' && seed ? forecastWeather(currentSeconds(), seed, { days: 7 }) : [];
  }
  catch (error) { console.error('OSP weather authority', error); return []; }
}

