import {beforeEach, expect, it, vi} from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../progression/progression-authority.js', () => ({requestProgressionMutation:request}));
import {combatTalentMarkup, saveCombatTalents, activateCombatTalents, selectedCombatTalentRecords} from './combat-talents-ui.js';
import {confirmAttackContext} from './combat-support-ui.js';
const weapons = [{name:'Dagger'}];
let actor;
beforeEach(() => {
  globalThis.game = {system:{id:'osp-houserules'},user:{isGM:true,targets:new Set()}};
  globalThis.ui = {notifications:{info:vi.fn()}};
  actor = {id:'a',uuid:'Actor.a',system:{class:'Fighter',level:3},getFlag:()=>[],items:[]};
  request.mockReset().mockResolvedValue({success:true});
});
it('hides controls for ineligible classes and offers only earned slots', () => {
  actor.system.class='Cleric';expect(combatTalentMarkup(actor,weapons,true)).toBe('');
  actor.system.class='Fighter';const html=combatTalentMarkup(actor,weapons,true);
  expect(html).toContain('data-talent-level="3"');expect(html).not.toContain('data-talent-level="7"');
});
it('restores selections and conditionally shows their extra fields', () => {
  actor.getFlag=()=>[{level:1,name:'Weapon Specialization',weapon:'Dagger'},{level:3,name:'Slayer',foeType:'Undead'}];
  const html=combatTalentMarkup(actor,weapons,true);
  expect(html).toContain('value="Dagger" selected');expect(html).toContain('value="Undead"');
  expect(html).toContain('data-talent-weapon-field>');expect(html).toContain('data-talent-foe-field>');
  expect(html).toContain('data-talent-weapon-field hidden');
  expect(combatTalentMarkup(actor,weapons,false)).not.toContain('data-save-talents');
});
it('saves through authority and rejects incomplete Slayer without a mutation', async () => {
  const choices=[{level:3,name:'Slayer',foeType:'Undead'}];
  await saveCombatTalents(actor,choices,weapons);
  expect(request).toHaveBeenCalledWith('combat.support',expect.objectContaining({actorUuid:'Actor.a',selections:choices}));
  request.mockClear();await expect(saveCombatTalents(actor,[{level:3,name:'Slayer',foeType:''}],weapons)).rejects.toThrow('specific foe');expect(request).not.toHaveBeenCalled();
});
it('directs missing mandatory specialization to Skills without opening a dialog',async()=>{
  actor.system.class='Knight';globalThis.Dialog=vi.fn();
  expect(await confirmAttackContext(actor,null,false)).toBeNull();
  expect(ui.notifications.info).toHaveBeenCalledWith(expect.stringContaining('Skills page'));
  expect(Dialog).not.toHaveBeenCalled();
});

it('keeps draft choices inside descriptions and out of sheet autosubmit', async () => {
  const listeners = {};
  const status={textContent:''};
  const section={querySelector:()=>status};
  const effect={innerHTML:'Level 1. Choose one.',insertAdjacentHTML:vi.fn()};
  const entry={querySelector:selector=>selector==='.skill-ability-effect'?effect:{innerHTML:''},classList:{remove:vi.fn()}};
  const host={dataset:{},isConnected:true,querySelectorAll:()=>[],insertAdjacentHTML:vi.fn(),prepend:vi.fn(),firstElementChild:entry,addEventListener:(type,fn,capture)=>{listeners[type]={fn,capture};}};
  globalThis.fetch=vi.fn().mockResolvedValue({ok:true,json:async()=>weapons});
  actor.isOwner=true;
  await activateCombatTalents({querySelector:()=>host},actor,true);
  expect(effect.insertAdjacentHTML).toHaveBeenCalledWith('beforeend',expect.stringContaining('data-talent-level'));
  expect(host.insertAdjacentHTML.mock.calls.every(call=>!call[1].startsWith('<section class="combat-talents-section"'))).toBe(true);
  const stopPropagation=vi.fn();
  listeners.change.fn({stopPropagation,target:{closest:()=>section,matches:()=>false}});
  expect(listeners.change.capture).toBe(true);
  expect(stopPropagation).toHaveBeenCalledOnce();
});
it('shows only saved and currently earned combat skills',()=>{
  actor.getFlag=()=>[{level:1,name:'Two-Weapon Fighting'},{level:3,name:'Slayer',foeType:'Undead'},{level:7,name:'Cleave'}];
  expect(selectedCombatTalentRecords(actor).map(t=>t.name)).toEqual(['Two-Weapon Fighting','Slayer']);
  actor.system.class='Cleric';expect(selectedCombatTalentRecords(actor)).toEqual([]);
});

it('lets players compare original descriptions before selecting a radio choice',()=>{
  const html=combatTalentMarkup(actor,weapons,true,undefined,{'Weapon Specialization':'Focus on one weapon.','Two-Weapon Fighting':'Reduce offhand penalties.'});
  expect(html).toContain('type="radio"');
  expect(html).toContain('Focus on one weapon.');
  expect(html).toContain('Reduce offhand penalties.');
  expect(html).not.toContain('<select data-talent-name');
  expect(html).toContain('form="combat-talent-a-1-draft"');
});

it('starts an unfinished choice unchecked without offering a no-talent option',()=>{
  const html=combatTalentMarkup(actor,weapons,true);
  expect(html).not.toContain('Not selected');
  expect(html).not.toContain(' checked');
  expect(html).toContain('Weapon Specialization');
  expect(html).toContain('Two-Weapon Fighting');
});

it('omits the redundant Combat Talent lead-in from option descriptions',()=>{
  const html=combatTalentMarkup(actor,weapons,true,undefined,{'Weapon Specialization':'Combat Talent. Choose a weapon.','Two-Weapon Fighting':'Combat Talent. Reduce penalties.'});
  expect(html).not.toContain('Combat Talent.');
  expect(html).toContain('Choose a weapon.');
  expect(html).toContain('Reduce penalties.');
});
