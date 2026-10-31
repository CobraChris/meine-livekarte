const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const N=require('../next-step-core.js');
const C=require('../core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const app=read('app.js'),html=read('index.html');

test('Japan local date works regardless of device timezone and DST',()=>{
 assert.equal(N.localDate(new Date('2026-10-31T14:59:00Z')),'2026-10-31');
 assert.equal(N.localDate(new Date('2026-10-31T15:01:00Z')),'2026-11-01');
 assert.equal(N.localDate(new Date('2026-11-01T15:01:00Z')),'2026-11-02');
 assert.equal(N.localDate(new Date('2026-11-03T00:00:00Z')),'2026-11-03');
});
test('Takayama the evening before departure suggests preparing Klook voucher rather than asserting it was collected',()=>{
 const schedule=N.choose('town-takayama','2026-10-31');
 assert.equal(schedule.total,1);
 assert.equal(schedule.next.id,'kyoto:prepare');
 assert.match(schedule.next.note,/QR-Abholcode/);
 assert.equal(N.completed(schedule.next,{pickupDone:true}),false);
 assert.equal(N.choose('town-takayama','2026-11-01').next.id,'kyoto:pickup');
});
test('1 Nov travel steps are complete and ordered without invented real-time confirmation',()=>{
 const schedule=N.choose('ride-kyoto','2026-11-01');
 assert.equal(schedule.total,7);
 assert.deepEqual(schedule.entries.map(x=>x.id),[
  'kyoto:pickup','kyoto:hida','kyoto:transfer','kyoto:nozomi',
  'kyoto:hotel','kyoto:gion','kyoto:ponto'
 ]);
 assert.equal(schedule.next.id,'kyoto:pickup');
 assert.equal(schedule.doneCount,0);
 assert.match(schedule.entries[1].note,/10C und 10D/);
 assert.match(schedule.entries[3].note,/8D und 8E/);
 assert.ok(schedule.entries.every(x=>x.place?.lat&&x.place?.lng));
 assert.ok(schedule.entries.every(x=>x.time&&!x.note.includes('Live-Fahrzeit')));
});
test('existing confirmed pickup and completed train stage are shared and not duplicated',()=>{
 const c={pickupDone:true,railDone:{0:true,1:false},manualDone:{'kyoto:transfer':true}};
 const schedule=N.choose('ride-kyoto','2026-11-01',c);
 assert.equal(schedule.doneCount,3);
 assert.equal(schedule.next.id,'kyoto:nozomi');
 assert.equal(N.completed(schedule.entries[0],c),true);
 assert.equal(N.completed(schedule.entries[1],c),true);
 assert.equal(N.completed(schedule.entries[3],c),false);
 assert.equal(N.choose('ride-kyoto','2026-11-01',{
  ...c,railDone:{0:true,1:true},
  manualDone:{...c.manualDone,'kyoto:hotel':true,'kyoto:gion':true,'kyoto:ponto':true}
 }).next,null);
});
test('city view switches automatically from arrival night to 02 Nov, with no invented days after',()=>{
 assert.deepEqual(N.choose('town-kyoto','2026-10-31').entries.map(x=>x.id),
   ['kyoto:hotel','kyoto:gion','kyoto:ponto']);
 assert.deepEqual(N.choose('town-kyoto','2026-11-01').entries.map(x=>x.id),
   ['kyoto:hotel','kyoto:gion','kyoto:ponto']);
 assert.deepEqual(N.choose('town-kyoto','2026-11-02').entries.map(x=>x.id),
   ['kyoto:kiyomizu','kyoto:sannenzaka','kyoto:fushimi']);
 assert.equal(N.choose('town-kyoto','2026-11-03').total,0);
 assert.equal(N.choose('town-takayama','2026-11-02').total,0);
 assert.equal(N.choose('all','2026-11-01').total,0);
});
test('new action UI is above existing Klook pickup instructions and adds no new routing calls',()=>{
 assert.ok(html.indexOf('id="next-action"')>0);
 assert.ok(html.indexOf('id="next-action"')<html.indexOf('id="kyoto-pickup"'));
 for(const id of ['next-action-count','next-action-name','next-action-complete',
  'next-action-map','next-action-details','next-action-list','next-action-feedback']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(html,/next-step-core\.js/);
 assert.match(read('sw.js'),/next-step-core\.js/);
 assert.match(read('sw.js'),/livekarte-shell-pwa-v21/);
 assert.match(read('style.css'),/\.next-action-buttons/);
});
test('manual step completion is local and undoable; GPS/tickets remain canonical',()=>{
 assert.match(app,/const NS=window\.NextStepCore/);
 assert.match(app,/function renderNextAction\(\)/);
 assert.match(app,/NS\.localDate\(\)/);
 assert.match(app,/NS\.choose\(view,today/);
 assert.match(app,/kyotoPickupDone/);
 assert.match(app,/tripStageDone\[C\.ticketLegKey\('ride-kyoto',trip,i\)\]/);
 assert.match(app,/localStorage\.setItem\('livekarte-next-actions-v1',JSON\.stringify\(next\)\)/);
 assert.match(app,/if\(done\)next\[id\]=true;else delete next\[id\]/);
 assert.match(app,/setRailLegStage\('ride-kyoto',trip,index,done\?'done':'booked'\)/);
 assert.match(app,/Abholung bitte nur über den Bestätigungsbutton/);
 assert.match(app,/undo\.onclick=\(\)=>setActionDone\(item,false\)/);
 assert.match(app,/task\.source==='pickup'/);
 assert.match(app,/if\(tourIsActive\|\|selectedTour\)/);
 const begin=app.indexOf('  function renderNextAction(){');
 const end=app.indexOf('  // A resumed app recalculates local calendar context',begin);
 assert.ok(begin>0&&end>begin);
 const section=app.slice(begin,end);
 assert.doesNotMatch(section,/fetch\(|navigator\.geolocation|setInterval\(/);
 assert.match(app,/window\.addEventListener\('focus',renderNextAction\)/);
});
test('map navigation only opens after explicit user click',()=>{
 assert.match(app,/nextActionMap\.href='https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination='/);
 assert.match(html,/id="next-action-map" target="_blank" rel="noopener noreferrer"/);
 assert.match(app,/nextActionMap\.hidden=!\(target&&Number\.isFinite/);
 const CTrip=C.presetJourney('takayama-kyoto-2026-11-01');
 assert.equal(CTrip.stops[0].departure,'11:35');
});