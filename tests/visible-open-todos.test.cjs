const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const NS=require('../next-step-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');
const at=(iso)=>new Date(iso);

test('open tasks are derived from canonical manual, rail and pickup statuses without modifying data',()=>{
  const context={pickupDone:true,railDone:{0:true,1:false},
    manualDone:{'kyoto:transfer':true}};
  const schedule=NS.choose('ride-kyoto','2026-11-01',context);
  const original=JSON.stringify(schedule);
  const result=NS.taskBuckets(schedule.entries,at('2026-11-01T03:37:00Z'));
  assert.equal(result.openCount,2);
  assert.equal(result.doneCount,3);
  assert.deepEqual(result.open.map(x=>x.id),[
    'kyoto:nozomi','kyoto:hotel']);
  assert.deepEqual(result.done.map(x=>x.id),[
    'kyoto:pickup','kyoto:hida','kyoto:transfer']);
  assert.equal(JSON.stringify(schedule),original);
  assert.equal(context.railDone[1],false);
  assert.equal(context.pickupDone,true);
  assert.equal(result.open[0].timeState,'upcoming');
  assert.equal(result.open[1].timeState,'flexible');
});

test('Japanese planned time can pass without marking travel done or falsely claiming train was missed',()=>{
  const schedule=NS.choose('ride-kyoto','2026-11-01');
  const tasks=schedule.entries;
  const cases=[
    ['2026-11-01T02:34:00Z','kyoto:pickup','upcoming'],
    ['2026-11-01T02:35:00Z','kyoto:pickup','past'],
    ['2026-11-01T05:25:00Z','kyoto:transfer','upcoming'],
    ['2026-11-01T05:26:00Z','kyoto:transfer','past'],
    ['2026-11-01T05:25:00Z','kyoto:nozomi','upcoming'],
    ['2026-11-01T05:26:00Z','kyoto:nozomi','past'],
    ['2026-11-01T04:37:00Z','kyoto:hotel','flexible'],
    ['2026-11-02T04:37:00Z','kyoto:hotel','past']
  ];
  for(const [iso,id,expect] of cases){
    const task=tasks.find(x=>x.id===id);
    assert.equal(NS.taskTimeState(task,at(iso)),expect,id+' '+iso);
  }
  assert.equal(schedule.doneCount,0);
  assert.ok(schedule.entries.every(x=>x.done===false));
  assert.equal(NS.taskBuckets(schedule.entries,at('2026-11-02T02:00:00Z')).openCount,5);
  assert.equal(NS.taskTimeState({id:'unknown'},at('2026-11-01T00:00:00Z')),'unscheduled');
});

test('previous and next Japan day trip items are differentiated without guessing real time',()=>{
  const prep=NS.choose('town-takayama','2026-10-31').entries[0];
  assert.equal(NS.taskTimeState(prep,at('2026-10-31T03:00:00Z')),'upcoming');
  assert.equal(NS.taskTimeState(prep,at('2026-11-01T05:00:00Z')),'past');
  const day=NS.choose('town-kyoto','2026-11-02');
  assert.equal(day.total,0,'optional sightseeing stays in itinerary, not checklist');
  assert.equal(NS.taskBuckets([]).openCount,0);
});

test('overview shows all open steps, completed steps are grouped and can be undone',()=>{
  const allIdx=html.indexOf('id="next-action-all"');
  const openIdx=html.indexOf('id="next-action-open"');
  assert.ok(openIdx>=0&&allIdx>openIdx);
  for(const id of ['next-action-open','next-action-open-count','next-action-open-list',
    'next-action-all','next-action-done-count','next-action-list','next-action-timing',
    'next-action-complete','next-action-details']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(app,/NS\.taskBuckets\(result\.entries\)/);
  assert.match(app,/:buckets\.openCount\+' offen · '\+buckets\.doneCount\+' erledigt'/);
  assert.match(app,/for\(const item of buckets\.open\)/);
  assert.match(app,/nextActionOpenList\.append\(li\)/);
  assert.match(app,/for\(const item of buckets\.done\)/);
  assert.match(app,/nextActionList\.append\(li\)/);
  assert.match(app,/undo\.onclick=\(\)=>setActionDone\(item,false\)/);
  assert.match(app,/confirm\.onclick=\(\)=>setActionDone\(item,true\)/);
  assert.match(app,/function setActionDone\(task,done\)/);
  assert.match(app,/renderNextAction\(\)/);
  assert.match(app,/task\.source==='pickup'/);
  assert.match(app,/nextActionPlanB\.hidden=!canShowRailPlanB\(\)/);
  assert.match(css,/\.next-action-open-list/);
  assert.match(css,/\.next-action-open-item/);
  assert.match(css,/\.next-action-open-item:first-child/);
  assert.match(css,/\.next-action-past/);
  assert.doesNotMatch(app.slice(app.indexOf('  function renderNextAction(){'),
    app.indexOf('  // A resumed app recalculates local calendar context')),
    /fetch\(|navigator\.geolocation|watchPosition|setInterval\(/);
});

test('confirmed and past departure pickup becomes compact but can still be opened from rail/ticket links',()=>{
  const start=html.indexOf('id="kyoto-pickup"'),end=html.indexOf('id="ticket-vault"',start);
  const section=html.slice(start,end);
  assert.match(section,/id="kyoto-pickup-history-toggle"/);
  assert.match(section,/id="kyoto-pickup-body"/);
  assert.match(section,/id="kyoto-seat-check"/);
  assert.match(section,/id="kyoto-pickup-confirm"/);
  assert.match(app,/const archived=kyotoPickupDone&&\(phase==='departed'\|\|phase==='past'\)/);
  assert.match(app,/\$\('kyoto-pickup-body'\)\.hidden=archived&&!kyotoPickupHistoryExpanded/);
  assert.match(app,/function revealKyotoPickupHistory\(\)/);
  assert.match(app,/\$\('kyoto-pickup-history-toggle'\)\.onclick=/);
  assert.match(app,/if\(details&&!kyotoPickupDone\)details\.open=true;\s*revealKyotoPickupHistory\(\)/);
  assert.match(app,/revealKyotoPickupHistory\(\);\s*check\.open=true/);
  assert.match(app,/kyotoPickupConfirm\.onclick=\(\)=>\{/);
  assert.match(css,/#kyoto-pickup-body\[hidden\]/);
  assert.match(css,/\.kyoto-seat-launch\{color:#ecfff2!important\}/);
});
