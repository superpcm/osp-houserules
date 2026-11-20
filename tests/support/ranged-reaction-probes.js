import { expect, vi } from 'vitest';
import { checkAmmoAvailability } from '../../src/module/combat/ammo-logic.js';

const SID = 'osp-houserules';
const copy = value => structuredClone(value);

/** Real weapon/context/support authorities with only dialog choices supplied. */
export async function rangedReactionProbes({ party, enemy, combat, ItemHandler, health, healthSnapshot, forcedDice, rolls, trace, warnings, gm, support, dice }) {
  const checks = [], choices = [];
  vi.stubGlobal('Dialog', class {
    constructor(options) { this.options = options; }
    render() {
      const answer = choices.shift();
      expect(answer, `Unexpected dialog: ${this.options.title}`).toBeTruthy();
      expect(this.options.title).toBe(answer.title);
      if (answer.cancel) this.options.buttons.cancel.callback();
      else this.options.buttons.ok.callback([{ querySelector(selector) {
        const name = selector.match(/name=["']([^"']+)["']/)?.[1];
        const value = answer.values[name] ?? (name === 'rangeBand' ? 'normal' : name === 'cover' ? '0' : '');
        return { value: String(value), checked: value === true };
      } }]);
      return this;
    }
  });
  const myr = party.find(actor => actor.name === 'Myr Ragmussen');
  const sling = myr.items.get('9OyrBZddiPG0g4dw'), stones = myr.items.get('63c4zCkhvUfdKcnm');
  const hammer = myr.items.get('5IfEEqBCBUerSkFP');
  expect(sling).toMatchObject({ name: 'Sling', system: { equipped: false, damage: '1d4', ammoTag: 'stones', range: { short: 30, medium: 60, long: 90 } } });
  expect(stones).toMatchObject({ name: 'Sling Stone', type: 'ammunition', system: { quantity: 20, tags: ['stones'] } });
  expect(checkAmmoAvailability(sling, myr.items).ammoItem.id).toBe(stones.id);
  const setup = { actorId: myr.id, weaponId: sling.id, ammoId: stones.id, originalEquipped: sling.system.equipped, originalAmmo: stones.system.quantity, range: copy(sling.system.range), changes: ['Equip copied Sling; unequip copied Warhammer; no ammo added'] };
  sling.system.equipped = true; hammer.system.equipped = false;
  await combat.setDeclaration(combat.attackCombatantFor(myr).id, { kind: 'weapon', weaponIds: [sling.id] });
  const turn = async actor => {
    await combat.nextRound(); let count = 0;
    while (combat.combatant?.actor !== actor) { expect(++count).toBeLessThanOrEqual(party.length + 1); await combat.nextTurn(); }
  };
  const attackChoice = (values = {}, cancel = false) => choices.push({ title: 'Confirm attack situation', values, cancel });
  const effect = async (actor, name) => {
    choices.push({ title: 'Combat action', values: { effect: name } });
    await support.declareCombatEffect(actor, combat);
    expect(choices).toEqual([]);
    const check = { name: `declare-${name}`, actorId: actor.id, round: combat.round, effects: copy(actor.getFlag(SID, 'combatEffects')) };
    checks.push(check); trace.push(check); return check;
  };
  const shot = async ({ name, actor = myr, target = enemy, weapon = sling, values = {}, forced = [], expected, formula, damage = null, rejected, noAttack = false, cancelDice = false, cancelContext = false, notify }) => {
    const handler = new ItemHandler(null, actor, null), member = combat.attackCombatantFor(actor);
    gm.targets = new Set([{ actor: target, name: target.name }]);
    const messageIndex = game.messages.length, rollIndex = rolls.length, callCount = dice.roll.mock.calls.length, beforeHP = healthSnapshot(target).hp;
    const beforeAmmo = myr.items.get(stones.id)?.system.quantity ?? 0, beforeState = copy(combat.attackStateFor(member)), warningIndex = warnings.length;
    if (!noAttack) attackChoice(values, cancelContext);
    forcedDice.push(...forced.map(([faces, value]) => ({ faces, value })));
    if (cancelDice) dice.roll.mockResolvedValueOnce({ cancelled: true });
    const action = () => weapon ? handler.rollWeapon(weapon) : handler.onUnarmedRoll({ preventDefault() {} });
    if (rejected) await expect(action()).rejects.toThrow(rejected); else await action();
    expect(choices).toEqual([]); expect(forcedDice).toEqual([]);
    const cards = game.messages.slice(messageIndex), attack = cards.find(card => card.flags?.[SID]?.attackResult), dmg = cards.find(card => card.flags?.[SID]?.combatDamage);
    const afterState = combat.attackStateFor(member), afterAmmo = myr.items.get(stones.id)?.system.quantity ?? 0;
    if (expected) {
      expect(attack?.flags[SID].attackResult).toBe(expected); expect(rolls[rollIndex].formula).toBe(formula);
      expect(afterState.spent).toBe(beforeState.spent + 1);
      expect(Object.values(afterState.reservations).some(reservation => reservation.status === 'reserved')).toBe(false);
      if (weapon === sling) expect(afterAmmo).toBe(beforeAmmo - 1);
      if (damage !== null) {
        expect(dmg?.flags[SID].combatDamageTotal).toBe(damage);
        expect((await health.changeHealth(target, { action: 'damage', amount: damage }, `ranged-damage-${checks.length}`)).success).toBe(true);
        expect(healthSnapshot(target).hp).toBe(beforeHP - damage);
      } else { expect(dmg).toBeUndefined(); expect(healthSnapshot(target).hp).toBe(beforeHP); }
    } else {
      expect(attack).toBeUndefined(); expect(dmg).toBeUndefined(); expect(afterAmmo).toBe(beforeAmmo); expect(afterState.spent).toBe(beforeState.spent);
      expect(dice.roll.mock.calls.length - callCount).toBe(cancelDice ? 1 : 0);
      if (cancelDice) expect(Object.values(afterState.reservations).some(reservation => reservation.status === 'cancelled')).toBe(true);
    }
    if (notify) expect(warnings.slice(warningIndex).join('; ')).toMatch(notify);
    else expect(warnings.slice(warningIndex)).toEqual([]);
    const notifications = warnings.splice(warningIndex);
    const check = { name, round: combat.round, actorId: actor.id, target: target.id, weaponId: weapon?.id ?? null, values, outcome: expected ?? (cancelDice || cancelContext ? 'cancelled' : 'blocked'), rolls: copy(rolls.slice(rollIndex)), beforeAmmo, afterAmmo, beforeHP, afterHP: healthSnapshot(target).hp, spent: afterState.spent, notifications };
    checks.push(check); trace.push(check); return check;
  };
  await turn(myr);
  await shot({ name: 'medium-range-hit', forced: [[20, 10], [4, 3]], expected: 'hit', formula: '1d20 + 2', damage: 3 });
  expect(sling.deleted).not.toBe(true); expect(myr.items.get(sling.id)).toBe(sling);
  await turn(myr);
  await shot({ name: 'short-range-plus-one', values: { rangeBand: 'short' }, forced: [[20, 9], [4, 2]], expected: 'hit', formula: '1d20 + 3', damage: 2 });
  await turn(myr);
  await shot({ name: 'long-range-minus-one-miss-still-spends-ammo', values: { rangeBand: 'long' }, forced: [[20, 10]], expected: 'miss', formula: '1d20 + 1' });
  await turn(myr);
  await shot({ name: 'half-cover-minus-two', values: { cover: '2' }, forced: [[20, 12], [4, 2]], expected: 'hit', formula: '1d20 + 0', damage: 2 });
  await turn(myr);
  await shot({ name: 'GM-confirmed-Defender-minus-two', values: { defender: true }, forced: [[20, 11]], expected: 'miss', formula: '1d20 + 0' });
  // All prohibited contexts fail before rolling, spending an attack, or ammo.
  for (const [name, values] of [['beyond-maximum-range', { rangeBand: 'out' }], ['full-cover', { cover: '99' }], ['ranged-in-melee', { opponentInMelee: true }]]) {
    await turn(myr); await shot({ name, values, rejected: /attack prohibited/ });
  }
  await turn(myr); await shot({ name: 'cancel-situation-prompt', cancelContext: true });
  await turn(myr); await shot({ name: 'cancel-roll-releases-reservation', cancelDice: true });

  await turn(myr); const aimRound = combat.round;
  await effect(myr, 'aim'); expect(support.activeCombatEffect(myr, 'aim')).toBe(false);
  expect(myr.getFlag(SID, 'combatEffects').aim).toEqual({ from: aimRound + 1, through: aimRound + 1 });
  await shot({ name: 'aim-forgoes-current-attack', noAttack: true, rejected: /Aiming forgoes attacks/ });
  await turn(myr); expect(combat.round).toBe(aimRound + 1); expect(support.activeCombatEffect(myr, 'aim')).toBe(true);
  await shot({ name: 'aim-next-round-plus-two', forced: [[20, 8], [4, 3]], expected: 'hit', formula: '1d20 + 4', damage: 3 });
  const beforeEffect = copy(myr.getFlag(SID, 'combatEffects'));
  choices.push({ title: 'Combat action', values: { effect: 'aim' } });
  await expect(support.declareCombatEffect(myr, combat)).rejects.toThrow(/before attacking/);
  expect(myr.getFlag(SID, 'combatEffects')).toEqual(beforeEffect); expect(choices).toEqual([]);
  await turn(myr); expect(support.activeCombatEffect(myr, 'aim')).toBe(false);
  await shot({ name: 'aim-expires-after-next-round', forced: [[20, 9]], expected: 'miss', formula: '1d20 + 2' });

  await turn(enemy); const parryRound = combat.round;
  await effect(myr, 'parry'); expect(support.activeCombatEffect(myr, 'parry')).toBe(true);
  await shot({ name: 'parry-forgoes-own-attacks', noAttack: true, rejected: /Parry\/dodge forgoes/ });
  const parried = await shot({ name: 'parry-minus-two-to-attacker', actor: enemy, target: myr, weapon: null, forced: [[20, 18]], expected: 'miss', formula: '1d20 - 2' });
  await turn(enemy); expect(combat.round).toBe(parryRound + 1); expect(support.activeCombatEffect(myr, 'parry')).toBe(false);
  const unParried = await shot({ name: 'parry-expires-next-round', actor: enemy, target: myr, weapon: null, forced: [[20, 18], [2, 1]], expected: 'hit', formula: '1d20 + 0', damage: 1 });
  expect(parried.rolls[0].naturalD20).toBe(unParried.rolls[0].naturalD20);

  // Actual melee weapon used for the supported charge declaration/modifiers.
  await turn(myr); sling.system.equipped = false; hammer.system.equipped = true;
  await combat.setDeclaration(combat.attackCombatantFor(myr).id, { kind: 'weapon', weaponIds: [hammer.id] });
  await effect(myr, 'charge'); expect(support.activeCombatEffect(myr, 'charge')).toBe(true);
  gm.targets = new Set([{ actor: myr, name: myr.name }]); attackChoice();
  const againstCharge = await support.confirmAttackContext(enemy, null, false, combat);
  expect(againstCharge.attack).toBe(1); expect(againstCharge.reasons).toContain('target charging');
  await shot({ name: 'charge-melee-plus-two', weapon: hammer, forced: [[20, 9], [4, 1]], expected: 'hit', formula: '1d20 + 3', damage: 3 });
  expect(support.activeCombatEffect(myr, 'charge', { id: 'another-combat', round: combat.round })).toBe(false);
  await turn(myr); expect(support.activeCombatEffect(myr, 'charge')).toBe(false);
  await effect(myr, 'clear'); expect(myr.getFlag(SID, 'combatEffects')).toEqual({});
  sling.system.equipped = true; hammer.system.equipped = false;
  await combat.setDeclaration(combat.attackCombatantFor(myr).id, { kind: 'weapon', weaponIds: [sling.id] });

  // Exhaust the remaining real twenty-stone stack by misses; no replenishment
  // or quantity override, and final deletion must remove it from the collection.
  const remaining = stones.system.quantity; expect(remaining).toBeGreaterThan(0); expect(remaining).toBeLessThan(20);
  for (let n = 0; n < remaining; n++) {
    await turn(myr);
    await shot({ name: n === remaining - 1 ? 'last-stone-deletes-stack' : 'consume-remaining-stone', forced: [[20, 2]], expected: 'miss', formula: '1d20 + 2' });
  }
  expect(stones.deleted).toBe(true); expect(myr.items.get(stones.id)).toBeUndefined();
  expect(myr.items.get(sling.id)).toBe(sling); expect(sling.system.quantity).toBe(1);
  await turn(myr); await shot({ name: 'empty-ammo-blocked-before-context-and-roll', noAttack: true, notify: /Out of ammunition/ });
  expect(checkAmmoAvailability(sling, myr.items).ok).toBe(false);

  // Fung's actual thrown Oil Flask is consumed as its own ammunition, while
  // his non-proficiency caps its real 2d6 damage at his d4 hit die.
  const fung = party.find(actor => actor.name === 'Fung Telt'), oil = fung.items.find(item => item.name === 'Oil Flask');
  expect(oil).toMatchObject({ system: { equipped: false, quantity: 1, damage: '2d6', missile: true } });
  const thrownSetup = { actorId: fung.id, itemId: oil.id, originalEquipped: false, quantity: 1, copiedOnlyEquip: true };
  oil.system.equipped = true; await combat.setDeclaration(combat.attackCombatantFor(fung).id, { kind: 'weapon', weaponIds: [oil.id] });
  await turn(fung);
  const oilPolicy = await new ItemHandler(null, fung, null)._getWeaponPolicy(oil);
  expect(oilPolicy).toMatchObject({ allowed: true, proficient: false, attackPenalty: -2, damageCapHD: 4 });
  const thrown = await shot({ name: 'actual-thrown-oil-self-consumed-and-capped', actor: fung, weapon: oil, forced: [[20, 15], [6, 6], [6, 6]], expected: 'hit', formula: '1d20 - 3', damage: 4 });
  expect(thrown.rolls.at(-1)).toEqual({ formula: '2d6', total: 12 });
  expect(oil.deleted).toBe(true); expect(fung.items.get(oil.id)).toBeUndefined();
  expect(choices).toEqual([]); expect(forcedDice).toEqual([]); expect(warnings).toEqual([]);
  const expended = checks.filter(check => check.weaponId === sling.id && ['hit', 'miss'].includes(check.outcome));
  expect(expended).toHaveLength(20); expect(expended.every(check => check.afterAmmo === check.beforeAmmo - 1)).toBe(true);
  return { setup, thrownSetup, checks, ammo: { original: 20, completedShots: 20, remaining: 0, deletedStack: true, launcherPreserved: true, cancelledShotsConsumeNothing: true }, reactionScope: { supported: ['aim', 'parry/dodge', 'GM-confirmed Defender', 'charge'], unsupported: ['automatic opportunity attacks', 'interception', 'automatic reaction attacks'], manual: ['range bands and cover are dialog confirmations, not measured geometry', 'charge straight-line/path and aim/parry movement restrictions require GM confirmation', 'persistent fire damage after Oil Flask is not automated by this probe'] } };
}
