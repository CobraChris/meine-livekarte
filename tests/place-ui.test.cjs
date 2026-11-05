'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const PlaceUI=require('../place-ui.js');
const fs=require('node:fs'),path=require('node:path');
function dom(){
 const ids=Object.create(null);
 function elem(tag){
  const classes=new Set();
  return {
   tagName:tag.toUpperCase(),children:[],textContent:'',className:'',hidden:false,
   disabled:false,value:'',title:'',type:'',attributes:{},dataset:{},
   classList:{add(...values){values.forEach(v=>classes.add(v));},
     contains(value){return classes.has(value);}},
   append(...children){this.children.push(...children);},
   replaceChildren(...children){this.children=children;},
   setAttribute(name,value){this.attributes[name]=String(value)},
   querySelector(name){return this.children.find(c=>c.tagName===name.toUpperCase())||null;}
  };
 }
 for(const id of ['places','count','empty','demo','share','clear']){
  ids[id]=elem('div');
 }
 ids.empty.append(elem('h3'),elem('p'));
 return {document:{createElement:elem,getElementById:id=>ids[id]},ids,elem};
}
function all(elem,predicate){
 const matches=[];
 function walk(e){if(predicate(e))matches.push(e);for(const child of e.children||[])walk(child);}
 walk(elem);
 return matches;
}
function setup({selected=false,dated=true,category='sight'}={}){
 const d=dom(),calls=[];
 const place={name:'Nara-Park',lat:34.683,lng:135.845,category,
  description:'Ein Tagesziel in Nara',note:'Extra'};
 const marker={openPopup(){calls.push(['openPopup'])}};
 const sourceAssignments={'Nara-Park':['town-kyoto']};
 const make=(p)=>dated?d.elem('select'):null;
 const button=(p,kind)=>{const b=d.elem('button');b.textContent=kind+' '+p.name;return b;};
 const ui=PlaceUI.create({document:d.document,
  categories:{sight:'Sehenswürdigkeit',restaurant:'Restaurant',station:'Bahnhof',hotel:'Hotel'},
  symbols:{sight:'◇',restaurant:'♨',station:'▤',hotel:'⌂'},
  placeKey:p=>p.name,
  handlers:{
   metric:()=> '2,3 km',
   makePlaceDayPicker:make,
   walkingButton:p=>button(p,'Fußweg'),
   route:p=>button(p,'Google Maps'),
   japaneseButton:p=>button(p,'Japanisch'),
   placeMeta:()=> 'Besuch 60 Minuten',
   appendPlaceTiming:(element,p)=>element.append(d.elem('time')),
   tourIsSelected:()=>selected,
   toggleTourPlace:(p,fromMap)=>calls.push(['tour',p.name,fromMap]),
   openPlaceEditor:p=>calls.push(['edit',p.name]),
   showOnMap:(p,m)=>calls.push(['show',p.name,m===marker]),
   getPlanAssignments:()=>sourceAssignments,
   allPlans:()=>[{id:'all',name:'Alle Orte'},{id:'town-kyoto',name:'Kyoto'},{id:'ride-nikko',name:'Nikkō'}],
   saveAssignment:(p,id)=>calls.push(['assign',p.name,id])
  }
 });
 return {...d,ui,place,marker,calls,sourceAssignments};
}
test('place list header resets consistently for every travel section',()=>{
 const s=setup();
 s.ui.begin({planPlacesCount:4,placesCount:6,activePlanId:'town-kyoto'});
 assert.equal(s.ids.places.children.length,0);
 assert.equal(s.ids.count.textContent,4);
 assert.equal(s.ids.empty.hidden,true);
 assert.equal(s.ids.demo.hidden,true);
 assert.equal(s.ids.share.disabled,false);
 assert.equal(s.ids.clear.disabled,false);
 s.ui.begin({planPlacesCount:0,placesCount:0,activePlanId:'all'});
 assert.equal(s.ids.empty.hidden,false);
 assert.equal(s.ids.demo.hidden,false);
 assert.equal(s.ids.share.disabled,true);
 assert.equal(s.ids.clear.disabled,true);
 assert.match(s.ids.empty.querySelector('h3').textContent,/nächster Ausflug/);
 s.ui.showEmptyFilter();
 assert.equal(s.ids.places.children[0].textContent,'Keine Orte in dieser Kategorie.');
});
test('Nara and other destination popups have same native day, walk, tour and More actions',()=>{
 for(const category of ['sight','restaurant','station','hotel']){
  const s=setup({category});
  const {popup,inPopup}=s.ui.buildPopup(s.place);
  assert.equal(popup.className,'place-popup-pan-surface');
  assert.equal(inPopup.textContent,'2,3 km');
  const headings=all(popup,e=>e.tagName==='STRONG');
  assert.equal(headings[0].textContent,'Nara-Park');
  assert.equal(all(popup,e=>e.className==='place-day-picker').length,0,
   'Day picker may be created by separate controller, not hardcoded into place UI');
  const quick=all(popup,e=>e.className==='popup-quick-actions popup-compact-actions')[0];
  assert.ok(quick);
  assert.equal(quick.children.length,3);
  assert.equal(quick.children[0].textContent,'🚶 Fußweg');
  assert.equal(quick.children[1].className,'tour-pick');
  assert.equal(quick.children[2].tagName,'DETAILS');
  assert.equal(quick.children[2].children[0].textContent,'⋯ Mehr');
  const tour=quick.children[1];
  assert.equal(tour.attributes['aria-pressed'],'false');
  tour.onclick();
  assert.deepEqual(s.calls[0],['tour','Nara-Park',true]);
  const edit=all(popup,e=>e.className==='place-edit')[0];
  edit.onclick();
  assert.deepEqual(s.calls[1],['edit','Nara-Park']);
  assert.equal(all(popup,e=>e.className==='place-popup-description')[0].textContent,s.place.description);
  assert.ok(all(popup,e=>e.className==='place-meta').length>=1);
  assert.equal(all(popup,e=>e.tagName==='TIME').length,1);
  assert.ok(all(popup,e=>e.textContent==='Japanisch Nara-Park').length>0);
  assert.ok(all(popup,e=>e.textContent==='Google Maps Nara-Park').length>0);
 }
});
test('place cards display their title and all actions independent of itinerary',()=>{
 for(const category of ['sight','restaurant','station','hotel']){
  const s=setup({category,selected:true});
  const {card,distance}=s.ui.buildCard(s.place,s.marker);
  assert.equal(card.tagName,'ARTICLE');
  assert.equal(card.className,'place');
  assert.equal(all(card,e=>e.tagName==='H3')[0].textContent,'Nara-Park');
  assert.equal(all(card,e=>e.className==='category')[0].textContent,
   {sight:'Sehenswürdigkeit',restaurant:'Restaurant',station:'Bahnhof',hotel:'Hotel'}[category]);
  assert.equal(distance.textContent,'2,3 km');
  assert.equal(all(card,e=>e.tagName==='TIME').length,1);
  const shown=all(card,e=>e.textContent==='Auf Karte')[0];
  shown.onclick();
  assert.deepEqual(s.calls[0],['show','Nara-Park',true]);
  const tour=all(card,e=>e.className==='tour-pick')[0];
  assert.equal(tour.attributes['aria-pressed'],'true');
  tour.onclick();
  assert.deepEqual(s.calls[1],['tour','Nara-Park',undefined]);
  const edit=all(card,e=>e.className==='place-edit')[0];
  edit.onclick();
  assert.deepEqual(s.calls[2],['edit','Nara-Park']);
  s.ui.appendCard(card);
  assert.equal(s.ids.places.children[0],card);
 }
});
test('changing the travel-section selector delegates without mutating data in presentation',()=>{
 const s=setup();
 const {card}=s.ui.buildCard(s.place,s.marker);
 const select=all(card,e=>e.className==='place-plan-select')[0];
 assert.ok(select);
 assert.equal(select.attributes['aria-label'],'Ort Nara-Park einem Reiseabschnitt zuordnen');
 assert.equal(select.children.length,3);
 assert.equal(select.children[1].value,'town-kyoto');
 assert.equal(select.children[1].selected,true);
 select.value='ride-nikko';select.onchange();
 assert.deepEqual(s.calls,[['assign','Nara-Park','ride-nikko']]);
 assert.deepEqual(s.sourceAssignments,{'Nara-Park':['town-kyoto']});
});
test('one portable place presentation and no GPS/network/storage/Leaflet calls',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../place-ui.js'),'utf8');
 const app=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
 assert.doesNotMatch(ui,/\blocalStorage\.|\bfetch\(|navigator\.geolocation|L\.marker\(|map\.setView\(/);
 assert.match(app,/const PlaceUI=window\.LivekartePlaceUI/);
 assert.match(app,/const \{popup,inPopup\}=placeUI\.buildPopup\(p\)/);
 assert.match(app,/const \{card,distance\}=placeUI\.buildCard\(p,marker\)/);
 assert.match(app,/distanceDisplays\.push\(\{place:p,inPopup,inList:distance\}\)/);
 assert.match(html,/src="place-ui\.js"/);
 assert.ok(html.indexOf('place-ui.js')<html.indexOf('app.js'));
 assert.match(sw,/'place-ui\.js'/);
});
