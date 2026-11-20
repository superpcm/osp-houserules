import misc from '../../../data/misc.json';
import { vehicleDestination } from './vehicle-lashing.js';
import { beforeAll, expect, it, vi } from 'vitest';
import livestock from '../../../data/livestock.json';
import tack from '../../../data/tack.json';
import vehicles from '../../../data/vehicles.json';

let planStorePlacement;
let serial = 0;
beforeAll(async () => {
  globalThis.foundry = { applications: { sheets: { ActorSheetV2: class {} }, api: { HandlebarsApplicationMixin: Base => Base } }, utils: { randomID: () => `stable-placement-${++serial}`, duplicate: value => structuredClone(value) } };
  globalThis.Application = class {};
  globalThis.Dialog = class {};
  globalThis.ui = { notifications: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } };
  globalThis.game = { user: { isGM: false }, settings: { get: () => false }, system: { id: 'osp-houserules' }, items: [] };
  globalThis.TextEditor = { getDragEventData: () => ({ type: 'Item' }) };
  globalThis.Hooks = { call: () => true };
  const { OspActorSheetCharacter } = await import('../actor/sheets/character-sheet.js');
  OspActorSheetCharacter._classProfiles = []; OspActorSheetCharacter._raceProfiles = [];
  ({ planStablePlacement: planStorePlacement } = await import('./stable-placement.js'));
});
function actor() {
  const items = [];
  return { id: 'stable-buyer', uuid: 'Actor.stable-buyer', type: 'character', isOwner: true, system: { class: 'fighter' },
    items: { contents: items, filter: fn => items.filter(fn), find: fn => items.find(fn), get: id => items.find(item => item.id === id), some: fn => items.some(fn), map: fn => items.map(fn), [Symbol.iterator]: function* () { yield* items; } },
    getFlag: () => null, createEmbeddedDocuments: vi.fn(() => { throw new Error('Preview changed live inventory'); }), updateEmbeddedDocuments: vi.fn(() => { throw new Error('Preview changed live inventory'); }) };
}
const line = (id, catalog, name, destination = '') => ({ entryId: id, quantity: 1, itemData: structuredClone(catalog.find(item => item.name === name)), destination });

it('uses actual animal, saddle, and saddlebag placement in one detached cart', async () => {
  const hero = actor();
  const lines = [line('horse', livestock, 'Horse, Riding'), line('saddle', tack, 'Saddle', 'cart:horse'), line('bags', tack, 'Saddlebags, Large', 'cart:horse')];
  const result = await planStorePlacement(hero, lines);
  expect(result.success, result.reason).toBe(true);
  const horse = result.draftState.items.find(item => item.name === 'Horse, Riding');
  expect(result.draftState.items.find(item => item.name === 'Saddle').system.containerId).toBe(horse.id);
  expect(result.draftState.items.find(item => item.name === 'Saddlebags, Large').system.containerId).toBe(horse.id);
  expect(hero.items.contents).toHaveLength(0);
  expect(hero.createEmbeddedDocuments).not.toHaveBeenCalled();
});

it('delivers a cart and wagon without putting their weight in carried gear', async () => {
  const hero = actor();
  const result = await planStorePlacement(hero, [line('cart', vehicles, 'Cart'), line('wagon', vehicles, 'Wagon')]);
  expect(result.success, result.reason).toBe(true);
  expect(result.draftState.items.filter(item => item.system.tags?.includes('vehicle'))).toHaveLength(2);
  expect(result.draftState.items.filter(item => item.system.tags?.includes('vehicle')).every(item => !item.system.containerId)).toBe(true);
  expect(hero.items.contents).toHaveLength(0);
});

it('rejects large saddlebags on a pony and keeps the entire order detached', async () => {
  const hero = actor();
  const result = await planStorePlacement(hero, [line('pony', livestock, 'Pony'), line('saddle', tack, 'Saddle', 'cart:pony'), line('bags', tack, 'Saddlebags, Large', 'cart:pony')]);
  expect(result.success).toBe(false);
  expect(result.reason).toMatch(/large|fit|animal/i);
  expect(hero.items.contents).toHaveLength(0);
});

it('delivers generic animals as separate records and preserves purchased destinations at review', async () => {
  const hero = actor(); const mules = line('mules', livestock, 'Mule'); mules.quantity = 2;
  const result = await planStorePlacement(hero, [mules]);
  expect(result.success, result.reason).toBe(true);
  expect(result.draftState.items.filter(item => item.name === 'Mule')).toHaveLength(2);
  expect(result.draftState.items.filter(item => item.name === 'Mule').every(item => item.system.quantity === 1)).toBe(true);
  const first = await planStorePlacement(hero, [line('horse', livestock, 'Horse, Riding'), line('saddle', tack, 'Saddle', 'cart:horse')]);
  const reviewed = first.placements.find(placed => placed.entryId === 'saddle'); expect(reviewed.destination).toBe('cart:horse');
  const second = await planStorePlacement(hero, [line('horse', livestock, 'Horse, Riding'), line('saddle', tack, 'Saddle', reviewed.destination)]);
  expect(second.success, second.reason).toBe(true);
});

it('fits the draft harness to a draft horse and rejects it for a riding horse', async () => {
  const hero = actor();
  const draft = await planStorePlacement(hero, [line('horse', livestock, 'Horse, Draft'), line('harness', tack, 'Harness, Draft', 'cart:horse')]);
  expect(draft.success, draft.reason).toBe(true);
  const riding = await planStorePlacement(hero, [line('horse', livestock, 'Horse, Riding'), line('harness', tack, 'Harness, Draft', 'cart:horse')]);
  expect(riding.success).toBe(false); expect(hero.items.contents).toHaveLength(0);
});

it('reserves two separate wheel positions on a purchased wagon and preserves review destinations', async () => {
  const hero = actor();
  const request = [line('wagon',vehicles,'Wagon'), line('left',misc,'Spare Wheel, Wagon',vehicleDestination('cart:wagon',{mode:'lashed',position:'left'})),line('right',misc,'Spare Wheel, Wagon',vehicleDestination('cart:wagon',{mode:'lashed',position:'right'}))];
  const result = await planStorePlacement(hero,request);
  expect(result.success,result.reason).toBe(true);
  const wheels=result.draftState.items.filter(item=>item.name==='Spare Wheel, Wagon');
  expect(wheels).toHaveLength(2);
  expect(wheels.map(x=>x.system.vehicleAttachment.position).sort()).toEqual(['left','right']);
  expect(wheels.every(x=>x.system.lashed===false&&x.system.quantity===1)).toBe(true);
  const reviewed=result.placements.find(p=>p.entryId==='left');
  expect(reviewed.destination).toBe(request[1].destination);
  const retry=await planStorePlacement(hero,request.map(l=>({...l,destination:result.placements.find(p=>p.entryId===l.entryId)?.destination??l.destination})));
  expect(retry.success,retry.reason).toBe(true);
  expect(hero.items.contents).toHaveLength(0);
});
it('rejects occupied or stacked wheel attachments without touching live inventory',async()=>{
 const hero=actor();const wheel=line('left',misc,'Spare Wheel, Wagon',vehicleDestination('cart:wagon',{mode:'lashed',position:'left'}));
 const occupied=await planStorePlacement(hero,[line('wagon',vehicles,'Wagon'),wheel,{...structuredClone(wheel),entryId:'extra'}]);
 expect(occupied.success).toBe(false);
 const stack=await planStorePlacement(hero,[line('wagon',vehicles,'Wagon'),{...wheel,quantity:2}]);
 expect(stack.success).toBe(false);expect(hero.items.contents).toHaveLength(0);expect(hero.createEmbeddedDocuments).not.toHaveBeenCalled();
});
it('ordinary vehicle storage stays cargo while fitted covers use their own installed position',async()=>{
 const hero=actor();const cargo=line('cargo',misc,'Spare Wheel, Wagon','cart:wagon');
 const result=await planStorePlacement(hero,[line('wagon',vehicles,'Wagon'),cargo,line('cover',tack,'Wagon Cover',vehicleDestination('cart:wagon',{mode:'installed',position:'canopy'}))]);
 expect(result.success,result.reason).toBe(true);
 expect(result.draftState.items.find(x=>x.name==='Spare Wheel, Wagon').system.vehicleAttachment).toBeFalsy();
 expect(result.draftState.items.find(x=>x.name==='Wagon Cover').system.vehicleAttachment).toEqual({mode:'installed',position:'canopy'});
});
