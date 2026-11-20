import { CALENDAR, dateToSeconds, secondsToDate, formatDate, EVENT_CATEGORIES, eventCategory, moonPhase, seasonForDate } from '../calendar/calendar.js';
import * as authority from '../calendar/calendar-authority.js';
import * as sessionNotes from '../calendar/session-notes.js';
import { layoutEventBars } from '../calendar/event-bars.js';
import * as weatherAuthority from '../calendar/weather-authority.js';
const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api;
const DAY = 86400, pad = value => String(value).padStart(2, '0');
const months = selected => CALENDAR.months.map((label, i) => ({ value: i + 1, label, selected: Number(selected) === i + 1 }));
const clockInput = d => `${pad(d.hour)}:${pad(d.minute)}`;
const clock = d => `${d.hour % 12 || 12}:${pad(d.minute)} ${d.hour >= 12 ? 'PM' : 'AM'}`;
const calendarClockContext = (now = secondsToDate(authority.worldTimeToCalendarSeconds())) => {
  return { ...now, hour: ((now.hour % 12) + now.minute / 60 + now.second / 3600) * 30, minute: (now.minute + now.second / 60) * 6, second: now.second * 6, timeLabel: clock(now), secondLabel: String(now.second).padStart(2, '0') };
};
const moonPresentation = value => {
  const phase = moonPhase(value), shape = phase.index > 4 ? 8 - phase.index : phase.index;
  const paths = ['', 'M12 2A10 10 0 0 1 12 22A7 10 0 0 0 12 2Z', 'M12 2A10 10 0 0 1 12 22Z', 'M12 2A10 10 0 0 1 12 22A7 10 0 0 1 12 2Z', 'M12 2A10 10 0 1 1 12 22A10 10 0 1 1 12 2Z'];
  return { ...phase, path: paths[shape], transform: phase.index > 4 ? 'translate(24 0) scale(-1 1)' : '', label: `${phase.name} · ${phase.illumination}% illuminated` };
};
const categoryPresentation = event => EVENT_CATEGORIES.find(category => category.value === eventCategory(event));
const options = (choices, selected) => choices.map(([value, label]) => ({ value, label, selected: value === selected }));
const noteDateFields = date => ({ noteYear: date.year, noteMonth: date.month, noteDay: date.day });
const noteDraft = (note = {}, date = {}) => ({ id: note.id ?? null, originalId: note.id ?? null, revision: note.revision ?? 0, noteTitle: note.title ?? note.noteTitle ?? 'Session note', noteBody: note.body ?? note.noteBody ?? '', noteVisibility: note.visibility === 'public' || note.noteVisibility === 'public' ? 'public' : 'private', ...noteDateFields(date) });
const weatherTime = value => value == null ? '' : clock(typeof value === 'number' ? secondsToDate(value) : value);
const weatherPeriodLabel = period => `${weatherTime(period.periodStart ?? period.start ?? period.date)}${(period.periodEnd ?? period.end) == null ? '' : ` – ${weatherTime(period.periodEnd ?? period.end)}`}`;
const weatherPresentation = weather => weather ? { ...weather, severityClass: String(weather.severity || 'Fair').toLowerCase(), periodLabel: weatherPeriodLabel(weather) } : null;
const dominantWeatherCondition = periods => Object.entries((periods || []).reduce((counts, period) => { counts[period.condition] = (counts[period.condition] || 0) + 1; return counts; }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
export function eventEditorDraft(event, readOnly = false) {
  const start = secondsToDate(event.start), allDay = event.kind === 'all-day';
  const end = secondsToDate(event.end == null ? event.start : event.end - (allDay ? DAY : 0));
  return { ...structuredClone(event), category: eventCategory(event), readOnly, startYear: start.year, startMonth: start.month, startDay: start.day, startTime: clockInput(start),
    endEnabled: event.end != null, endYear: end.year, endMonth: end.month, endDay: end.day, endTime: clockInput(end),
    earlierMinutes: (event.reminderOffsets || []).filter(n => n > 0).map(n => n / 60).join(', '), repeatUnit: event.recurrence?.unit || 'none', repeatInterval: event.recurrence?.interval || 1 };
}
export class CalendarApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = { id: 'osp-calendar', classes: ['osp', 'osp-calendar-window'], window: { title: 'Campaign Calendar', resizable: false }, position: { width: 1280, height: 760 }, actions: { calendarAction: CalendarApp._action } };
  static PARTS = { main: { template: 'systems/osp-houserules/templates/apps/calendar.html' } };
  constructor(options = {}) {
    super(options); const today = authority.currentCalendarDate();
    Object.assign(this, { viewYear: today.year, viewMonth: today.month, selectedDay: today.day, activeTab: 'month', editing: null, noteEditing: null, errorMessage: '', busy: false, showTimeControls: false, _calendarHooks: [] });
  }
  static async _action(event, target) {
    const action = target?.dataset?.calendarAction;
    if (action && !this.busy && typeof this[`_action_${action}`] === 'function') {
      try { return await this[`_action_${action}`](event, target); }
      catch (error) { this.errorMessage = error.message; return this.render(); }
    }
  }
  _action_openClock() { return openCalendarClock(); }
  _captureDraft() {
    if (!this.element?.querySelector) return;
    const capture = (root, draft, readOnly = false) => {
      if (!root || !draft || readOnly) return;
      root.querySelectorAll('input,textarea,select').forEach(input => { draft[input.name] = input.type === 'checkbox' ? input.checked : input.value; });
    };
    capture(this.element.querySelector('[data-calendar-editor]'), this.editing, this.editing?.readOnly);
    capture(this.element.querySelector('[data-session-note-editor]'), this.noteEditing);
  }
  async _prepareContext() {
    const today = authority.currentCalendarDate(), isGM = Boolean(game.user?.isGM);
    const current = authority.worldTimeToCalendarSeconds(), now = secondsToDate(current), from = dateToSeconds({ year: this.viewYear, month: this.viewMonth, day: 1 }), to = from + 30 * DAY;
    const occurrences = authority.calendarOccurrences(from, to - 1, { limit: 1000 });
    const onDay = day => occurrences.filter(item => item.occurrenceStart < day + DAY && (item.occurrenceEnd > day || item.occurrenceEnd === item.occurrenceStart && item.occurrenceStart >= day));
    const present = item => {
      const occurrence = secondsToDate(item.occurrenceStart), category = categoryPresentation(item), symbolClass = category.value;
      const occurrenceEnd = item.occurrenceEnd ?? item.end;
      return { ...item, shortDay: String(occurrence.day), shortLabel: `${CALENDAR.months[occurrence.month - 1]} ${occurrence.day}`, shortDateLabel: formatDate(item.occurrenceStart, { includeTime: false }), symbolClass, category: category.value, categoryLabel: category.label, categoryIcon: category.icon, markerIcon: category.icon, private: item.visibility !== 'public', allDay: item.kind === 'all-day', repeatLabel: item.recurrence ? `Every ${item.recurrence.interval === 1 ? item.recurrence.unit.slice(0, -1) : `${item.recurrence.interval} ${item.recurrence.unit}`}` : '', label: formatDate(item.occurrenceStart, { includeTime: item.kind !== 'all-day' }), endLabel: occurrenceEnd == null ? '' : formatDate(occurrenceEnd - (item.kind === 'all-day' ? DAY : 0), { includeTime: item.kind !== 'all-day' }) };
    };
    const barLayout = layoutEventBars(occurrences, from, { lanes: 2 });
    const days = Array.from({ length: 30 }, (_, i) => {
      const events = onDay(from + i * DAY).map(present), markerClass = events.find(event => event.symbolClass)?.symbolClass || '';
      return { day: i + 1, label: formatDate(from + i * DAY, { includeTime: false }), today: today.year === this.viewYear && today.month === this.viewMonth && today.day === i + 1, selected: this.selectedDay === i + 1,
        moon: moonPresentation(from + i * DAY), hasMarker: Boolean(markerClass), markerClass, markerIcon: markerClass === 'market' ? 'fa-scale-balanced' : 'fa-sun', events, eventOverflow: barLayout.overflowByDay[i] };
    });
    const state = authority.getCalendarState(), pending = isGM ? state.pendingAdvance : null;
    const notes = sessionNotes.listSessionNotes();
    const selectedDate = dateToSeconds({ year: this.viewYear, month: this.viewMonth, day: this.selectedDay });
    const selectedNotes = notes.filter(note => note.date === selectedDate).map(note => ({ ...note, private: note.visibility !== 'public' }));
    let editing = null;
    if (this.editing) {
      const e = this.editing;
      editing = { ...e, categoryLabel: categoryPresentation(e).label, categoryIcon: categoryPresentation(e).icon, categoryOptions: options(EVENT_CATEGORIES.map(c => [c.value, c.label]), e.category), startMonths: months(e.startMonth), endMonths: months(e.endMonth),
        visibilityOptions: options([['private', 'DM-only'], ['public', 'Public']], e.visibility), kindOptions: options([['timed', 'Timed'], ['all-day', 'All day']], e.kind),
        repeatOptions: options([['none', 'Does not repeat'], ['days', 'Days'], ['weeks', 'Weeks'], ['months', 'Months'], ['years', 'Years']], e.repeatUnit),
        label: formatDate(e.displayStart ?? e.start, { includeTime: e.kind !== 'all-day' }), endLabel: e.end == null ? '' : formatDate(e.displayEnd ?? e.end - (e.kind === 'all-day' ? DAY : 0), { includeTime: e.kind !== 'all-day' }) };
    }
    let noteEditing = null;
    if (this.noteEditing && isGM) noteEditing = { ...this.noteEditing, noteMonths: months(this.noteEditing.noteMonth), visibilityOptions: options([['private', 'DM-only'], ['public', 'Public']], this.noteEditing.noteVisibility) };
    return { isGM, label: authority.currentCalendarLabel(), dateLabel: formatDate(current, { includeTime: false }), year: this.viewYear, monthName: CALENDAR.months[this.viewMonth - 1], weekdays: CALENDAR.weekdays, days, upcoming: authority.upcomingCalendarEvents({ limit: 20 }).map(present),
      activeTab: this.activeTab, isMonthTab: this.activeTab === 'month', isAgendaTab: this.activeTab === 'agenda', isUpcomingTab: this.activeTab === 'upcoming', isHistoryTab: this.activeTab === 'history', isNotesTab: this.activeTab === 'notes', isWeatherTab: this.activeTab === 'weather', isTimeControlsOpen: isGM && this.showTimeControls,
      moon: moonPresentation(current), selectedMoon: moonPresentation(from + (this.selectedDay - 1) * DAY), clock: calendarClockContext(now),
      season: seasonForDate(current), selectedDay: this.selectedDay, selectedLabel: `${CALENDAR.months[this.viewMonth - 1]} ${this.selectedDay}`, selectedEvents: days[this.selectedDay - 1]?.events || [], selectedNotes,
      notes: notes.map(note => ({ ...note, label: formatDate(note.date, { includeTime: false }), private: note.visibility !== 'public' })),
      calendarBarSegments: barLayout.segments.map(segment => { const item = present(segment); return { ...item, laneOffset: (1 - segment.lane) * 17 + 3, ariaLabel: `${item.title}: ${item.label}${item.endLabel ? ` – ${item.endLabel}` : ''}` }; }),
      currentWeather: weatherPresentation(weatherAuthority.getCurrentWeather()),
      weatherForecast: isGM ? (weatherAuthority.getDMForecast() || []).map(day => { const periods = (day.periods || []).map(period => ({ ...weatherPresentation(period), timeLabel: weatherPeriodLabel(period) })); return { ...day, label: formatDate(day.date, { includeTime: false }), dominantCondition: dominantWeatherCondition(periods), periods }; }) : [],
      editing, pending: pending ? { ...pending, rest: Boolean(pending.rest), remaining: Math.max(0, (pending.target - current) / 3600).toFixed(2), retry: pending.stage === 'error' || pending.stage === 'completing', canCancel: pending.stage !== 'completing' && !Object.values(pending.rest?.progress || {}).some(p => p.health || p.spells) } : null,
      noteEditing,
      busy: this.busy, controlsDisabled: this.busy || Boolean(pending), errorMessage: this.errorMessage, currentYear: today.year, currentDay: today.day, currentTime: clockInput(today), currentMonths: months(today.month),
      history: isGM ? [...(state.history || [])].reverse().map(h => ({ ...h, oldLabel: formatDate(h.old), newLabel: formatDate(h.new), kindLabel: ({ manual: 'Time advance', rest: 'Award Rest', correction: 'Date correction' }[h.kind] || h.kind) })) : [] };
  }
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element?.querySelectorAll?.('[data-calendar-editor] input,[data-calendar-editor] textarea,[data-calendar-editor] select').forEach(input => input.addEventListener('input', () => this._captureDraft()));
    if (!this._calendarHooks.length) {
      for (const event of ['ospCalendarTimeChanged', 'ospWeatherChanged', 'updateWorldTime', 'updateJournalEntry', 'createJournalEntry', 'deleteJournalEntry']) this._calendarHooks.push([event, Hooks.on(event, () => {
        if (this.busy) return; this._captureDraft();
        // A player cannot retain an event that the DM made private or deleted.
        if (this.editing?.id && !authority.listCalendarEvents().some(item => item.id === this.editing.id)) this.editing = null;
        if (this.noteEditing?.id && !sessionNotes.listSessionNotes().some(note => note.id === this.noteEditing.id)) this.noteEditing = null;
        void this.render();
      })]);
    }
  }
  async close(options) { for (const [event, id] of this._calendarHooks) Hooks.off(event, id); this._calendarHooks = []; return super.close(options); }
  async _run(operation) {
    if (this.busy) return; this._captureDraft(); this.busy = true; this.errorMessage = '';
    try { await this.render(); await operation(); }
    catch (error) { this.errorMessage = error?.message || 'Calendar action failed. Try again.'; ui.notifications?.error?.(this.errorMessage); }
    finally { this.busy = false; await this.render(); }
  }
  _action_previousMonth() { this._captureDraft(); if (this.viewYear === 1 && this.viewMonth === 1) return; if (--this.viewMonth < 1) { this.viewMonth = 12; this.viewYear--; } return this.render(); }
  _action_nextMonth() { this._captureDraft(); if (++this.viewMonth > 12) { this.viewMonth = 1; this.viewYear++; } return this.render(); }
  _action_today() { this._captureDraft(); const d = authority.currentCalendarDate(); this.viewYear = d.year; this.viewMonth = d.month; this.selectedDay = d.day; this.activeTab = 'month'; return this.render(); }
  _action_selectTab(_event, target) { this._captureDraft(); const tab = target.dataset.tab; if (['month', 'agenda', 'upcoming', 'notes', 'weather'].includes(tab) || (tab === 'history' && game.user?.isGM)) this.activeTab = tab; return this.render(); }
  _action_toggleTimeControls() { if (!game.user?.isGM) return; this._captureDraft(); this.showTimeControls = !this.showTimeControls; return this.render(); }
  _action_selectDay(_event, target) { this.selectedDay = Number(target.dataset.day); this.editing = null; this.activeTab = 'agenda'; return this.render(); }
  _action_newEvent() {
    if (!game.user?.isGM) return;
    this.editing = eventEditorDraft({ title: '', description: '', visibility: 'private', kind: 'timed', start: dateToSeconds({ year: this.viewYear, month: this.viewMonth, day: this.selectedDay, hour: 8 }), end: null, recurrence: null, reminderOffsets: [] }); this.activeTab = 'agenda'; return this.render();
  }
  _action_newNote() {
    if (!game.user?.isGM || authority.isCalendarAuthority?.() === false) return;
    this._captureDraft(); this.noteEditing = noteDraft({}, { year: this.viewYear, month: this.viewMonth, day: this.selectedDay }); this.activeTab = 'notes'; return this.render();
  }
  _action_editNote(_event, target) {
    if (!game.user?.isGM || authority.isCalendarAuthority?.() === false) return;
    this._captureDraft(); const note = sessionNotes.listSessionNotes().find(item => item.id === target.dataset.noteId); if (!note) return;
    this.noteEditing = noteDraft(note, secondsToDate(note.date)); this.activeTab = 'notes'; return this.render();
  }
  _action_cancelNote() { this.noteEditing = null; return this.render(); }
  _readNoteDraft(root = this.element) {
    if (!game.user?.isGM || authority.isCalendarAuthority?.() === false) throw new Error('Only the active DM can edit session notes.');
    if (!this.noteEditing) throw new Error('Choose a session note first.');
    const value = name => root.querySelector(`[name="${name}"]`)?.value ?? this.noteEditing[name];
    return { title: value('noteTitle'), body: value('noteBody'), visibility: value('noteVisibility'), date: dateToSeconds({ year: value('noteYear'), month: value('noteMonth'), day: value('noteDay') }) };
  }
  _action_saveNote() {
    const draft = this._readNoteDraft(this.element?.querySelector('[data-session-note-editor]') || this.element), editing = this.noteEditing;
    return this._run(async () => { await (editing.id ? sessionNotes.updateSessionNote(editing.id, draft, editing.revision) : sessionNotes.createSessionNote(draft)); this.noteEditing = null; });
  }
  _action_deleteNote(_event, target) {
    const targetId = target?.dataset?.noteId;
    const editing = targetId ? sessionNotes.listSessionNotes().find(note => note.id === targetId) : this.noteEditing;
    if (!game.user?.isGM || authority.isCalendarAuthority?.() === false || !editing?.id) return;
    return this._run(async () => { await sessionNotes.deleteSessionNote(editing.id, editing.revision); this.noteEditing = null; });
  }
  _action_editEvent(_event, target) {
    const item = authority.listCalendarEvents().find(e => e.id === target.dataset.eventId); if (!item) return;
    this.editing = eventEditorDraft(item, !game.user?.isGM);
    const occurrence = Number(target.dataset.occurrenceStart);
    if (Number.isSafeInteger(occurrence)) { this.editing.displayStart = occurrence; this.editing.displayEnd = item.end == null ? null : occurrence + item.end - item.start - (item.kind === 'all-day' ? DAY : 0); }
    this.activeTab = 'agenda';
    return this.render();
  }
  _action_cancelEdit() { this.editing = null; return this.render(); }
  _readDate(root, prefix) {
    const value = name => root.querySelector(`[name="${prefix}${name}"]`)?.value;
    const time = value('Time') || '00:00', [hour, minute] = time.split(':').map(Number);
    return dateToSeconds({ year: value('Year'), month: value('Month'), day: value('Day'), hour, minute });
  }
  _readDraft(root = this.element) {
    if (!game.user?.isGM || !this.editing || this.editing.readOnly) throw new Error('Only the DM can edit calendar events.');
    const value = name => root.querySelector(`[name="${name}"]`)?.value ?? this.editing[name];
    const kind = value('kind'), rawStart = this._readDate(root, 'start'), start = kind === 'all-day' ? Math.floor(rawStart / DAY) * DAY : rawStart;
    const enabled = root.querySelector('[name="endEnabled"]')?.checked;
    let end = enabled ? this._readDate(root, 'end') : null;
    if (kind === 'all-day') end = enabled ? Math.floor(end / DAY) * DAY + DAY : start + DAY;
    const earlier = String(value('earlierMinutes') || '').trim();
    const offsets = earlier ? earlier.split(',').map(text => { if (!text.trim()) throw new Error('Enter reminder minutes separated by commas.'); return Number(text.trim()) * 60; }) : [];
    const unit = value('repeatUnit');
    return { title: value('title'), description: value('description'), category: value('category'), visibility: value('visibility'), kind, start, end, reminderOffsets: offsets, recurrence: unit && unit !== 'none' ? { unit, interval: Number(value('repeatInterval')) } : null };
  }
  _action_saveEvent() { const input = this._readDraft(); const editing = this.editing; return this._run(async () => { if (editing.id) await authority.updateCalendarEvent(editing.id, input, editing.revision); else await authority.createCalendarEvent(input); this.editing = null; }); }
  _action_deleteEvent() { const editing = this.editing; if (!game.user?.isGM || !editing?.id || editing.readOnly) return; return this._run(async () => { await authority.deleteCalendarEvent(editing.id, editing.revision); this.editing = null; }); }
  _action_resetReminders() { if (!game.user?.isGM || !this.editing?.id || this.editing.readOnly) return; return this._run(async () => { await authority.resetCalendarEventReminders(this.editing.id); this.editing.revision = authority.listCalendarEvents().find(e => e.id === this.editing.id)?.revision; }); }
  _action_resume() { return this._run(() => authority.resumePendingAdvance()); }
  _action_cancelPending() { return this._run(() => authority.cancelPendingAdvance()); }
  async _action_awardRest() {
    if (!game.user?.isGM || authority.isCalendarAuthority?.() === false) return;
    const hours = await foundry.applications.api.DialogV2.prompt({
      window: { title: 'Award Rest' },
      content: '<p>Advance time for uninterrupted rest. Natural healing and spell recovery are applied only when the rest finishes. Calendar reminders can pause it.</p><label for="osp-calendar-rest-hours">Hours of rest</label><input id="osp-calendar-rest-hours" name="hours" type="number" min="0.01" step="0.01" value="8" required>',
      ok: { label: 'Start Rest', callback: (_event, button) => Number(button.form.elements.hours.value) }, rejectClose: false
    });
    if (hours == null) return;
    return this._run(async () => { const result = await authority.startAwardRest(hours);
    if (result?.stopped) { ui.notifications?.info?.('Award Rest paused at a calendar reminder. Resume or cancel it from Calendar.'); } });
  }
  _action_advance(_event, target) {
    const root = this.element, amount = target.dataset.amount;
    const seconds = amount != null ? Number(amount) : Number(root.querySelector('[name="duration"]').value) * ({ minutes: 60, hours: 3600, days: DAY }[root.querySelector('[name="durationUnit"]').value]);
    return this._run(() => authority.advanceCalendarTime(Math.round(seconds)));
  }
  _action_advanceTo() { const target = this._readDate(this.element, 'advance'); return this._run(() => authority.advanceCalendarTo(target)); }
  _action_correctDate() { const target = this._readDate(this.element, 'correction'), reason = this.element.querySelector('[name="correctionReason"]').value; return this._run(() => authority.correctCalendarDate(target, reason)); }
}
export class CalendarClockApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = { id: 'osp-calendar-clock', classes: ['osp', 'osp-calendar-clock-window'], window: { title: 'Campaign Clock', resizable: false }, position: { width: 340, height: 380 } };
  static PARTS = { main: { template: 'systems/osp-houserules/templates/apps/calendar-clock.html' } };
  constructor(options = {}) { super(options); this._calendarClockHooks = []; }
  async _prepareContext() { return { clock: calendarClockContext() }; }
  _onRender(context, options) {
    super._onRender?.(context, options);
    if (!this._calendarClockHooks.length) for (const event of ['ospCalendarTimeChanged', 'updateWorldTime']) this._calendarClockHooks.push([event, Hooks.on(event, () => void this.render())]);
  }
  async close(options) { for (const [event, id] of this._calendarClockHooks) Hooks.off(event, id); this._calendarClockHooks = []; return super.close(options); }
}
export function openCalendarClock() { const app = ui.calendarClock || (ui.calendarClock = new CalendarClockApp()); app.render({ force: true }); return app; }
export function openCalendar() { const app = ui.calendar || (ui.calendar = new CalendarApp()); app.render({ force: true }); return app; }
