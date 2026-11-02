const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Core=require('../core.js'),NS=require('../next-step-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');

test('Nikko itinerary is a standalone date-bounded journey; Kyoto remains intact',()=>{
  const ids=Core.planPresets.map(x=>x.id);
  assert.ok(ids.includes('ride-kyoto'));
  assert.ok(ids.includes('town-kyoto'));
  assert.ok(ids.includes('ride-nikko'));
  assert.ok(ids.includes('town-nikko'));
  assert.equal(new Set(ids).size,ids.length);
  const journey=Core.presetJourney('kyoto-nikko-2026-11-07');
  assert.equal(journey.date,'07.11.2026');
  assert.equal(journey.stops.length,4);
  assert.deepEqual(journey.stops.map(x=>x.name),
    ['Kyoto Station','Tokyo Station','Utsunomiya Station','Nikkō Station (JR)']);
  assert.equal(journey.stops[0].departure,'11:01');
  assert.equal(journey.stops[1].arrival,'','Tokyo arrival time must not be guessed');
  assert.equal(journey.stops[1].departure,'14:00');
  assert.equal(journey.stops[2].arrival,'14:48');
  assert.equal(journey.stops[2].departure,'15:15');
  assert.equal(journey.stops[3].arrival,'15:58');
  assert.ok(journey.stops[0].leg.includes('Nozomi 12'));
  assert.ok(journey.stops[1].leg.includes('Yamabiko 141'));
  assert.ok(journey.stops[2].leg.includes('JR Nikkō-Linie'));
  assert.match(journey.stops[0].description,/prüfen/);
  assert.match(journey.stops[3].description,/nicht direkt am Bahnhof/);
  assert.equal(Core.presetJourney('takayama-kyoto-2026-11-01').stops.length,3);
  assert.match(Core.planPresets.find(x=>x.id==='town-nikko').name,/Nikkō/);
});

test('Nikko hotel and both distinct stations have markers but never masquerade as identical interchange',()=>{
  const places=Core.presetPlaces('town-nikko');
  assert.equal(places.length,3);
  const hotel=places.find(x=>x.category==='hotel');
  const jr=places.find(x=>x.name==='Nikkō Station (JR)');
  const tobu=places.find(x=>x.name==='Tōbu-Nikkō Station');
  assert.ok(hotel&&jr&&tobu);
  assert.match(hotel.note,/1541-3 Tokorono/);
  assert.match(hotel.note,/30 Min./);
  assert.match(hotel.note,/keine Speisen vor Ort/);
  assert.equal(jr.category,'station');
  assert.equal(tobu.category,'station');
  assert.ok(Core.distance(jr,tobu)>100,'different platforms and operators');
  assert.ok(Core.distance(jr,hotel)>1000,'hotel is not at the JR station');
  assert.equal(Core.presetPlaces('town-kyoto').length>0,true);
});

test('Nikko suggestions arrive on Nov 7 and stop guessing beyond known dates',()=>{
  const at=day=>new Date(day);
  const before=NS.todaySuggestion(at('2026-11-06T14:59:00Z'));
  assert.equal(before.planId,'town-kyoto');
  const leaving=NS.todaySuggestion(at('2026-11-06T15:00:00Z'));
  assert.equal(leaving.planId,'ride-nikko');
  assert.match(leaving.summary,/Utsunomiya/);
  assert.match(leaving.hint,/keine Live-Fahrzeiten/);
  assert.equal(NS.todaySuggestion(at('2026-11-07T15:00:00Z')).planId,'town-nikko');
  assert.equal(NS.todaySuggestion(at('2026-11-08T15:00:00Z')),null);
  assert.equal(NS.isPastTravelView('ride-nikko',at('2026-11-07T14:59:00Z')),false);
  assert.equal(NS.isPastTravelView('ride-nikko',at('2026-11-07T15:00:00Z')),true);
});

test('Nikko itinerary panel is informational with hotel links and no false completion states',()=>{
  const section=html.slice(html.indexOf('id="nikko-overview"'),
    html.indexOf('id="kyoto-overview"'));
  assert.ok(section.length>1000);
  assert.match(section,/07\.11\.2026/);
  assert.match(section,/Nozomi 12/);
  assert.match(section,/Yamabiko 141/);
  assert.match(section,/27 Minuten/);
  assert.match(section,/JR Nikkō-Linie/);
  assert.match(section,/15:58/);
  assert.match(section,/Fairfield by Marriott Tochigi Nikko/);
  assert.match(section,/keine Live-Fahrzeiten/);
  assert.match(section,/Gleise oder Ticketstatus werden live abgeglichen/);
  assert.match(section,/www\.marriott\.com/);
  assert.match(section,/www\.google\.com\/maps\/search/);
  assert.doesNotMatch(section,/type="checkbox"|✓ Erledigt|Gebucht · vorhanden/);
  assert.match(app,/activePlanId === 'ride-nikko' \? C\.presetJourney\('kyoto-nikko-2026-11-07'\)/);
  assert.match(app,/renderNikkoOverview\(\)/);
  assert.match(app,/nikkoOverview\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
  assert.match(css,/\.nikko-overview \.nikko-help/);
});

test('one-time Nikko migration only adds missing location pins, keeping user edits and tickets',()=>{
  const begin=app.indexOf('  function seedNikkoPlaces(){');
  const end=app.indexOf('  seedNikkoPlaces();',begin);
  assert.ok(begin>0&&end>begin);
  const snippet=app.slice(begin,end);
  assert.match(snippet,/const marker='livekarte-nikko-2026-11-07-v1'/);
  assert.match(snippet,/if\(localStorage\.getItem\(marker\)==='1'\)return/);
  assert.match(snippet,/const existing=places\.find/);
  assert.match(snippet,/if\(!existing\)additions\.push\(candidate\)/);
  assert.match(snippet,/const merged=C\.merge\(places,additions\)/);
  assert.match(snippet,/const next=Object\.assign\(Object\.create\(null\),planAssignments\)/);
  assert.match(snippet,/localStorage\.setItem\('livekarte-places-v1'/);
  assert.match(snippet,/localStorage\.setItem\('livekarte-plan-assignments-v1'/);
  assert.match(snippet,/localStorage\.setItem\(marker,'1'\)/);
  assert.doesNotMatch(snippet,/localStorage\.clear|indexedDB|ticketStatuses\[|tripStageDone\[/);
});


test('Kyoto recap offers an explicit one-tap transition to the Nikko journey',()=>{
  const start=html.indexOf('id="kyoto-overview"');
  const end=html.indexOf('<div class="toolbar">',start);
  assert.ok(start>0&&end>start);
  const section=html.slice(start,end);
  assert.match(section,/<button type="button" id="open-nikko-next" class="kyoto-next-leg">/);
  assert.match(section,/Fahrt Kyoto → Nikkō am 07\\.11\\. öffnen/);
  const handler=app.slice(app.indexOf("  $('open-nikko-next').onclick="),
    app.indexOf("  $('quick-today').onclick="));
  assert.match(handler,/selectPlan\\('ride-nikko'\\)/);
  assert.match(handler,/nikkoOverview\\.scrollIntoView/);
  assert.doesNotMatch(handler,/ticketStatuses|ticketVault|tripStageDone|localStorage\\.clear/);
  assert.match(css,/\\.kyoto-next-leg\\{/);
});
