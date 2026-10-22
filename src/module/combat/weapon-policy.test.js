vi.mock('./combat-support-ui.js', () => ({ confirmAttackContext: async () => ({...supportContext}) }));
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findClassProfile, isWeaponProficient, evaluateWeaponPolicy, applyWeaponDamageCap, weaponDamageFormula } from './weapon-policy.js';
const { roll, supportContext } = vi.hoisted(() => ({ roll: vi.fn(), supportContext:{attack:0,damage:0,offhand:false,override:false,automatic:false} }));
const { rollCritical, changeHealth } = vi.hoisted(() => ({ rollCritical: vi.fn(), changeHealth: vi.fn() }));
vi.mock('../dice.js', () => ({ ospRoll: roll, buildManualChatContent: result => `raw:${result.total}` }));
vi.mock('../health/critical-authority.js', () => ({ rollCritical }));
vi.mock('../health/health-authority.js', () => ({ changeHealth }));
vi.mock('../cards/item-card-dialog.js', () => ({ ItemCardDialog: class {} }));
import { ItemHandler } from '../actor/sheets/handlers/item-handler.js';
import { rollItemMacro } from '../helpers-macros.js';
import { getChatDamageTotal, getChatDamageAmount, addChatMessageContextOptions, addChatMessageButtons } from '../helpers-chat.js';
const read = file => JSON.parse(readFileSync(new URL(`../../../data/${file}`, import.meta.url), 'utf8'));
const classes = read('class_profiles.json').classProfiles;
const races = read('race_profiles.json').raceProfiles;
const catalog = read('weapons.json');
const weapon = name => ({ ...structuredClone(catalog.find(item => item.name === name)), id:name, delete:vi.fn(), update:vi.fn() });
const profile = name => findClassProfile(classes, name);
const policy = (className, item, race='Human', strength=18) => evaluateWeaponPolicy({ item, classProfile:profile(className),raceProfile:findClassProfile(races,race),strength });
let posted, mode;
function actorFor(className, item, race='Human') {
  const items = [item]; items.get = id => items.find(entry => entry.id === id);
  const actor = { id:'actor',type:'character',system:{class:className,race,level:1,attributes:{str:{value:10},dex:{value:10}}},items,
    sheet:{loadProfileData:async () => ({classes,races})} };
  return actor;
}
function outcome(total, naturalD20=null, manual=false) {
  return {total,naturalD20,manual, foundryRoll:manual ? null : { total,toMessage:async data => posted.push({...data,rolls:[{total}],isRoll:true}) } };
}
beforeEach(() => {
  vi.clearAllMocks(); posted=[];mode='melee';
  rollCritical.mockResolvedValue({ success: true, rerollOnes: false });
  changeHealth.mockResolvedValue({ success: true, beforeHP: 20, afterHP: 16 });
  Object.assign(supportContext,{attack:0,damage:0,offhand:false,override:false,automatic:false});
  globalThis.DOMPurify={sanitize:value=>value};
  globalThis.ui={notifications:{warn:vi.fn(),error:vi.fn(),info:vi.fn()}};
  globalThis.game={system:{id:'osp-houserules'},user:{targets:new Set()},actors:new Map(),settings:{get:(_scope,key)=>key==='applyDamageOption'?'controlled':'publicroll'},messages:new Map(),i18n:{localize:key=>key}};
  globalThis.canvas={tokens:{controlled:[]}};
  globalThis.ChatMessage={getSpeaker:()=>({actor:'actor'}),applyRollMode:()=>({}),create:async data=>posted.push(data)};
  globalThis.Dialog=class {constructor(config){this.config=config;} render(){this.config.buttons[mode].callback();}};
});

describe('BR-10 catalog-backed weapon policy', () => {
  it('classifies every Any profile and every catalog weapon as trained', () => {
    for (const p of classes.filter(p=>p.weaponPermissions.includes('Any'))) for (const item of catalog) expect(isWeaponProficient(item,p.weaponPermissions)).toBe(true);
  });
  it('allows Magic-User sword at -2 and d4, while dagger/staff remain proficient', () => {
    expect(policy('Magic-User',weapon('Longsword'))).toMatchObject({allowed:true,proficient:false,attackPenalty:-2,damageCapHD:4});
    for (const name of ['Dagger','Staff']) expect(policy('Magic-User',weapon(name))).toMatchObject({allowed:true,proficient:true,attackPenalty:0,damageCapHD:null});
    expect(policy('Mage',weapon('Battle Axe'))).toMatchObject({attackPenalty:-2,damageCapHD:6});
  });
  it('handles named families, exact names, optional Staff, and magical suffixes', () => {
    expect(isWeaponProficient(weapon('Scimitar'),profile('Mage').weaponPermissions)).toBe(true);
    expect(isWeaponProficient(weapon('Sling, Staff'),['Sling'])).toBe(false);
    const staff=weapon('Staff');staff.name+=' +2';expect(isWeaponProficient(staff,profile('Illusionist').weaponPermissions)).toBe(true);
    expect(findClassProfile(classes,'magic_user').name).toBe('Magic-User');
  });
  it('treats Mage\'s Staff as Staff for Mage, Magic-User, and Illusionist proficiency', () => {
    const mageStaff = weapon('Staff');
    mageStaff.name = "Mage's Staff";
    for (const className of ['Mage', 'Magic-User', 'Illusionist']) {
      expect(isWeaponProficient(mageStaff, profile(className).weaponPermissions)).toBe(true);
    }
    mageStaff.name = 'Mage’s Staff';
    expect(isWeaponProficient(mageStaff, profile('Mage').weaponPermissions)).toBe(true);
    mageStaff.name = "Mage's Staff +2";
    for (const className of ['Mage', 'Magic-User', 'Illusionist']) {
      expect(isWeaponProficient(mageStaff, profile(className).weaponPermissions)).toBe(true);
    }
  });
  it('keeps Staff Sling distinct from Mage\'s Staff and preserves named-list limits', () => {
    expect(isWeaponProficient(weapon('Sling, Staff'), ['Staff'])).toBe(false);
    expect(isWeaponProficient(weapon('Dagger'), ['Staff'])).toBe(false);
    const mageStaff = weapon('Staff');
    mageStaff.name = "Mage's Staff";
    expect(isWeaponProficient(mageStaff, ['Dagger'])).toBe(false);
  });
  it('retains physical race/profile limits and explicit STR even without race data', () => {
    expect(policy('Fighter',weapon('Longbow'),'Dwarf').allowed).toBe(false);
    expect(policy('Fighter',weapon('Greatsword'),'Hobbit').allowed).toBe(false);
    expect(policy('Gnome',weapon('Longsword'),'Gnome').allowed).toBe(false);
    const club=weapon('Club');club.system.minStr=13;
    expect(evaluateWeaponPolicy({item:club,classProfile:profile('Fighter'),strength:12}).allowed).toBe(false);
    expect(evaluateWeaponPolicy({item:club,classProfile:profile('Fighter'),strength:13}).allowed).toBe(true);
    expect(evaluateWeaponPolicy({item:club,classProfile:profile('Fighter')}).allowed).toBe(false);
    expect(evaluateWeaponPolicy({item:club}).allowed).toBe(false);
  });
  it('does not silently remove a cap for missing class hit die', () => {
    expect(evaluateWeaponPolicy({item:weapon('Longsword'),classProfile:{weaponPermissions:['Dagger']}}).allowed).toBe(false);
  });
  it('caps final totals including bonus/critical totals, not proficient attacks', () => {
    expect(applyWeaponDamageCap(9,4)).toEqual({total:4,capped:true});
    expect(applyWeaponDamageCap(17,6)).toEqual({total:6,capped:true});
    expect(applyWeaponDamageCap(3,4)).toEqual({total:3,capped:false});
    expect(applyWeaponDamageCap(17,null).total).toBe(17);
    expect(weaponDamageFormula(weapon('Bastard Sword'))).toBe('1d8');
    expect(weaponDamageFormula(weapon('Bastard Sword'),'twoHanded')).toBe('2d4');
  });
});

describe('BR-10 canonical attack integration', () => {
  it.each([false,true])('non-proficient normal attack posts/apply capped damage (manual=%s)', async manual => {
    const item=weapon('Longsword');const actor=actorFor('Magic-User',item);const handler=new ItemHandler(null,actor,actor.sheet);
    roll.mockResolvedValueOnce(outcome(15,17,manual)).mockResolvedValueOnce(outcome(9,null,manual));
    await handler.rollWeapon(item);
    expect(roll.mock.calls[0][0]).toBe('1d20 - 2');
    expect(posted[0].flavor).toContain('Non-proficient: -2');
    expect(posted[1].flags['osp-houserules']).toMatchObject({combatDamageTotal:4,rawDamageTotal:9,nonProficiencyCap:4});
    expect(posted[1].flavor).toContain('effective damage <strong>4');
    expect(getChatDamageTotal(posted[1])).toBe(4);
  });
  it('critical damage and magic bonus are rolled fully then capped, even without target', async () => {
    const item=weapon('Longsword');item.system.bonus=2;const actor=actorFor('Magic-User',item);
    roll.mockResolvedValueOnce(outcome(20,20)).mockResolvedValueOnce(outcome(14));
    await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(rollCritical).toHaveBeenCalledWith(actor, 'hit');
    expect(roll.mock.calls[0][0]).toBe('1d20 + 0');
    expect(roll.mock.calls[1][0]).toBe('2d8 + 2');
    expect(getChatDamageTotal(posted[1])).toBe(4);
  });
  it('applies critical reroll-ones guidance to the damage formula', async () => {
    rollCritical.mockResolvedValue({ success: true, rerollOnes: true });
    const item=weapon('Longsword');const actor=actorFor('Fighter',item);
    roll.mockResolvedValueOnce(outcome(20,20)).mockResolvedValueOnce(outcome(8));
    await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(rollCritical).toHaveBeenCalledWith(actor, 'hit');
    expect(roll.mock.calls[1][0]).toMatch(/2d8rr1/);
  });
  it('natural one resolves the critical miss and never rolls damage', async () => {
    const item=weapon('Longsword');const actor=actorFor('Fighter',item);
    roll.mockResolvedValueOnce(outcome(1,1));
    await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(rollCritical).toHaveBeenCalledWith(actor, 'miss');
    expect(roll).toHaveBeenCalledTimes(1);
  });
  it('proficient attack has neither proficiency penalty nor damage cap', async () => {
    const item=weapon('Longsword');const actor=actorFor('Fighter',item);
    roll.mockResolvedValueOnce(outcome(17,17)).mockResolvedValueOnce(outcome(8));
    await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(roll.mock.calls[0][0]).toBe('1d20 + 0');expect(getChatDamageTotal(posted[1])).toBe(8);
    expect(posted[1].flags['osp-houserules'].nonProficiencyCap).toBeNull();
  });
  it('macro uses canonical penalties, manual dice and cap', async () => {
    const item=weapon('Longsword');const actor=actorFor('Magic-User',item);game.actors.set(actor.id,actor);
    roll.mockResolvedValueOnce(outcome(15,17,true)).mockResolvedValueOnce(outcome(9,null,true));
    await rollItemMacro(item.name,actor.id);
    expect(roll.mock.calls[0][0]).toBe('1d20 - 2');expect(getChatDamageTotal(posted[1])).toBe(4);
  });
  it('sheet event uses canonical policy', async () => {
    const item=weapon('Longsword');const actor=actorFor('Magic-User',item);const handler=new ItemHandler(null,actor,actor.sheet);
    handler.getItemFromEvent=()=>item;
    roll.mockResolvedValueOnce(outcome(15,17)).mockResolvedValueOnce(outcome(8));
    await handler.onItemRoll({preventDefault:vi.fn()});expect(roll.mock.calls[0][0]).toBe('1d20 - 2');
  });
  it('draw/unlash permission allows non-proficient weapon and warns Cleric', async () => {
    const item=weapon('Longsword');const actor=actorFor('Cleric',item);const handler=new ItemHandler(null,actor,actor.sheet);
    expect(await handler._checkWeaponPermission(item)).toMatchObject({allowed:true,attackPenalty:-2,deityRisk:true});
    expect(ui.notifications.warn).toHaveBeenCalledWith(expect.stringContaining('deity anger'));
    roll.mockResolvedValueOnce(outcome(15,17)).mockResolvedValueOnce(outcome(8));await handler.rollWeapon(item);
    expect(posted[0].flavor).toContain('GM adjudicates');expect(getChatDamageTotal(posted[1])).toBe(6);
  });
  it.each(['onItemToggle','onItemLashToggle'])('actual %s draws non-proficient weapons while retaining physical gates', async method => {
    const item=weapon('Longsword');item.system.lashed=method==='onItemLashToggle';const actor=actorFor('Magic-User',item);const handler=new ItemHandler(null,actor,actor.sheet);
    handler.getItemFromEvent=()=>item;
    const event={preventDefault:vi.fn(),stopPropagation:vi.fn()};
    await handler[method](event);
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({'system.equipped':true}));
    item.update.mockClear();actor.system.race='Dwarf';item.name='Greatsword';item.system.tags=['melee','two-handed','sword'];item.system.size='L';
    await handler[method](event);expect(item.update).not.toHaveBeenCalled();
  });
  it('physical hand/race/STR gates still prevent attacks', async () => {
    const item=weapon('Greatsword');const actor=actorFor('Magic-User',item);actor.items.push({id:'shield',type:'armor',name:'Shield',system:{equipped:true,type:'shield'}});
    await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);expect(roll).not.toHaveBeenCalled();
    actor.items.pop();actor.system.race='Dwarf';await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);expect(roll).not.toHaveBeenCalled();
    actor.system.race='Human';item.system.minStr=13;await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);expect(roll).not.toHaveBeenCalled();
  });
  it('missing profiles fail clearly instead of granting proficiency', async () => {
    const item=weapon('Longsword');const actor=actorFor('unknown',item);await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(roll).not.toHaveBeenCalled();expect(ui.notifications.warn).toHaveBeenCalled();
  });
  it('attack cancellation, miss, or absent ammunition prevents damage', async () => {
    const item=weapon('Longsword');const actor=actorFor('Magic-User',item);const handler=new ItemHandler(null,actor,actor.sheet);
    roll.mockResolvedValueOnce({cancelled:true});await handler.rollWeapon(item);expect(posted).toHaveLength(0);
    game.user.targets=new Set([{name:'Target',actor:{system:{ac:20}}}]);roll.mockResolvedValueOnce(outcome(4,6));await handler.rollWeapon(item);expect(posted).toHaveLength(1);
    roll.mockClear();await handler.rollWeapon(weapon('Longbow'));expect(roll).not.toHaveBeenCalled();
  });
  it('thrown attack gets penalty/cap and consumes one weapon only after attack roll', async () => {
    mode='thrown';const item=weapon('Hand Axe');item.system.quantity=2;const actor=actorFor('Magic-User',item);
    roll.mockResolvedValueOnce(outcome(15,17)).mockResolvedValueOnce(outcome(6));
    await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(roll.mock.calls[0][0]).toBe('1d20 - 2');expect(item.update).toHaveBeenCalledWith({'system.quantity':1});expect(getChatDamageTotal(posted[1])).toBe(4);
  });
  it('cancelled thrown attack does not consume the weapon', async () => {
    mode='thrown';const item=weapon('Hand Axe');item.system.quantity=2;const actor=actorFor('Magic-User',item);
    roll.mockResolvedValueOnce({cancelled:true});await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(item.update).not.toHaveBeenCalled();expect(item.delete).not.toHaveBeenCalled();expect(posted).toHaveLength(0);
  });
  it('unarmed and monster policy have no class proficiency penalty/cap', async () => {
    const item=weapon('Longsword');const actor=actorFor('Magic-User',item);const handler=new ItemHandler(null,actor,actor.sheet);
    roll.mockResolvedValueOnce(outcome(15,15)).mockResolvedValueOnce(outcome(2));await handler.onUnarmedRoll({preventDefault:vi.fn()});
    expect(roll.mock.calls[0][0]).toBe('1d20 + 0');expect(posted[1].flags['osp-houserules'].nonProficiencyCap).toBeNull();
    actor.type='monster';expect(await handler._getWeaponPolicy(item)).toMatchObject({attackPenalty:0,damageCapHD:null});
  });
});

describe('BR-10 chat damage application', () => {
  it('manual and virtual totals use cap for normal/double/half; legacy rolls remain valid', () => {
    const flags={'osp-houserules':{combatDamage:true,combatDamageTotal:4,nonProficiencyCap:4,manualRoll:true,manualDamageTotal:4}};
    const message={flags,rolls:[{total:9}]};
    expect(getChatDamageTotal(message)).toBe(4);
    expect([1,2,0.5,-1].map(multiplier=>getChatDamageAmount(message,multiplier))).toEqual([4,4,2,-4]);
    expect(getChatDamageTotal({rolls:[{total:9}]})).toBe(9);
    expect(getChatDamageTotal({flags})).toBe(4);expect(getChatDamageTotal({})).toBeNull();
  });
  it('manual capped card context and button both apply effective damage', async () => {
    const message={id:'msg',flags:{'osp-houserules':{combatDamage:true,combatDamageTotal:4,nonProficiencyCap:4,manualRoll:true}},rolls:[]};game.messages.set('msg',message);
    const actor={id:'target',uuid:'Actor.target',name:'Target',system:{hitpoints:20,maxhitpoints:20},update:vi.fn()};canvas.tokens.controlled=[{actor}];
    const options=[];addChatMessageContextOptions(null,options);const li={data:()=> 'msg'};
    expect(options[0].condition(li)).toBe(true);await options[1].callback(li);expect(changeHealth).toHaveBeenCalledWith(actor, {action:'damage',amount:4}, expect.stringMatching(/^health-chat-msg-Actor_target-damage-2$/));expect(actor.update).not.toHaveBeenCalled();
    let click;globalThis.document={createElement:()=>({addEventListener:(_event,callback)=>{click=callback;}})};
    addChatMessageButtons(message,{querySelector:()=>({appendChild:vi.fn()})});click();await Promise.resolve();
    expect(changeHealth).toHaveBeenCalledTimes(2);
  });
});

describe('BR15 canonical attack completion', () => {
  it.each([true,false])('spends completed attacks whether hit is %s', async hit => {
    const actor=actorFor('Fighter',weapon('Longsword')), handler=new ItemHandler(null,actor,actor.sheet);
    game.combat={round:1,reserveAttackForActor:vi.fn(async()=>({round:1,sequence:0})),settleAttackForActor:vi.fn(async()=>({success:true}))};
    roll.mockResolvedValue(outcome(hit?20:2,hit?20:2));
    const result=await handler._performCombatAttack(actor.items[0],{},'1d20','Attack',{targetAAC:15,targetName:'foe',needRoll:15});
    expect(result.isHit).toBe(hit); expect(game.combat.settleAttackForActor).toHaveBeenCalledWith(actor,expect.any(String),true,{round:1,sequence:0});
  });
  it('releases a cancelled roll without spending an attack', async () => {
    const actor=actorFor('Fighter',weapon('Longsword')), handler=new ItemHandler(null,actor,actor.sheet);
    game.combat={round:1,reserveAttackForActor:vi.fn(async()=>({round:1,sequence:0})),settleAttackForActor:vi.fn(async()=>({success:true}))};
    roll.mockResolvedValue({cancelled:true});
    const result=await handler._performCombatAttack(actor.items[0],{},'1d20','Attack',null);
    expect(result.cancelled).toBe(true); expect(game.combat.settleAttackForActor).toHaveBeenCalledWith(actor,expect.any(String),false,{round:1,sequence:0});
  });
  it('spends the attack even when posting its completed roll fails', async () => {
    const actor=actorFor('Fighter',weapon('Longsword')), handler=new ItemHandler(null,actor,actor.sheet);
    game.combat={round:1,reserveAttackForActor:vi.fn(async()=>({round:1,sequence:0})),settleAttackForActor:vi.fn(async()=>({success:true}))};
    roll.mockResolvedValue({total:10,naturalD20:10,foundryRoll:{toMessage:async()=>{throw new Error('chat failed');}}});
    await expect(handler._performCombatAttack(actor.items[0],{},'1d20','Attack',null)).rejects.toThrow('chat failed');
    expect(game.combat.settleAttackForActor).toHaveBeenCalledTimes(1); expect(game.combat.settleAttackForActor.mock.calls[0][2]).toBe(true);
  });
  it('applies STR to melee damage while preserving final class damage caps', async () => {
    const item=weapon('Longsword'), actor=actorFor('Fighter',item);actor.system.attributes.str.value=16;
    roll.mockResolvedValueOnce(outcome(12,10)).mockResolvedValueOnce(outcome(7));
    await new ItemHandler(null,actor,actor.sheet).rollWeapon(item);
    expect(roll.mock.calls[1][0]).toContain('+ 2');
  });
  it('enforces catalog armor STR requirements with the Knight exception', () => {
    const armor={name:'Full plate',system:{type:'heavy',minStr:16}};
    const actor=actorFor('Fighter',armor), handler=new ItemHandler(null,actor,actor.sheet);
    expect(handler._checkArmorPermission(armor,['Any']).allowed).toBe(false);
    actor.system.class='Knight';expect(handler._checkArmorPermission(armor,['Any']).allowed).toBe(true);
  });
});

it('BR15 applies a confirmed Slayer damage bonus to unarmed attacks',async()=>{
  const actor=actorFor('Fighter',weapon('Longsword'));
  supportContext.attack=1;supportContext.damage=1;
  roll.mockResolvedValueOnce(outcome(11,10)).mockResolvedValueOnce(outcome(3));
  await new ItemHandler(null,actor,actor.sheet).onUnarmedRoll({preventDefault(){}});
  expect(roll.mock.calls[1][0]).toBe('1d2 + 1');
});
