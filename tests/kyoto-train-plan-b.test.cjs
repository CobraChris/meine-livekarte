const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const NS=require('../next-step-core.js');
const C=require('../core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');

test('all four Plan B scenarios provide real staff-help steps, Japanese text and safe itinerary',()=>{
 for(const kind of ['delay','missed','ticket','staff']){
   const g=NS.trainProblem(kind);
   assert.equal(g.kind,kind);
   assert.equal(g.plannedTransferMinutes,22);
   assert.ok(g.title.length>6);
   assert.equal(g.steps.length,3);
   assert.ok(g.steps.every(s=>typeof s==='string'&&s.length>20));
   assert.match(g.japanese,/Klook/);
   assert.match(g.japanese,/2人分/);
   assert.match(g.japanese,/ひだ8号/);
   assert.match(g.japanese,/のぞみ71号/);
   assert.match(g.japanese,/14:04/);
   assert.match(g.japanese,/14:26/);
   assert.match(g.japanese,/8D・8E/);
   assert.ok(g.japanese.includes('\n'),'Japanese card should display multi-line text');
   assert.doesNotMatch(g.japanese,/予約番号:|パスワード|QR-[A-Za-z0-9]{8}/);
 }
 assert.throws(()=>NS.trainProblem('unknown'));
});

test('delay calculation remains arithmetic only and handles boundaries without claim of guaranteed connection',()=>{
 const blank=NS.trainProblem('delay');
 assert.equal(blank.delayMinutes,null);
 assert.equal(blank.remainingMinutes,null);
 assert.match(blank.marginText,/22 Minuten laut Fahrplan/);
 for(const [delay,margin] of [[0,22],[1,21],[15,7],[21,1],[22,0],[23,-1],[40,-18],[180,-158]]){
   const g=NS.trainProblem('delay',delay);
   assert.equal(g.delayMinutes,delay);
   assert.equal(g.remainingMinutes,margin);
   assert.match(g.japanese,new RegExp('約'+delay+'分'));
 }
 assert.match(NS.trainProblem('delay',15).marginText,/Rechnerisch noch 7 Minuten/);
 assert.match(NS.trainProblem('delay',22).marginText,/stark gefährdet/);
 assert.match(NS.trainProblem('delay',40).marginText,/Kein Nachweis/);
 for(const invalid of ['',null,-1,'-1','12.5','abc','181',Infinity]){
   assert.equal(NS.trainProblem('delay',invalid).delayMinutes,null);
 }
 assert.equal(NS.trainProblem('missed',30).delayMinutes,null);
});

test('Nozomi failure and ticket issue cannot promise valid fare, rebooking or seat reuse',()=>{
 const missed=NS.trainProblem('missed');
 assert.match(missed.steps.join(' '),/JR-Shinkansen-Schalter/);
 assert.match(missed.steps.join(' '),/Klook-Tickets/);
 assert.match(missed.steps.join(' '),/Nicht ungeprüft/);
 assert.match(missed.japanese,/新しい切符は必要ですか/);
 const tickets=NS.trainProblem('ticket');
 assert.match(tickets.steps.join(' '),/nicht erneut kaufen/);
 assert.match(tickets.japanese,/発券/);
 const staff=NS.trainProblem('staff');
 assert.match(staff.japanese,/乗り換え改札口/);
 assert.equal(C.isNagoyaKyotoTrip(C.presetJourney('takayama-kyoto-2026-11-01')),true);
 assert.equal(C.isNagoyaKyotoTrip(C.presetJourney('hakone-takayama-2026-10-30')),false);
});

test('dialog includes all entry points, native minute input, scenario toggles and source links',()=>{
 for(const id of ['train-planb-dialog','train-planb-title','train-planb-close',
   'train-planb-delay','train-planb-delay-minutes','train-planb-margin',
   'train-planb-steps','train-planb-jp','train-planb-copy','train-planb-feedback',
   'kyoto-pickup-planb','next-action-planb'])
   assert.ok(html.includes('id="'+id+'"'),id);
 for(const kind of ['delay','missed','ticket','staff'])
   assert.ok(html.includes('data-train-planb="'+kind+'"'),kind);
 assert.match(html,/id="train-planb-delay-minutes"[^>]*min="0" max="180"/);
 assert.match(html,/22 Minuten/);
 assert.match(html,/keine Anschlussprognose/);
 assert.match(html,/Klook-Vouchern/);
 assert.match(html,/global\.jr-central\.co\.jp\/en\/tickets\/change\//);
 assert.match(html,/global\.jr-central\.co\.jp\/en\/nozomi\//);
 assert.match(css,/\.train-planb-delay\[hidden\]/);
 assert.match(css,/\.train-planb-scenarios>button\[aria-pressed="true"\]/);
});

test('date/route-gated Plan B works from next action, pickup and infographic',()=>{
 assert.match(app,/function canShowRailPlanB\(\)/);
 assert.match(app,/NS\.localDate\(\)!=='2026-11-01'/);
 assert.match(app,/return C\.isNagoyaKyotoTrip\(trip\)/);
 assert.match(app,/nextActionPlanB\.hidden=!canShowRailPlanB\(\)/);
 assert.match(app,/\$\('kyoto-pickup-planb'\)\.hidden=!canShowRailPlanB\(\)/);
 assert.match(app,/planBButton\.onclick=\(\)=>openTrainPlanB\(\)/);
 assert.match(app,/nextActionPlanB\.onclick=\(\)=>openTrainPlanB\(\)/);
 assert.match(app,/function renderTrainPlanB\(\)/);
 assert.match(app,/NS\.trainProblem\(trainPlanBKind,trainPlanBDelay\.value\)/);
 assert.match(app,/trainPlanBButtons\.forEach\(button/);
 assert.match(app,/trainPlanBDelay\.addEventListener\('input',renderTrainPlanB\)/);
 assert.match(app,/trainPlanBDialog\.showModal\(\)/);
 assert.match(app,/trainPlanBDialog\.close\(\)/);
 assert.match(app,/navigator\.clipboard\?\.writeText\(japanese\)/);
 assert.match(app,/\$\('train-planb-jp'\)\.textContent=advice\.japanese/);
});

test('Plan B never changes booking, trip progress, location or navigation as a side effect',()=>{
 const start=app.indexOf('  // Plan B is based on the existing, exact journey');
 const end=app.indexOf('  const ticketHelpButton=',start);
 assert.ok(start>0&&end>start);
 const block=app.slice(start,end);
 assert.doesNotMatch(block,/localStorage|sessionStorage|fetch\(|navigator\.geolocation|watchPosition|setRailLegStage\(|setActionDone\(|kyotoPickupDone\s*=|journey\s*=|map\.setView\(|renderJourney\(/);
 assert.match(block,/if\(!canShowRailPlanB\(\)\)/);
 assert.match(block,/trainPlanBDelay\.value=''/);
 assert.match(block,/setAttribute\('aria-pressed'/);
 assert.match(app,/kyotoPickupConfirm\.onclick=\(\)=>\{/);
 assert.match(app,/function openNagoyaKyotoGuide\(\)/);
 assert.match(html,/id="ticket-help-dialog"/);
 assert.match(html,/id="nagoya-kyoto-dialog"/);
});
