import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dateToSeconds, INITIAL_DATE } from './calendar.js';

const SCOPE = 'osp-houserules';
let weather, journals, hooks, gm, player;

function assignPath(object, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((current, key) => current[key] ||= {}, object);
  parent[last] = structuredClone(value);
}

function makeDocument(data) {
  const document = { id: `journal-${journals.size}`, ...structuredClone(data), getFlag(scope, key) { return this.flags?.[scope]?.[key]; }, async update(changes) { for (const [path, value] of Object.entries(changes)) assignPath(this, path, value); return this; } };
  journals.set(document.id, document);
  return document;
}

beforeEach(async () => {
  vi.resetModules();
  journals = new Map(); hooks = new Map();
  gm = { id: 'gm', isGM: true }; player = { id: 'player', isGM: false };
  globalThis.game = { system: { id: SCOPE }, world: { id: 'weather-test' }, user: gm, users: Object.assign(new Map([['gm', gm], ['player', player]]), { activeGM: gm }), journal: journals, time: { worldTime: 1000, advance: vi.fn(), set: vi.fn() }, settings: { get: () => ({ anchor: { worldTime: 1000, calendarSeconds: dateToSeconds(INITIAL_DATE) } }) } };
  game.journal.documentClass = { create: async data => makeDocument(data) };
  globalThis.Hooks = { on: vi.fn((name, handler) => hooks.set(name, handler)), callAll: vi.fn() };
  weather = await import('./weather-authority.js');
});

describe('weather authority', () => {
  it('initializes one private seed and one public current snapshot', async () => {
    weather.registerWeather();
    await weather.initializeWeather();
    expect([...journals.values()].map(document => document.name)).toEqual(['Calendar — DM weather', 'Current weather']);
    const control = [...journals.values()].find(document => document.getFlag(SCOPE, 'weatherControl'));
    const current = [...journals.values()].find(document => document.getFlag(SCOPE, 'weatherCurrent'));
    expect(control.ownership).toEqual({ default: 0 });
    expect(current.ownership).toEqual({ default: 2 });
    expect(control.getFlag(SCOPE, 'weatherControl').seed).toEqual(expect.any(String));
    expect(current.getFlag(SCOPE, 'weatherCurrent').current).not.toHaveProperty('seed');
  });

  it('keeps future forecast and private seed out of player reads', async () => {
    await weather.initializeWeather();
    game.user = player;
    expect(weather.getCurrentWeather()).toMatchObject({ periodStart: expect.any(Number) });
    expect(await weather.getDMForecast()).toEqual([]);
    expect(weather.getCurrentWeather()).not.toHaveProperty('seed');
  });

  it('keeps getters read-only before initialization and for inactive GMs', () => {
    expect(weather.getCurrentWeather()).toBeNull();
    expect(weather.getDMForecast()).toEqual([]);
    expect(journals.size).toBe(0);
    game.user = { id: 'inactive-gm', isGM: true };
    expect(weather.getCurrentWeather()).toBeNull();
    expect(weather.getDMForecast()).toEqual([]);
    expect(journals.size).toBe(0);
  });

  it('does not write or emit again when the current slot is unchanged', async () => {
    weather.registerWeather();
    await weather.initializeWeather();
    const updates = [...journals.values()].map(document => vi.spyOn(document, 'update'));
    Hooks.callAll.mockClear();
    await weather.refreshWeatherForCurrentTime();
    expect(updates.every(update => update.mock.calls.length === 0)).toBe(true);
    expect(Hooks.callAll).not.toHaveBeenCalledWith('ospWeatherChanged', expect.anything());
  });

  it('guards inactive GMs and does not touch world time', async () => {
    game.user = { id: 'other-gm', isGM: true };
    await expect(weather.refreshWeatherForCurrentTime()).resolves.toBeNull();
    expect(game.time.advance).not.toHaveBeenCalled();
    expect(game.time.set).not.toHaveBeenCalled();
    expect(journals.size).toBe(0);
  });
});


it('refreshes periods and reproduces earlier weather on correction without exposing a forecast', async () => {
  await weather.initializeWeather();
  const original = weather.getCurrentWeather();
  const control = [...journals.values()].find(document => document.getFlag(SCOPE, 'weatherControl'));
  const seed = control.getFlag(SCOPE, 'weatherControl').seed;
  game.time.worldTime += 3 * 3600;
  game.user = player;
  expect(weather.getCurrentWeather()).toBeNull();
  game.user = gm;
  await weather.refreshWeatherForCurrentTime();
  expect(weather.getCurrentWeather().periodStart).toBe(original.periodStart + 3 * 3600);
  game.time.worldTime = 1000;
  await weather.refreshWeatherForCurrentTime();
  expect(weather.getCurrentWeather()).toEqual(original);
  const reloaded = await import('./weather-authority.js');
  await reloaded.initializeWeather();
  expect(journals.size).toBe(2);
  expect(control.getFlag(SCOPE, 'weatherControl').seed).toBe(seed);
  const forecast = weather.getDMForecast();
  expect(forecast).toHaveLength(7);
  expect(forecast[0].periods.find(period => period.periodStart === original.periodStart)).toEqual(original);
  game.user = player;
  expect(weather.getDMForecast()).toEqual([]);
  expect(weather.getCurrentWeather()).toEqual(original);
  const publicFlag = [...journals.values()].find(document => document.getFlag(SCOPE, 'weatherCurrent')).getFlag(SCOPE, 'weatherCurrent');
  expect(JSON.stringify(publicFlag)).not.toContain(seed);
  expect(publicFlag.current).not.toHaveProperty('periods');
  expect(publicFlag.current).not.toHaveProperty('highF');
  expect(game.time.advance).not.toHaveBeenCalled();
});
it('registers time and authority hooks once and refreshes without a weather-hook loop', async () => {
  weather.registerWeather(); weather.registerWeather();
  expect(Hooks.on).toHaveBeenCalledTimes(4);
  expect(hooks.has('ospWeatherChanged')).toBe(false);
  await weather.initializeWeather();
  game.time.worldTime += 10800;
  hooks.get('updateWorldTime')();
  await weather.refreshWeatherForCurrentTime();
  expect(weather.getCurrentWeather().periodStart).toBe(Math.floor((dateToSeconds(INITIAL_DATE) + 10800) / 10800) * 10800);
  expect(journals.size).toBe(2);
});
