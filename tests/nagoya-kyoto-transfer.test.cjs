const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../core.js');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('style.css');

test('Kyoto transfer matches only the confirmed 01.11 itinerary',()=>{
 const original=C.presetJourney('takayama-kyoto-2026-11-01');
 assert.equal(C.isNagoyaKyotoTrip(original),true);
 const other=C.presetJourney('hakone-takayama-2026-10-30');
 assert.equal(C.isNagoyaKyotoTrip(other),false);
 for(const wrong of [
  null,{}, {...original,date:'02.11.2026'},
  {...original,stops:original.stops.slice(0,2)},
  {...original,stops:original.stops.map((s,i)=>i===1?{...s,departure:'14:30'}:s)},
  {...original,stops:original.stops.map((s,i)=>i===1?{...s,name:'Other station'}:s)}
 ])assert.equal(C.isNagoyaKyotoTrip(wrong),false);
});

test('new guide has booked transfer time and verified Japanese transfer terminology',()=>{
 const g=C.stationGuides.nagoyaKyoto;
 assert.equal(g.incoming,'Hida 8');
 assert.equal(g.arrival,'14:04');
 assert.equal(g.outbound,'Nozomi 71');
 assert.equal(g.departure,'14:26');
 assert.equal(g.transferMinutes,22);
 assert.match(g.arrivalPlatforms,/4/);
 assert.match(g.departurePlatform,/17/);
 assert.equal(g.steps.length,5);
 assert.match(g.steps[1].sign,/新幹線/);
 assert.match(g.steps[2].sign,/のりかえ口/);
 assert.match(g.steps[4].action,/8D und 8E/);
 assert.ok(g.steps.every(s=>s.action&&s.sign&&s.level&&s.caution));
 assert.ok(g.steps.every(s=>!s.action.includes('GPS')));
 assert.match(g.mapUrl,/jr-central.co.jp/);
});

test('historic Hikari 637 to Hida 9 assistant remains unchanged',()=>{
 const old=C.stationGuides.nagoya;
 assert.equal(old.incoming,'Hikari 637');
 assert.equal(old.arrival,'11:19');
 assert.equal(old.outbound,'Hida 9');
 assert.equal(old.departure,'11:43');
 assert.equal(old.transferMinutes,24);
 assert.equal(old.steps.length,5);
 assert.match(html,/id="nagoya-dialog"/);
 assert.match(app,/const ng = C.stationGuides.nagoya/);
 assert.match(app,/livekarte-nagoya-step-v1/);
});

test('Kyoto transfer is reachable from map, itinerary and upcoming next action',()=>{
 for(const id of ['nagoya-kyoto-guide-trigger','nagoya-kyoto-dialog',
  'nagoya-kyoto-close','nagoya-kyoto-progress','nagoya-kyoto-floor',
  'nagoya-kyoto-step-title','nagoya-kyoto-step-action','nagoya-kyoto-sign',
  'nagoya-kyoto-step-caution','nagoya-kyoto-prev','nagoya-kyoto-next'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/14:04/);assert.match(html,/14:26/);
 assert.match(html,/22 Min\./);
 assert.match(html,/Gleis 4 prüfen/);
 assert.match(html,/Gleis 17 · Kyoto/);
 assert.match(html,/Schematische Wegfolge/);
 assert.match(app,/const kyoto=activePlanId==='ride-kyoto'&&C\.isNagoyaKyotoTrip\(journey\)/);
 assert.match(app,/ngTrigger\.hidden=!legacy\|\|!nearNagoya/);
 assert.match(app,/ngKyotoTrigger\.hidden=!kyoto\|\|!nearNagoya/);
 assert.match(app,/ngKyotoTrigger\.onclick=openNagoyaKyotoGuide/);
 assert.match(app,/function openNagoyaKyotoGuide\(\)/);
 assert.match(app,/task\.id==='kyoto:transfer'&&activePlanId==='ride-kyoto'/);
 assert.match(app,/Umstiegshilfe öffnen/);
 assert.match(app,/guide\.onclick=openNagoyaKyotoGuide/);
 assert.match(app,/kyoto-transfer-guide/);
 assert.match(css,/#nagoya-kyoto-guide-trigger\[hidden\]/);
 assert.match(css,/#nagoya-kyoto-dialog/);
});

test('no invented indoor GPS, ticket confirmation or separate user progress store',()=>{
 const begin=app.indexOf('  // 01.11.2026: dedicated JR-to-Shinkansen guide');
 const end=app.indexOf('  function fitJourney()',begin);
 assert.ok(begin>0&&end>begin);
 const guide=app.slice(begin,end);
 assert.match(guide,/ngKyotoStep=0/);
 assert.match(guide,/ngKyotoDialog\.showModal\(\)/);
 assert.match(guide,/ngKyotoDialog\.close\(\)/);
 assert.doesNotMatch(guide,/navigator\.geolocation|watchPosition|fetch\(|localStorage|setRailLegStage|saveTicketStatus|map\.setView/);
 assert.doesNotMatch(html.slice(html.indexOf('id="nagoya-kyoto-dialog"'),
  html.indexOf('id="plan-dialog"')),/GPS-Navigation starten|Ticket abgeholt/);
});
