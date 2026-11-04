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
 assert.ok(app.includes('const currentDayContext=()=>DC.resolve('));
 assert.ok(app.includes('const visiblePlaces = () => currentDayContext().visiblePlaces'));
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
 assert.match(source,/const mapFocusPlaces = \(\) => currentDayContext\(\)\.mapFocusPlaces/);
 assert.match(source,/function fit\(items = mapFocusPlaces\(\)\)/);
 assert.match(source,/const matching=mapFocusPlaces\(\)/);
 assert.match(source,/const p=mapFocusPlaces\(\)/);
 assert.match(source,/if\(automatic && firstFix && camera\.isFollowing\(\) && activePlanId==='town-kyoto' &&/);
 assert.match(source,/MD\.preferDistantDayView\(visiblePlaces\(\),activeCityDay,position,C\.distance\)/);
 assert.match(source,/if \(camera\.isFollowing\(\)\) centerOnGPS\(ll,Math\.max\(map\.getZoom\(\),15\)\)/);
 assert.match(source,/focusLabel=selected\?'Standort und Tagesziele zeigen'/);
 assert.match(source,/\$\('fit'\)\.title=focusLabel/);
});

test('one-tap 📍 overview includes live GPS and all Nara day goals',()=>{
 const vm=require('node:vm');
 const app=read('app.js');
 const begin=app.indexOf('  function mapOverviewPadding() {');
 const end=app.indexOf('  // City dates are an extra filter',begin);
 assert.ok(begin>=0&&end>begin);
 const part=app.slice(begin,end);
 const preset=C.presetPlaces('town-kyoto');
 const nara=preset.filter(p=>p.schedule?.startsWith('04.11.'));
 const hotel=preset.find(p=>p.category==='hotel');
 assert.equal(nara.length,4);
 const now=Date.now(), kyoto={lat:35.011,lng:135.765};
 const calls=[];
 const mapRect={left:0,right:395,top:55,bottom:815,width:395,height:760};
 const rect=(left,top,right,bottom)=>({
   left,top,right,bottom,width:right-left,height:bottom-top
 });
 const overlays={
   '.plan-picker':{hidden:false,getBoundingClientRect:()=>rect(15,70,365,166)},
   '#place-search':{hidden:false,getBoundingClientRect:()=>rect(15,175,365,269)},
   '#tour-map-tools':{hidden:false,getBoundingClientRect:()=>rect(15,283,315,370)},
   '.map-actions':{hidden:false,getBoundingClientRect:()=>rect(333,280,385,430)}
 };
 const ctx={
  $:id=>id==='map'?{getBoundingClientRect:()=>mapRect}:null,
  document:{querySelector:selector=>overlays[selector]||null},
  mapFocusPlaces:()=>MD.mapFocusPlaces([hotel,...nara],'2026-11-04'),
  filter:'all',watch:1,position:kyoto,positionUpdatedAt:now,
  withCameraView:(mode,action)=>action(),
  Date,Math,map:{
    getSize:()=>({x:395,y:760}),
    fitBounds:(coords,options)=>calls.push({coords,options})
  }
 };
 vm.runInNewContext(part+'\nthis.fitTogether=fitDayGoalsAndPosition;',ctx);
 assert.equal(ctx.fitTogether(),true);
 assert.equal(calls.length,1);
 assert.equal(calls[0].coords.length,5,'four day goals and own position');
 for(const goal of nara){
   assert.ok(calls[0].coords.some(p=>p[0]===goal.lat&&p[1]===goal.lng),goal.name);
 }
 assert.ok(calls[0].coords.some(p=>p[0]===kyoto.lat&&p[1]===kyoto.lng));
 assert.equal(calls[0].options.paddingTopLeft[1],357,
   'topmost location must clear 370px overlay bottom relative to map at 55px plus 42px');
 assert.ok(calls[0].options.paddingBottomRight[0]>=84,'avoid right control rail');
 assert.ok(!calls[0].coords.some(p=>p[0]===hotel.lat&&p[1]===hotel.lng),
   'hotel does not expand goals in daily excursion');
 ctx.watch=null;ctx.position=null;calls.length=0;
 assert.equal(ctx.fitTogether(),false);
 assert.equal(calls[0].coords.length,4,'without GPS show day goals only');
 ctx.watch=1;ctx.position=kyoto;ctx.positionUpdatedAt=now-120000;calls.length=0;
 assert.equal(ctx.fitTogether(),false);
 assert.equal(calls[0].coords.length,4,'stale GPS cannot masquerade as live');
 assert.match(app,/\$\('fit'\)\.onclick = \(\) => \{\s*pauseGPSFollow\(\)/);
 assert.match(app,/if\(!fitDayGoalsAndPosition\(\)\)/);
 assert.match(app,/map\.on\('dragstart', \(\) => \{ if \(!camera\.isProgrammatic\(\)\) pauseGPSFollow\(\); \}\)/);
});

test('combined map overview adapts to tall controls, short viewports and hidden overlays',()=>{
 const vm=require('node:vm'),app=read('app.js');
 const begin=app.indexOf('  function mapOverviewPadding() {');
 const end=app.indexOf('  // The pin is a combined day-trip overview',begin);
 assert.ok(begin>=0&&end>begin);
 const overlays={};
 const rect=(left,top,right,bottom)=>({
   left,top,right,bottom,width:right-left,height:bottom-top
 });
 const frame=rect(0,0,390,940);
 let size={x:390,y:940};
 const ctx={
  $:id=>id==='map'?{getBoundingClientRect:()=>frame}:null,
  document:{querySelector:s=>overlays[s]||null},
  map:{getSize:()=>size},Math
 };
 vm.runInNewContext(app.slice(begin,end)+'\nthis.paddingForTest=mapOverviewPadding;',ctx);
 overlays['.plan-picker']={hidden:false,getBoundingClientRect:()=>rect(10,16,335,116)};
 overlays['#place-search']={hidden:false,getBoundingClientRect:()=>rect(10,120,335,221)};
 overlays['#tour-map-tools']={hidden:false,getBoundingClientRect:()=>rect(10,232,280,312)};
 overlays['.map-actions']={hidden:false,getBoundingClientRect:()=>rect(318,270,382,480)};
 let result=ctx.paddingForTest();
 assert.equal(result.paddingTopLeft[1],354,'marker clears real toolbar bottom plus GPS icon margin');
 assert.ok(result.paddingBottomRight[0]>=94,'side rail keeps eastern marker clear');
 overlays['#tour-map-tools'].getBoundingClientRect=()=>rect(10,232,280,390);
 result=ctx.paddingForTest();
 assert.equal(result.paddingTopLeft[1],432,'expanded top tools get extra clearance');
 overlays['#tour-map-tools'].hidden=true;
 result=ctx.paddingForTest();
 assert.equal(result.paddingTopLeft[1],263,'hidden controls do not reserve space');
 size={x:390,y:390};
 result=ctx.paddingForTest();
 assert.ok(result.paddingTopLeft[1]<=Math.round(390*0.62),
   'tiny fullscreen layouts must still retain space for the destination points');
});

test('daily stop order is exact shortest open route while preserving scheduled first stop',()=>{
 const nara=C.presetPlaces('town-kyoto').filter(p=>p.schedule?.startsWith('04.11.'));
 assert.equal(nara.length,4);
 const result=MD.optimizeDayOrder(nara,C.distance);
 assert.equal(result.length,4);
 assert.equal(result[0].name,'Nara-Park');
 assert.deepEqual(result.map(x=>x.name).sort(),nara.map(x=>x.name).sort());
 const pathDistance=arr=>arr.slice(1).reduce((sum,p,i)=>sum+C.distance(arr[i],p),0);
 function permutations(items){
  if(!items.length)return [[]];
  return items.flatMap((x,i)=>permutations(items.filter((_,j)=>j!==i)).map(rest=>[x,...rest]));
 }
 const optimum=Math.min(...permutations(nara.slice(1)).map(rest=>
   pathDistance([nara[0],...rest])));
 assert.ok(Math.abs(pathDistance(result)-optimum)<0.01,'exact optimal length after first stop');
 assert.deepEqual(MD.optimizeDayOrder([],C.distance),[]);
 assert.deepEqual(MD.optimizeDayOrder([nara[0]],C.distance),[]);
});

test('auto day itinerary is local, numbered and honest; foot-route is a deliberate request',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 for(const id of ['day-route-preview','day-route-stops','day-route-status','day-route-foot'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(app,/renderDayRoutePreview\(\);\s*renderTourBuilder\(\)/);
 assert.match(app,/return currentDayContext\(\)\.orderedStops/);
 assert.match(app,/dashArray:actual\?null:'5 10'/);
 assert.match(app,/className:'day-route-label'/);
 assert.match(app,/dayRouteLayers\.clearLayers\(\)/);
 assert.match(app,/\$\('day-route-foot'\)\.onclick=\(\)=>\{\s*googleDemo\?\.forceOSM\(\);\s*void calculateDailyFootRoute\(\);\s*\}/);
 const fn=app.slice(app.indexOf('  async function calculateDailyFootRoute(){'),
    app.indexOf("  $('day-route-foot').onclick=",app.indexOf('  async function calculateDailyFootRoute(){')));
 assert.match(fn,/W\.optimizedTourRequestUrl\(from,remaining\)/);
 assert.match(fn,/W\.parseOptimizedTour\(JSON\.parse\(raw\),from,remaining\)/);
 assert.doesNotMatch(fn,/position\.lat|position\.lng|navigator\.geolocation/);
 assert.match(fn,/if\(generation!==dayFootGeneration\|\|dailyRouteKey\(dailyStops\(\)\)!==key\)return/);
 assert.match(app,/if\(dayFootController\)dayFootController\.abort\(\)/);
 assert.match(html,/Die Tagesplanung zeigt ohne Netzwerk zunächst eine gestrichelte Luftlinienvorschau/);
 assert.match(css,/\.day-route-number\{/);
});
