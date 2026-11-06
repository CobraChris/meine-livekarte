const {test}=require('node:test');
const assert=require('node:assert/strict');
const API=require('../rail-leg-details-core.js');
function memory(){
 const m=new Map();
 return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,v)};
}
const one='["ride-nikko","07.11.2026","Kyoto Station","11:01","Tokyo Station"]';
const two='["ride-nikko","07.11.2026","Tokyo Station","14:00","Utsunomiya Station"]';
test('leg metadata is separate per train and survives fresh reads',()=>{
 const storage=memory();
 const first=API.save(storage,one,{reference:' ABC 123 ',note:'Am Automaten abholen',
  pickupRequired:true,ticketIds:['img-1','pdf-2']});
 assert.equal(first.reference,'ABC 123');
 assert.equal(first.pickupRequired,true);
 assert.deepEqual(first.ticketIds,['img-1','pdf-2']);
 assert.equal(API.get(storage,one).note,'Am Automaten abholen');
 assert.equal(API.get(storage,two).ticketIds.length,0);
 const second=API.save(storage,two,{note:'Anderer Zug'});
 assert.equal(second.note,'Anderer Zug');
 assert.equal(API.get(storage,one).reference,'ABC 123');
 assert.ok(Object.isFrozen(first));
 assert.ok(Object.isFrozen(first.ticketIds));
});
test('multiple ticket photos can be linked without duplicate files or automatic status changes',()=>{
 const storage=memory();
 API.link(storage,one,'qr-a');
 API.link(storage,one,'qr-b');
 API.link(storage,one,'qr-a');
 assert.deepEqual(API.get(storage,one).ticketIds,['qr-a','qr-b']);
 API.unlink(storage,one,'qr-a');
 assert.deepEqual(API.get(storage,one).ticketIds,['qr-b']);
 assert.equal(API.get(storage,two).ticketIds.length,0);
 for(let i=0;i<7;i++)API.link(storage,one,'extra-'+i);
 assert.equal(API.get(storage,one).ticketIds.length,8);
 assert.throws(()=>API.link(storage,one,'extra-full'),/acht/);
});
test('bad input and corrupt local state are ignored safely and normalized',()=>{
 const storage=memory();
 storage.setItem(API.KEY,'{bad json');
 assert.deepEqual(API.get(storage,one).ticketIds,[]);
 assert.throws(()=>API.get(storage,''),/Fahrtabschnitt/);
 assert.throws(()=>API.link(storage,one,'a'.repeat(101)),/ungültig/);
 assert.equal(API.normalize({reference:'x'.repeat(500),note:'n'.repeat(999),
  ticketIds:['abc','abc',42],pickupRequired:'true'}).reference.length,120);
 assert.equal(API.normalize({note:'n'.repeat(999)}).note.length,500);
 assert.equal(API.normalize({pickupRequired:'true'}).pickupRequired,false);
});
test('local metadata failures do not silently mutate ticket state',()=>{
 const storage={getItem:()=>null,setItem:()=>{throw Error('quota');}};
 assert.throws(()=>API.save(storage,one,{reference:'TEST'}),/quota/);
 assert.deepEqual(API.get(storage,one).ticketIds,[]);
 const data=API.normalize({reference:'MUST-NOT-SYNC'});
 assert.equal(Object.hasOwn(data,'status'),false);
 assert.equal(Object.hasOwn(data,'booked'),false);
});
