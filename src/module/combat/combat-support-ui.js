import { healthSnapshot, conditionEffects } from '../health/health-rules.js';
import { loadWeaponProfiles, findClassProfile } from './weapon-policy.js';
import { combatKey, talentChoices, hasTalent, canUseOffhand, twoWeaponPenalties, situationalModifiers, talentBonuses } from './attack-support.js';
import { registerProgressionAuthority, requestProgressionMutation, getProgressionRequester, assertProgressionAuthorityFence } from '../progression/progression-authority.js';
import { ospDialogOptions } from '../dialog/dialog-theme.js';
const sid = () => game.system.id;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owns = (user, actor) => Boolean(user?.isGM || actor?.testUserPermission?.(user, 'OWNER'));
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
async function writeFlag(actor, key, value) {
  assertProgressionAuthorityFence();
  try { await actor.setFlag(sid(), key, value); } catch (e) { if (!equal(actor.getFlag(sid(), key), value)) throw e; }
  if (!equal(actor.getFlag(sid(), key), value)) throw new Error('Combat support write requires GM recovery.');
}
export function talentSlots(actor) {
  const cls = combatKey(actor.system.class), level = Number(actor.system.level) || 1;
  if (cls === 'fighter') return [1,3,7].filter(n => level >= n).map(n => ({ level:n, choices:talentChoices(n) }));
  if (['knight','paladin'].includes(cls)) return [{level:1,choices:['Weapon Specialization'],mandatory:true}];
  if (['ranger','warden'].includes(cls)) return [{level:1,choices:talentChoices(1)}];
  return [];
}
export function validateTalentSelections(actor, selections, catalog) {
  const slots = talentSlots(actor);
  if (!Array.isArray(selections) || selections.length > slots.length) throw new Error('Invalid talent selections.');
  for (const slot of slots.filter(s => s.mandatory)) if (!selections.some(t => t.level === slot.level && slot.choices.includes(t.name))) throw new Error('This class requires its granted Weapon Specialization.');
  const levels = new Set();
  for (const t of selections) {
    if (!t || !slots.some(s => s.level === t.level && s.choices.includes(t.name)) || levels.has(t.level)) throw new Error('Talent is not available in that level slot.');
    levels.add(t.level);
    if (t.name === 'Weapon Specialization' && !catalog.some(w => w.name === t.weapon)) throw new Error('Choose a catalog weapon for specialization.');
    if (t.name === 'Slayer' && (typeof t.foeType !== 'string' || !t.foeType.trim() || t.foeType.length > 100)) throw new Error('Slayer requires a specific foe type.');
  }
}
export function registerCombatSupportAuthority() {
  registerProgressionAuthority('combat.support', async details => {
    const actor = details.actorUuid ? await fromUuid(details.actorUuid) : game.actors.get(details.actorId), user = getProgressionRequester();
    if (!actor || !owns(user, actor)) return {success:false,reason:'An owned actor is required.'};
    try {
      if (details.kind === 'talents') {
        const selections = details.selections;
        const catalog = await fetch(`systems/${sid()}/data/weapons.json`).then(r => { if (!r.ok) throw new Error('Weapon catalog unavailable.'); return r.json(); });
        validateTalentSelections(actor,selections,catalog);
        await writeFlag(actor,'combatTalents',selections.map(t => ({level:t.level,name:t.name,...(t.weapon ? {weapon:t.weapon} : {}),...(t.foeType ? {foeType:t.foeType.trim()} : {})})));
      } else if (details.kind === 'effect') {
        const combat = game.combats.get(details.combatId);
        if (!combat || combat.round !== details.round || !combat.round || !combat.combatants.some(c => c.actor === actor || c.actor?.uuid === actor.uuid)) throw new Error('A current combatant and round are required.');
        if (!['charge','aim','parry','clear'].includes(details.effect)) throw new Error('Invalid combat effect.');
        if (details.effect !== 'clear' && details.effect !== 'charge') {
          const c = combat.combatants.find(c => c.actor === actor || c.actor?.uuid === actor.uuid);
          const state = combat.attackStateFor(c);
          if (state.spent || Object.values(state.reservations).some(r => r.status === 'reserved')) throw new Error('Declare this action before attacking.');
        }
        const old = actor.getFlag(sid(),'combatEffects') ?? {}, same = old.combatId === combat.id && old.sequence === (combat.getFlag(sid(),'initiativeRoundSequence') ?? 0);
        const value = same ? {...old} : {combatId:combat.id,sequence:combat.getFlag(sid(),'initiativeRoundSequence') ?? 0};
        if (details.effect === 'clear') { await writeFlag(actor,'combatEffects',{}); }
        else {
          value[details.effect] = {from:combat.round + (details.effect === 'aim' ? 1 : 0), through:combat.round + (details.effect === 'aim' ? 1 : 0)};
          await writeFlag(actor,'combatEffects',value);
        }
      } else throw new Error('Unknown combat support operation.');
      return {success:true};
    } catch (e) { return {success:false,recoveryRequired:/recovery|acknowledg/i.test(e.message),reason:e.message}; }
  });
}
export function activeCombatEffect(actor, name, combat = game.combat) {
  const record = actor?.getFlag?.('osp-houserules','combatEffects');
  const effect = record?.[name];
  return Boolean(combat && record?.combatId === combat.id && effect && combat.round >= effect.from && combat.round <= effect.through);
}
async function ask(title, content, collect) {
  return new Promise(resolve => new Dialog(ospDialogOptions({title,content,buttons:{ok:{label:'Confirm',callback:html => resolve(collect(html[0] ?? html))},cancel:{label:'Cancel',callback:() => resolve(null)}},close:() => resolve(null),default:'cancel'})).render(true));
}
export async function declareCombatEffect(actor, combat, selectedCombatant = null) {
  const combatant = selectedCombatant ?? combat.attackCombatantFor(actor);
  const reservations = Object.values(combat.attackStateFor(combatant).reservations).filter(r => r.status === 'reserved');
  const release = game.user.isGM && reservations.length ? `<option value="release">Release an abandoned, unrolled reservation</option>` : '';
  const result = await ask('Combat action', `<p>Confirm the action and its requirements. Charge uses all movement; aim and parry forgo attacks and movement.</p><select name="effect"><option value="charge">Charge: 20 feet straight, unhindered</option><option value="aim">Aim: +2 ranged attack next round</option><option value="parry">Parry/dodge: attackers -2 this round</option><option value="clear">Clear effects</option>${release}</select>${release ? `<select name="reservation">${reservations.map(r => `<option value="${esc(r.operationId)}">${esc(r.operationId)}</option>`).join('')}</select><p>Before releasing, confirm that no attack roll was completed for this reservation.</p>` : ''}`, root => ({effect:root.querySelector('[name="effect"]').value,reservation:root.querySelector('[name="reservation"]')?.value}));
  if (!result) return;
  if (result.effect === 'release') { await combat.settleAttackForActor(actor,result.reservation,false,{combatantId:combatant.id,round:combat.round,sequence:combat.getFlag(sid(),'initiativeRoundSequence') ?? 0}); return; }
  const response = await requestProgressionMutation('combat.support',{kind:'effect',actorId:actor.id,actorUuid:actor.uuid,combatId:combat.id,round:combat.round,effect:result.effect});
  if (!response.success) throw new Error(response.reason);
}
export async function confirmAttackContext(actor, item, ranged, combat = game.combat) {
  if (conditionEffects(healthSnapshot(actor)).cannotAct) throw new Error('Dead, unconscious or Incapacitated characters cannot attack.');
  const granted = talentSlots(actor).find(s => s.mandatory);
  if (granted && !hasTalent(actor,'Weapon Specialization')) {
    ui.notifications.info('Choose and save Weapon Specialization on the Skills page before attacking.');
    return null;
  }
  const target = [...(game.user.targets ?? [])][0]?.actor;
  if (activeCombatEffect(actor,'parry',combat)) throw new Error('Parry/dodge forgoes attacks this round.');
  const effects = actor.getFlag(sid(),'combatEffects');
  if (effects?.combatId === combat?.id && effects?.aim?.from === combat?.round + 1) throw new Error('Aiming forgoes attacks this round.');
  const weapons = Array.from(actor.items ?? []).filter(w => w.type === 'weapon' && w.system?.equipped && w.id !== item?.id);
  const checks = [['reloadReady','Reload requirements satisfied (including movement limits)'],['offhand','Offhand attack (once per round)'],['twoWeapon','Using two weapons this round'],['defender','Target is protected by Defender'],['cleave','Cleave: confirmed killing blow, second foe'],['mounted','Mounted against a foe on foot'],['secondRank','Reach attack through an ally'],['attackerLarger','Attacker is larger than that ally'],['blinded','Attacker is blinded'],['blindedTarget','Target is blinded'],['targetHelpless','Target is helpless'],['opponentInMelee','An opponent is within attacker melee range'],['prone','Attacker prone'],['targetProne','Target prone']];
  const context = await ask('Confirm attack situation', `<p>Confirm applicable conditions. Unchecked conditions add no modifier.</p>${checks.map(([n,label]) => `<label style="display:block"><input type="checkbox" name="${n}">${label}</label>`).join('')}<label>Primary weapon (for offhand)<select name="primaryId"><option value="">Select</option>${weapons.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></label><label>Range band<select name="rangeBand"><option value="normal">Medium / not applicable</option><option value="short">Short (+1)</option><option value="long">Long (-1)</option><option value="out">Beyond maximum</option></select></label><label>Target cover<select name="cover"><option value="0">None</option><option value="1">Quarter</option><option value="2">Half</option><option value="4">Three quarters</option><option value="99">Full</option></select></label><label>Confirmed Slayer foe type<input name="targetType"></label>${game.user.isGM ? '<label><input type="checkbox" name="override">GM grants extra attack / exhaustion override</label>' : ''}`,root => {
    const values = Object.fromEntries(checks.map(([n]) => [n,root.querySelector(`[name="${n}"]`).checked]));
    for (const n of ['primaryId','rangeBand','cover','targetType']) values[n] = root.querySelector(`[name="${n}"]`).value;
    values.override = Boolean(root.querySelector('[name="override"]')?.checked);
    return values;
  });
  if (!context) return null;
  if (ranged && (context.cleave || context.twoWeapon)) throw new Error('Cleave and two-weapon fighting require melee attacks.');
  if (context.cleave && !context.override) ui.notifications.info('Cleave: ask the GM to grant the conditional extra attack if the normal allowance is exhausted.');
  if (context.cleave && !hasTalent(actor,'Cleave')) throw new Error('Cleave requires the Cleave talent.');
  if (context.secondRank && !item?.system?.tags?.includes('reach')) throw new Error('Second-rank attacks require a Reach weapon.');
  const trained = hasTalent(actor,'Two-Weapon Fighting');
  if ((context.offhand || context.twoWeapon) && !trained) {
    const {classes} = await loadWeaponProfiles(), profile = findClassProfile(classes, actor.system.class);
    if (!profile?.primeRequisites?.some(p => ['STR','DEX'].includes(p))) throw new Error('Two-weapon fighting requires STR or DEX as a prime requisite.');
  }
  if (item?.system?.tags?.includes('reload') && !context.reloadReady) throw new Error('Confirm that the weapon is loaded and its reload/movement restrictions were observed.');
  if (context.offhand && (ranged || !canUseOffhand(item, actor.items.get(context.primaryId), trained))) throw new Error('Choose a permitted primary/offhand pair.');
  const penalties = trained ? twoWeaponPenalties(actor.system.level) : {primary:-2,offhand:-4};
  const health = healthSnapshot(actor), targetHealth = target ? healthSnapshot(target) : null;
  context.prone ||= health.conditions.prone;
  context.targetProne ||= Boolean(targetHealth?.conditions.prone);
  context.targetHelpless ||= Boolean(targetHealth && conditionEffects(targetHealth).helpless);
  context.targetIncapacitated = Boolean(targetHealth?.zeroIncapacitated || targetHealth?.conditions.incapacitated);
  const modifiers = situationalModifiers({...context,targetOnFoot:context.mounted,ranged,itemName:item?.name,charging:activeCombatEffect(actor,'charge',combat),aiming:activeCombatEffect(actor,'aim',combat),targetCharging:activeCombatEffect(target,'charge',combat)});
  if (modifiers.blocked) throw new Error(modifiers.reasons.join('; '));
  if (activeCombatEffect(target,'parry',combat)) { modifiers.attack -= 2; modifiers.reasons.push('target parrying'); }
  const talents = talentBonuses(actor,item,context.targetType);
  modifiers.attack += talents.attack + (context.offhand ? penalties.offhand : context.twoWeapon ? penalties.primary : 0);
  modifiers.damage += talents.damage;
  return {...context,...modifiers};
}
