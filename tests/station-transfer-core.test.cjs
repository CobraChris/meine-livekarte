const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build,labelPlatform}=require('../station-transfer-core.js');
const steps=['Den Schildern zum Umstieg folgen','Anzeigetafel prüfen','Zum richtigen Bahnsteig gehen'];
test('uncertain station platforms are never claimed as live or confirmed',()=>{
 const plan=build({station:'Nagoya',arrival:{number:'16',confidence:'confirmed'},
   departure:{number:'11',confidence:'planned'},steps,ticketStatus:'booked'});
 assert.equal(plan.arrivalPlatform.confidence,'planned',
  'A claimed platform without source must remain a plan value');
 assert.match(plan.departurePlatform.label,/vor Ort prüfen/);
 assert.equal(plan.ticketStatus,'booked');
 assert.equal(plan.live,false);
 assert.equal(plan.indoorGps,false);
 assert.equal(plan.steps.length,3);
});
test('Tokyo transfer with unknown platforms displays no invented platform',()=>{
 const guide=build({station:'Tokyo',steps:['Zugschilder beachten']});
 assert.equal(guide.arrivalPlatform.number,null);
 assert.equal(guide.departurePlatform.number,null);
 assert.equal(guide.ticketStatus,'unknown');
 assert.equal(guide.steps[0].number,1);
});
test('only explicitly sourced platform data can be labelled confirmed',()=>{
 const guide=build({station:'Testbahnhof',
  sourceUrl:'https://example.org/platform-plan',
  arrival:{number:'2',confidence:'confirmed'},steps:['Schilder folgen']});
 assert.equal(guide.arrivalPlatform.confidence,'confirmed');
 assert.equal(guide.departurePlatform.confidence,'unknown');
 assert.equal(labelPlatform({number:'2',confidence:'confirmed'},'http://not-secure').confidence,'planned');
});
test('invalid inputs and accidental ticket claims are rejected',()=>{
 assert.throws(()=>build({station:'',steps}),/erforderlich/);
 assert.throws(()=>build({station:'A',steps:[]}),/erforderlich/);
 assert.throws(()=>build({station:'A',steps:['']}),/Ungültiger/);
 const guide=build({station:'A',steps:['Weiter'],ticketStatus:'invalid'});
 assert.equal(guide.ticketStatus,'unknown');
 assert.ok(Object.isFrozen(guide.steps));
});

test('Tokyo transfer step sequence has no assumed platform and cannot auto-complete',()=>{
 const {stepState}=require('../station-transfer-core.js');
 const guide=build({station:'Tokyo',steps:[
  {title:'Aussteigen',action:'Anzeigen prüfen'},
  {title:'Ticket',action:'Richtige Sperre beim Personal prüfen'},
  {title:'Abfahrt',action:'Zug auf Anzeigetafel prüfen'}]});
 assert.equal(guide.arrivalPlatform.confidence,'unknown');
 assert.equal(guide.departurePlatform.confidence,'unknown');
 const initial=stepState(guide,0),last=stepState(guide,100);
 assert.equal(initial.number,1);
 assert.equal(initial.canBack,false);
 assert.equal(initial.canNext,true);
 assert.equal(last.number,3);
 assert.equal(last.canNext,false);
 assert.equal(last.finished,true);
 assert.match(last.step.action,/Anzeigetafel/);
 assert.equal(stepState(guide,NaN).index,0);
 assert.equal(guide.ticketStatus,'unknown');
 assert.equal(guide.live,false);
 assert.ok(Object.isFrozen(last));
});
