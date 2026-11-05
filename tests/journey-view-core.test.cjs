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

test('planned transfer window uses only explicit same-day station times',()=>{
 const {connectionMinutes}=require('../journey-view-core.js');
 assert.equal(connectionMinutes('14:04','14:26'),22);
 assert.equal(connectionMinutes('11:19','11:25'),6);
 for(const [a,b] of [['23:55','00:10'],['14:26','14:04'],
  ['13:99','14:04'],['','14:04'],['11:00','18:00']])
  assert.equal(connectionMinutes(a,b),null,'Cannot infer journey day or bad clocks');
 const t={title:'Transfer',date:'06.11.2026',stops:[
  {name:'Start',departure:'10:00',leg:'Rail'},
  {name:'Change',arrival:'10:55',departure:'11:01',leg:'Metro'},
  {name:'End',arrival:'11:35'}]};
 const view=build({journey:t,planId:'test',ticketFor:()=> 'unknown'});
 assert.equal(view.rows[1].connectionMinutes,6);
 assert.match(view.rows[1].connectionNote,/Zeit knapp/);
 assert.equal(view.rows[1].timeLabel,'10:55 an · 11:01 ab');
 assert.equal(view.rows[0].connectionMinutes,null);
 assert.equal(view.rows[2].connectionNote,'');
 assert.equal(view.rows[1].ticket,'unknown');
});
