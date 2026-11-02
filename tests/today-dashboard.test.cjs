const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const NS=require('../next-step-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');
const at=iso=>new Date(iso);

test('today suggestions use real Japan local date and only confirmed preset travel days',()=>{
  const cases=[
    ['2026-10-29T14:59:00Z',null,null],
    ['2026-10-29T15:00:00Z','town-takayama',null],
    ['2026-10-31T14:59:00Z','town-takayama',null],
    ['2026-10-31T15:00:00Z','ride-kyoto',0],
    ['2026-11-01T14:59:00Z','ride-kyoto',0],
    ['2026-11-01T15:00:00Z','town-kyoto',1],
    ['2026-11-02T14:59:00Z','town-kyoto',1],
    ['2026-11-02T15:00:00Z','town-kyoto',null],
    ['2026-11-06T15:00:00Z','town-kyoto',null],
    ['2026-11-07T15:00:00Z',null,null]
  ];
  for(const [iso,id,dayIndex] of cases){
    const actual=NS.todaySuggestion(at(iso));
    assert.equal(actual?.planId??null,id,iso);
    assert.equal(actual?.dayIndex??null,dayIndex,iso);
  }
  const today=NS.todaySuggestion(at('2026-11-02T01:19:00Z'));
  assert.match(today.title,/Kyoto/);
  assert.match(today.summary,/Kiyomizu-dera/);
  assert.match(today.summary,/Fushimi Inari/);
  assert.match(today.hint,/freiwillig/);
  assert.equal(today.date,'2026-11-02');
  assert.equal(NS.localDate(at('2026-11-02T01:19:00Z')),'2026-11-02');
});

test('past views are archived only for dated travel plans, not current Kyoto or future unspecified trips',()=>{
  assert.equal(NS.isPastTravelView('ride-kyoto',at('2026-11-01T14:59:00Z')),false);
  assert.equal(NS.isPastTravelView('ride-kyoto',at('2026-11-01T15:00:00Z')),true);
  assert.equal(NS.isPastTravelView('town-takayama',at('2026-11-02T01:00:00Z')),true);
  assert.equal(NS.isPastTravelView('ride-takayama',at('2026-10-31T01:00:00Z')),true);
  assert.equal(NS.isPastTravelView('town-kyoto',at('2026-11-02T01:00:00Z')),false);
  assert.equal(NS.isPastTravelView('all',at('2026-11-02T01:00:00Z')),false);
  assert.equal(NS.isPastTravelView('custom-trip',at('2026-11-02T01:00:00Z')),false);
  // Old items remain explicitly incomplete, with no auto-completion.
  const past=NS.choose('ride-kyoto','2026-11-02',{});
  assert.equal(past.total,5);
  assert.equal(past.doneCount,0);
  assert.ok(past.entries.every(x=>x.done===false));
  assert.equal(NS.taskBuckets(past.entries,at('2026-11-02T01:00:00Z')).openCount,5);
});

test('mobile top navigation and date-first suggestion are accessible and visible before the map',()=>{
  const main=html.indexOf('<main>'),nav=html.indexOf('class="daily-quick-nav"'),
    today=html.indexOf('id="today-panel"'),map=html.indexOf('id="map"');
  assert.ok(main<nav&&nav<today&&today<map);
  for(const id of ['quick-today','quick-map','quick-tickets','today-date',
    'today-title','today-summary','today-hint','today-open','today-view-note'])
    assert.match(html,new RegExp('id="'+id+'"'),id);
  assert.match(html,/aria-label="Schnellzugriff"/);
  assert.match(html,/id="today-view-note" role="status" aria-live="polite"/);
  assert.match(css,/\.daily-quick-nav\{display:grid/);
  assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(css,/\.today-panel\[hidden\]/);
  assert.match(app,/\$\('quick-today'\)\.onclick=openTodayPlan/);
  assert.match(app,/\$\('quick-map'\)\.onclick=/);
  assert.match(app,/\$\('quick-tickets'\)\.onclick=/);
  assert.match(app,/shelf\.open=true/);
  assert.match(app,/const suggestion=NS\.todaySuggestion\(\)/);
});

test('today button selects only after click and shows second Kyoto day; old day remains accessible',()=>{
  assert.match(app,/function openTodayPlan\(\)\{/);
  assert.match(app,/if\(activePlanId!==suggestion\.planId\)\s*selectPlan\(suggestion\.planId,\{focus:false\}\)/);
  assert.match(app,/focusKyotoOverviewDay\(suggestion\.dayIndex\)/);
  assert.match(app,/kyotoOverview\.scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
  assert.match(app,/focusKyotoOverviewDay\(suggested\.dayIndex\)/);
  assert.match(app,/if\(!kyotoOverview\.hidden&&lastOverviewDay!==today\)/);
  assert.match(app,/sections\.forEach\(\(section,i\)=>\{section\.open=index===i;\}\)/);
  const overview=html.slice(html.indexOf('id="kyoto-overview"'),html.indexOf('id="tour-builder"'));
  assert.match(overview,/Mo\. 02\.11\. · Higashiyama und Fushimi Inari/);
  assert.match(overview,/So\. 01\.11\. · Anreise und Gion-Abend/);
  assert.match(overview,/09:45–11:15/);
  assert.match(app,/renderTodayDashboard\(\)/);
});

test('selected day, manual edits and deep links win over automatic date suggestion',()=>{
  assert.match(app,/const queryView=new URLSearchParams\(location\.search\)\.get\('view'\)/);
  assert.match(app,/const savedView=\(\(\)=>\{try\{return localStorage\.getItem\('livekarte-active-plan-v1'\)/);
  assert.match(app,/const dailyDefault=NS\.todaySuggestion\(\)\?\.planId/);
  assert.match(app,/const requestedView=queryView\|\|savedView\|\|dailyDefault\|\|/);
  assert.match(app,/const plan=allPlans\(\)\.find\(p=>p\.id===id\)/);
  assert.match(app,/if\(options\.save!==false\) persistPlanState\(\)/);
  assert.match(app,/if\(options\.url!==false\)/);
  assert.match(app,/window\.addEventListener\('focus',renderKyotoOverview\)/);
  assert.match(app,/if\(!document\.hidden\)renderKyotoOverview\(\)/);
  assert.doesNotMatch(app.slice(app.indexOf('function renderTodayDashboard(){'),app.indexOf("  let journey = null;")),
    /fetch\(|navigator\.geolocation|watchPosition/);
});

test('old unfinished journey is collapsed but still reviewable without changing completion state',()=>{
  assert.match(html,/id="next-action-archive-toggle"[^>]*hidden aria-expanded="false"/);
  assert.match(html,/id="next-action-archive-content"/);
  assert.match(app,/const isArchived=NS\.isPastTravelView\(view\)/);
  assert.match(app,/nextActionSection\.classList\.toggle\('is-archived-trip',isArchived\)/);
  assert.match(app,/\$\('next-action-archive-content'\)\.hidden=isArchived&&!oldTravelExpanded/);
  assert.match(app,/oldTravelExpanded=!oldTravelExpanded/);
  assert.match(app,/Archiv · '\+buckets\.openCount\+' nicht bestätigt'/);
  assert.match(css,/#next-action-archive-content\[hidden\]/);
  assert.match(css,/\.next-action\.is-archived-trip/);
  assert.doesNotMatch(app.slice(app.indexOf('  function renderNextAction(){'),
    app.indexOf('  // A resumed app recalculates local calendar context')),
    /storeNextAction\(task\.id,true\)|setRailLegStage\(.*'done'/);
});
