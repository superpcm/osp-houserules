const DAY = 86400;
const WEEK = 5;
const WEEKS_PER_MONTH = 6;

function stableKey(occurrence) { return `${occurrence.id ?? ''}:${occurrence.occurrenceStart}`; }

/** Lay out month-calendar event bars without changing the supplied occurrences. */
export function layoutEventBars(occurrences = [], from, { lanes = 2 } = {}) {
  const laneCount = Math.max(1, Math.floor(Number(lanes) || 1));
  const monthStart = Number(from);
  const overflowByDay = Array(30).fill(0);
  const segments = [];
  const previousLanes = new Map();
  const normalized = occurrences.map((occurrence, index) => {
    const start = Number(occurrence.occurrenceStart);
    const end = Number(occurrence.occurrenceEnd);
    const first = Math.floor((start - monthStart) / DAY);
    const last = Math.floor(((end > start ? end - 1 : start) - monthStart) / DAY);
    return { occurrence, index, first, last, stable: stableKey(occurrence) };
  }).filter(item => item.last >= 0 && item.first < 30);

  for (let week = 0; week < WEEKS_PER_MONTH; week++) {
    const weekStart = week * WEEK, weekEnd = weekStart + WEEK - 1;
    const weekItems = normalized.filter(item => item.last >= weekStart && item.first <= weekEnd).map(item => ({
      ...item,
      start: Math.max(item.first, weekStart),
      end: Math.min(item.last, weekEnd),
      span: Math.min(item.last, weekEnd) - Math.max(item.first, weekStart) + 1
    })).sort((a, b) => a.start - b.start || b.span - a.span || String(a.occurrence.title ?? '').localeCompare(String(b.occurrence.title ?? '')) || a.stable.localeCompare(b.stable) || a.index - b.index);
    const occupied = Array.from({ length: laneCount }, () => Array(WEEK).fill(false));
    const assigned = new Map();
    for (const item of weekItems) {
      const available = lane => { for (let column = item.start - weekStart; column <= item.end - weekStart; column++) if (occupied[lane][column]) return false; return true; };
      const preferred = previousLanes.get(item.stable);
      let lane = preferred != null && preferred < laneCount && available(preferred) ? preferred : -1;
      if (lane < 0) for (let candidate = 0; candidate < laneCount; candidate++) if (available(candidate)) { lane = candidate; break; }
      if (lane < 0) {
        for (let day = item.start; day <= item.end; day++) if (day >= 0 && day < 30) overflowByDay[day]++;
        continue;
      }
      for (let column = item.start - weekStart; column <= item.end - weekStart; column++) occupied[lane][column] = true;
      assigned.set(item.stable, lane);
      const occurrence = item.occurrence;
      segments.push({ ...occurrence, key: `${item.stable}:week-${week}`, week, row: week + 1, startColumn: item.start - weekStart + 1, span: item.span, lane, multiDay: item.last > item.first, startsHere: item.first >= item.start, endsHere: item.last <= item.end, continuesBefore: item.first < item.start, continuesAfter: item.last > item.end });
    }
    for (const [key, lane] of assigned) previousLanes.set(key, lane);
  }
  return { segments, overflowByDay };
}
