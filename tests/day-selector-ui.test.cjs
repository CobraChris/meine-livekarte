'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../core.js'),MD=require('../multi-day-core.js'),DC=require('../day-context-core.js');
const UI=require('../day-selector-ui.js');
const plan=C.planPresets.find(x=>x.id==='town-kyoto');
const places=C.presetPlaces('town-kyoto');
const assignments=Object.fromEntries(places.map(p=>[C.placePlanKey(p),['town-kyoto']]));
const dayAssignments=MD.seedDayAssignments(places,assignments,C.placePlanKey,'town-kyoto');
const context=(id,day,extra={})=>DC.resolve({planId:id,day,plan:id==='town-kyoto'?plan:{id,name:'Nikkō-Bahn',kind:'journey'},
 places,assignments,dayAssignments,placeKey:C.placePlanKey,
 placesForPlan:C.placesForPlan,calendar:MD,distance:C.distance,...extra});

function fakeDOM(){
 const elems=Object.create(null);
 function element(tag){
  const added=new Set();
  return {tagName:tag,children:[],dataset:{},attributes:{},textContent:'',title:'',value:'',hidden:false,
   className:'',type:'',
   classList:{add(value){added.add(value)},contains(value){return added.has(value)}},
   setAttribute(name,value){this.attributes[name]=String(value)},
   replaceChildren(...items){this.children=items},
   append(...items){this.children.push(...items)},
   get lastElementChild(){return this.children.at(-1)||null}
  };
 }
 for(const id of ['city-days','city-days-list','plan-day-summary',
  'city-day-brief-title','city-day-brief-summary','city-day-brief-time',
  'city-day-brief-open','city-days-help','fit'])
    elems[id]=element('div');
 elems.fit.append(element('span'));
 const document={createElement:element,getElementById:id=>elems[id]};
 return {elems,document};
}
function overview(days){
 return {querySelectorAll:()=>days.map(day=>({
  querySelector:selector=>selector==='summary strong'
   ?{textContent:day+' · Programm'}:selector==='.kyoto-day-timeline time'
     ?{textContent:'10:30'}:null
 }))};
}

test('Kyoto, Nara and Osaka share identical day-control DOM and goal counters',()=>{
 for(const [date,expected] of [['2026-11-03',4],['2026-11-04',4],['2026-11-05',7]]){
  const {document,elems}=fakeDOM(),picked=[];
  const ui=UI.create({document,calendar:MD,placeKey:C.placePlanKey});
  ui.render({context:context('town-kyoto',date),activeDay:date,
    overview:overview(MD.days('town-kyoto').map(MD.dayLabel)),onSelect:day=>picked.push(day)});
  assert.equal(elems['city-days'].hidden,false);
  assert.equal(elems['city-days-list'].children.length,MD.days('town-kyoto').length+2);
  assert.equal(elems['plan-day-summary'].textContent,
    MD.dayLabel(date)+' · '+expected+' Ziele');
  assert.equal(elems['city-day-brief-open'].hidden,false);
  assert.match(elems['city-day-brief-title'].textContent,/Programm/);
  assert.equal(elems['city-day-brief-time'].textContent,'Planstart: 10:30 · Zeiten Richtwerte');
  assert.equal(elems.fit.lastElementChild.textContent,'Standort und Tagesziele zeigen');
  const active=elems['city-days-list'].children.filter(b=>b.attributes['aria-pressed']==='true');
  assert.equal(active.length,1);
  assert.equal(active[0].dataset.dayDate,date);
  assert.equal(active[0].children[0].textContent,expected+' Ziele');
  elems['city-days-list'].children[1].onclick();
  assert.equal(picked[0],MD.days('town-kyoto')[1],'day press forwarded without changing storage');
 }
});

test('all-day and unassigned views use one shared presentation and no false timetable',()=>{
 const {document,elems}=fakeDOM();
 const ui=UI.create({document,calendar:MD,placeKey:C.placePlanKey});
 ui.render({context:context('town-kyoto',MD.ALL),activeDay:MD.ALL,onSelect:()=>{}});
 assert.equal(elems['city-day-brief-title'].textContent,'Alle Reiseziele in Kyoto');
 assert.equal(elems['city-day-brief-open'].hidden,true);
 assert.equal(elems.fit.lastElementChild.textContent,'Alle Kyoto-Ziele zeigen');
 ui.render({context:context('town-kyoto',MD.UNASSIGNED),activeDay:MD.UNASSIGNED,onSelect:()=>{}});
 assert.equal(elems['city-day-brief-title'].textContent,'Merkliste · noch ohne Datum');
 assert.equal(elems.fit.lastElementChild.textContent,'Merkliste auf Karte zeigen');
 assert.equal(elems['city-day-brief-time'].textContent,'');
});

test('date field in all ordinary place popups forwards selected day; hotels omit it',()=>{
 const {document}=fakeDOM(),clicked=[];
 const ui=UI.create({document,calendar:MD,placeKey:C.placePlanKey});
 const nara=context('town-kyoto','2026-11-04').displayGoals[0];
 const picker=ui.makePlaceDayPicker({place:nara,context:context('town-kyoto','2026-11-04'),
  dayAssignments,onAssign:(place,day)=>clicked.push([place.name,day])});
 assert.equal(picker.className,'place-day-picker');
 const select=picker.children[1];
 assert.equal(select.attributes['aria-label'],'Kalendertag für '+nara.name);
 assert.equal(select.value,'2026-11-04');
 assert.equal(select.children.length,MD.days('town-kyoto').length+1);
 select.value='2026-11-05';select.onchange();
 assert.deepEqual(clicked,[[nara.name,'2026-11-05']]);
 const hotel=places.find(p=>p.category==='hotel');
 assert.equal(ui.makePlaceDayPicker({place:hotel,context:context('town-kyoto','2026-11-04'),dayAssignments,onAssign:()=>{}}),null);
});

test('travel sections without configured calendar hide date controls without touching other sections',()=>{
 const {document,elems}=fakeDOM();
 const ui=UI.create({document,calendar:MD,placeKey:C.placePlanKey});
 const ctx=context('ride-nikko',MD.ALL);
 ui.render({context:ctx,activeDay:MD.ALL,onSelect:()=>{}});
 assert.equal(elems['city-days'].hidden,true);
 assert.equal(elems['plan-day-summary'].hidden,true);
 assert.equal(elems['city-days-list'].children.length,0);
 assert.equal(ui.makePlaceDayPicker({place:places[1],context:ctx,dayAssignments,onAssign:()=>{}}),null);
});

test('shared selector only renders and invokes callbacks, with no storage/GPS/network side effects',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../day-selector-ui.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(ui,/\blocalStorage\.|\bfetch\(|navigator\.geolocation|\.setView\(|\.fitBounds\(/);
 assert.match(app,/const DayUI=window\.LivekarteDaySelectorUI/);
 assert.match(app,/daySelector\.makePlaceDayPicker\(\{place,context:currentDayContext\(\)/);
 assert.match(html,/src="day-selector-ui\.js"/);
 assert.ok(html.indexOf('day-selector-ui.js')<html.indexOf('app.js'));
});
