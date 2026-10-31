const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const D=require('../day-plan-core.js');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const stops=[
 {name:'Takayama Jinya',duration:'30–60 Min.',schedule:'Tag 1'},
 {name:'Sanmachi-Suji',duration:'1–2 Std.',note:'Spätere Beleuchtung beachten'},
 {name:'Hida-no-Sato',duration:'45–90 Min.'}
];
const legs=[
 {distance:532,duration:420},
 {distance:285,duration:240},
 {distance:2300,duration:1500}
];

test('parses only supported stated visit-duration units, with explicit range midpoints',()=>{
 assert.equal(D.visitMinutes('30–60 Min.'),45);
 assert.equal(D.visitMinutes('1–2 Std.'),90);
 assert.equal(D.visitMinutes('45–90 Min.'),70);
 assert.equal(D.visitMinutes('5–7 Std. inkl. Bus'),360);
 assert.equal(D.visitMinutes('ca. 1,5 Std.'),90);
 assert.equal(D.visitMinutes('60 Min.'),60);
 assert.equal(D.visitMinutes('kurz durchgehen'),null);
 assert.equal(D.visitMinutes('irgendwann 2026'),null);
 assert.equal(D.visitMinutes('90–30 Min.'),null);
 assert.equal(D.visitMinutes(''),null);
});

test('builds true-leg itinerary, waits for entered opening and inserts lunch at a stop',()=>{
 const plan=D.build({
  start:'10:30',stops,legs,
  visits:[60,90,45],
  windows:[{open:'11:00',close:'12:00'}, {open:'13:00',close:'15:00'},{}],
  buffer:10,lunch:45
 });
 assert.deepEqual(plan.items.map(x=>x.legMinutes),[7,4,25]);
 assert.equal(plan.items[0].depart,630);
 assert.equal(plan.items[0].arrival,637);
 assert.equal(plan.items[0].visitEnd,720);
 assert.equal(plan.items[0].lunchAfter,45);
 assert.equal(plan.items[0].bufferAfter,10);
 assert.equal(plan.items[1].depart,775);
 assert.equal(plan.items[1].arrival,779);
 assert.equal(plan.items[1].wait,1);
 assert.equal(plan.items[1].visitStart,780);
 assert.equal(plan.items[1].visitEnd,870);
 assert.equal(plan.items[2].depart,880);
 assert.equal(plan.end,950);
 assert.equal(D.clockText(plan.end),'15:50');
 assert.equal(plan.walkingMinutes,36);
 assert.equal(plan.visitingMinutes,195);
 assert.equal(plan.knownHours,2);
 assert.equal(plan.unknownHours,1);
 assert.equal(plan.lunchScheduled,true);
 assert.equal(plan.items[0].windowWarning,'');
 assert.deepEqual(plan.items[1].note,stops[1].note);
});

test('never assumes opening times and warns on closing conflict',()=>{
 const plan=D.build({start:'10:30',stops:stops.slice(0,1),
  legs:legs.slice(0,1),visits:[90],windows:[{}],buffer:0,lunch:0});
 assert.equal(plan.knownHours,0);
 assert.equal(plan.unknownHours,1);
 assert.equal(plan.items[0].windowWarning,'');
 const late=D.build({start:'15:00',stops:stops.slice(0,1),
  legs:legs.slice(0,1),visits:[45],
  windows:[{open:'09:00',close:'14:00'}],buffer:0,lunch:0});
 assert.match(late.items[0].windowWarning,/bereits geschlossen/);
 assert.throws(()=>D.build({start:'10:30',stops:stops.slice(0,1),
  legs:legs.slice(0,1),visits:[45],
  windows:[{open:'09:00',close:''}],buffer:0,lunch:0}),/vollständig/);
 assert.throws(()=>D.build({start:'10:30',stops:stops.slice(0,1),
  legs:legs.slice(0,1),visits:[45],
  windows:[{open:'15:00',close:'09:00'}],buffer:0,lunch:0}),/ungültig/);
});

test('strict times, limits and visit validation avoid invented schedules',()=>{
 assert.equal(D.minuteOf('09:00'),540);
 assert.equal(D.clockText(1510),'01:10 (+1 Tag)');
 for(const time of ['9:00','24:00','12:60','','10:30Z'])
  assert.throws(()=>D.minuteOf(time),/gültige/);
 const base={start:'10:30',stops,legs,visits:[45,90,70],
  windows:[{},{},{}],buffer:10,lunch:0};
 assert.throws(()=>D.build({...base,legs:legs.slice(0,2)}),/passen nicht/);
 assert.throws(()=>D.build({...base,visits:[45,-1,70]}),/5 bis 480/);
 assert.throws(()=>D.build({...base,buffer:999}),/Ungültiger/);
 assert.throws(()=>D.build({...base,legs:[{...legs[0],duration:-1},...legs.slice(1)]}),/ungültige/);
});

test('mobile planner is tied to a real calculated tour, and does not transmit GPS',()=>{
 const html=read('index.html'),app=read('app.js'),css=read('style.css');
 const workflow=read('.github/workflows/pages.yml');
 const stamp=read('scripts/stamp_pwa_version.py');
 for(const id of ['day-planner','day-plan-state','day-start','day-buffer','day-lunch',
  'day-stop-settings','day-plan-refresh','day-plan-alert','day-plan-output',
  'day-plan-summary','day-plan-timeline','day-plan-warnings'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/src="day-plan-core\.js"/);
 assert.match(html,/10:30 Uhr/);
 assert.match(html,/Öffnungszeiten werden nur aus deinen eigenen Angaben berücksichtigt/);
 assert.match(app,/const D=window\.LivekarteDayPlan/);
 assert.match(app,/renderDayPlanControls\(\)/);
 assert.match(app,/const matching=tourRoute\?\.planId===activePlanId&&tourRoute\.legs\?\.length===tourRoute\.stops\.length/);
 assert.match(app,/D\.build\(/);
 assert.match(app,/livekarte-day-plans-v1/);
 assert.match(app,/D\?\.visitMinutes\(place\.duration\)\?\?45/);
 assert.match(app,/windows:stops\.map/);
 assert.match(app,/if\(!matching\)/);
 assert.match(app,/renderDayPlanControls\(\);\s*tourBuilderStatus\.textContent=remaining/);
 const render=app.slice(app.indexOf('  function renderDayPlanSummary(){'),
    app.indexOf("  $('day-start').onchange="));
 assert.doesNotMatch(render,/fetch\(|navigator\.geolocation|\.route\/|routing\.openstreetmap/);
 const persist=app.slice(app.indexOf('  function persistDayPlans(){'),
    app.indexOf('  function dayPlanStops(){'));
 assert.match(persist,/JSON\.stringify\(dayPlans\)/);
 assert.doesNotMatch(persist,/position|tourRoute|geometry|coordinates/);
 assert.match(css,/\.day-plan-global/);
 assert.match(workflow,/node --check day-plan-core\.js/);
 assert.match(workflow,/cp index\.html style\.css core\.js walking-core\.js day-plan-core\.js route-discovery\.js app\.js/);
 assert.match(stamp,/\("src", "day-plan-core\.js"\)/);
 assert.match(read('sw.js'),/livekarte-shell-pwa-v19/);
 assert.match(read('sw.js'),/'day-plan-core\.js'/);
});
