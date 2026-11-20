/** The campaign's leap-free, 360-day calendar. All values are integer seconds. */
export const CALENDAR = Object.freeze({ hoursPerDay: 24, daysPerWeek: 5, weeksPerMonth: 6, daysPerMonth: 30, monthsPerYear: 12, daysPerYear: 360,
  weekdays: Object.freeze(['Dawnday', 'Forgeday', 'Wyrmday', 'Crownday', 'Veilday']),
  months: Object.freeze(['Frostveil', 'Emberwane', 'Thawborn', 'Rainweald', 'Thornbloom', 'Suncrest', 'Dragonflame', 'Goldfield', 'Harvestmere', 'Duskhollow', 'Ravenfall', 'Longnight']) });
export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 86400;
export const INITIAL_DATE = Object.freeze({ year: 742, month: 12, day: 4, hour: 8, minute: 0, second: 0 });
export function seasonForDate(value) {
  const month = secondsToDate(typeof value === 'number' ? value : dateToSeconds(value)).month;
  if ([12, 1, 2].includes(month)) return { name: 'Winter', icon: 'fa-snowflake' };
  if ([3, 4, 5].includes(month)) return { name: 'Spring', icon: 'fa-seedling' };
  if ([6, 7, 8].includes(month)) return { name: 'Summer', icon: 'fa-sun' };
  return { name: 'Autumn', icon: 'fa-leaf' };
}
export const EVENT_CATEGORIES = Object.freeze([
  Object.freeze({ value: 'general', label: 'General', icon: 'fa-calendar-day' }),
  Object.freeze({ value: 'market', label: 'Market', icon: 'fa-scale-balanced' }),
  Object.freeze({ value: 'festival', label: 'Festival', icon: 'fa-champagne-glasses' }),
  Object.freeze({ value: 'religious', label: 'Religious', icon: 'fa-place-of-worship' }),
  Object.freeze({ value: 'quest', label: 'Quest', icon: 'fa-compass' }),
  Object.freeze({ value: 'deadline', label: 'Deadline', icon: 'fa-hourglass-end' })
]);
const EVENT_CATEGORY_VALUES = new Set(EVENT_CATEGORIES.map(category => category.value));
export function eventCategory(event = {}) {
  if (EVENT_CATEGORY_VALUES.has(event.category)) return event.category;
  const title = typeof event.title === 'string' ? event.title : '';
  const description = typeof event.description === 'string' ? event.description : '';
  if (/(religious|cleansing|new beginnings)/i.test(`${title} ${description}`)) return 'religious';
  if (/market/i.test(title)) return 'market';
  if (/festival/i.test(title)) return 'festival';
  return 'general';
}
export function moonPhase(value) {
  const date = secondsToDate(typeof value === 'number' ? value : dateToSeconds(value));
  const age = date.day - 1;
  const index = Math.floor((age / 30) * 8 + 0.5) % 8;
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return { index, name: names[index], age, illumination: Math.round((1 - Math.cos(age / 30 * 2 * Math.PI)) * 50), waxing: age < 15 };
}
export function safeInteger(value, label = 'Value') {
  if (value === '' || value == null || typeof value === 'boolean' || !Number.isSafeInteger(Number(value))) throw new RangeError(`${label} must be a whole number within the supported range.`);
  return Number(value);
}
export function validateDate(date) {
  const d = { year: safeInteger(date?.year, 'Year'), month: safeInteger(date?.month, 'Month'), day: safeInteger(date?.day, 'Day'), hour: safeInteger(date?.hour ?? 0, 'Hour'), minute: safeInteger(date?.minute ?? 0, 'Minute'), second: safeInteger(date?.second ?? 0, 'Second') };
  if (d.year < 1 || d.month < 1 || d.month > 12 || d.day < 1 || d.day > 30 || d.hour < 0 || d.hour > 23 || d.minute < 0 || d.minute > 59 || d.second < 0 || d.second > 59) throw new RangeError('Choose a valid calendar date (years start at 1; each month has 30 days).');
  return d;
}
export function dateToSeconds(date) {
  const d = validateDate(date);
  return safeInteger((((d.year - 1) * 360 + (d.month - 1) * 30 + d.day - 1) * SECONDS_PER_DAY) + d.hour * 3600 + d.minute * 60 + d.second, 'Calendar date');
}
export function secondsToDate(value) {
  const seconds = safeInteger(value, 'Calendar time');
  if (seconds < 0) throw new RangeError('Calendar time cannot precede Year 1.');
  const dayIndex = Math.floor(seconds / SECONDS_PER_DAY), inDay = seconds % SECONDS_PER_DAY;
  const month = Math.floor((dayIndex % 360) / 30) + 1;
  return { year: Math.floor(dayIndex / 360) + 1, month, day: dayIndex % 30 + 1, hour: Math.floor(inDay / 3600), minute: Math.floor(inDay % 3600 / 60), second: inDay % 60, weekday: CALENDAR.weekdays[dayIndex % 5], monthName: CALENDAR.months[month - 1] };
}
export function minuteOfDay(seconds) { return Math.floor(((safeInteger(seconds) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY / 60); }
export function formatDate(value, { includeTime = true } = {}) {
  const d = secondsToDate(typeof value === 'number' ? value : dateToSeconds(value));
  const suffix = d.day >= 11 && d.day <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[d.day % 10] || 'th');
  const text = `${d.weekday}, ${d.monthName} the ${d.day}${suffix}, ${d.year}`;
  return includeTime ? `${text} · ${d.hour % 12 || 12}:${String(d.minute).padStart(2, '0')} ${d.hour >= 12 ? 'PM' : 'AM'}` : text;
}
export function addSeconds(date, delta) { return secondsToDate(safeInteger((typeof date === 'number' ? date : dateToSeconds(date)) + safeInteger(delta))); }
export function dateKey(value) { const d = secondsToDate(value); return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`; }
export const recurrencePeriod = event => event.recurrence ? safeInteger(({ days: 1, weeks: 5, months: 30, years: 360 }[event.recurrence.unit] || 0) * event.recurrence.interval * SECONDS_PER_DAY, 'Recurrence interval') : 0;
export function normalizeEvent(input) {
  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (!title || title.length > 160) throw new Error('Give the event a title of 1–160 characters.');
  if (input.description != null && (typeof input.description !== 'string' || input.description.length > 10000)) throw new Error('Event descriptions support up to 10,000 characters.');
  let start = safeInteger(input.start, 'Event start'); secondsToDate(start);
  const kind = input.kind === 'all-day' ? 'all-day' : 'timed';
  let end = input.end == null || input.end === '' ? null : safeInteger(input.end, 'Event end');
  if (kind === 'all-day') {
    start = Math.floor(start / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    end = end == null ? start + SECONDS_PER_DAY : Math.ceil(end / SECONDS_PER_DAY) * SECONDS_PER_DAY;
  }
  if (end != null && (end <= start || !Number.isSafeInteger(end))) throw new Error('The event must end after it starts.');
  let recurrence = null;
  if (input.recurrence?.unit) {
    const { unit } = input.recurrence, interval = safeInteger(input.recurrence.interval, 'Repeat interval');
    if (!['days', 'weeks', 'months', 'years'].includes(unit) || interval < 1 || interval > 10000) throw new Error('Choose a repeat interval from 1 to 10,000 days, weeks, months, or years.');
    recurrence = { unit, interval };
  }
  if (input.reminderOffsets != null && (!Array.isArray(input.reminderOffsets) || input.reminderOffsets.length > 16)) throw new Error('Use up to 16 earlier reminders.');
  if (input.category != null && !EVENT_CATEGORY_VALUES.has(input.category)) throw new Error(`Unknown event category: ${input.category}.`);
  const reminderOffsets = [...new Set([0, ...(input.reminderOffsets || []).map(n => safeInteger(n, 'Reminder offset'))])].sort((a, b) => a - b);
  if (reminderOffsets.some(n => n < 0)) throw new Error('Earlier reminders must use a nonnegative duration.');
  const event = { title, description: input.description || '', visibility: input.visibility === 'public' ? 'public' : 'private', kind, start, end, recurrence, reminderOffsets, category: eventCategory(input) };
  if (recurrence && recurrencePeriod(event) <= 0) throw new Error('The repeat interval is too large.');
  return event;
}
export function occurrenceAt(event, index) {
  const period = recurrencePeriod(event), start = safeInteger(event.start + index * period, 'Event occurrence');
  return { ...event, occurrenceStart: start, occurrenceEnd: event.end == null ? start : safeInteger(start + event.end - event.start), occurrenceIndex: index };
}
/** Jump directly to the relevant recurrence instead of walking from the first date. */
export function occurrencesInRange(event, from, to, limit = 200) {
  if (to < from) return [];
  const period = recurrencePeriod(event), duration = Math.max(0, (event.end ?? event.start) - event.start);
  let index = period ? Math.max(0, Math.floor((from - duration - event.start) / period)) : 0;
  const result = [];
  while (result.length < limit) {
    const occurrence = occurrenceAt(event, index);
    if (occurrence.occurrenceStart > to) break;
    if (occurrence.occurrenceEnd > from || occurrence.occurrenceStart >= from) result.push(occurrence);
    if (!period) break;
    index++;
  }
  return result;
}
export const reminderKey = (occurrenceStart, offset) => `${occurrenceStart}_${offset}`;
/** Find every reminder at the earliest unacknowledged instant, including now. */
export function earliestReminders(events, from, target) {
  let due = Infinity, reminders = [];
  for (const event of events) {
    const period = recurrencePeriod(event), morning = event.kind === 'all-day' ? 8 * 3600 : 0;
    for (const offset of [...new Set([0, ...(event.reminderOffsets || [])])]) {
      const firstDue = event.start + morning - offset;
      let index = period ? Math.max(0, Math.ceil((from - firstDue) / period)) : 0;
      // Only acknowledged occurrences can force another iteration; their count is bounded by saved acknowledgements.
      for (;;) {
        const occurrenceStart = safeInteger(event.start + index * period), at = occurrenceStart + morning - offset;
        if (at > target || at > due || at < from || at < 0) break;
        const key = reminderKey(occurrenceStart, offset);
        if (!event.acknowledged?.[key]) {
          const reminder = { eventId: event.id, occurrenceStart, offset, due: at, title: event.title, visibility: event.visibility, key };
          if (at < due) { due = at; reminders = [reminder]; } else reminders.push(reminder);
          break;
        }
        if (!period) break;
        index++;
      }
    }
  }
  return reminders;
}
