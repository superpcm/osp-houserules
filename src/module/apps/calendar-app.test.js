import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { dateToSeconds, INITIAL_DATE, secondsToDate, occurrencesInRange, occurrenceAt } from '../calendar/calendar.js';
globalThis.foundry = { applications: { api: { HandlebarsApplicationMixin: base => base, ApplicationV2: class { async render() {} async close() {} } } } };
const authority = await import('../calendar/calendar-authority.js');
const sessionNotes = await import('../calendar/session-notes.js');
const weatherAuthority = await import('../calendar/weather-authority.js');
const { CalendarApp, CalendarClockApp, eventEditorDraft, openCalendarClock } = await import('./calendar-app.js');
const NOW = dateToSeconds(INITIAL_DATE), DAY = 86400;
let events, notes;
const fakeForm = data => ({ querySelector: selector => { const name = /name="([^"]+)"/.exec(selector)?.[1]; return name && name in data ? { value: String(data[name]), checked: Boolean(data[name]) } : null; } });
beforeEach(() => {
  events = []; notes = []; globalThis.game = { user: { id: 'gm', isGM: true }, users: { activeGM: { id: 'gm' } }, time: { worldTime: 0 } };
  globalThis.Hooks = { on: vi.fn((_name, handler) => handler), off: vi.fn() }; globalThis.ui = { notifications: { error: vi.fn() } };
  vi.spyOn(authority, 'currentCalendarDate').mockImplementation(() => secondsToDate(NOW));
  vi.spyOn(authority, 'currentCalendarLabel').mockReturnValue('Crownday, Longnight the 4th, 742 · 8:00 AM');
  vi.spyOn(authority, 'worldTimeToCalendarSeconds').mockReturnValue(NOW);
  vi.spyOn(authority, 'getCalendarState').mockReturnValue({ pendingAdvance: null, history: [] });
  const visible = () => events.filter(e => game.user.isGM || e.visibility === 'public');
  vi.spyOn(authority, 'listCalendarEvents').mockImplementation(visible);
  vi.spyOn(authority, 'calendarOccurrences').mockImplementation((from, to) => visible().flatMap(e => occurrencesInRange(e, from, to)));
  vi.spyOn(authority, 'upcomingCalendarEvents').mockImplementation(() => visible().map(e => occurrenceAt(e, 0)));
  vi.spyOn(sessionNotes, 'listSessionNotes').mockImplementation(() => notes.filter(note => game.user.isGM || note.visibility === 'public').sort((a, b) => b.date - a.date));
  vi.spyOn(sessionNotes, 'createSessionNote').mockImplementation(async input => { const note = { id: `note-${notes.length + 1}`, revision: 0, title: input.title, body: input.body, date: input.date, visibility: input.visibility }; notes.push(note); return note; });
  vi.spyOn(sessionNotes, 'updateSessionNote').mockImplementation(async (id, input, revision) => { const note = notes.find(item => item.id === id); if (note.revision !== revision) throw new Error('changed'); Object.assign(note, input, { revision: revision + 1 }); return note; });
  vi.spyOn(sessionNotes, 'deleteSessionNote').mockImplementation(async (id, revision) => { const note = notes.find(item => item.id === id); if (note.revision !== revision) throw new Error('changed'); notes = notes.filter(item => item.id !== id); return { success: true }; });
  vi.spyOn(weatherAuthority, 'getCurrentWeather').mockReturnValue(null);
  vi.spyOn(weatherAuthority, 'getDMForecast').mockReturnValue([]);
  globalThis.ui.calendarClock = undefined;
});
afterEach(() => vi.restoreAllMocks());
describe('Calendar application behavior', () => {
  it('navigates the month/year without changing the world clock', async () => {
    const advance = vi.spyOn(authority, 'advanceCalendarTime'); const app = new CalendarApp();
    await app._action_nextMonth(); expect([app.viewYear, app.viewMonth]).toEqual([743, 1]);
    await app._action_previousMonth(); expect([app.viewYear, app.viewMonth]).toEqual([742, 12]); expect(advance).not.toHaveBeenCalled();
  });
  it('renders thirty days and only public event details for players', async () => {
    events = [{ id: 'private', title: 'Hidden', visibility: 'private', start: NOW }, { id: 'public', title: 'Market', visibility: 'public', start: NOW }];
    game.user.isGM = false; const app = new CalendarApp(); const context = await app._prepareContext();
    expect(context.days).toHaveLength(30); expect(context.upcoming.map(e => e.title)).toEqual(['Market']);
    await app._action_editEvent({}, { dataset: { eventId: 'public' } }); expect(app.editing.readOnly).toBe(true);
    expect(() => app._readDraft(fakeForm({}))).toThrow('Only the DM');
    await app._action_editEvent({}, { dataset: { eventId: 'private' } }); expect(app.editing.title).toBe('Market');
  });
  it('adds presentation symbols without changing event data or privacy filtering', async () => {
    events = [
      { id: 'market', title: 'Forgeday Market', visibility: 'public', start: NOW },
      { id: 'festival', title: 'Festival of the Sun', visibility: 'public', start: NOW + DAY },
      { id: 'religious', title: 'The Cleansing', description: 'Religious observance', visibility: 'public', start: NOW + 2 * DAY },
      { id: 'private-market', title: 'Hidden Market', visibility: 'private', start: NOW + 3 * DAY }
    ];
    const context = await new CalendarApp()._prepareContext();
    expect(context.days[3].events[0]).toMatchObject({ title: 'Forgeday Market', symbolClass: 'market', markerIcon: 'fa-scale-balanced' });
    expect(context.days[4].events[0]).toMatchObject({ title: 'Festival of the Sun', symbolClass: 'festival', markerIcon: 'fa-champagne-glasses' });
    expect(context.days[5].events[0]).toMatchObject({ title: 'The Cleansing', symbolClass: 'religious', markerIcon: 'fa-place-of-worship' });
    expect(context.days[3].markerClass).toBe('market');
    game.user.isGM = false;
    const playerContext = await new CalendarApp()._prepareContext();
    expect(playerContext.days.flatMap(day => day.events).map(event => event.id)).not.toContain('private-market');
  });
  it('keeps upcoming entries with an accessible full date', async () => {
    events = Array.from({ length: 6 }, (_, index) => ({ id: `event-${index}`, title: `Event ${index}`, visibility: 'public', start: NOW + index * DAY }));
    const context = await new CalendarApp()._prepareContext();
    expect(context.upcoming).toHaveLength(6);
    expect(context.upcoming[0]).toMatchObject({ shortDay: '4', shortLabel: 'Longnight 4', shortDateLabel: 'Crownday, Longnight the 4th, 742' });
  });
  it('keeps a midnight instant on its own day and expands recurring dates', async () => {
    const midnight = NOW - 8 * 3600;
    events = [{ id: 'market', title: 'Market', visibility: 'public', start: midnight, end: null, recurrence: { unit: 'weeks', interval: 1 } }];
    const context = await new CalendarApp()._prepareContext();
    expect(context.days[3].events).toHaveLength(1); expect(context.days[2].events).toHaveLength(0); expect(context.days[4].events).toHaveLength(0); expect(context.days[8].events).toHaveLength(1);
  });
  it('preserves selected visibility/type/recurrence and converts reminder units once', async () => {
    const source = { id: 'one', title: 'Festival', start: NOW, end: NOW + 3600, kind: 'timed', visibility: 'public', recurrence: { unit: 'months', interval: 2 }, reminderOffsets: [0, 3600, 86400] };
    const app = new CalendarApp(); app.editing = eventEditorDraft(source); const context = await app._prepareContext();
    expect(context.editing.earlierMinutes).toBe('60, 1440'); expect(context.editing.visibilityOptions.find(e => e.selected).value).toBe('public'); expect(context.editing.repeatOptions.find(e => e.selected).value).toBe('months');
    const input = app._readDraft(fakeForm({ title: 'Festival', description: 'Town square', visibility: 'public', kind: 'timed', startYear: 742, startMonth: 12, startDay: 4, startTime: '08:00', endEnabled: true, endYear: 742, endMonth: 12, endDay: 4, endTime: '09:00', repeatUnit: 'months', repeatInterval: 2, earlierMinutes: '60, 1440' }));
    expect(input).toMatchObject({ start: NOW, end: NOW + 3600, recurrence: { unit: 'months', interval: 2 }, reminderOffsets: [3600, 86400] });
  });
  it('converts an all-day inclusive end into an exclusive stored boundary', () => {
    const app = new CalendarApp(); app.editing = eventEditorDraft({ title: 'Feast', start: NOW, end: null });
    const input = app._readDraft(fakeForm({ title: 'Feast', description: '', visibility: 'private', kind: 'all-day', startYear: 742, startMonth: 12, startDay: 4, startTime: '17:00', endEnabled: true, endYear: 742, endMonth: 12, endDay: 5, endTime: '17:00', repeatUnit: 'none', earlierMinutes: '' }));
    expect(input.start).toBe(NOW - 8 * 3600); expect(input.end - input.start).toBe(2 * DAY);
    expect(eventEditorDraft(input).endDay).toBe(5);
  });
  it('dispatches Foundry actions through function references and reads custom duration', async () => {
    const advance = vi.spyOn(authority, 'advanceCalendarTime').mockResolvedValue({ success: true });
    const app = new CalendarApp(); app.element = fakeForm({ duration: 2, durationUnit: 'hours' });
    await CalendarApp.DEFAULT_OPTIONS.actions.calendarAction.call(app, {}, { dataset: { calendarAction: 'advance' } });
    expect(advance).toHaveBeenCalledWith(7200);
  });
  it('shows readable history and the remaining pending rest duration', async () => {
    vi.mocked(authority.getCalendarState).mockReturnValue({ pendingAdvance: { kind: 'rest', target: NOW + 5 * 3600, stage: 'waiting', rest: { progress: {} }, waiting: [{ title: 'Caravan' }] }, history: [{ kind: 'correction', old: NOW, new: NOW - 3600, status: 'complete', reason: 'Fix' }] });
    const context = await new CalendarApp()._prepareContext(); expect(context.pending.remaining).toBe('5.00'); expect(context.history[0].oldLabel).toContain('8:00 AM');
  });
  it('registers live updates once and cleans them up on close', async () => {
    const app = new CalendarApp(); app._onRender({}, {}); app._onRender({}, {}); expect(Hooks.on).toHaveBeenCalledTimes(6);
    await app.close(); expect(Hooks.off).toHaveBeenCalledTimes(6);
  });
  it('derives the analogue hand angles from campaign time, including seconds', async () => {
    vi.mocked(authority.worldTimeToCalendarSeconds).mockReturnValue(NOW + 5 * 3600 + 30 * 60 + 45);
    const context = await new CalendarApp()._prepareContext();
    expect(context.clock.timeLabel).toBe('1:30 PM');
    expect(context.clock.secondLabel).toBe('45');
    expect(context.clock.hour).toBeCloseTo(45.375);
    expect(context.clock.minute).toBeCloseTo(184.5);
    expect(context.clock.second).toBe(270);
  });
  it('opens and reuses one standalone clock without changing campaign time', async () => {
    const advance = vi.spyOn(authority, 'advanceCalendarTime');
    const first = openCalendarClock(); const second = openCalendarClock();
    expect(second).toBe(first); expect(ui.calendarClock).toBe(first); expect(advance).not.toHaveBeenCalled();
  });
  it('refreshes standalone clock angles on time hooks and removes hooks on close', async () => {
    const app = new CalendarClockApp(); app._onRender({}, {}); app._onRender({}, {});
    expect(Hooks.on).toHaveBeenCalledWith('ospCalendarTimeChanged', expect.any(Function));
    expect(Hooks.on).toHaveBeenCalledWith('updateWorldTime', expect.any(Function));
    const render = vi.spyOn(app, 'render');
    Hooks.on.mock.calls.find(([name]) => name === 'ospCalendarTimeChanged')[1]();
    expect(render).toHaveBeenCalled();
    await app.close(); expect(Hooks.off).toHaveBeenCalledTimes(2);
  });
  it('switches to the agenda when a day is selected and keeps tabs explicit', async () => {
    const app = new CalendarApp();
    await app._action_selectDay({}, { dataset: { day: '12' } });
    expect(app.selectedDay).toBe(12);
    expect(app.activeTab).toBe('agenda');
    await app._action_selectTab({}, { dataset: { tab: 'month' } });
    expect(app.activeTab).toBe('month');
  });
  it('supports the public upcoming tab and keeps its listing authority-filtered', async () => {
    events = [{ id: 'public', title: 'Public event', visibility: 'public', start: NOW }, { id: 'private', title: 'Private event', visibility: 'private', start: NOW + DAY }];
    const app = new CalendarApp(); await app._action_selectTab({}, { dataset: { tab: 'upcoming' } }); game.user.isGM = false;
    const playerContext = await app._prepareContext();
    expect(playerContext.isUpcomingTab).toBe(true);
    expect(playerContext.upcoming.map(event => event.title)).toEqual(['Public event']);
    game.user.isGM = true;
    const gmContext = await new CalendarApp()._prepareContext();
    expect(gmContext.upcoming.map(event => event.title)).toEqual(['Public event', 'Private event']);
  });
  it('toggles time controls for GMs without changing campaign time and ignores players', async () => {
    const advance = vi.spyOn(authority, 'advanceCalendarTime'); const app = new CalendarApp();
    expect(app.showTimeControls).toBe(false);
    await app._action_toggleTimeControls(); expect(app.showTimeControls).toBe(true); expect(advance).not.toHaveBeenCalled();
    game.user.isGM = false; await app._action_toggleTimeControls(); expect(app.showTimeControls).toBe(true); expect(advance).not.toHaveBeenCalled();
  });
  it.each([[0, 0, 0, '12:00 AM'], [12, 0, 0, '12:00 PM'], [8, 240, 0, '8:00 AM'], [23.5, 345, 180, '11:30 PM']])('places clock hands at campaign hour %s', async (hours, hourAngle, minuteAngle, label) => {
    vi.mocked(authority.worldTimeToCalendarSeconds).mockReturnValue(NOW - 8 * 3600 + hours * 3600);
    const context = await new CalendarApp()._prepareContext();
    expect(context.clock.hour).toBe(hourAngle); expect(context.clock.minute).toBe(minuteAngle); expect(context.clock.timeLabel).toBe(label);
  });
  it('refreshes the clock through world-time hooks without discarding editor input or month navigation', async () => {
    const app = new CalendarApp(); await app._action_newEvent();
    app.viewMonth = 1; app.viewYear = 743;
    const fields = [{ name: 'title', value: 'Unsaved festival', type: 'text' }];
    app.element = { querySelector: () => ({ querySelectorAll: () => fields }), querySelectorAll: () => [] };
    app._onRender({}, {}); const render = vi.spyOn(app, 'render');
    Hooks.on.mock.calls.find(([name]) => name === 'updateWorldTime')[1]();
    expect(render).toHaveBeenCalled(); expect(app.editing.title).toBe('Unsaved festival');
    expect([app.viewYear, app.viewMonth, app.activeTab]).toEqual([743, 1, 'agenda']);
  });
  it('prevents players from opening history and returns Today to the month view', async () => {
    const app = new CalendarApp(); game.user.isGM = false;
    await app._action_selectTab({}, { dataset: { tab: 'history' } }); expect(app.activeTab).toBe('month');
    app.activeTab = 'agenda'; app.viewMonth = 3; await app._action_today();
    expect([app.activeTab, app.viewMonth, app.selectedDay]).toEqual(['month', 12, 4]);
  });
  it('awards the selected rest duration through the existing authority and handles cancelled prompts', async () => {
    const prompt = vi.fn().mockResolvedValue(1.5); foundry.applications.api.DialogV2 = { prompt };
    const rest = vi.spyOn(authority, 'startAwardRest').mockResolvedValue({ stopped: false });
    const app = new CalendarApp(); await app._action_awardRest(); expect(rest).toHaveBeenCalledWith(1.5);
    expect(prompt.mock.calls[0][0].content).toContain('value="8"');
    rest.mockClear(); prompt.mockResolvedValue(null); await app._action_awardRest(); expect(rest).not.toHaveBeenCalled();
  });
});

describe('Lunar and category presentation', () => {
  it('shows the campaign moon independently of browsing and assigns phases to all month days', async () => {
    const app = new CalendarApp(); app.viewMonth = 1; app.viewYear = 743;
    const context = await app._prepareContext();
    expect(context.moon).toMatchObject({ name: 'Waxing crescent', age: 3 });
    expect(context.days[0].moon.name).toBe('New moon');
    expect(context.days[15].moon).toMatchObject({ name: 'Full moon', illumination: 100 });
    expect(context.days.every(day => day.moon.label.includes('illuminated'))).toBe(true);
  });
  it('preserves explicit event category through editing and hides private category details from players', async () => {
    events = [{ id: 'one', title: 'Festival cover', category: 'quest', visibility: 'public', start: NOW }, { id: 'hidden', title: 'Hidden deadline', category: 'deadline', visibility: 'private', start: NOW }];
    const app = new CalendarApp(); await app._action_editEvent({}, { dataset: { eventId: 'one' } });
    const context = await app._prepareContext();
    expect(context.editing.categoryOptions.find(option => option.selected).value).toBe('quest');
    expect(context.days[3].events[0]).toMatchObject({ categoryLabel: 'Quest', categoryIcon: 'fa-compass' });
    const input = app._readDraft(fakeForm({ title: 'Festival cover', category: 'deadline', kind: 'timed', startYear: 742, startMonth: 12, startDay: 4, startTime: '08:00' }));
    expect(input.category).toBe('deadline');
    game.user.isGM = false;
    const player = await new CalendarApp()._prepareContext();
    expect(player.upcoming.map(event => event.category)).toEqual(['quest']);
  });
});

describe('Session notes presentation and actions', () => {
  it('lists notes newest first, keeps the current season, and filters selected agenda notes by browsed date', async () => {
    notes = [
      { id: 'old', revision: 0, title: 'Old', body: 'older', date: NOW - DAY, visibility: 'public' },
      { id: 'new', revision: 0, title: 'New', body: 'newer', date: NOW, visibility: 'private' }
    ];
    const app = new CalendarApp(); app.viewMonth = 6; app.selectedDay = 1;
    const context = await app._prepareContext();
    expect(context.notes.map(note => note.id)).toEqual(['new', 'old']);
    expect(context.season).toEqual({ name: 'Winter', icon: 'fa-snowflake' });
    expect(context.selectedNotes).toEqual([]);
    game.user.isGM = false;
    expect((await new CalendarApp()._prepareContext()).notes.map(note => note.id)).toEqual(['old']);
  });

  it('saves and deletes notes with revision guards while players cannot edit them', async () => {
    const app = new CalendarApp(); await app._action_newNote();
    app.element = fakeForm({ noteTitle: 'Chapter', noteBody: 'A\nnew line', noteVisibility: 'public', noteYear: 742, noteMonth: 12, noteDay: 4 });
    await app._action_saveNote();
    expect(sessionNotes.createSessionNote).toHaveBeenCalledWith(expect.objectContaining({ title: 'Chapter', body: 'A\nnew line', date: NOW - 8 * 3600 }));
    expect(app.noteEditing).toBeNull();
    app.noteEditing = { id: 'note-1', originalId: 'note-1', revision: 0, noteTitle: 'Chapter', noteBody: 'A\nnew line', noteVisibility: 'public', noteYear: 742, noteMonth: 12, noteDay: 4 };
    await app._action_deleteNote();
    expect(sessionNotes.deleteSessionNote).toHaveBeenCalledWith('note-1', 0);
    game.user.isGM = false; app.noteEditing = null; await app._action_newNote(); expect(app.noteEditing).toBeNull();
  });

  it('captures event and note drafts independently through a time hook', async () => {
    const app = new CalendarApp(); app.editing = eventEditorDraft({ title: 'event', description: '', visibility: 'private', kind: 'timed', start: NOW, end: null, recurrence: null, reminderOffsets: [] }); app.noteEditing = { noteTitle: '', noteBody: '', noteVisibility: 'private', noteYear: 742, noteMonth: 12, noteDay: 4 };
    const eventFields = [{ name: 'title', value: 'unsaved event', type: 'text' }];
    const noteFields = [{ name: 'noteTitle', value: 'unsaved note', type: 'text' }];
    app.element = { querySelector: selector => selector.includes('session-note') ? { querySelectorAll: () => noteFields } : { querySelectorAll: () => eventFields }, querySelectorAll: () => [] };
    app._captureDraft();
    expect(app.editing.title).toBe('unsaved event'); expect(app.noteEditing.noteTitle).toBe('unsaved note');
    const context = await app._prepareContext(); expect(context.noteEditing.noteTitle).toBe('unsaved note');
  });

  it('deletes the clicked list note instead of an unrelated open note', async () => {
    notes = [{ id: 'a', revision: 2, title: 'A', body: 'a', date: NOW, visibility: 'public' }, { id: 'b', revision: 4, title: 'B', body: 'b', date: NOW, visibility: 'public' }];
    const app = new CalendarApp(); app.noteEditing = { id: 'a', revision: 2, noteTitle: 'A', noteBody: 'a', noteVisibility: 'public' };
    await app._action_deleteNote({}, { dataset: { noteId: 'b' } });
    expect(sessionNotes.deleteSessionNote).toHaveBeenCalledWith('b', 4);
  });
});

describe('Month event bars', () => {
  it('lays out recurring and multiday occurrences while preserving complete agenda events and privacy filtering', async () => {
    events = [
      { id: 'multi', title: 'Long watch', visibility: 'public', start: NOW - DAY, end: NOW + 2 * DAY, kind: 'timed', recurrence: { unit: 'weeks', interval: 1 } },
      { id: 'hidden', title: 'Hidden watch', visibility: 'private', start: NOW, end: NOW + DAY, kind: 'timed' }
    ];
    const context = await new CalendarApp()._prepareContext();
    expect(context.calendarBarSegments.some(segment => segment.id === 'multi' && segment.multiDay)).toBe(true);
    expect(context.days[3].events.map(event => event.id)).toContain('multi');
    game.user.isGM = false;
    const player = await new CalendarApp()._prepareContext();
    expect(player.calendarBarSegments.map(segment => segment.id)).not.toContain('hidden');
  });

  it('opens a bar through the existing read-only event action and reports overflow without changing time', async () => {
    events = [0, 1, 2].map(index => ({ id: `over-${index}`, title: `Overlap ${index}`, visibility: 'public', start: NOW, end: NOW + DAY, kind: 'timed' }));
    const advance = vi.spyOn(authority, 'advanceCalendarTime');
    const app = new CalendarApp(); const context = await app._prepareContext();
    expect(context.days[3].events).toHaveLength(3);
    expect(context.days[3].eventOverflow).toBeGreaterThan(0);
    game.user.isGM = false;
    await app._action_editEvent({}, { dataset: { eventId: 'over-0', occurrenceStart: String(NOW) } });
    expect(app.editing.readOnly).toBe(true);
    await app._action_selectDay({}, { dataset: { day: '4' } });
    expect(app.activeTab).toBe('agenda'); expect(advance).not.toHaveBeenCalled();
  });
});

describe('Weather presentation', () => {
  it('shows current weather to everyone but only requests the seven-day forecast for GMs', async () => {
    const current = { periodStart: NOW, periodEnd: NOW + 6 * 3600, condition: 'Clear', conditionKey: 'clear', icon: 'fa-sun', severity: 'Fair', temperatureF: 72, windMph: 5, windDirection: 'N', precipitation: 'None', visibility: 'Clear', guidance: { movement: 'Good', travel: 'Good', visibility: 'Good', combat: 'Good' } };
    const forecast = Array.from({ length: 7 }, (_, day) => ({ date: NOW - 8 * 3600 + day * DAY, highF: 75, lowF: 50, periods: [current, current, current, current, current, current, current, current] }));
    vi.mocked(weatherAuthority.getCurrentWeather).mockReturnValue(current);
    vi.mocked(weatherAuthority.getDMForecast).mockReturnValue(forecast);
    const gm = await new CalendarApp()._prepareContext();
    expect(gm.currentWeather).toMatchObject({ condition: 'Clear', periodLabel: '8:00 AM – 2:00 PM' }); expect(gm.weatherForecast).toHaveLength(7); expect(gm.weatherForecast[0].periods[0].timeLabel).toBe('8:00 AM – 2:00 PM');
    vi.mocked(weatherAuthority.getDMForecast).mockClear(); game.user.isGM = false;
    const player = await new CalendarApp()._prepareContext();
    expect(player.currentWeather.condition).toBe('Clear'); expect(player.weatherForecast).toEqual([]); expect(weatherAuthority.getDMForecast).not.toHaveBeenCalled();
  });

  it('refreshes weather through its hook without discarding editor drafts', () => {
    const app = new CalendarApp(); app.editing = eventEditorDraft({ title: 'event', description: '', visibility: 'private', kind: 'timed', start: NOW, end: null, recurrence: null, reminderOffsets: [] }); app.noteEditing = { noteTitle: 'note', noteBody: 'body', noteVisibility: 'private', noteYear: 742, noteMonth: 12, noteDay: 4 };
    const fields = [{ name: 'title', value: 'unsaved event', type: 'text' }]; const noteFields = [{ name: 'noteBody', value: 'unsaved note', type: 'text' }];
    app.element = { querySelector: selector => selector.includes('session-note') ? { querySelectorAll: () => noteFields } : { querySelectorAll: () => fields }, querySelectorAll: () => [] };
    app._onRender({}, {}); const render = vi.spyOn(app, 'render'); Hooks.on.mock.calls.find(([name]) => name === 'ospWeatherChanged')[1]();
    expect(render).toHaveBeenCalled(); expect(app.editing.title).toBe('unsaved event'); expect(app.noteEditing.noteBody).toBe('unsaved note');
  });
});
