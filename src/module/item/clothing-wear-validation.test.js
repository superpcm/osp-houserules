import { beforeAll, describe, expect, it } from 'vitest';
let OspItem;
beforeAll(async () => {
  globalThis.Item = class {
    static async createDocuments(data) { return data; }
    async _preCreate() {}
    async _preUpdate() {}
  };
  ({ OspItem } = await import('./item.js'));
});
const clothing = (id,name,system={}) => ({id,name,type:'clothing',system:{equipped:false,quantity:1,...system}});
function document(data,others=[]) {
  const item=Object.assign(new OspItem(),structuredClone(data));
  item.parent={type:'character',items:[...others,item]};
  item.toObject=()=>({id:item.id,name:item.name,type:item.type,system:{...item.system}});
  item.updateSource=changes=>{for(const [key,value] of Object.entries(changes))item.system[key.slice(7)]=value;};
  return item;
}
describe('clothing wear document validation',()=>{
  it('rejects direct equip into an occupied position even with other positions free',async()=>{
    const worn=clothing('boots-a','Boots',{slot:'boots',equipped:true});
    const next=document(clothing('boots-b','Renamed footwear',{slot:'boots'}),[worn]);
    expect(await next._preUpdate({'system.equipped':true},{},{})).toBe(false);
    expect(next.system.equipped).toBe(false);
  });
  it('rejects two newly worn base outfits as a batch, including robes',async()=>{
    await expect(OspItem.createDocuments([
      clothing('a',"Clothes, Adventurer's",{equipped:true}),
      clothing('b','Robes',{equipped:true}),
    ],{parent:{type:'character',items:[]}})).rejects.toThrow();
  });
  it('rejects two newly worn base outfits when the batch has no ids yet',async()=>{
    await expect(OspItem.createDocuments([
      clothing(undefined,"Clothes, Adventurer's",{equipped:true}),
      clothing(undefined,'Robes',{equipped:true}),
    ],{parent:{type:'character',items:[]}})).rejects.toThrow();
  });
  it('allows a separate base outfit, coat and cloak',async()=>{
    const data=[clothing('a',"Clothes, Adventurer's",{equipped:true}),clothing('b','Coat, Winter',{equipped:true,slot:'outerwear'}),clothing('c','Cloak',{equipped:true})];
    await expect(OspItem.createDocuments(data,{parent:{type:'character',items:[]}})).resolves.toHaveLength(3);
  });
  it('preserves duplicate legacy wear during neutral category migration and renaming',async()=>{
    const first=clothing('first','Gloves',{equipped:true});
    const second=document(clothing('second','Gauntlets',{equipped:true}),[first]);
    expect(await second._preUpdate({'system.slot':'gloves'},{},{})).toBeUndefined();
    expect(await second._preUpdate({'system.description':'Updated text'},{},{})).toBeUndefined();
    expect(second.system.equipped).toBe(true);
  });
  it('lets a conflict be resolved by unequipping without removing either item',async()=>{
    const first=clothing('first','Boots',{equipped:true,slot:'boots'});
    const second=document(clothing('second','Spare Boots',{equipped:true,slot:'boots'}),[first]);
    expect(await second._preUpdate({'system.equipped':false},{},{})).toBeUndefined();
    expect(second.parent.items).toHaveLength(2);
  });
  it('rejects a new worn stack but permits correcting a legacy stack to one',async()=>{
    const stack=document(clothing('stack','Boots',{quantity:2}));
    expect(await stack._preUpdate({'system.equipped':true},{},{})).toBe(false);
    stack.system.equipped=true;
    expect(await stack._preUpdate({'system.quantity':1},{},{})).toBeUndefined();
    expect(await stack._preUpdate({'system.quantity':3},{},{})).toBe(false);
  });
  it('assigns a known explicit category at creation and blocks direct duplicate creation',async()=>{
    const first=clothing('first','Boots',{equipped:true,slot:'boots'});
    const item=document(clothing('new','Boots',{equipped:true}),[first]);
    expect(await item._preCreate(item.toObject(),{},{})).toBe(false);
    expect(item.system.slot).toBe('boots');
  });
  it('does not count clothing stored in a container as occupying a position',async()=>{
    const stored=clothing('stored','Boots',{equipped:true,containerId:'bag',slot:'boots'});
    const item=document(clothing('new','Boots',{slot:'boots'}),[stored]);
    expect(await item._preUpdate({'system.equipped':true},{},{})).toBeUndefined();
  });
});
