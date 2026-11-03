const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const html=read('index.html'),css=read('style.css'),app=read('app.js');

test('map precedes exactly one merged Kyoto day selector and today card',()=>{
  const map=html.indexOf('id="map"'),panel=html.indexOf('id="day-planning"'),
    days=html.indexOf('id="city-days"'),today=html.indexOf('id="today-panel"');
  assert.ok(map>0&&map<panel&&panel<days&&days<today);
  for(const id of ['map-day-context','map-day-context-title','map-day-context-count',
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
  assert.match(app,/\$\('map-day-context-title'\)\.textContent='Kyoto · '\+MD\.dayLabel\(activeCityDay\)/);
  assert.match(app,/dayBriefOpen\.onclick=/);
  assert.match(app,/dayBriefOpen\.hidden=!selected/);
  assert.match(app,/todayPanel\.hidden=activePlanId==='town-kyoto'/);
  assert.match(app,/\$\('map-day-context'\)\.hidden=cityDaysPanel\.hidden/);
  assert.match(app,/function selectCityDay\(day\)\{/);
  assert.match(app,/render\(\);\s*const p=visiblePlaces\(\)/);
});
