const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const NS=require('../next-step-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('style.css');

test('Kyoto timetable milestones use the actual Japan calendar, never device-local time',()=>{
  assert.deepEqual(NS.kyotoDepartureClock(new Date('2026-10-31T14:59:00Z')),
    {phase:'future',minutesToStation:null,minutesToTrain:null});
  assert.deepEqual(NS.kyotoDepartureClock(new Date('2026-11-01T00:06:00Z')),
    {phase:'before-station',minutesToStation:99,minutesToTrain:149});
  assert.deepEqual(NS.kyotoDepartureClock(new Date('2026-11-01T01:44:00Z')),
    {phase:'before-station',minutesToStation:1,minutesToTrain:51});
  assert.deepEqual(NS.kyotoDepartureClock(new Date('2026-11-01T01:45:00Z')),
    {phase:'station-window',minutesToStation:0,minutesToTrain:50});
  assert.deepEqual(NS.kyotoDepartureClock(new Date('2026-11-01T02:34:59Z')),
    {phase:'station-window',minutesToStation:0,minutesToTrain:1});
  assert.deepEqual(NS.kyotoDepartureClock(new Date('2026-11-01T02:35:00Z')),
    {phase:'departed',minutesToStation:0,minutesToTrain:0});
  assert.deepEqual(NS.kyotoDepartureClock(new Date('2026-11-01T15:00:00Z')),
    {phase:'past',minutesToStation:null,minutesToTrain:null});
});

test('pickup card shows a separate clock and the station-link only opens on user click',()=>{
  for(const id of ['kyoto-departure-clock','kyoto-clock-label',
    'kyoto-clock-value','kyoto-clock-note'])
    assert.ok(html.includes('id="'+id+'"'),id);
  const card=html.slice(html.indexOf('id="kyoto-pickup"'),
    html.indexOf('id="sync-panel"'));
  assert.match(card,/Empfohlen: ca\. 10:45 Uhr/);
  assert.match(card,/Hida 8 fährt um 11:35 Uhr/);
  assert.match(card,/https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=36\.14113%2C137\.25129&amp;travelmode=walking/);
  assert.match(card,/target="_blank" rel="noopener noreferrer"/);
  assert.match(card,/Zeitplan, keine Live-Bahnauskunft/);
  assert.match(css,/\.kyoto-departure-clock\.is-urgent/);
});

test('departure clock updates text only and never mutates tickets or tasks',()=>{
  const start=app.indexOf('  function renderKyotoDepartureClock(){');
  const end=app.indexOf('  function renderKyotoPickup(){',start);
  assert.ok(start>0&&end>start);
  const block=app.slice(start,end);
  assert.match(block,/NS\.kyotoDepartureClock\(\)/);
  assert.match(block,/setInterval\(renderKyotoDepartureClock,60000\)/);
  assert.match(block,/visibilitychange/);
  assert.match(block,/focus/);
  assert.match(block,/kyotoPickupDone/);
  assert.match(block,/Bahnhofsanzeigen haben Vorrang/);
  assert.match(block,/Keine Live-Auskunft/);
  assert.doesNotMatch(block,/navigator\.geolocation|watchPosition|fetch\(|localStorage|sessionStorage|setActionDone\(|kyotoPickupDone\s*=|setRailLegStage\(|renderJourney\(|map\.setView\(/);
  assert.match(app,/ticketHelpButton\.hidden=kyotoPickupDone\|\|!canShowTicketHelp\(\);\s*renderKyotoDepartureClock\(\)/);
  assert.match(app,/kyotoPickupConfirm\.onclick=\(\)=>\{/);
  assert.match(app,/livekarte-kyoto-qr-pickedup-v1/);
  assert.match(html,/id="nagoya-kyoto-dialog"/);
});

test('core task order and the canonical pickup status are unchanged',()=>{
  const tasks=NS.choose('ride-kyoto','2026-11-01');
  assert.equal(tasks.entries.length,7);
  assert.equal(tasks.next.id,'kyoto:pickup');
  assert.equal(NS.choose('ride-kyoto','2026-11-01',{pickupDone:true}).next.id,'kyoto:hida');
  const fixed=NS.kyotoDepartureClock(new Date('2026-11-01T02:36:00Z'));
  assert.equal(fixed.phase,'departed');
  assert.equal(NS.choose('ride-kyoto','2026-11-01').next.id,'kyoto:pickup',
    'time passing must not confirm collection');
});
