import { readItemSpell, itemSpellResource, assertItemSpellEligibility } from './item-spell.js';
import { healthSnapshot, conditionEffects } from '../health/health-rules.js';
import { ospRoll } from '../dice.js';
import { normalizeQuantity } from '../inventory/encumbrance.js';
import { registerProgressionAuthority, requestProgressionMutation, getProgressionRequester, currentProgressionOperation, assertProgressionAuthorityFence, recoverProgressionOperation } from '../progression/progression-authority.js';
import { spellClassKey, spellMode, bonusSpellSlots, wildMagicOutcome, spellFocusPolicy, externalFocusPolicy, focusKindForItem, isEligibleFocusItem } from './spell-rules.js';
import { readSpellState, transitionSpellState, spellStateUpdate } from './spell-state.js';
import { isSpellbookItem, spellbookVolumeKey } from './spellbook-names.js';

let dataPromise;
const clone = value => structuredClone(value);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function data() {
  dataPromise ??= Promise.all(['class_profiles', 'spells', 'ose_house_rules_v1_5'].map(async name => {
    const response = await fetch(`systems/osp-houserules/data/${name}.json`);
    if (!response.ok) throw new Error(`Unable to load ${name}.`);
    return response.json();
  })).catch(error => { dataPromise = null; throw error; });
  return dataPromise;
}
export async function spellContext(actor) {
  const [profiles, catalog, house] = await data();
  const profile = profiles.classProfiles.find(p => spellClassKey(p) === spellClassKey(actor.system.class));
  const mode = spellMode(profile);
  const list = catalog.spellLists[profile?.spellcasting?.spellList] ?? [];
  const spells = Object.fromEntries(list.map(spell => [spell.id, spell]));
  const items = Array.from(actor.items ?? []);
  const usable = items.filter(item => normalizeQuantity(item.system.quantity) > 0);
  const persistedBooks = readSpellState(actor).books ?? {};
  const focusPolicy = spellFocusPolicy(profile, actor);
  const bookNames = clone(actor.flags?.['osp-houserules']?.spellbookNames ?? {});
  const bookIds = [];
  for (const item of usable.filter(item => isSpellbookItem(item, persistedBooks))) {
    if (normalizeQuantity(item.system.quantity) > 1000) throw new Error('This Spellbook stack requires GM inventory review.');
    for (let n = 1; n <= normalizeQuantity(item.system.quantity); n++) bookIds.push(spellbookVolumeKey(item.id, n));
  }
  const focusItems = usable.filter(item => !isSpellbookItem(item, persistedBooks) && isEligibleFocusItem(item, focusPolicy));
  const focusIds = focusItems.map(item => item.id);
  return { profile, mode, spells, allLists: catalog.spellLists, slots: bonusSpellSlots(actor.system, profile, house.spells), level: Number(actor.system.level), int: Number(actor.system.attributes?.int?.value), itemIds: usable.map(item => item.id), focusIds, focusItems, bookIds, bookNames, items, focusPolicy, gm: Boolean(getProgressionRequester()?.isGM) };
}
export async function spellView(actor) {
  const context = await spellContext(actor);
  const state = readSpellState(actor);
  for (const [key, book] of Object.entries(state.books)) book.available = context.bookIds.includes(key);
  for (const spell of Object.values(context.spells)) if (spell.alwaysKnown && ['magicuser', 'illusionist'].includes(spellClassKey(context.profile))) state.known[spell.id] = true;
  return { context, state, pending: actor.getFlag('osp-houserules', 'spellcastingPending') };
}
function denied(reason) { return { success: false, reason }; }
async function persistPending(actor, pending) {
  assertProgressionAuthorityFence();
  try { await actor.update({ 'flags.osp-houserules.spellcastingPending': pending }); }
  catch (error) {
    if (JSON.stringify(actor.getFlag('osp-houserules', 'spellcastingPending')) !== JSON.stringify(pending)) throw error;
  }
}
function sourceSpell(context, actor, command) {
  if (command.action === 'itemCast') {
    const source = actor.items.get(command.sourceId);
    if (!source || !context.itemIds.includes(source.id)) throw new Error('Choose an available owned spell item.');
    if (['spell', 'ability'].includes(source.type)) throw new Error('Use a physical inventory item as the spell source.');
    const config = readItemSpell(source);
    if (!config || config.spellId !== command.spellId || config.listKey !== command.listKey || config.reverse !== command.reverse || config.kind !== command.sourceKind) throw new Error('The item spell link changed; reopen its card.');
    assertItemSpellEligibility(context, config);
    itemSpellResource(source, config);
    const spell = context.allLists[config.listKey]?.find(entry => entry.id === config.spellId);
    if (!spell || config.reverse && !spell.reversed) throw new Error('This item has an invalid linked spell or form.');
    return spell;
  }
  if (command.action !== 'external') {
    const spell = context.spells[command.spellId];
    if (!spell) throw new Error('Spell is not on this class list.');
    return spell;
  }
  const source = actor.items.get(command.sourceId);
  if (!source || !context.itemIds.includes(source.id)) throw new Error('Choose an available owned spell source.');
  if (!['scroll', 'wand', 'staff', 'item', 'innate'].includes(command.sourceKind) || command.sourceConfirmed !== true) throw new Error('Confirm an actual spell source and its available uses.');
  if (command.sourceKind === 'innate' && !['spell', 'ability'].includes(source.type)) throw new Error('An innate source must be an owned spell or ability.');
  if (command.sourceKind === 'innate' && command.sourceRacial !== true) throw new Error('Confirm that this innate spell is a racial ability. Other special cases require a ruling at the table.');
  if (command.sourceKind !== 'innate' && ['spell', 'ability'].includes(source.type)) throw new Error('A spell or ability record cannot be used as a physical spell source.');
  const spell = context.allLists[command.listKey]?.find(s => s.id === command.spellId);
  if (!spell) throw new Error('Choose the actual spell produced by the source.');
  return spell;
}
function currentIdentity(actor) { return JSON.stringify({ class: actor.system.class, race: actor.system.race ?? actor.system.attributes?.race ?? actor.race ?? null, level: actor.system.level }); }
function validateCastingFocus(context, state, actor, command) {
  if (command.gmOverride !== undefined) throw new Error('GM focus overrides are not part of the spellcasting rules.');
  const external = ['external', 'itemCast'].includes(command.action);
  const policy = external ? externalFocusPolicy(command) : context.focusPolicy;
  if (policy.exempt) return;
  const choices = policy.choices;
  if (choices && !choices.includes(state.focus?.kind)) throw new Error('Choose Wand or Staff on the Spells page before casting.');
  if (choices && command.focusKind !== undefined && command.focusKind !== state.focus?.kind) throw new Error('Choose Wand or Staff on the Spells page before casting.');
  if (command.focusHeldOrDisplayed !== true) throw new Error(`Hold or display ${policy.label} while casting.`);
  if (external && policy.kind === 'source') return;
  const selectedKind = choices ? state.focus?.kind : null;
  if (choices && state.focus?.classKey && state.focus.classKey !== policy.classKey) throw new Error('The saved focus is for a different class.');
  const item = context.items.find(candidate => candidate.id === state.focus?.itemId);
  if (!choices) {
    if (!item || !context.focusIds.includes(item.id) || state.focus.classKey !== context.focusPolicy.classKey) throw new Error(`Designate an available inventory item as ${policy.label} for this class.`);
    if (item.system?.equipped !== true) throw new Error(`Equip ${item.name} before casting.`);
    return;
  }
  const quantity = item ? normalizeQuantity(item.system?.quantity) : 0;
  const typeMatches = selectedKind ? focusKindForItem(item) === selectedKind : isEligibleFocusItem(item, policy);
  if (!item || quantity <= 0 || !context.focusIds.includes(item.id) || !typeMatches || state.focus.classKey !== context.focusPolicy.classKey) throw new Error(`Designate an available ${selectedKind ?? 'physical'} focus for this class.`);
  if (item.system?.equipped !== true) throw new Error(`Equip ${item.name} before casting.`);
}
async function publish(actor, plan) {
  if (!plan.cast) return;
  const exists = Array.from(game.messages ?? []).some(message => message.getFlag?.('osp-houserules', 'spellOperation') === plan.operationId);
  if (exists) return;
  const { spell, command, roll } = plan.cast;
  const name = command.reverse ? spell.reversed?.name ?? spell.name : spell.name;
  const description = command.reverse ? spell.reversed?.description ?? spell.description : spell.description;
  const outcome = wildMagicOutcome(roll);
  const sourceLabel = plan.cast.source ? `<p>Source: ${esc(plan.cast.source.kind)} — ${esc(plan.cast.source.name)}.</p>` : '';
  const manual = command.action === 'itemCast' ? `<p>${plan.itemResource.path.startsWith('system.quantity') ? 'One scroll consumed.' : 'One charge consumed.'} Resolve spell attacks, saves and target effects separately.</p>` : command.action === 'external' ? '<p>External source: confirm and deduct charges/uses manually. Resolve target effects and eligibility with the GM.</p>' : '<p>One prepared copy and daily slot consumed. Resolve spell attacks, saves and target effects separately.</p>';
  const wild = outcome === 'Normal' ? 'No Boon or Bane.' : `${outcome}: GM adjudication required.${outcome === 'Bane' ? ' The spell does not automatically fail.' : ''}`;
  const content = `<h3>${esc(name)}</h3><p>Wild magic: unmodified d20 = <b>${roll}</b>. ${esc(wild)}</p>${sourceLabel}${manual}<p>${esc(description)}</p>`;
  assertProgressionAuthorityFence();
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content, flags: { 'osp-houserules': { spellOperation: plan.operationId } } });
}
async function applyItemSpellResource(actor, plan) {
  const resource = plan.itemResource;
  if (!resource) return;
  const item = actor.items.get(resource.itemId);
  if (!item) throw new Error('The spell item moved or was removed; GM recovery is required.');
  const receipt = item.flags?.['osp-houserules']?.spellUse;
  if (receipt?.operationId === plan.operationId) return;
  const current = itemSpellResource(item);
  if (JSON.stringify(current) !== JSON.stringify(resource)) throw new Error('The spell item changed before consumption; GM recovery is required.');
  assertProgressionAuthorityFence();
  const update = { _id: item.id, [resource.path]: resource.after, 'flags.osp-houserules.spellUse': { operationId: plan.operationId } };
  try { await actor.updateEmbeddedDocuments('Item', [update]); }
  catch (error) {
    if (actor.items.get(item.id)?.flags?.['osp-houserules']?.spellUse?.operationId !== plan.operationId) throw error;
  }
}
async function applyPlan(actor, plan) {
  assertProgressionAuthorityFence();
  const actual = readSpellState(actor);
  const marker = actual.operations?.[plan.operationId];
  if (!marker) {
    if (JSON.stringify(actual) !== JSON.stringify(plan.before)) throw new Error('Spell state changed during this operation; GM review is required.');
    if (plan.cast) {
      if (plan.castingIdentity && currentIdentity(actor) !== plan.castingIdentity) throw new Error('The caster changed before resources were committed; GM review is required.');
      if (conditionEffects(healthSnapshot(actor)).cannotAct) throw new Error('Dead, unconscious or Incapacitated characters cannot cast spells.');
      const live = await spellView(actor);
      sourceSpell(live.context, actor, plan.cast.command);
      validateCastingFocus(live.context, live.state, actor, plan.cast.command);
    }
    const update = { ...spellStateUpdate(plan.after), 'flags.osp-houserules.spellcastingPending': plan };
    try { await actor.update(update); }
    catch (error) { if (!readSpellState(actor).operations?.[plan.operationId]) throw error; }
  }
  await applyItemSpellResource(actor, plan);
  await publish(actor, plan);
  await persistPending(actor, null);
  return plan.result;
}
async function mutate(details) {
  const actor = await fromUuid(details.actorUuid);
  const requester = getProgressionRequester();
  if (!actor || !requester || !actor.testUserPermission(requester, 'OWNER')) return denied('Actor ownership is required.');
  const operationId = currentProgressionOperation();
  let command = details.command;
  if (command?.action === 'itemCast') {
    const config = readItemSpell(actor.items.get(command.sourceId));
    if (!config) return denied('This item has no linked spell.');
    command = { action: 'itemCast', sourceId: command.sourceId, confirmed: command.confirmed, focusHeldOrDisplayed: command.focusHeldOrDisplayed, spellId: config.spellId, listKey: config.listKey, reverse: config.reverse, sourceKind: config.kind };
  }
  if (!command || typeof command !== 'object') return denied('Invalid spell operation.');
  const pending = actor.getFlag('osp-houserules', 'spellcastingPending');
  if (pending) {
    if (command.action === 'resolveRoll') {
      if (!requester.isGM || pending.stage !== 'rolling') return denied('Only a GM can resolve an interrupted roll.');
      const maximum = pending.command.action === 'copy' ? 100 : 20;
      if (!Number.isInteger(command.roll) || command.roll < 1 || command.roll > maximum) return denied('Record the actual die result in range.');
      await persistPending(actor, { ...pending, stage: 'rolled', roll: command.roll });
      return { success: true, targetId: pending.operationId };
    }
    if (pending.operationId !== operationId) return denied('A spell operation needs GM recovery before another change.');
    if (pending.stage === 'rolling') return { success: false, recoveryRequired: true, reason: 'The roll was interrupted. The GM must record the actual result before recovery.' };
    if (pending.stage === 'planned') return applyPlan(actor, pending);
  }
  const { context, state } = await spellView(actor);
  context.gm = Boolean(requester.isGM);
  const initialBefore = pending?.before ?? readSpellState(actor);
  const castingIdentity = pending?.castingIdentity ?? currentIdentity(actor);
  let roll = pending?.roll;
  let spell;
  const casts = ['cast', 'external', 'itemCast'].includes(command.action);
  let itemResource = pending?.itemResource;
  try {
    if (command.action === 'focus') {
      if (context.focusPolicy.choices) {
        if (command.focusClass !== context.focusPolicy.classKey) throw new Error('Choose the exact class focus; physical inventory object selection is required.');
        {
          const item = context.items.find(candidate => candidate.id === command.itemId);
          const quantity = item ? normalizeQuantity(item.system?.quantity) : 0;
          const inferredKind = focusKindForItem(item);
          const typeMatches = inferredKind && context.focusPolicy.choices.includes(inferredKind);
          if (!item || quantity <= 0 || !context.focusIds.includes(command.itemId) || !typeMatches) throw new Error('Choose an owned available Wand or Staff item; its metadata does not establish an eligible kind.');
        }
      } else {
        if (!context.focusIds.includes(command.itemId)) throw new Error('Choose a physical inventory object as focus.');
        if (context.focusPolicy.exempt || context.focusPolicy.perCast) throw new Error('This class uses an innate or per-spell focus and does not designate a generic focus.');
        const item = context.items.find(candidate => candidate.id === command.itemId);
        if (!item || !isEligibleFocusItem(item, context.focusPolicy) || normalizeQuantity(item.system?.quantity) <= 0) throw new Error('Choose an eligible available inventory item as focus.');
        if (command.focusClass !== context.focusPolicy.classKey) throw new Error('Confirm the exact focus requirement for the current class.');
      }
    }
    if (casts) {
      if (conditionEffects(healthSnapshot(actor)).cannotAct) throw new Error('Dead, unconscious or Incapacitated characters cannot cast spells.');
      spell = sourceSpell(context, actor, command);
      if (command.action === 'itemCast') itemResource ??= itemSpellResource(actor.items.get(command.sourceId));
      if (command.reverse && !spell.reversed) throw new Error('This spell has no reversed form.');
      if (command.confirmed !== true) throw new Error('Confirm freedom to speak and move hands, target visibility and casting conditions.');
      validateCastingFocus(context, state, actor, command);
    }
    // Validate resource eligibility before requesting any die. A placeholder successful copy checks pages and retry eligibility.
    transitionSpellState(state, { ...command, ...(command.action === 'copy' ? { percentile: 1 } : {}) }, context);
  } catch (error) { return pending ? { success: false, recoveryRequired: true, reason: error.message } : denied(error.message); }
  if ((casts || command.action === 'copy') && roll === undefined) {
    await persistPending(actor, { stage: 'rolling', operationId, command: clone(command), requesterId: requester.id, before: initialBefore, castingIdentity, ...(itemResource ? { itemResource } : {}) });
    const result = await ospRoll(command.action === 'copy' ? '1d100' : '1d20', { strictIntegers: true, label: command.action === 'copy' ? 'Copy spell into spellbook' : 'Separate wild-magic check' });
    if (result.cancelled) {
      await persistPending(actor, null);
      return { success: false, reason: 'Cancelled; no spell resources consumed.' };
    }
    roll = result.total;
    const max = command.action === 'copy' ? 100 : 20;
    if (!Number.isInteger(roll) || roll < 1 || roll > max) throw new Error('Die result requires GM recovery.');
    await persistPending(actor, { stage: 'rolled', operationId, command: clone(command), roll, requesterId: requester.id, before: initialBefore, castingIdentity, ...(itemResource ? { itemResource } : {}) });
  }
  const before = readSpellState(actor);
  if (JSON.stringify(before) !== JSON.stringify(initialBefore) || currentIdentity(actor) !== castingIdentity) throw new Error('Spell state, class, race, or level changed during the roll; GM review is required.');
  const live = await spellView(actor);
  if (casts) {
    if (conditionEffects(healthSnapshot(actor)).cannotAct) throw new Error('Dead, unconscious or Incapacitated characters cannot cast spells.');
    sourceSpell(live.context, actor, command);
    validateCastingFocus(live.context, live.state, actor, command);
  }
  if (itemResource && JSON.stringify(itemSpellResource(actor.items.get(command.sourceId))) !== JSON.stringify(itemResource)) throw new Error('The spell item changed during the roll; GM recovery is required.');
  const after = transitionSpellState(live.state, { ...command, ...(command.action === 'copy' ? { percentile: roll } : {}) }, live.context);
  const failedCopy = command.action === 'copy' && after.copyFailures[command.spellId] === live.context.level && !after.books[command.bookId].spellIds.includes(command.spellId);
  const result = { success: true, copied: command.action === 'copy' ? !failedCopy : undefined, ...(casts ? { wild: wildMagicOutcome(roll), roll } : {}) };
  after.operations[operationId] = result;
  const plan = { stage: 'planned', operationId, before, after, result, castingIdentity, ...(itemResource ? { itemResource } : {}), ...(casts ? { cast: { spell, command, roll, ...(['external', 'itemCast'].includes(command.action) ? { source: { kind: command.sourceKind, name: actor.items.get(command.sourceId).name } } : {}) } } : {}) };
  await persistPending(actor, plan);
  return applyPlan(actor, plan);
}
export function registerSpellcastingAuthority() { registerProgressionAuthority('spells.mutate', mutate); }
export function changeSpellState(actor, command) { return requestProgressionMutation('spells.mutate', { actorUuid: actor.uuid, command }); }
export async function resolveInterruptedSpell(actor, roll) {
  const result = await changeSpellState(actor, { action: 'resolveRoll', roll });
  return result.success && result.targetId ? recoverProgressionOperation(result.targetId) : result;
}
