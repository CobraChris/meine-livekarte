const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');

test('predeparture instruction stands ahead of sync and rail diagram, with compact two-state summary',()=>{
 const pickup=html.indexOf('id="kyoto-pickup"');
 const sync=html.indexOf('id="sync-panel"');
 const diagram=html.indexOf('id="kyoto-rail-infographic"');
 assert.ok(pickup>=0&&pickup<sync&&sync<diagram);
 assert.match(html,/id="kyoto-pickup-state">⚠ Papiertickets: noch abholen/);
 assert.match(html,/✅ Buchung: bestätigt/);
 assert.match(html,/Empfohlen: ca\. 10:45 Uhr da sein/);
 assert.match(html,/<details class="kyoto-pickup-more" id="kyoto-pickup-steps-details">/);
 assert.match(html,/4 Schritte zur Ticketabholung ansehen/);
 assert.doesNotMatch(html,/<details class="kyoto-pickup-more"[^>]*open/);
 assert.match(html,/Klook öffnen → Buchungen → QR-Abholcode/);
 assert.match(css,/\.kyoto-pickup-two-status/);
 assert.match(css,/\.kyoto-pickup-more>summary/);
});
test('rail infographic repeats ticket pickup warning and links to full guide, without conflating booking',()=>{
 assert.match(app,/node\('strong','✅ Buchung: beide Zugabschnitte bestätigt'/);
 assert.match(app,/kyotoPickupDone\s*\?\s*'✅ Papiertickets: abgeholt/);
 assert.match(app,/'⚠ Papiertickets: noch am Bahnhof Takayama abholen'/);
 assert.match(app,/const pickupLink=node\('button'/);
 assert.match(app,/pickupLink\.onclick=\(\)=>\{/);
 assert.match(app,/\$\('kyoto-pickup'\)\.scrollIntoView/);
 assert.match(app,/if\(details&&!kyotoPickupDone\)details\.open=true/);
 assert.match(app,/kyotoPickupFeedback\.textContent=kyotoPickupDone/);
 assert.match(app,/kyotoPickupConfirm\.disabled=kyotoPickupDone/);
 assert.match(app,/kyotoPickupPanel\.hidden=!\['town-takayama','ride-kyoto'\]\.includes\(activePlanId\)/);
});
test('travel stage cannot erase an already verified Klook booking',()=>{
 const start=app.indexOf('  function setRailLegStage(');
 const end=app.indexOf('  function renderKyotoRailInfographic()',start);
 assert.ok(start>0&&end>start);
 const block=app.slice(start,end);
 assert.match(block,/if\(stage==='planned'&&\['booked','ready'\]\.includes\(ticketState\)\)/);
 assert.match(block,/Diese Fahrt ist bereits gebucht/);
 assert.match(block,/if\(stage==='booked'&&!\['booked','ready'\]\.includes\(ticketState\)/);
 assert.doesNotMatch(block,/saveTicketStatus\(planId,trip,index,'unknown'\)/);
 assert.match(block,/livekarte-trip-progress-v1/);
});
test('physical ticket pickup remains confirmed solely by traveler, not by Klook web calls',()=>{
 const start=app.indexOf('  const kyotoPickupPanel='),end=app.indexOf('  function renderJourney()',start);
 const block=app.slice(start,end);
 assert.match(block,/if\(!confirm\('Sind alle Papiertickets/);
 assert.match(block,/localStorage\.setItem\('livekarte-kyoto-qr-pickedup-v1','1'\)/);
 assert.match(block,/status:'ready',source:'manual'/);
 assert.doesNotMatch(block,/fetch\(|getUserMedia|accessToken|klook\.com\/api/);
 assert.match(read('sw.js'),/livekarte-shell-pwa-v21/);
});
