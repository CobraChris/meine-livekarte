const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const C=require('../core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');

test('Japanese JR staff card is reachable from pre-departure pickup only',()=>{
  assert.match(html,/id="kyoto-pickup-help"[^>]*hidden/);
  assert.ok(html.indexOf('id="kyoto-pickup-help"')>html.indexOf('id="kyoto-pickup-confirm"'));
  for(const id of ['ticket-help-dialog','ticket-help-title','ticket-help-close',
    'ticket-help-copy','ticket-help-feedback']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.match(app,/ticketHelpButton\.hidden=kyotoPickupDone\|\|!canShowTicketHelp\(\)/);
  assert.match(app,/kyotoPickupPanel\.hidden=!\['town-takayama','ride-kyoto'\]\.includes\(activePlanId\)/);
  assert.match(app,/ticketHelpButton\.onclick=/);
  assert.match(app,/ticketHelpDialog\.showModal\(\)/);
  assert.match(app,/ticketHelpDialog\.close\(\)/);
});

test('staff card displays the exact booked legs without pretending ticket release is confirmed',()=>{
  const card=html.slice(html.indexOf('<dialog id="ticket-help-dialog"'),
    html.indexOf('<dialog id="japanese-driver-dialog"'));
  assert.match(card,/lang="ja"/);
  for(const detail of ['11:35','14:04','14:26','15:00',
    'ひだ8号','のぞみ71号','2号車','4号車','10C','10D','8D','8E','2人分']){
    assert.ok(card.includes(detail),detail);
  }
  assert.match(card,/QRコードとバウチャー/);
  assert.match(card,/どの券売機または窓口/);
  assert.match(card,/keine Prüfung durch JR oder Klook/);
  assert.match(card,/der Klook-QR-Code nicht funktioniert/);
  assert.doesNotMatch(card,/QR-[0-9A-Za-z]{8,}|Buchungsnummer: ?[0-9]/);
});

test('staff-card route matches only exact Kyoto booking; Hida 9 remains untouched',()=>{
  assert.equal(C.isNagoyaKyotoTrip(C.presetJourney('takayama-kyoto-2026-11-01')),true);
  assert.equal(C.isNagoyaKyotoTrip(C.presetJourney('hakone-takayama-2026-10-30')),false);
  assert.match(app,/Object\.hasOwn\(planJourneys,'ride-kyoto'\)/);
  assert.match(app,/return C\.isNagoyaKyotoTrip\(trip\)/);
  assert.match(app,/Die Zugverbindung wurde verändert|Reiseplan verändert/);
  assert.match(html,/id="nagoya-dialog"/);
  assert.match(html,/id="nagoya-kyoto-dialog"/);
});

test('opening and copying are explicit and private; original ticket confirmation remains',()=>{
  const begin=app.indexOf("  const ticketHelpButton=$('kyoto-pickup-help');");
  const end=app.indexOf('  function renderKyotoPickup()',begin);
  assert.ok(begin>0&&end>begin);
  const logic=app.slice(begin,end);
  assert.match(logic,/navigator\.clipboard\?\.writeText/);
  assert.match(logic,/querySelectorAll\('\.ticket-help-jp p'\)/);
  assert.match(logic,/join\('\\n'\)/);
  assert.doesNotMatch(logic,/fetch\(|navigator\.geolocation|localStorage|sessionStorage|indexedDB|cookie|saveTicketStatus|setRailLegStage/);
  assert.match(app,/kyotoPickupConfirm\.onclick=\(\)=>\{/);
  assert.match(app,/livekarte-kyoto-qr-pickedup-v1/);
  assert.match(css,/\.kyoto-pickup-help\[hidden\]/);
  assert.match(css,/#ticket-help-dialog/);
});
