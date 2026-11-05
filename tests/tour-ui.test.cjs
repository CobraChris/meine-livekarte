const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const TourUI=require('../tour-ui.js');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

function fixture(){
  const all=new Map(),events=[];
  function el(tag){
    const result={
      tag,children:[],attributes:{},textContent:'',value:'',type:'',disabled:false,
      hidden:false,open:false,title:'',className:'',scrollOptions:null,
      append(...nodes){this.children.push(...nodes);},
      replaceChildren(...nodes){this.children=nodes;},
      setAttribute(k,v){this.attributes[k]=v;},
      scrollIntoView(options){this.scrollOptions=options;}
    };
    return result;
  }
  const document={createElement:el,getElementById(id){
    if(!all.has(id))all.set(id,el(id));
    return all.get(id);
  }};
  const $=id=>document.getElementById(id);
  let selectedCount=2;
  const handlers={
    selectMapMode:()=>events.push(['mapMode']),
    selectMapPick:()=>events.push(['mapPick']),
    finishMapPick:()=>events.push(['mapDone']),
    selectedCount:()=>selectedCount,
    setSelection:places=>{selectedCount=places.length;events.push(['selection',places.map(p=>p.name)]);},
    removeStop:p=>events.push(['remove',p.name]),
    calculate:optimized=>events.push(['calculate',optimized]),
    dayStopMinutes:p=>p.name==='First'?60:45,
    setVisitMinutes:(p,n)=>events.push(['visit',p.name,n]),
    setOpening:(p,t)=>events.push(['opening',p.name,t]),
    setClosing:(p,t)=>events.push(['closing',p.name,t]),
    setStart:t=>events.push(['start',t]),
    setBuffer:t=>events.push(['buffer',t]),
    setLunch:t=>events.push(['lunch',t]),
    refreshDayPlan:()=>events.push(['refresh']),
    toggleLiveTour:()=>events.push(['live-toggle']),
    nextLiveStop:()=>events.push(['live-next']),
    retryLiveRoute:()=>events.push(['live-retry'])
  };
  const dayPlanCore={visitMinutes:duration=>duration==='60 Min.'?60:null,
    clockText:m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')};
  const walkingCore={distanceText:m=>m+' m',durationText:seconds=>
    Math.round(seconds/60)+' Min.'};
  const ui=TourUI.create({document,dayPlanCore,walkingCore,handlers});
  const first={name:'First',duration:'60 Min.'},second={name:'Second'};
  return {$,ui,events,first,second,handlers};
}
test('tour controls are defined once and keep map pick state and accessible count',()=>{
 const f=fixture();f.ui.bind();
 f.ui.renderMapControls({picking:true,count:2});
 assert.equal(f.$('tour-map-mode').attributes['aria-pressed'],'true');
 assert.equal(f.$('tour-map-counter').textContent,'2/6 Ziele · Kartenpins antippen');
 assert.equal(f.$('tour-map-counter').hidden,false);
 assert.equal(f.$('tour-map-done').textContent,'Fertig · 2');
 assert.equal(f.$('tour-pick-on-map').attributes['aria-pressed'],'true');
 f.$('tour-map-mode').onclick();f.$('tour-pick-on-map').onclick();
 f.$('tour-map-done').onclick();
 assert.deepEqual(f.events.slice(0,3),[['mapMode'],['mapPick'],['mapDone']]);
 assert.equal(f.$('tour-builder').open,true);
 assert.equal(f.$('tour-builder').scrollOptions.block,'start');
 assert.match(f.$('tour-builder-status').textContent,/Jetzt Route optimieren/);
 f.ui.renderMapControls({picking:false,count:6});
 assert.equal(f.$('tour-map-counter').hidden,true);
 assert.equal(f.$('tour-map-done').hidden,true);
 assert.match(f.$('tour-map-counter').textContent,/Maximum erreicht/);
 assert.equal(f.$('tour-pick-on-map').attributes['aria-pressed'],'false');
});
test('tour list offers reorder/remove, preserves stop objects and never modifies its inputs',()=>{
 const f=fixture();f.ui.bind();
 const input=[f.first,f.second];
 f.ui.renderTourBuilder({selected:input,calculating:false,hasRoute:false});
 assert.equal(f.$('tour-count').textContent,'2/6 Ziele');
 assert.equal(f.$('tour-stops').children.length,2);
 assert.equal(f.$('tour-calculate').disabled,false);
 const [one,two]=f.$('tour-stops').children;
 assert.equal(one.children[0].textContent,'1');
 assert.equal(one.children[1].textContent,'First');
 assert.equal(one.children[1].children[0].textContent,'Besuch: 60 Min.');
 const firstControls=one.children[2].children;
 assert.equal(firstControls[0].disabled,true);
 assert.equal(firstControls[1].disabled,false);
 firstControls[1].onclick();
 assert.deepEqual(f.events.at(-1),['selection',['Second','First']]);
 assert.deepEqual(input,[f.first,f.second]);
 assert.equal(f.$('tour-builder').open,true);
 assert.match(f.$('tour-builder-status').textContent,/Reihenfolge angepasst/);
 const secondControls=two.children[2].children;
 assert.equal(secondControls[1].disabled,true);
 secondControls[2].onclick();
 assert.deepEqual(f.events.at(-1),['remove','Second']);
 f.ui.renderTourBuilder({selected:input,calculating:true,hasRoute:true});
 assert.equal(f.$('tour-optimize').disabled,true);
 assert.equal(f.$('tour-calculate').disabled,true);
});
test('empty tour list disables calculation but never removes saved place data',()=>{
 const f=fixture();f.ui.bind();
 f.ui.renderTourBuilder({selected:[],calculating:false,hasRoute:false});
 assert.equal(f.$('tour-stops').children[0].textContent,'Noch keine Ziele ausgewählt.');
 assert.equal(f.$('tour-calculate').disabled,true);
 assert.equal(f.$('tour-clear').disabled,true);
 assert.match(f.$('tour-builder-status').textContent,/Wähle zunächst zwei bis sechs/);
 f.$('tour-clear').onclick();
 assert.deepEqual(f.events.at(-1),['selection',[]]);
 assert.match(f.$('tour-builder-status').textContent,/Deine gespeicherten Orte bleiben erhalten/);
 f.$('tour-optimize').onclick();f.$('tour-calculate').onclick();
 assert.deepEqual(f.events.slice(-2),[['calculate',true],['calculate',false]]);
});
test('day stop setting fields validate and persist only through supplied callbacks',()=>{
 const f=fixture();f.ui.bind();
 f.ui.renderDayControls({
   prefs:{start:'10:30',buffer:10,lunch:45},
   stops:[f.first,f.second],
   stopPrefs:p=>p===f.first?{open:'09:00',close:'17:00'}:{},
   visitMinutes:p=>p===f.first?60:45
 });
 assert.equal(f.$('day-start').value,'10:30');
 assert.equal(f.$('day-buffer').value,'10');
 assert.equal(f.$('day-lunch').value,'45');
 const first=f.$('day-stop-settings').children[0];
 assert.equal(first.children[0].textContent,'1. First');
 const inputs=first.children[2].children.map(label=>label.children[0]);
 assert.deepEqual(inputs.map(x=>x.type),['number','time','time']);
 assert.equal(inputs[0].value,'60');
 assert.equal(inputs[0].min,'5');
 assert.equal(inputs[1].value,'09:00');
 inputs[0].value='75';inputs[0].onchange();
 inputs[1].value='10:00';inputs[1].onchange();
 inputs[2].value='18:00';inputs[2].onchange();
 assert.deepEqual(f.events.slice(-3),[
   ['visit','First','75'],['opening','First','10:00'],['closing','First','18:00']]);
 const second=f.$('day-stop-settings').children[1];
 assert.match(second.children[1].textContent,/45 Min. als Schätzung/);
 f.$('day-start').value='09:30';f.$('day-start').onchange();
 f.$('day-buffer').value='15';f.$('day-buffer').onchange();
 f.$('day-lunch').value='30';f.$('day-lunch').onchange();
 f.$('day-plan-refresh').onclick();
 assert.deepEqual(f.events.slice(-4),[
   ['start','09:30'],['buffer','15'],['lunch','30'],['refresh']]);
});
test('new UI is wired before app, included in offline shell and has no transport/persistence',()=>{
 const ui=read('tour-ui.js'),app=read('app.js'),html=read('index.html'),
   sw=read('sw.js'),workflow=read('.github/workflows/pages.yml'),
   stamp=read('scripts/stamp_pwa_version.py');
 assert.match(app,/const tourUI=window\.LivekarteTourUI\.create\(/);
 assert.match(app,/tourUI\.bind\(\)/);
 assert.match(app,/tourUI\.renderTourBuilder\(/);
 assert.match(app,/tourUI\.renderDayControls\(/);
 assert.match(app,/tourUI\.renderMapControls\(/);
 assert.ok(html.indexOf('src="tour-ui.js"')<html.indexOf('src="app.js"'));
 assert.match(sw,/'tour-ui\.js'/);
 assert.match(workflow,/node --check tour-ui\.js/);
 assert.match(workflow,/cp multi-day-core\.js day-context-core\.js day-selector-ui\.js place-ui\.js tour-ui\.js/);
 assert.match(stamp,/\("src", "tour-ui\.js"\)/);
 assert.doesNotMatch(ui,/\blocalStorage\b|sessionStorage|\bfetch\(|\bgeolocation\b|navigator\.|getCurrentPosition|watchPosition/);
 assert.doesNotMatch(ui,/\bJSON\.stringify\b|indexedDB|setInterval/);
});


test('verified OSRM results render the same multi-stop summary, leg sequence and map HUD',()=>{
 const f=fixture();
 f.ui.renderCalculatedTour({
   ordered:[f.first,f.second],
   result:{distance:920,duration:660,legs:[
     {distance:340,duration:240},{distance:580,duration:420}]}
 });
 assert.equal(f.$('tour-route-title').textContent,'🚶 Rundgang · 2 Ziele');
 assert.equal(f.$('tour-route-metrics').textContent,'920 m · ca. 11 Min. zu Fuß');
 assert.equal(f.$('tour-route-note').textContent,
   'Start am GPS-Punkt bei Berechnung · keine automatische Aktualisierung');
 assert.equal(f.$('tour-route-hud').hidden,false);
 assert.equal(f.$('tour-result').hidden,false);
 assert.equal(f.$('tour-result-summary').textContent,f.$('tour-route-metrics').textContent);
 assert.deepEqual(f.$('tour-result-legs').children.map(x=>x.textContent),[
   'Standort → First: 340 m · 4 Min.',
   'Stopp 1 → Second: 580 m · 7 Min.'
 ]);
 // Rendering a newly calculated tour replaces the old legs, not appends.
 f.ui.renderCalculatedTour({ordered:[f.second],
   result:{distance:90,duration:60,legs:[{distance:90,duration:60}]}});
 assert.equal(f.$('tour-result-legs').children.length,1);
 assert.equal(f.$('tour-route-title').textContent,'🚶 Rundgang · 1 Ziele');
});
test('day results show exact schedule legs, visits, warning details and lunch/buffer',()=>{
 const f=fixture();
 const schedule={
   start:630,end:1030,walkingMinutes:23,visitingMinutes:170,
   unknownHours:1,lunchScheduled:false,
   warnings:['Fenster prüfen'],
   items:[{
     index:1,name:'First',depart:630,arrival:645,visitStart:650,visitEnd:710,
     legMeters:580,legMinutes:15,visitMinutes:60,wait:5,
     hoursKnown:true,opening:650,closing:800,windowWarning:'Schließt bald',
     schedule:'Nur heute',note:'Sonderzugang',lunchAfter:45,bufferAfter:10
   },{
     index:2,name:'Second',depart:765,arrival:773,visitStart:775,visitEnd:885,
     legMeters:300,legMinutes:8,visitMinutes:110,wait:0,
     hoursKnown:false,windowWarning:'',schedule:'',note:'',lunchAfter:0,bufferAfter:0
   }]
 };
 f.ui.renderDaySchedule({schedule,pref:{lunch:45},stopsCount:2});
 assert.equal(f.$('day-plan-output').hidden,false);
 assert.equal(f.$('day-plan-state').textContent,'10:30–17:10');
 assert.match(f.$('day-plan-summary').textContent,/23 Min. Gehzeit · 170 Min. Besichtigung/);
 const timeline=f.$('day-plan-timeline').children;
 assert.equal(timeline.length,2);
 assert.equal(timeline[0].children[0].textContent,'Stopp 1 · First');
 assert.match(timeline[0].children[1].textContent,/580 m · 15 Min./);
 assert.ok(timeline[0].children.some(x=>x.textContent.includes('60 Min.')));
 assert.ok(timeline[0].children.some(x=>x.textContent.includes('Öffnungsfenster')));
 assert.ok(timeline[0].children.some(x=>x.textContent.includes('Schließt bald')));
 assert.ok(timeline[0].children.some(x=>x.textContent.includes('Mittagspause')));
 assert.ok(timeline[0].children.some(x=>x.textContent.includes('Zeitpuffer')));
 assert.ok(timeline[1].children.some(x=>x.textContent.includes('Öffnungszeiten nicht hinterlegt')));
 assert.equal(f.$('day-plan-warnings').children.length,3);
 assert.match(f.$('day-plan-warnings').children[0].textContent,/1 von 2 Zielen/);
 assert.match(f.$('day-plan-warnings').children[1].textContent,/Mittagspause passt nicht/);
 assert.match(f.$('day-plan-warnings').children[2].textContent,/Fenster prüfen/);
 assert.match(f.$('day-plan-alert').textContent,/Schätzwerte/);
 f.ui.renderDaySchedule({schedule:{...schedule,items:[],warnings:[],unknownHours:0,lunchScheduled:true},
   pref:{lunch:0},stopsCount:0});
 assert.equal(f.$('day-plan-timeline').children.length,0);
 assert.equal(f.$('day-plan-warnings').children.length,0);
});
test('missing and invalid routes cannot show stale calculated itineraries',()=>{
 const f=fixture();
 f.$('day-plan-output').hidden=false;
 f.ui.showDayPlanMissing();
 assert.equal(f.$('day-plan-output').hidden,true);
 assert.equal(f.$('day-plan-state').textContent,'Route fehlt');
 assert.match(f.$('day-plan-alert').textContent,/Ohne echte Gehzeiten/);
 f.$('day-plan-output').hidden=false;
 f.ui.showDayPlanError(new Error('Ungültiges Zeitfenster'));
 assert.equal(f.$('day-plan-output').hidden,true);
 assert.equal(f.$('day-plan-state').textContent,'Angaben prüfen');
 assert.equal(f.$('day-plan-alert').textContent,'Ungültiges Zeitfenster');
});
test('only the presentation is extracted; app keeps build, GPS/network and persistence',()=>{
 const ui=read('tour-ui.js'),app=read('app.js');
 assert.match(ui,/function renderCalculatedTour\(/);
 assert.match(ui,/function renderDaySchedule\(/);
 assert.match(ui,/function showDayPlanMissing\(/);
 assert.match(ui,/function showDayPlanError\(/);
 assert.match(app,/tourUI\.renderCalculatedTour\(\{ordered,result\}\)/);
 assert.match(app,/tourUI\.renderDaySchedule\(\{schedule,pref,stopsCount:stops\.length\}\)/);
 assert.match(app,/const schedule=D\.build\(/);
 assert.match(app,/const tourView=RM\.walking\(/);
 assert.match(app,/routeRequests\.request\(\{kind:'tour',url:request,controller\}\)/);
 assert.match(read('routing-requests.js'),/fetcher\(url,\{/);
 assert.match(app,/localStorage\.setItem\('livekarte-day-plans-v1'/);
 assert.match(app,/localStorage\.setItem\('livekarte-tour-drafts-v1'/);
 assert.doesNotMatch(ui,/fetch\(|localStorage|navigator\.geolocation|indexedDB|window\.location/);
});


test('GPS tour status UI binds three controls once to state-owner callbacks',()=>{
 const f=fixture();f.ui.bind();
 f.$('tour-live-toggle').onclick();
 f.$('tour-live-next').onclick();
 f.$('tour-live-retry').onclick();
 assert.deepEqual(f.events.slice(-3),[['live-toggle'],['live-next'],['live-retry']]);
});
test('GPS tour idle and start states do not leave stale route or GPS warnings',()=>{
 const f=fixture();
 f.ui.renderLiveNavigation({phase:'gps-required'});
 assert.equal(f.$('tour-live-state').hidden,false);
 assert.match(f.$('tour-live-message').textContent,/aktuellen Standort/);
 f.ui.renderLiveNavigation({phase:'started'});
 assert.equal(f.$('tour-live-state').hidden,false);
 assert.equal(f.$('tour-live-next').hidden,false);
 assert.equal(f.$('tour-live-retry').hidden,true);
 assert.equal(f.$('tour-live-toggle').textContent,'Ⅱ Tour pausieren');
 assert.equal(f.$('tour-live-toggle').attributes['aria-pressed'],'true');
 f.ui.renderLiveNavigation({phase:'reset'});
 assert.equal(f.$('tour-live-state').hidden,true);
 assert.equal(f.$('tour-live-step').textContent,'');
 assert.equal(f.$('tour-live-progress').textContent,'');
 assert.equal(f.$('tour-live-message').textContent,'');
 assert.equal(f.$('tour-live-next').hidden,true);
 assert.equal(f.$('tour-live-retry').hidden,true);
 assert.equal(f.$('tour-live-toggle').textContent,'▶ Tour starten');
 assert.equal(f.$('tour-live-toggle').attributes['aria-pressed'],'false');
});
test('live tour progress reflects verified leg distances and manual arrival',()=>{
 const f=fixture();
 f.ui.renderLiveNavigation({phase:'started'});
 f.ui.renderLiveNavigation({phase:'progress',
   stage:1,total:3,name:'Nara-Park',arrived:false,status:'on-route',
   remainingMeters:420,remainingSeconds:300,offRoute:false});
 assert.equal(f.$('tour-live-step').textContent,'Stopp 1 von 3 · Nara-Park');
 assert.equal(f.$('tour-live-progress').textContent,'Noch 420 m · 5 Min.');
 assert.match(f.$('tour-live-message').textContent,/keine automatische Neuberechnung/);
 assert.equal(f.$('tour-live-retry').hidden,true);
 assert.equal(f.$('tour-live-next').textContent,'Nächster Stopp →');
 f.ui.renderLiveNavigation({phase:'progress',stage:2,total:3,name:'Tōdai-ji',
   arrived:false,status:'off-route',remainingMeters:155,remainingSeconds:80,
   offRoute:true});
 assert.match(f.$('tour-live-message').textContent,/abgewichen/);
 assert.equal(f.$('tour-live-retry').hidden,false);
 f.ui.renderLiveNavigation({phase:'progress',stage:2,total:3,name:'Tōdai-ji',
   arrived:false,status:'poor-gps',remainingMeters:155,remainingSeconds:80,
   offRoute:false});
 assert.equal(f.$('tour-live-progress').textContent,'📍 GPS ungenau');
 assert.match(f.$('tour-live-message').textContent,/genauere GPS-Messung/);
 assert.equal(f.$('tour-live-retry').hidden,true);
 f.ui.renderLiveNavigation({phase:'progress',stage:3,total:3,name:'Kasuga-Taisha',
   arrived:true,status:'near-goal',remainingMeters:1,remainingSeconds:1,
   offRoute:false});
 assert.equal(f.$('tour-live-progress').textContent,'✓ Ziel erreicht');
 assert.equal(f.$('tour-live-next').textContent,'✓ Tour abschließen');
 assert.match(f.$('tour-live-message').textContent,/Nächster Stopp/);
});
test('pause, resume, pending GPS, explicit retry, finish and error states',()=>{
 const f=fixture();f.ui.bind();f.ui.renderLiveNavigation({phase:'started'});
 f.ui.renderLiveNavigation({phase:'paused'});
 assert.equal(f.$('tour-live-toggle').textContent,'▶ Tour fortsetzen');
 assert.equal(f.$('tour-live-toggle').attributes['aria-pressed'],'false');
 assert.equal(f.$('tour-live-retry').hidden,true);
 assert.match(f.$('tour-live-message').textContent,/Pausiert/);
 f.ui.renderLiveNavigation({phase:'resume-gps-required'});
 assert.match(f.$('tour-live-message').textContent,/aktueller GPS-Standort/);
 f.ui.renderLiveNavigation({phase:'resumed'});
 assert.equal(f.$('tour-live-toggle').attributes['aria-pressed'],'true');
 f.ui.renderLiveNavigation({phase:'progress-error'});
 assert.match(f.$('tour-live-message').textContent,/nicht verfügbar/);
 f.ui.renderLiveNavigation({phase:'next'});
 assert.equal(f.$('tour-live-toggle').textContent,'Ⅱ Tour pausieren');
 f.ui.renderLiveNavigation({phase:'next-gps-pending',stage:2,total:3});
 assert.equal(f.$('tour-live-step').textContent,'Stopp 2 von 3');
 assert.equal(f.$('tour-live-progress').textContent,'Standort wird ermittelt …');
 f.ui.renderLiveNavigation({phase:'reset'});
 f.ui.renderLiveNavigation({phase:'complete'});
 assert.equal(f.$('tour-live-state').hidden,false);
 assert.equal(f.$('tour-live-next').hidden,true);
 assert.equal(f.$('tour-live-step').textContent,'✓ Rundgang abgeschlossen');
 assert.equal(f.$('tour-live-progress').textContent,'Alle Ziele erledigt.');
 assert.equal(f.$('tour-live-toggle').textContent,'↺ Tour erneut starten');
 assert.equal(f.$('tour-live-toggle').attributes['aria-pressed'],'false');
 assert.throws(()=>f.ui.renderLiveNavigation({phase:'invented'}),/Unbekannter/);
});
test('GPS tour UI is shared across dates, never stores coordinates or makes route requests',()=>{
 const ui=read('tour-ui.js'),app=read('app.js');
 assert.match(ui,/function renderLiveNavigation\(/);
 assert.match(ui,/tour-live-toggle'\)\.onclick=\(\)=>handlers\.toggleLiveTour/);
 assert.match(app,/toggleLiveTour:\(\)=>toggleTourNavigation\(\)/);
 assert.match(app,/nextLiveStop:\(\)=>advanceTourNavigation\(\)/);
 assert.match(app,/retryLiveRoute:\(\)=>\{void calculateTour\(false,true\);\}/);
 assert.match(read('tour-navigation-core.js'),/walkingCore\.tourLegProgress\(prepared,route\.legs/);
 const nav=read('tour-navigation-core.js');
 assert.match(nav,/nearReadings>=2/);
 assert.match(nav,/offReadings>=2/);
 assert.match(app,/tourUI\.renderLiveNavigation\(\{/);
 assert.doesNotMatch(ui,/fetch\(|localStorage|indexedDB|navigator\.geolocation|watchPosition/);
});

test('navigation HUD suppresses stale and uncertain GPS reroute even when raw progress claims deviation',()=>{
 const f=fixture();
 f.ui.renderLiveNavigation({phase:'started'});
 f.ui.renderLiveNavigation({phase:'progress',stage:2,total:3,name:'Stopp',
   arrived:false,status:'off-route',remainingMeters:200,remainingSeconds:100,
   offRoute:true,guidance:{kind:'waiting',message:'GPS-Position aktualisieren',
     distanceMeters:null,durationSeconds:null,canOfferReroute:false}});
 assert.equal(f.$('tour-live-progress').textContent,'📍 GPS-Signal wird aktualisiert');
 assert.match(f.$('tour-live-message').textContent,/GPS-Position aktualisieren/);
 assert.equal(f.$('tour-live-retry').hidden,true);
 f.ui.renderLiveNavigation({phase:'progress',stage:2,total:3,name:'Stopp',
   arrived:false,status:'off-route',remainingMeters:200,remainingSeconds:100,
   offRoute:true,guidance:{kind:'uncertain',message:'GPS zu ungenau',
     distanceMeters:null,durationSeconds:null,canOfferReroute:false}});
 assert.equal(f.$('tour-live-progress').textContent,'📍 GPS ungenau');
 assert.equal(f.$('tour-live-retry').hidden,true);
 f.ui.renderLiveNavigation({phase:'progress',stage:2,total:3,name:'Stopp',
   arrived:false,status:'off-route',remainingMeters:200,remainingSeconds:100,
   offRoute:true,guidance:{kind:'deviation',message:'Vom Fußweg abgewichen',
     distanceMeters:198,durationSeconds:99,canOfferReroute:true}});
 assert.equal(f.$('tour-live-retry').hidden,false);
 assert.match(f.$('tour-live-progress').textContent,/198 m/);
});
