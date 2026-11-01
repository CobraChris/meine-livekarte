const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const html=read('index.html'),ui=read('ticket-library-ui.js'),css=read('style.css');

test('normal ticket library has no password, PIN, face or fingerprint unlock fields',()=>{
  const begin=html.indexOf('<details id="ticket-vault"');
  const end=html.indexOf('<dialog id="vault-preview"',begin);
  const ticket=html.slice(begin,end);
  assert.ok(begin>=0&&end>begin);
  const passwords=[...ticket.matchAll(/<input[^>]*type="password"[^>]*>/g)];
  assert.equal(passwords.length,1,'single old encrypted migration field only');
  assert.match(passwords[0][0],/id="ticket-legacy-password"/);
  assert.match(ticket,/id="ticket-legacy"[^>]*hidden/);
  assert.match(ticket,/ohne Passwort, PIN oder Fingerabdruck/);
  assert.doesNotMatch(ticket,/Passwort ändern|Passwort vergessen|Tresor entsperren|Passkey zur Schnellentsperrung/);
  assert.doesNotMatch(ui,/installPasswordVisibility|biometricSupported|navigator\.credentials/);
  assert.match(ticket,/id="ticket-add"/);
});

test('old encrypted files are only transferred after an explicit one-time action',()=>{
  assert.match(ui,/if\(!oldCount\)\{\$\('ticket-legacy'\)\.hidden=true;return;\}/);
  assert.match(ui,/old\.unlock\(password\)/);
  assert.match(ui,/shelf\.importLegacy\(old\)/);
  assert.match(ui,/old\.lock\(\)/);
  assert.match(ui,/ticket-legacy-password'\)\.value=''/);
  assert.match(css,/\.ticket-library-legacy/);
  assert.match(html,/Der alte Tresor bleibt/);
});
