import { describe, it, expect } from 'vitest';
import { getVehicleAttachmentOptions, checkVehicleAttachment, validateVehicleAttachments } from './vehicle-lashing.js';
const host = (id='w') => ({id,name:'Wagon',type:'container',system:{quantity:1,containerId:null,capacity:200,vehicleKind:null}});
const part = (id,kind,extra={}) => ({id,name:id,type:'item',system:{quantity:1,storedSize:4,vehicleAttachmentKind:kind,...extra}});
describe('vehicle attachment adversarial edges',()=>{
 it('returns no options for unclassified, invalid, or absent hosts without throwing',()=>{
  for(const h of [null,{id:'bag',name:'Backpack',type:'container',system:{capacity:40}}, {...host(),system:{...host().system,vehicleKind:'invalid'}}]){
   for(const kind of ['tool','rope','bucket','wagon-wheel'])expect(getVehicleAttachmentOptions(part('part',kind),h,[])).toEqual([]);
  }
 });
 it('blocks duplicate slots and shared bulky and underframe positions across kinds',()=>{
  const w=host();const wheel=part('wheel','wagon-wheel',{containerId:'w',vehicleAttachment:{mode:'lashed',position:'left'}});
  expect(checkVehicleAttachment(part('tent','tent'),w,[w,wheel],{mode:'lashed',position:'left'}).allowed).toBe(false);
  const axle=part('axle','wagon-axle',{containerId:'w',vehicleAttachment:{mode:'lashed',position:'underframe'}});
  expect(checkVehicleAttachment(part('yoke','ox-yoke'),w,[w,axle],{mode:'lashed',position:'underframe'}).allowed).toBe(false);
 });
 it('retains old invalid items only for neutral changes; adding a conflicting attachment fails',()=>{
  const w=host();const a=part('a','cover',{containerId:'w',vehicleAttachment:{mode:'lashed',position:'left'}});
  const b=part('b','cover',{containerId:'w',vehicleAttachment:{mode:'lashed',position:'right'}});
  expect(validateVehicleAttachments([w,a,b],{baselineItems:[w,a]}).allowed).toBe(false);
 });
 it('prevents normal cargo from filling capacity already used by attachments',()=>{
  const w=host();w.system.capacity=10;const a=part('a','wagon-wheel',{containerId:'w',storedSize:8,vehicleAttachment:{mode:'lashed',position:'left'}});
  expect(validateVehicleAttachments([w,a,part('cargo','none',{containerId:'w',storedSize:3})]).allowed).toBe(false);
 });
 it('does not grandfather a newly filled bucket or a changed vehicle quantity',()=>{
  const w=host();const bucket=part('bucket','bucket',{containerId:'w',vehicleAttachment:{mode:'lashed',position:'hook-1'}});
  const baseline=[w,bucket];
  expect(validateVehicleAttachments(baseline).allowed).toBe(true);
  expect(validateVehicleAttachments([...baseline,part('water','none',{containerId:'bucket'})],{baselineItems:baseline}).allowed).toBe(false);
  expect(validateVehicleAttachments([{...w,system:{...w.system,quantity:2}},bucket],{baselineItems:baseline}).allowed).toBe(false);
 });
});
