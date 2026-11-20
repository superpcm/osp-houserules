import { calculatePersonalEncumbrance, raceMovement } from '../inventory/encumbrance.js';

/** Descriptions use the same load and movement rules as actor preparation. */
export function movementTooltips(options = {}) {
  const load = calculatePersonalEncumbrance(options);
  const base = raceMovement(options.race);
  const pounds = value => String(Number(Math.max(0, value).toFixed(2)));
  const labels = { unencumbered: 'Unencumbered', light: 'Mildly encumbered', heavy: 'Heavily encumbered', overloaded: 'Overloaded' };
  const burden = labels[load.level];
  const effect = load.level === 'overloaded' ? 'Above carrying capacity: unable to move.' : `${burden}: ${base - load.tactical} ft reduction to encounter movement.`;
  const basis = `Base encounter movement: ${base} ft. ${effect}`;
  let threshold;
  if (load.level === 'overloaded') {
    threshold = `Shed at least ${pounds(load.totalWeight - load.maxWeight)} lb to return to carrying capacity (${pounds(load.maxWeight)} lb).`;
  } else {
    const next = load.level === 'unencumbered' ? load.third : load.level === 'light' ? load.twoThirds : load.maxWeight;
    const nextLabel = load.level === 'unencumbered' ? 'mildly encumbered' : load.level === 'light' ? 'heavily encumbered' : 'overloaded and unable to move';
    threshold = `${pounds(next - load.totalWeight)} lb remaining before exceeding ${pounds(next)} lb. Above that weight: ${nextLabel}.`;
  }
  return {
    encounter: `Encounter: ${load.tactical} ft per encounter round. ${basis}`,
    run: `Run: ${load.dash} ft per encounter round (2 × adjusted encounter movement of ${load.tactical} ft). ${basis}`,
    explore: `Explore: ${load.explore} ft per exploration turn (3 × adjusted encounter movement of ${load.tactical} ft). ${basis}`,
    encumbrance: `${burden}. Carried: ${pounds(load.totalWeight)} / ${pounds(load.maxWeight)} lb maximum (STR × 15). ${effect} Encounter ${load.tactical} ft; run ${load.dash} ft per encounter round; explore ${load.explore} ft per exploration turn. ${threshold} Mounts, vehicles, and their cargo are excluded from personal load.`
  };
}
