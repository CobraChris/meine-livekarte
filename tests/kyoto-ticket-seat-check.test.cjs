const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');

test('both people and both booked trains have exactly one checkable seat',()=>{
  const start=html.indexOf('id="kyoto-seat-check"');
  const end=html.indexOf('id="kyoto-pickup-confirm"',start);
  assert.ok(start>0&&end>start);
  const form=html.slice(start,end);
  const seatIds=[...form.matchAll(/data-kyoto-seat="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(seatIds,['hida-10c','hida-10d','nozomi-8d','nozomi-8e']);
  assert.match(form,/Wagen 2 · Sitz 10C/);
  assert.match(form,/Wagen 2 · Sitz 10D/);
  assert.match(form,/Wagen 4 · Sitz 8D/);
  assert.match(form,/Wagen 4 · Sitz 8E/);
  assert.match(form,/Takayama 11:35 → Nagoya 14:04/);
  assert.match(form,/Nagoya 14:26 → Kyoto 15:00/);
  assert.match(form,/mehrere Papiere/);
  assert.match(form,/kein Nachweis für die Ticketgültigkeit/);
  assert.match(form,/bestätigen nicht automatisch die Abholung/);
  assert.match(html,/id="kyoto-seat-progress"/);
  assert.match(html,/id="kyoto-seat-feedback"[^>]*aria-live="polite"/);
});

test('seat progress has no side effects on tickets or completed actions',()=>{
  const start=app.indexOf('  const kyotoSeatInputs=[');
  const end=app.indexOf('  function renderKyotoPickup(){',start);
  assert.ok(start>0&&end>start);
  const logic=app.slice(start,end);
  assert.match(logic,/kyotoSeatInputs\.filter\(input=>input\.checked\)\.length/);
  assert.match(logic,/renderKyotoSeatCheck/);
  assert.match(logic,/kyotoSeatInputs\.forEach\(input=>input\.addEventListener\('change',renderKyotoSeatCheck\)\)/);
  assert.doesNotMatch(logic,/localStorage|sessionStorage|navigator\.geolocation|fetch\(|setRailLegStage|kyotoPickupDone\s*=|ticketStatuses\s*=|setActionDone/);
  assert.match(app,/function renderKyotoPickup\(\)\{\s*renderKyotoSeatCheck\(\);/);
  assert.match(app,/kyotoPickupConfirm\.onclick=\(\)=>\{/);
  assert.match(app,/if\(!confirm\('Sind alle Papiertickets/);
  assert.match(app,/livekarte-kyoto-qr-pickedup-v1/);
  assert.match(app,/nextActionPlanB\.onclick=/);
});

test('seat rendering reflects 0, partial and full manually checked state',()=>{
  const start=app.indexOf('  const kyotoSeatInputs=[');
  const end=app.indexOf('  function renderKyotoPickup(){',start);
  const logic=app.slice(start,end);
  const checkboxes=Array.from({length:4},()=>({
    checked:false,
    addEventListener(type,cb){this.onChange=cb}
  }));
  const nodes=Object.fromEntries(['kyoto-seat-progress','kyoto-seat-feedback','kyoto-seat-check'].map(id=>[id,{
    textContent:'',
    classList:{values:[],toggle(name,value){this.values.push({name,value})}}
  }]));
  const document={querySelectorAll(){return checkboxes},getElementById(id){return nodes[id]}};
  const context={document,$:id=>document.getElementById(id)};
  vm.runInNewContext(logic+"\nthis.renderSeatCheck=renderKyotoSeatCheck;",context);
  assert.equal(nodes['kyoto-seat-progress'].textContent,'','no eager mutation');
  context.renderSeatCheck();
  assert.equal(nodes['kyoto-seat-progress'].textContent,'0/4 geprüft');
  checkboxes[0].checked=true;checkboxes[2].checked=true;
  checkboxes[0].onChange();
  assert.equal(nodes['kyoto-seat-progress'].textContent,'2/4 geprüft');
  assert.match(nodes['kyoto-seat-feedback'].textContent,/2\/4/);
  checkboxes[1].checked=true;checkboxes[3].checked=true;
  context.renderSeatCheck();
  assert.equal(nodes['kyoto-seat-progress'].textContent,'4/4 geprüft');
  assert.match(nodes['kyoto-seat-feedback'].textContent,/gesonderte Abholbestätigung bleibt erforderlich/);
  assert.deepEqual(nodes['kyoto-seat-check'].classList.values.at(-1),{name:'is-checked',value:true});
  checkboxes[2].checked=false;context.renderSeatCheck();
  assert.equal(nodes['kyoto-seat-progress'].textContent,'3/4 geprüft');
  assert.deepEqual(nodes['kyoto-seat-check'].classList.values.at(-1),{name:'is-checked',value:false});
});

test('rail infographic opens checklist on deliberate click and does not auto-confirm',()=>{
  assert.match(app,/const seatsButton=node\('button','🧾 Beide Reisenden/);
  assert.match(app,/if\(C\.isNagoyaKyotoTrip\(trip\)\)/);
  assert.match(app,/seatsButton\.onclick=\(\)=>\{/);
  assert.match(app,/check\.open=true/);
  assert.match(app,/check\.scrollIntoView/);
  assert.match(css,/\.kyoto-seat-check/);
  assert.match(css,/\.kyoto-seat-groups input\[type=checkbox\]/);
  assert.match(html,/id="kyoto-pickup-help"/);
  assert.match(html,/id="kyoto-pickup-planb"/);
  assert.match(html,/id="train-planb-dialog"/);
});
