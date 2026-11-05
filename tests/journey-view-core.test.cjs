const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build,normalizedStatus}=require('../journey-view-core.js');
const trip=Object.freeze({title:'Kyoto nach Nikko',date:'2026-11-07',stops:[
 {name:'Kyoto',departure:'11:01',leg:'Nozomi 12'},
 {name:'Tokyo',arrival:'13:12',departure:'14:00',leg:'Yamabiko 141'},
 {name:'Nikko',arrival:'15:58'}]});
test('shared journey view model produces stable rail/ticket rows',()=>{
 const original=JSON.stringify(trip);
 const model=build({journey:trip,planId:'ride-nikko',
  ticketFor:i=>i===0?'ready':'booked',
  phaseFor:i=>i===0?'done':'planned'});
 assert.equal(model.rows.length,3);
 assert.equal(model.rows[0].ticket,'ready');
 assert.equal(model.rows[0].phase,'done');
 assert.equal(model.rows[1].nextLeg,'Yamabiko 141');
 assert.equal(model.rows[2].ticket,null);
 assert.equal(model.openTickets,1);
 assert.equal(model.allTicketsReady,false);
 assert.equal(model.live,false);
 assert.equal(JSON.stringify(trip),original,'the input journey remains unchanged');
 assert.ok(Object.isFrozen(model.rows));
});
test('no ticket is automatically marked ready when an arrival time passes',()=>{
 const model=build({journey:trip,planId:'ride-nikko',ticketFor:()=>null});
 assert.equal(model.openTickets,2);
 assert.equal(model.rows[0].phase,'planned');
 assert.deepEqual(model.rows.slice(0,-1).map(x=>x.ticket),['unknown','unknown']);
});
test('invalid statuses, missing stops and malformed trips fail safely',()=>{
 assert.equal(normalizedStatus('bogus'),'unknown');
 assert.throws(()=>build({journey:{stops:[]},planId:'ride-nikko',ticketFor:()=>null}),/Ungültiger/);
 assert.throws(()=>build({journey:trip,planId:'',ticketFor:()=>null}),/erforderlich/);
 assert.throws(()=>build({journey:{stops:[{name:'A'},{name:''}]},planId:'x',ticketFor:()=>null}),/Haltepunkt/);
});
