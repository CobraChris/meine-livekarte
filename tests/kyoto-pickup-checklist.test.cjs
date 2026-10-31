const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const C=require('../core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('index.html'),app=read('app.js'),css=read('style.css');

test('critical boarding actions are visible ahead of optional sync and infographic in Takayama',()=>{
 const start=html.indexOf('id="kyoto-pickup"');
 const sync=html.indexOf('id="sync-panel"');
 const rail=html.indexOf('id="kyoto-rail-infographic"');
 assert.ok(start>=0&&start<sync&&sync<rail);
 assert.match(html,/id="kyoto-pickup-title">Klook-Tickets in Takayama abholen/);
 assert.match(html,/Empfohlen: ca\. 10:45 Uhr da sein/);
 assert.match(html,/Hida 8 fährt um 11:35 Uhr/);
 assert.match(html,/Klook öffnen → Buchungen → QR-Abholcode/);
 assert.match(html,/„How to use“/);
 assert.match(html,/JR-Bahnhof Takayama Tickets ausgeben lassen/);
 assert.match(html,/nicht jeder QR-Code funktioniert an jedem Automaten/);
 assert.match(html,/mit Voucher und Abholcode zum JR-Ticketschalter gehen/);
 assert.match(html,/Wagen 2, 10C\/10D/);
 assert.match(html,/Wagen 4, 8D\/8E/);
 assert.match(html,/beide Personen und beide Zugstrecken/);
 assert.match(html,/id="kyoto-pickup-confirm"/);
 assert.match(html,/id="kyoto-pickup-feedback" role="status" aria-live="polite"/);
});

test('only Takayama and Kyoto journey views show task, with safe local progress',()=>{
 const begin=app.indexOf('  // Explicit departure action shared by Takayama city');
 const end=app.indexOf('  function renderJourney() {',begin);
 assert.ok(begin>=0&&end>begin);
 const logic=app.slice(begin,end);
 assert.match(logic,/!\['town-takayama','ride-kyoto'\]\.includes\(activePlanId\)/);
 assert.match(logic,/kyotoPickupConfirm\.disabled=kyotoPickupDone/);
 assert.match(logic,/if\(kyotoPickupDone\)return/);
 assert.match(logic,/if\(!confirm\('Sind alle Papiertickets/);
 assert.match(logic,/C\.presetJourney\('takayama-kyoto-2026-11-01'\)/);
 assert.match(logic,/const expected=\[\['Takayama','11:35','Nagoya'\],\['Nagoya','14:26','Kyoto Station'\]\]/);
 assert.match(logic,/C\.ticketLegKey\('ride-kyoto',trip,index\)/);
 assert.match(logic,/status:'ready',source:'manual',updatedAt:now/);
 assert.match(logic,/localStorage\.setItem\('livekarte-ticket-status-v1',JSON\.stringify\(nextTickets\)\)/);
 assert.match(logic,/localStorage\.setItem\('livekarte-kyoto-qr-pickedup-v1','1'\)/);
 assert.match(logic,/ticketStatuses=nextTickets/);
 assert.match(logic,/window\.dispatchEvent\(new Event\('livekarte:ticket-updated'\)\)/);
 assert.match(app,/renderKyotoPickup\(\);\s*journeyLayer\.clearLayers\(\)/);
 assert.match(app,/kyotoPickupDone=localStorage\.getItem\('livekarte-kyoto-qr-pickedup-v1'\)==='1'/);
 assert.doesNotMatch(logic,/fetch\(|navigator\.geolocation|QRcodeValue|passphrase|bookingReference/);
});

test('incorrect or customized route cannot mark unrelated train tickets as present',()=>{
 const logic=app.slice(app.indexOf('  // Explicit departure action shared by Takayama city'),
   app.indexOf('  function renderJourney() {'));
 assert.match(logic,/trip\?\.stops\?\.findIndex\(\(stop,i\)=>/);
 assert.match(logic,/if\(indices\.some\(index=>index<0\|\|!Number\.isInteger\(index\)\)\)/);
 assert.match(logic,/Die Zugverbindung wurde verändert/);
 const trip=C.presetJourney('takayama-kyoto-2026-11-01');
 const keys=[0,1].map(i=>C.ticketLegKey('ride-kyoto',trip,i));
 assert.equal(new Set(keys).size,2);
 assert.match(logic,/previousTicketData===null/);
 assert.match(logic,/localStorage\.removeItem\('livekarte-ticket-status-v1'\)/);
});

test('mobile checklist has numbered steps, clear task action and no map popup changes',()=>{
 assert.match(css,/\.kyoto-pickup\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.kyoto-pickup-steps li>b/);
 assert.match(css,/\.kyoto-pickup-status button:disabled/);
 assert.match(css,/\.kyoto-pickup\.is-complete/);
 assert.match(css,/@media\(max-width:390px\)/);
 assert.match(read('sw.js'),/livekarte-shell-pwa-v21/);
 assert.match(app,/function enablePopupMapDrag\(marker,surface\)/);
});
