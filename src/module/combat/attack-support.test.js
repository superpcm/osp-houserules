import { describe, expect, it } from 'vitest';
import { hasTalent, talentBonuses, canUseOffhand, attackAllowance, talentChoices, specializationBonus, twoWeaponPenalties, situationalModifiers, oilDamage, createAttackRoundState, reserveAttack, settleAttack } from './attack-support.js';

describe('BR-15 combat support', () => {
  it('uses approved normal attack progression', () => {
    expect(attackAllowance({ system: { class: 'Fighter', level: 9 } })).toBe(3);
    expect(attackAllowance({ system: { class: 'Warden', level: 5 } })).toBe(2);
    expect(attackAllowance({ system: { class: 'Cleric', level: 14 } })).toBe(1);
  });
  it('keeps the v1.5 talent choice groups', () => {
    expect(talentChoices(1)).toEqual(['Weapon Specialization', 'Two-Weapon Fighting']);
    expect(talentChoices(3)).toEqual(['Cleave', 'Defender', 'Leader', 'Slayer']);
    expect(talentChoices(7)).toEqual(talentChoices(3));
  });
  it('calculates specialization and two weapon progression', () => {
    expect(specializationBonus(1)).toEqual({ attack: 1, damage: 1 });
    expect(specializationBonus(10)).toEqual({ attack: 1, damage: 3 });
    expect(twoWeaponPenalties(1)).toEqual({ primary: -1, offhand: -3 });
    expect(twoWeaponPenalties(9)).toEqual({ primary: 0, offhand: 0 });
  });
  it('applies confirmed situational modifiers and hard blocks', () => {
    expect(situationalModifiers({ charging: true, targetCharging: true, cleave: true }).attack).toBe(1);
    expect(situationalModifiers({ ranged: true, opponentInMelee: true }).blocked).toBe(true);
    expect(situationalModifiers({ targetHelpless: true }).automatic).toBe(true);
    expect(situationalModifiers({ targetHelpless: true, ranged: true }).automatic).toBe(false);
    expect(situationalModifiers({ mounted: true, targetOnFoot: true, ranged: true }).attack).toBe(0);
    expect(situationalModifiers({ charging: true, ranged: true }).attack).toBe(0);
    expect(oilDamage('hit', '1d6')).toBe('1d6');
    expect(oilDamage('next-round')).toBe('1d4');
  });
  it('reserves, commits, and releases attacks idempotently', () => {
    const state = createAttackRoundState({ round: 2, attackCount: 1 });
    reserveAttack(state, 'a');
    expect(() => reserveAttack(state, 'b')).toThrow('No attacks remain');
    settleAttack(state, 'a', false);
    reserveAttack(state, 'b');
    settleAttack(state, 'b', true);
    expect(state.spent).toBe(1);
    expect(settleAttack(state, 'b', true)).toBe(true);
  });
  it('requires specific specialization and Slayer selections', () => {
    const actor = {system:{level:4},getFlag:() => [{name:'Weapon Specialization'},{name:'Slayer'}]};
    expect(talentBonuses(actor,{name:'Sword'},'orc').attack).toBe(0);
    actor.getFlag = () => [{name:'Weapon Specialization',weapon:'Sword'},{name:'Slayer',foeType:'orc'}];
    expect(talentBonuses(actor,{name:'Sword'},'orc')).toMatchObject({attack:2,damage:3});
    expect(talentBonuses(actor,{name:'Axe'},'human').attack).toBe(0);
  });
  it('requires both short swords and rejects concurrent offhand reservations', () => {
    expect(canUseOffhand({id:'a',name:'Shortsword'},{id:'b',name:'Longsword'})).toBe(false);
    expect(canUseOffhand({id:'a',name:'Shortsword'},{id:'b',name:'Shortsword'})).toBe(true);
    const state = createAttackRoundState({round:1}); reserveAttack(state,'first',{offhand:true});
    expect(() => reserveAttack(state,'second',{offhand:true})).toThrow();
    settleAttack(state,'first',false); reserveAttack(state,'second',{offhand:true});
    settleAttack(state,'second',true); expect(state.offhandSpent).toBe(true); expect(state.spent).toBe(0);
  });

  it('reads legacy object-shaped talent records safely',()=>{
    expect(hasTalent({getFlag:()=>({first:{name:'Cleave'}})},'Cleave')).toBe(true);
    expect(hasTalent({getFlag:()=>null},'Cleave')).toBe(false);
  });

});
