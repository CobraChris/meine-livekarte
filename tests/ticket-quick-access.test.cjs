const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const html=read('index.html'),ui=read('ticket-library-ui.js'),
  css=read('style.css'),core=read('ticket-library.js');

test('search field and pinned ticket controls are part of the existing offline library',()=>{
  const start=html.indexOf('id="ticket-files"');
  assert.ok(start>0);
  assert.match(html,/id="ticket-search" type="search"/);
  assert.match(html,/id="ticket-filter-result"[^>]*aria-live="polite"/);
  assert.match(ui,/API\.filterTickets\(files,search\)/);
  assert.match(ui,/\$\('ticket-search'\)\.addEventListener\('input'/);
  assert.match(ui,/shelf\.setPinned\(item\.id,!item\.pinned\)/);
  assert.match(ui,/pin\.setAttribute\('aria-pressed',String\(item\.pinned===true\)\)/);
  assert.match(ui,/pin\.setAttribute\('aria-label'/);
  assert.match(ui,/actions\.append\(pin,show,save,remove\)/);
  assert.match(css,/\.vault-file\.is-pinned/);
  assert.match(css,/#ticket-search/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|WebSocket|navigator\.geolocation/);
});

test('newly imported tickets remain visible regardless of an existing search filter',()=>{
  const fromShare=ui.slice(ui.indexOf("  $('ticket-shared-save').onclick="),
    ui.indexOf("  $('ticket-shared-discard').onclick="));
  assert.match(fromShare,/await SHARE\.remove\(item\.id\);\s*\$\('ticket-search'\)\.value='';\s*await render\(\)/);
  const fromPicker=ui.slice(ui.indexOf("  $('ticket-add').onclick="),
    ui.indexOf("  $('ticket-backup').onclick="));
  assert.match(fromPicker,/item=await shelf\.add\(file,[\s\S]*?\$\('ticket-search'\)\.value='';\s*await render\(\)/);
  assert.match(fromPicker,/revealSavedTicket\(item\)/);
  assert.match(fromShare,/revealSavedTicket\(saved\)/);
});

test('pinned metadata does not require a database schema bump or additional network storage',()=>{
  assert.match(core,/const DB_NAME='livekarte-ticket-library-v1'/);
  assert.match(core,/async setPinned\(id,pinned\)/);
  assert.match(core,/pinned:item\.pinned===true/);
  assert.match(core,/return Object\.freeze\(\{Library,available,mimeOf,filterTickets/);
  assert.doesNotMatch(core,/indexedDB\.deleteDatabase|fetch\(|sendBeacon/);
  assert.match(core,/async backup\(\)/);
  assert.match(core,/async restore\(file\)/);
});
