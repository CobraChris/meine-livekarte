const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const html=read('index.html'),css=read('style.css'),app=read('app.js');

test('map precedes exactly one merged Kyoto day selector and today card',()=>{
  const map=html.indexOf('id="map"'),panel=html.indexOf('id="day-planning"'),
    days=html.indexOf('id="city-days"'),today=html.indexOf('id="today-panel"');
  assert.ok(map>0&&map<panel&&panel<days&&days<today);
  for(const id of ['plan-period','plan-day-summary',
    'city-day-brief-title','city-day-brief-summary','city-day-brief-time','city-day-brief-open'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.equal((html.match(/id="today-panel"/g)||[]).length,1);
  assert.equal((html.match(/id="city-days-list"/g)||[]).length,1);
  assert.match(css,/\.day-planning \.city-days-list\{grid-template-columns:repeat\(6/);
});

test('date filter remains the source of truth and the chosen day drives the brief and map chip',()=>{
  assert.match(app,/const choices=\[\.\.\.MD\.days\('town-kyoto'\),MD\.ALL,MD\.UNASSIGNED\]/);
  assert.match(app,/cityDayAssignments\[C\.placePlanKey\(p\)\]===activeCityDay/);
  assert.match(app,/\$\('city-day-brief-summary'\)\.textContent=assigned\.length/);
  assert.match(app,/\$\('plan-day-summary'\)\.textContent=MD\.dayLabel\(activeCityDay\)\+' · '\+assigned\.length\+' Ziele'/);
  assert.match(app,/dayBriefOpen\.onclick=/);
  assert.match(app,/dayBriefOpen\.hidden=!selected/);
  assert.match(app,/todayPanel\.hidden=activePlanId==='town-kyoto'/);
  assert.match(app,/\$\('plan-day-summary'\)\.hidden=cityDaysPanel\.hidden/);
  assert.match(app,/function selectCityDay\(day\)\{/);
  assert.match(app,/render\(\);\s*const p=mapFocusPlaces\(\)/);
});

test('section dates come from established preset names and the top date strip is removed',()=>{
 const C=require('../core.js');
 assert.doesNotMatch(html,/id="map-day-context"/);
 assert.match(html,/<label for="plan-select">Reiseabschnitt<span id="plan-period"><\/span><\/label>/);
 assert.match(html,/id="plan-day-summary"/);
 assert.match(html,/id="city-days-title">🗓 Tagesplanung/);
 assert.match(app,/function planPickerLabel\(plan\)\{/);
 assert.match(app,/\$\('plan-period'\)\.textContent=period\?' · '\+period:''/);
 assert.match(css,/\.plan-picker-heading\{display:flex/);
 assert.match(css,/#plan-day-summary\[hidden\]/);
 assert.ok(C.planPresets.some(p=>p.name==='01.–06.11. · Kyoto'));
 assert.ok(C.planPresets.some(p=>p.name==='ab 07.11. · Nikkō'));
 const source=app.slice(app.indexOf('function planPickerLabel('),app.indexOf('function renderPlanPicker()'));
 const vm=require('node:vm');
 const actualParser=vm.runInNewContext('('+source.trim()+')',{C});
 assert.equal(JSON.stringify(actualParser(C.planPresets.find(p=>p.id==='town-kyoto'))),JSON.stringify({period:'01.–06.11.',name:'Kyoto'}));
 assert.equal(JSON.stringify(actualParser(C.planPresets.find(p=>p.id==='town-takayama'))),JSON.stringify({period:'30.10.–01.11.',name:'Takayama'}));
 assert.equal(JSON.stringify(actualParser(C.planPresets.find(p=>p.id==='town-nikko'))),JSON.stringify({period:'ab 07.11.',name:'Nikkō'}));
 assert.deepEqual(JSON.parse(JSON.stringify(actualParser({id:'custom-trip',name:'Meine Reise'}))),{name:'Meine Reise',period:''});
 assert.ok(source.includes('C.planPresets.some'));
});
