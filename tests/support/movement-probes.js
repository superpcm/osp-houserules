import { expect, vi } from 'vitest';

const copy = value => structuredClone(value);
const plainCopy = value => JSON.parse(JSON.stringify(value));

function itemCollection(items) {
  return Object.assign(items, { get(id) { return this.find(item => item.id === id); } });
}

function itemWeight(item) {
  const system = item?.system ?? {};
  const raw = Number(system.unitWeight ?? system.weight ?? 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return system.unitWeight === undefined || system.unitWeight === null || system.unitWeight === '' ? raw / 10 : raw;
}

const GOLDEN_MOVEMENT = new Map([
  ['Blayne "Slim" Isembart', { level: 'unencumbered', tactical: 40, overland: 120, dash: 80 }],
  ['Fung Telt', { level: 'light', tactical: 20, overland: 60, dash: 40 }],
  ['Myr Ragmussen', { level: 'light', tactical: 30, overland: 90, dash: 60 }]
]);

function controlledActor(actor, items) {
  const clone = { id: actor.id, name: actor.name, system: plainCopy(actor.system), items: itemCollection(items.map(plainCopy)) };
  Object.setPrototypeOf(clone, Object.getPrototypeOf(actor));
  return clone;
}

/**
 * Exercises movement/encumbrance and the ruler highlight boundary on copied actors.
 * This intentionally does not simulate token positions, collisions, or movement transactions.
 */
export async function movementProbes({ party, combat }) {
  expect(Array.isArray(party)).toBe(true);
  expect(combat).toBeTruthy();

  const previousCombat = Object.prototype.hasOwnProperty.call(globalThis.game ?? {}, 'combat') ? globalThis.game.combat : undefined;
  const hadCombat = Object.prototype.hasOwnProperty.call(globalThis.game ?? {}, 'combat');
  const previousFoundry = globalThis.foundry;
  const baseStyle = { color: 0x13579b, alpha: 0.25 };
  class TestTokenRuler { _getGridHighlightStyle() { return { ...baseStyle }; } }

  const actors = [];
  try {
    if (globalThis.game) globalThis.game.combat = combat;
    // All actor calculations below run on copies, leaving the encounter party untouched.
    for (const actor of party) {
      const items = [...(actor.items ?? [])].map(plainCopy);
      const probe = controlledActor(actor, items);
      probe._calculateEncumbrance();
      const strength = Number(probe.system?.attributes?.str?.value);
      const race = probe.system?.race ?? '';
      const encumbrance = probe.system?.encumbrance ?? {};
      const weight = {
        total: Number(encumbrance.weight?.value ?? 0),
        maximum: Number(encumbrance.weight?.max ?? 0),
        level: encumbrance.level
      };
      expect(weight.maximum).toBe(strength * 15);
      const golden = GOLDEN_MOVEMENT.get(actor.name);
      expect(golden, `Missing movement golden for ${actor.name}`).toBeTruthy();
      expect(weight.level).toBe(golden.level);
      expect(probe.system.movement).toEqual({ tactical: golden.tactical, overland: golden.overland, dash: golden.dash });

      let overload;
      const weightedItem = items.find(item => item.type === 'weapon' && itemWeight(item) > 0) ?? items.find(item => itemWeight(item) > 0);
      if (weightedItem && Number.isFinite(strength) && strength >= 0) {
        const originalQuantity = Number(weightedItem.system?.quantity?.value ?? weightedItem.system?.quantity ?? 1);
        const unit = 1;
        const maximum = Number(strength) * 15;
        const boundaryItem = plainCopy(weightedItem);
        boundaryItem.system ??= {};
        boundaryItem.system.unitWeight = unit;
        if (boundaryItem.system.quantity && typeof boundaryItem.system.quantity === 'object') boundaryItem.system.quantity.value = maximum;
        else boundaryItem.system.quantity = maximum;
        const atMaximum = controlledActor(actor, [boundaryItem]);
        atMaximum._calculateEncumbrance();
        expect(atMaximum.system.encumbrance.level).toBe('heavy');
        const heavyTactical = ['dwarf', 'gnome', 'hobbit', 'halfling'].includes(String(race).trim().toLowerCase()) ? 10 : 20;
        expect(atMaximum.system.movement.tactical).toBe(heavyTactical);
        const beyondItem = plainCopy(boundaryItem);
        if (beyondItem.system.quantity && typeof beyondItem.system.quantity === 'object') beyondItem.system.quantity.value = maximum + 1;
        else beyondItem.system.quantity = maximum + 1;
        const overloaded = controlledActor(actor, [beyondItem]);
        overloaded._calculateEncumbrance();
        expect(overloaded.system.encumbrance.level).toBe('overloaded');
        expect(overloaded.system.movement.tactical).toBe(0);
        overload = { itemId: weightedItem.id, originalQuantity, overrideUnitWeight: unit, atMaximumQuantity: maximum, atMaximumLevel: atMaximum.system.encumbrance.level, atMaximumTactical: atMaximum.system.movement.tactical, beyondMaximumQuantity: maximum + 1, beyondMaximumLevel: overloaded.system.encumbrance.level, beyondMaximumTactical: overloaded.system.movement.tactical };
      }
      actors.push({
        id: actor.id,
        name: actor.name,
        strength,
        race,
        inventoryWeight: weight,
        movement: copy(probe.system.movement),
        expectedMovement: golden,
        overload
      });
    }

    vi.stubGlobal('foundry', {
      ...(previousFoundry ?? {}),
      canvas: {
        ...(previousFoundry?.canvas ?? {}),
        placeables: {
          ...(previousFoundry?.canvas?.placeables ?? {}),
          tokens: { ...(previousFoundry?.canvas?.placeables?.tokens ?? {}), TokenRuler: TestTokenRuler }
        }
      }
    });
    const ruler = Object.create((await import('../../src/module/actor/token-ruler.js')).TokenRulerOSP.prototype);
    const ownStarted = Object.prototype.hasOwnProperty.call(combat, 'started');
    const previousStarted = combat.started;
    const rulerChecks = [];
    try {
      for (const actor of party) {
        ruler.token = { actor };
        const tacticalLimit = actor.system.movement.tactical, overlandLimit = actor.system.movement.overland;
        combat.started = true;
        const tacticalAtLimit = ruler._getGridHighlightStyle(tacticalLimit, 0, null);
        const tacticalBeyond = ruler._getGridHighlightStyle(tacticalLimit + 1, 0, null);
        combat.started = false;
        const overlandAtLimit = ruler._getGridHighlightStyle(overlandLimit, 0, null);
        const overlandBeyond = ruler._getGridHighlightStyle(overlandLimit + 1, 0, null);
        expect(tacticalAtLimit).toEqual(baseStyle); expect(overlandAtLimit).toEqual(baseStyle);
        expect(tacticalBeyond).toEqual({ color: 0x990000, alpha: 0.4 });
        expect(overlandBeyond).toEqual({ color: 0x990000, alpha: 0.4 });
        rulerChecks.push({ actorId: actor.id, name: actor.name, tactical: { limit: tacticalLimit, atLimit: tacticalAtLimit, beyondLimit: tacticalBeyond }, overland: { limit: overlandLimit, atLimit: overlandAtLimit, beyondLimit: overlandBeyond } });
      }
    } finally {
      if (ownStarted) combat.started = previousStarted; else delete combat.started;
    }

    return {
      actors,
      ruler: rulerChecks,
      limitations: 'Movement speed, encumbrance, and ruler highlight only; token positions, collisions, and movement transactions are not simulated.'
    };
  } finally {
    if (globalThis.game) {
      if (hadCombat) globalThis.game.combat = previousCombat;
      else delete globalThis.game.combat;
    }
    globalThis.foundry = previousFoundry;
  }
}

