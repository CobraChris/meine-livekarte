const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const MD=require('../multi-day-core.js');
const C=require('../core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const key=C.placePlanKey;
const hotel={name:'Tomoya',lat:35,lng:135,category:'hotel'};
const a={name:'Kiyomizu-dera',lat:34.99,lng:135.78,category:'sight',schedule:'02.11. · 09:45–11:15'};
const b={name:'Gion',lat:35.01,lng:135.77,category:'sight',schedule:'01.11. · Abend'};
const c={name:'Neues Café',lat:35.02,lng:135.75,category:'restaurant'};
const places=[hotel,a,b,c];

test('Kyoto is one city with six real date selectors; unknown plans remain untouched',()=>{
 assert.deepEqual(MD.days('town-kyoto'),[
 '2026-11-01','2026-11-02','2026-11-03',
 '2026-11-04','2026-11-05','2026-11-06']);
 assert.deepEqual(MD.days('ride-kyoto'),[]);
 assert.equal(MD.defaultDay('town-kyoto','2026-11-02'),'2026-11-02');
 assert.equal(MD.defaultDay('town-kyoto','2026-12-12'),'all');
 assert.equal(MD.dayLabel('2026-11-04'),'04.11.');
 assert.equal(MD.dayLabel('unassigned'),'Merkliste');
});
test('seed known places by dated schedule once without assigning hotel or inventing later plans',()=>{
 const assignments=Object.fromEntries(places.map(p=>[key(p),['town-kyoto']]));
 const result=MD.seedDayAssignments(places,assignments,key,'town-kyoto');
 assert.equal(result[key(a)],'2026-11-02');
 assert.equal(result[key(b)],'2026-11-01');
 assert.equal(result[key(c)],undefined);
 assert.equal(result[key(hotel)],undefined);
 assert.equal(MD.fromSchedule('01.–06.11. · Unterkunft'),'');
});
test('day filter preserves hotel; moving/unassigning is local and never changes input',()=>{
 const first=Object.fromEntries([[key(a),'2026-11-02'],[key(b),'2026-11-01']]);
 const seen=MD.selected(places,first,'2026-11-02',key);
 assert.deepEqual(seen.map(p=>p.name),['Tomoya','Kiyomizu-dera']);
 assert.deepEqual(MD.selected(places,first,'unassigned',key).map(p=>p.name),['Tomoya','Neues Café']);
 const moved=MD.change(first,key(b),'2026-11-05');
 assert.equal(moved[key(b)],'2026-11-05');
 assert.equal(first[key(b)],'2026-11-01');
 assert.deepEqual(MD.selected(places,moved,'2026-11-05',key).map(p=>p.name),['Tomoya','Gion']);
 const removed=MD.change(moved,key(b),'unassigned');
 assert.equal(removed[key(b)],undefined);
 assert.throws(()=>MD.change(moved,key(b),'2026-12-01'),/Ungültiger/);
});
test('only known saved marker keys and permitted dates are restored',()=>{
 const raw=Object.fromEntries([
  [key(a),'2026-11-04'],[key(b),'2027-11-02'],
  ['unknown','2026-11-05'],['__proto__','2026-11-03']
 ]);
 const cleaned=MD.cleanAssignments(raw,places,key);
 assert.equal(cleaned[key(a)],'2026-11-04');
 assert.equal(cleaned[key(b)],undefined);
 assert.equal(cleaned.unknown,undefined);
});
test('UI and deployment preserve itinerary while adding per-day tours',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 for(const id of ['city-days','city-days-title','city-days-list','city-days-help'])
   assert.ok(html.includes('id="'+id+'"'));
 assert.ok(app.includes('MD.selected(currentPlaces()'));
 assert.ok(app.includes("livekarte-city-day-assignments-v1"));
 assert.ok(app.includes("tourContextKey()"));
 assert.ok(app.includes('renderCityDays()'));
 assert.ok(app.includes("data-day-date"));
 assert.ok(app.includes('setDayAssignment('));
 assert.ok(html.includes('src="multi-day-core.js"'));
 assert.ok(css.includes('.city-days[hidden]'));
 const workflow=read('.github/workflows/pages.yml'),sw=read('sw.js'),
 stamp=read('scripts/stamp_pwa_version.py');
 assert.ok(workflow.includes('cp multi-day-core.js public/'));
 assert.ok(workflow.includes('node --check multi-day-core.js'));
 assert.ok(sw.includes("'multi-day-core.js'"));
 assert.ok(stamp.includes('("src", "multi-day-core.js")'));
 assert.ok(!sw.includes('ticket-backup.json'));
});


test('renaming or deleting a saved place also migrates separate calendar mapping',()=>{
  const app=read('app.js');
  const from=app.indexOf('  function commitPlaceEditor(changes){');
  const to=app.indexOf("  $('edit-place-close').onclick=",from);
  assert.ok(from>=0&&to>from);
  const part=app.slice(from,to);
  assert.ok(part.includes('const assignedDay=nextCityDays[oldKey]'));
  assert.ok(part.includes('delete nextCityDays[oldKey]'));
  assert.ok(part.includes("cityDays:'livekarte-city-day-assignments-v1'"));
  assert.ok(part.includes('localStorage.setItem(storageKeys.cityDays,JSON.stringify(nextCityDays))'));
  assert.ok(part.includes('cityDayAssignments=nextCityDays'));
  const helper=app.slice(app.indexOf('  function appendPlaceTiming(target,p)'),
                         app.indexOf('  function metric(p)'));
  assert.ok(helper.includes('Uhrzeiten nicht automatisch übertragen'));
  assert.ok(app.includes('Der bestätigte wetteroptimierte Plan ist in der Tagesauswahl'));
});

test('Nara/Osaka day trips fit only their goals, not the Kyoto hotel',()=>{
 const preset=C.presetPlaces('town-kyoto');
 const nara=preset.filter(p=>p.schedule?.startsWith('04.11.'));
 const osaka=preset.filter(p=>p.schedule?.startsWith('05.11.'));
 const kyotoHotel=preset.find(p=>p.category==='hotel');
 assert.ok(kyotoHotel&&nara.length===4&&osaka.length>0);
 assert.deepEqual(MD.mapFocusPlaces([kyotoHotel,...nara],'2026-11-04'),nara);
 assert.deepEqual(MD.mapFocusPlaces([kyotoHotel,...osaka],'2026-11-05'),osaka);
 assert.deepEqual(MD.mapFocusPlaces([kyotoHotel,...nara],'all'),[kyotoHotel,...nara]);
 assert.deepEqual(MD.mapFocusPlaces([kyotoHotel],'2026-11-04'),[kyotoHotel]);
});
test('GPS auto-start keeps far day-trip view while recording location; nearby goals still follow GPS',()=>{
 const preset=C.presetPlaces('town-kyoto');
 const nara=preset.filter(p=>p.schedule?.startsWith('04.11.'));
 const kyoto=preset.filter(p=>p.schedule?.startsWith('03.11.'));
 const here={lat:35.013,lng:135.765};
 assert.equal(MD.preferDistantDayView(nara,'2026-11-04',here,C.distance),true);
 assert.equal(MD.preferDistantDayView(kyoto,'2026-11-03',here,C.distance),false);
 assert.equal(MD.preferDistantDayView(nara,'all',here,C.distance),false);
 assert.equal(MD.preferDistantDayView([], '2026-11-04',here,C.distance),false);
 assert.equal(MD.preferDistantDayView(nara,'2026-11-04',{lat:34.684,lng:135.843},C.distance),false);
 const source=read('app.js');
 assert.match(source,/const mapFocusPlaces = \(\) => activePlanId==='town-kyoto'/);
 assert.match(source,/function fit\(items = mapFocusPlaces\(\)\)/);
 assert.match(source,/const matching=mapFocusPlaces\(\)/);
 assert.match(source,/const p=mapFocusPlaces\(\)/);
 assert.match(source,/if\(automatic && firstFix && following && activePlanId==='town-kyoto' &&/);
 assert.match(source,/MD\.preferDistantDayView\(visiblePlaces\(\),activeCityDay,position,C\.distance\)/);
 assert.match(source,/if \(following\) centerOnGPS\(ll,Math\.max\(map\.getZoom\(\),15\)\)/);
 assert.match(source,/focusLabel=selected\?'Tagesziele zeigen'/);
 assert.match(source,/\$\('fit'\)\.title=focusLabel/);
});
