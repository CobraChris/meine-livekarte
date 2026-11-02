const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=pathName=>fs.readFileSync(path.join(__dirname,'..',pathName),'utf8');
const html=read('index.html'),ui=read('ticket-library-ui.js'),
  css=read('style.css'),core=read('ticket-library.js');

test('backup reminder sits near saved documents and is hidden for empty library',()=>{
  const section=html.slice(html.indexOf('class="ticket-library-list"'),
    html.indexOf('id="ticket-legacy"'));
  for(const id of ['ticket-files','ticket-backup-health','ticket-backup-message',
    'ticket-backup-quick','ticket-backup-open','ticket-backup-details',
    'ticket-backup','ticket-restore-file','ticket-backup-check',
    'ticket-backup-check-result','ticket-restore'])
    assert.ok(section.includes('id="'+id+'"'),id);
  assert.match(section,/id="ticket-backup-health"[^>]*hidden/);
  assert.match(section,/id="ticket-backup-message"[^>]*role="status" aria-live="polite"/);
  assert.match(section,/id="ticket-backup-check-result"[^>]*role="status" aria-live="polite"/);
  assert.match(css,/\.ticket-backup-health\[hidden\]/);
  assert.match(css,/\.ticket-backup-health\[data-level="changed"\]/);
  assert.match(css,/\.ticket-backup-actions button/);
});

test('backup reminder renderer uses local metadata only and shows appropriate state',()=>{
  const start=ui.indexOf('  function renderBackupHealth(files){');
  const end=ui.indexOf('  async function render(){',start);
  assert.ok(start>0&&end>start);
  let healthCalls=0;
  const elements={
    'ticket-backup-health':{hidden:false,dataset:{}},
    'ticket-backup-message':{textContent:''}
  };
  const state={localStorage:{getItem(){return null}},
    BACKUP_MARKER:'not-a-ticket',
    $:id=>elements[id],
    API:{backupIndicator(files,marker){
      healthCalls++;
      assert.equal(marker,null);
      return {level:'missing',message:'Noch kein Export'};
    }}};
  vm.runInNewContext(ui.slice(start,end)+'\nthis.renderBackupHealth=renderBackupHealth;',state);
  state.renderBackupHealth([]);
  assert.equal(elements['ticket-backup-health'].hidden,true);
  assert.equal(healthCalls,0);
  state.renderBackupHealth([{id:'one'}]);
  assert.equal(elements['ticket-backup-health'].hidden,false);
  assert.equal(elements['ticket-backup-health'].dataset.level,'missing');
  assert.equal(elements['ticket-backup-message'].textContent,'Noch kein Export');
  assert.equal(healthCalls,1);
});

test('both backup buttons share one export flow and do not assert file was saved externally',()=>{
  assert.match(ui,/async function exportBackup\(\)/);
  assert.match(ui,/const pack=await shelf\.backupPackage\(\)/);
  assert.match(ui,/download\(pack\.blob,/);
  assert.match(ui,/localStorage\.setItem\(BACKUP_MARKER,JSON\.stringify/);
  assert.match(ui,/sig:pack\.signature/);
  assert.match(ui,/renderBackupHealth\(await shelf\.list\(\)\)/);
  assert.match(ui,/\$\('ticket-backup'\)\.onclick=\(\)=>busy\(\$\('ticket-backup'\),exportBackup\)/);
  assert.match(ui,/\$\('ticket-backup-quick'\)\.onclick=\(\)=>busy\(\$\('ticket-backup-quick'\),exportBackup\)/);
  assert.match(ui,/Export angestoßen/);
  assert.match(ui,/unter „Downloads“ prüfen/);
  assert.doesNotMatch(ui,/Backup erfolgreich auf Server gespeichert|in der Cloud gesichert/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.doesNotMatch(ui,/localStorage\.clear\(|indexedDB\.deleteDatabase/);
});

test('verification validates selected backup without importing or deleting tickets',()=>{
  const start=ui.indexOf("  $('ticket-backup-check').onclick="),
    end=ui.indexOf("  $('ticket-restore').onclick=",start);
  assert.ok(start>0&&end>start);
  const check=ui.slice(start,end);
  assert.match(check,/shelf\.inspectBackup\(file\)/);
  assert.match(check,/Noch nichts importiert/);
  assert.match(check,/Nichts importiert/);
  assert.doesNotMatch(check,/shelf\.restore\(|shelf\.add\(|shelf\.remove\(/);
  const restore=ui.slice(end,ui.indexOf("  $('ticket-persist').onclick=",end));
  assert.match(restore,/const info=await shelf\.inspectBackup\(file\)/);
  assert.match(restore,/if\(!confirm\(/);
  assert.match(restore,/const imported=await shelf\.restore\(file\)/);
  assert.match(restore,/Vorhandene Dateien wurden nicht überschrieben/);
});

test('backup marker contains only timestamp/signature; documents stay in IndexedDB',()=>{
  assert.match(core,/async backupPackage\(\)/);
  assert.match(core,/async inspectBackup\(file\)/);
  assert.match(core,/async restore\(file\)/);
  assert.match(core,/async function parseBackup\(file\)/);
  assert.match(core,/function backupSignature\(items\)/);
  assert.match(core,/function backupIndicator\(items,marker/);
  assert.match(ui,/at:now\.toISOString\(\),sig:pack\.signature/);
  const writes=[...ui.matchAll(/localStorage\.setItem\(/g)];
  assert.equal(writes.length,1,'only the export reminder marker may be stored');
});
