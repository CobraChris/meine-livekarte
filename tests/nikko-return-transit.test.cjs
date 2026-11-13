'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Core=require('../core.js'),RM=require('../route-model-core.js'),NS=require('../next-step-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('index.html'),app=read('app.js');

test('10 November return route starts at Fairfield and ends at booked Kinshicho hotel',()=>{
 const trip=Core.presetJourney('nikko-tokyo-2026-11-10');
 assert.equal(trip.date,'10.11.2026');
 assert.deepEqual(trip.stops.map(s=>s.name),[
  'Fairfield by Marriott Tochigi Nikko (Hotel)',
  'Tōbu-Nikkō Station',
  'Tokyo Skytree Station (Tōbu)',
  'Oshiage (Skytree-mae) Station · Hanzōmon Z14',
  'Kinshichō Station · Metro Z13',
  'THE skM TOKYO HOTEL & DINING (Hotel)'
 ]);
 assert.deepEqual(trip.stops.slice(0,-1).map(s=>s.mode),
   ['walk','rail','walk','rail','walk']);
 assert.equal(trip.stops[1].departure,'12:55');
 assert.equal(trip.stops[2].arrival,'14:40');
 assert.match(trip.stops[1].description,/STANDARD, Wagen 4, Plätze 05C\/05D/);
 assert.match(trip.stops[1].description,/KEINE Cockpit Lounge/);
 assert.match(trip.stops[1].description,/1\.393 ¥/);
 assert.match(trip.stops[3].leg,/178 ¥/);
 assert.ok(trip.stops.every(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lng)));
 assert.ok(trip.stops.every(s=>!s.description.includes('5594536864')),
   'booking references may not be stored in public data');
});

test('shared map marks only real train legs as rail and does not invent walking geography',()=>{
 const trip=Core.presetJourney('nikko-tokyo-2026-11-10'),route=RM.rail(trip);
 assert.deepEqual(route.segments.map(s=>s.mode),['walk','rail','walk','rail','walk']);
 assert.deepEqual(route.segments.map(s=>s.geometry),
   ['straight','schematic-rail','straight','schematic-rail','straight']);
 assert.ok(route.segments.every(s=>s.distance===null&&s.duration===null));
 assert.ok(route.segments.every(s=>s.style.dashArray));
 assert.equal(route.real,false);
 assert.match(route.note,/keine echten Gehwege/);
});

test('legacy journeys remain all-rail and rail ticket keys remain stable',()=>{
 const old=Core.normalizeJourney({
  title:'10.11. · Nikkō → Tokyo Skytree → Kinshichō',date:'10.11.2026',
  stops:[
   {name:'Tōbu-Nikkō Station',lat:36.74806,lng:139.62008,departure:'12:55'},
   {name:'Tokyo Skytree Station (Tōbu)',lat:35.7109,lng:139.8093,arrival:'14:40'}
  ]
 });
 const current=Core.presetJourney('nikko-tokyo-2026-11-10');
 assert.equal(Core.ticketLegKey('ride-tokyo',old,0),
   Core.ticketLegKey('ride-tokyo',current,1),'preserve existing local ticket links/status');
 assert.equal(old.stops[0].mode,'rail');
 assert.equal(RM.rail(old).segments[0].mode,'rail');
});

test('walk + Metro IC legs do not generate false unresolved tickets or automatic confirmations',()=>{
 const trip=Core.presetJourney('nikko-tokyo-2026-11-10');
 const required=trip.stops.slice(0,-1).filter(s=>s.mode!=='walk'&&s.ticketRequired!==false);
 assert.equal(required.length,1,'only SPACIA X reservation is tracked');
 assert.equal(required[0].name,'Tōbu-Nikkō Station');
 assert.match(app,/stop\.mode!=='walk' && stop\.ticketRequired!==false/);
 assert.match(app,/segment\.mode==='walk'/);
 assert.match(app,/travelmode=walking/);
 assert.match(app,/Google Maps ansehen/);
 assert.doesNotMatch(app.slice(app.indexOf('  function renderJourney()'),app.indexOf('  function renderJourney()',app.indexOf('  function renderJourney()')+1)>0
   ?app.indexOf('  function renderJourney()',app.indexOf('  function renderJourney()')+1)
   :app.length),/localStorage\.clear\(/);
});

test('return day panels show no-taxi route, verified seat class and Suica fare, links open externally',()=>{
 const panel=html.slice(html.indexOf('id="nikko-return-steps"'),
    html.indexOf('id="nikko-help"',html.indexOf('id="nikko-return-steps"')));
 assert.ok(panel.length>2500);
 for(const val of ['10.11.','05C','05D','Wagen 4','Oshiage','Z14','Z13',
  '1.393 ¥','178 ¥','1.571 ¥','2.000 ¥','THE skM TOKYO',
  'travelmode=walking','travelmode=transit','target="_blank" rel="noopener noreferrer"'])
   assert.ok(panel.includes(val),val);
 assert.ok(panel.includes('kostenfreier Hotelshuttle')||panel.includes('Kostenloser Hotelshuttle'));
 assert.match(html,/id="nikko-day-10"/);
 assert.doesNotMatch(panel,/Cockpit-Sitze laut Buchungsplanung/);
 assert.doesNotMatch(panel,/Taxi vor Ort wählen/);
});

test('Nov 10 daily suggestion matches reservation and Suica plan',()=>{
 const now=NS.todaySuggestion(new Date('2026-11-10T01:00:00Z'));
 assert.equal(now.planId,'ride-tokyo');
 assert.match(now.summary,/Oshiage/);
 assert.match(now.hint,/05C\/05D/);
 assert.match(now.hint,/2\.000 ¥/);
});
