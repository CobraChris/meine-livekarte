const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('style.css');
const trip=C.presetJourney('takayama-kyoto-2026-11-01');

test('infographic uses the existing Kyoto route and keeps rail timetable untouched',()=>{
 assert.equal(trip.date,'01.11.2026');
 assert.equal(trip.stops[0].departure,'11:35');
 assert.equal(trip.stops[1].arrival,'14:04');
 assert.equal(trip.stops[1].departure,'14:26');
 assert.equal(trip.stops[2].arrival,'15:00');
 assert.ok(html.includes('id="kyoto-rail-infographic"'));
 assert.match(app,/kyotoRailInfographic\.hidden=!visible/);
 assert.match(app,/visible=activePlanId==='ride-kyoto'&&!!journey/);
 assert.match(app,/panel\.hidden = !journey \|\| activePlanId==='ride-kyoto'/);
 assert.match(app,/renderKyotoRailInfographic\(\);\s*updateStationTransfer/);
 assert.match(app,/Math\.floor\(total\/60\)\+' h '/);
 assert.match(css,/\.kyoto-kpis/);
 assert.match(css,/\.kyoto-rail-line/);
 assert.match(css,/\.kyoto-rail-transfer/);
});

test('three simple travel phases do not turn a completed ride into unverified ticket proof',()=>{
 const begin=app.indexOf('  function railLegStage(planId,trip,index){');
 const end=app.indexOf('  function renderJourney() {',begin);
 assert.ok(begin>0&&end>begin);
 const logic=app.slice(begin,end);
 assert.match(logic,/if\(tripStageDone\[key\]===true\)return 'done'/);
 assert.match(logic,/return \['booked','ready'\]\.includes\(ticketStatusFor\(planId,trip,index\)\)\?'booked':'planned'/);
 assert.match(logic,/if\(!\['planned','booked','done'\]\.includes\(stage\)\)return false/);
 assert.match(logic,/const nextTicket=stage==='planned'\?'unknown'/);
 assert.match(logic,/ticketState==='ready'\?'ready':'booked'/);
 assert.match(logic,/if\(stage==='done'\)next\[key\]=true/);
 assert.match(logic,/livekarte-trip-progress-v1/);
 assert.match(logic,/Reisephase selbst festlegen/);
 assert.match(logic,/Geplant/);
 assert.match(logic,/Gebucht/);
 assert.match(logic,/Erledigt/);
 assert.match(logic,/Fahrt manuell als abgeschlossen markiert – kein Ticketnachweis/);
 assert.doesNotMatch(logic,/navigator\.geolocation|fetch\(|Date\.now\(\)>.*?arrival|ticketCodes/);
 assert.equal(C.ticketStates.unknown,'Ungeklärt');
 assert.equal(C.ticketStates.ready,'Vorhanden');
});

test('existing 4-option ticket picker is still accessible and synced to the same exact leg key',()=>{
 assert.match(app,/const ticketState=ticketStatusFor\(activePlanId,trip,i\)/);
 assert.match(app,/const details=node\('details',undefined,'kyoto-ticket-details'\)/);
 assert.match(app,/for\(const \[key,label\] of Object\.entries\(C\.ticketStates\)\)/);
 assert.match(app,/picker\.value=ticketState/);
 assert.match(app,/saveTicketStatus\(activePlanId,trip,i,picker\.value\)/);
 assert.match(app,/plan\.id==='ride-kyoto'\s*\?C\.presetJourney\('takayama-kyoto-2026-11-01'\)/);
 assert.match(app,/update\.plan==='ride-kyoto'\?C\.presetJourney\('takayama-kyoto-2026-11-01'\)/);
 const a=C.ticketLegKey('ride-kyoto',trip,0);
 const b=C.ticketLegKey('ride-kyoto',trip,1);
 assert.notEqual(a,b);
 assert.ok(!a.includes('GPS'));
});

test('Kyoto city plan has legible expandable timeline, compact metrics and honest planned durations',()=>{
 const expected=[
  'id="kyoto-overview"','class="kyoto-day-stats"',
  'So. 01.11. · Anreise und Gion-Abend',
  'Mo. 02.11. · Higashiyama und Fushimi Inari',
  '11:35–14:04','14:26–15:00','15:30–16:15',
  'Gion Shirakawa','Ponto-chō','Kiyomizu-dera','Fushimi Inari',
  'keine Ticketbestätigung','Keine feste ÖPNV-Verbindung zugesichert',
  '03.–06.11.'
 ];
 for(const fragment of expected)assert.ok(html.includes(fragment),fragment);
 assert.match(css,/\.kyoto-day-timeline/);
 assert.match(css,/\.kyoto-day-stats/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(read('sw.js'),/livekarte-shell-pwa-v18/);
});

test('completed journey markers are only locally restored and do not enter public sync snapshots',()=>{
 const begin=app.indexOf('  // Travel progress is explicit and separate from ticket readiness/proof.');
 const end=app.indexOf('  // Restore only explicit local timing preferences',begin);
 assert.ok(begin>0&&end>begin);
 assert.match(app.slice(begin,end),/localStorage\.getItem\('livekarte-trip-progress-v1'\)/);
 const snap=app.slice(app.indexOf('  window.LivekarteExportTicketSnapshot='),app.indexOf('  // Called solely by the optional encrypted inbox'));
 assert.doesNotMatch(snap,/tripStageDone|trip-progress-v1/);
 const updater=app.slice(app.indexOf('  window.LivekarteApplySyncedTicket='),app.indexOf('  // A confirmation link'));
 assert.doesNotMatch(updater,/tripStageDone|trip-progress-v1/);
});
