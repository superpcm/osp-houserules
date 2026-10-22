import {beforeEach,describe,expect,it,vi} from 'vitest';
import {validateTalentSelections,talentSlots,activeCombatEffect,confirmAttackContext} from './combat-support-ui.js';
let actor;
beforeEach(()=>{
  actor={system:{class:'Fighter',level:7},items:[],getFlag:()=>({combatId:'battle',charge:{from:2,through:2},aim:{from:3,through:3}})};
  globalThis.game={system:{id:'osp-houserules'},user:{isGM:false,targets:new Set()},combat:{id:'battle',round:2}};
  globalThis.ui={notifications:{info:vi.fn()}};
});
describe('BR15 support UI rules and effect durations',()=>{
  it('offers only earned class talent slots',()=>{
    expect(talentSlots(actor).map(s=>s.level)).toEqual([1,3,7]);
    actor.system.class='Knight';expect(talentSlots(actor)[0].choices).toEqual(['Weapon Specialization']);
    actor.system.class='Ranger';expect(talentSlots(actor)[0].choices).toEqual(['Weapon Specialization','Two-Weapon Fighting']);
    actor.system.class='Cleric';expect(talentSlots(actor)).toEqual([]);
  });
  it('expires charge and activates aim only on its designated round',()=>{
    expect(activeCombatEffect(actor,'charge')).toBe(true);expect(activeCombatEffect(actor,'aim')).toBe(false);
    game.combat.round=3;expect(activeCombatEffect(actor,'charge')).toBe(false);expect(activeCombatEffect(actor,'aim')).toBe(true);
    game.combat.round=4;expect(activeCombatEffect(actor,'aim')).toBe(false);
    game.combat.id='other';expect(activeCombatEffect(actor,'charge')).toBe(false);
  });
  it('cancelling attack confirmation produces no context or mutation',async()=>{
    actor.getFlag=()=>[];
    globalThis.Dialog=class{constructor(config){this.config=config;}render(){this.config.buttons.cancel.callback();}};
    expect(await confirmAttackContext(actor,null,false)).toBeNull();
  });
  it('prohibits attacks while aiming or parrying',async()=>{
    await expect(confirmAttackContext(actor,null,true)).rejects.toThrow('Aiming');
    actor.getFlag=()=>({combatId:'battle',parry:{from:2,through:2}});
    await expect(confirmAttackContext(actor,null,false)).rejects.toThrow('Parry');
  });
  it('requires Knight and Paladin grants and validates named choices',()=>{
    actor.system.class='Knight';expect(()=>validateTalentSelections(actor,[],[{name:'Dagger'}])).toThrow('requires');
    expect(()=>validateTalentSelections(actor,[{level:1,name:'Weapon Specialization',weapon:'Dagger'}],[{name:'Dagger'}])).not.toThrow();
    actor.system.class='Paladin';expect(()=>validateTalentSelections(actor,[],[])).toThrow('requires');
    actor.system.class='Fighter';expect(()=>validateTalentSelections(actor,[{level:3,name:'Weapon Specialization',weapon:'Dagger'}],[{name:'Dagger'}])).toThrow('not available');
    expect(()=>validateTalentSelections(actor,[{level:3,name:'Slayer',foeType:''}],[])).toThrow('specific foe');
  });

});
