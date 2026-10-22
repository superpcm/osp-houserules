import { beforeEach, describe, expect, it, vi } from 'vitest';
class Element {
  constructor(tag='div') { this.tag=tag;this.children=[];this.listeners={};this.dataset={};this.className=''; }
  set innerHTML(value) { this.html=value;if(value.includes('<input')) { this.input=new Element('input');this.input.checked=value.includes('checked');this.input.disabled=value.includes('disabled'); } }
  get innerHTML() { return this.html; }
  querySelector(selector) { if(selector==='input') return this.input;if(selector.includes('combatant-controls')) return this.controls;if(selector==='header')return this.header;return this.children.find(child=>selector.split(',').some(part=>child.className.split(' ').includes(part.trim().slice(1)))); }
  querySelectorAll() { return this.rows ?? []; }
  appendChild(child) { this.children.push(child); }
  addEventListener(name,listener) { this.listeners[name]=listener; }
  setAttribute(name,value) { this[name]=value; }
}
class BaseTracker { async _onRender() {} async _prepareTurnContext(_combat,combatant) { return {initiative:combatant.initiative,hasDecimals:true,isDefeated:true}; } }
vi.stubGlobal('foundry',{applications:{sidebar:{tabs:{CombatTracker:BaseTracker}}}});
const {default:Tracker,spellsOf,weaponsOf}=await import('./combat-tracker.js');
let tracker,combat,member,root,dialogs;
beforeEach(()=>{
  vi.stubGlobal('game',{user:{isGM:true}});vi.stubGlobal('ui',{notifications:{error:vi.fn()}});
  vi.stubGlobal('document',{createElement:tag=>new Element(tag)});
  dialogs=[];vi.stubGlobal('Dialog',class {constructor(data){dialogs.push(data);}render(){}});
  member={id:'a',initiative:1.99,defeated:false,isDefeated:false,isSurprised:false,isOwner:true,combatInitiativeState:{declaration:{kind:'weapon',weaponIds:['sword']}},actor:{items:[{id:'sword',type:'weapon',name:'Sword',system:{equipped:true,speedFactor:4}},{id:'spell',type:'spell',name:'Sleep',system:{lvl:3}}]}};
  const li=new Element('li');li.dataset.combatantId='a';li.controls=new Element();li.querySelector=Element.prototype.querySelector.bind(li);
  root=new Element();root.rows=[li];root.header=new Element();
  combat={round:1,combatants:new Map([['a',member]]),setDeclaration:vi.fn().mockResolvedValue({}),setSurprised:vi.fn().mockResolvedValue({}),markDefeated:vi.fn().mockResolvedValue({}),recoverInitiative:vi.fn().mockResolvedValue({})};
  tracker=new Tracker();tracker.element=root;tracker.viewed=combat;
});
describe('Foundry v13 initiative tracker',()=>{
  it('filters only equipped weapons and embedded spells',()=>{
    const actor={items:[...member.actor.items,{id:'stowed',type:'weapon',system:{equipped:false}},{id:'no-equipped-field',type:'weapon',system:{}}]};
    expect(weaponsOf(actor).map(item=>item.id)).toEqual(['sword']);expect(spellsOf(actor).map(item=>item.id)).toEqual(['spell']);
  });
  it('floors displayed initiative and respects explicit defeat',async()=>{
    expect(await tracker._prepareTurnContext(combat,member,0)).toMatchObject({initiative:1,hasDecimals:false,isDefeated:false});
  });
  it('gives each GM-controlled row its own surprise and defeat controls',async()=>{
    await tracker._onRender({},{});const children=root.rows[0].controls.children;
    const surprise=children.find(child=>child.className==='osp-surprise-control'), defeated=children.find(child=>child.className.includes('osp-defeated-control'));
    surprise.input.listeners.change({stopPropagation(){},currentTarget:{checked:true}});
    defeated.input.listeners.change({currentTarget:{checked:true}});
    expect(combat.setSurprised).toHaveBeenCalledWith('a',true);expect(combat.markDefeated).toHaveBeenCalledWith('a',true);
  });
  it('opens a usable declaration dialog and sends the selected embedded spell ID',async()=>{
    await tracker._onRender({},{});const button=root.rows[0].controls.children.find(child=>child.className.includes('osp-action-declaration'));
    button.listeners.click({preventDefault(){},stopPropagation(){}});
    expect(dialogs[0].content).toContain('Sleep (level 3)');expect(dialogs[0].content).toContain('Sword (4)');
    const inputs={kind:{value:'spell'},weaponIds:{selectedOptions:[{value:'sword'}]},spellId:{value:'spell'}};
    await dialogs[0].buttons.submit.callback([{querySelector:selector=>inputs[selector.match(/name=([^\]]+)/)[1]]}]);
    expect(combat.setDeclaration).toHaveBeenCalledWith('a',{kind:'spell',spellId:'spell'});
  });
  it('keeps GM state controls away from players and omits controls for unowned actors',async()=>{
    game.user.isGM=false;await tracker._onRender({},{});expect(root.rows[0].controls.children).toHaveLength(2);
    expect(root.rows[0].controls.children.some(c=>c.className==='osp-combat-support')).toBe(true);
    member.isOwner=false;member.actor.isOwner=false;root.rows[0].controls.children=[];await tracker._onRender({},{});expect(root.rows[0].controls.children).toHaveLength(0);
  });
});
