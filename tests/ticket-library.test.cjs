const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Library,mimeOf,MAX_FILE,BACKUP_FORMAT}=require('../ticket-library.js');
const original=globalThis.indexedDB;
after(()=>{globalThis.indexedDB=original;});
function fakeIndexedDB(){
  const databases=new Map();
  function create(name){
    const stores=new Map();
    const db={
      objectStoreNames:{contains:name=>stores.has(name)},
      createObjectStore(name){stores.set(name,new Map());},
      close(){},
      transaction(name){
        const tx={oncomplete:null,onabort:null,onerror:null,error:null};
        let queued=0;
        const request=fn=>{
          const req={onsuccess:null,onerror:null,result:null,error:null};
          queued++;
          queueMicrotask(()=>{
            try{req.result=fn();req.onsuccess?.();}
            catch(e){req.error=e;tx.error=e;req.onerror?.();tx.onabort?.();}
            queued--;
            if(queued===0)queueMicrotask(()=>tx.oncomplete?.());
          });
          return req;
        };
        tx.objectStore=key=>{
          const map=stores.get(key);
          if(!map)throw Error('missing store');
          return {
            get:key=>request(()=>map.get(key)),
            getAll:()=>request(()=>[...map.values()]),
            count:()=>request(()=>map.size),
            add:value=>request(()=>{
              if(map.has(value.id))throw Error('Duplicate');
              map.set(value.id,value);return value.id;
            }),
            delete:key=>request(()=>{map.delete(key);})
          };
        };
        return tx;
      }
    };
    databases.set(name,{db,stores});
    return db;
  }
  const factory={
    databases:async()=>[...databases.keys()].map(name=>({name})),
    open(name){
      const req={result:null,onsuccess:null,onupgradeneeded:null,onerror:null};
      queueMicrotask(()=>{
        const already=databases.has(name);
        req.result=already?databases.get(name).db:create(name);
        if(!already)req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    }
  };
  globalThis.indexedDB=factory;
  return {databases,factory};
}
const bytes=new Uint8Array([37,80,68,70,45,49,46,54,10,37,99,111,110,116,101,110,116]);
function fakeFile(name,type,data=bytes){
  const blob=new Blob([data],{type});
  return {name,type,size:blob.size,arrayBuffer:()=>blob.arrayBuffer(),text:()=>blob.text()};
}
test('PDF and QR images are type-checked even with misleading file extensions',()=>{
  assert.equal(mimeOf('application/pdf','ticket.pdf',bytes),'application/pdf');
  assert.throws(()=>mimeOf('application/pdf','ticket.pdf',new TextEncoder().encode('<script>')),/Dateiinhalt/);
  assert.throws(()=>mimeOf('text/html','ticket.html',bytes),/Nur PDF/);
  const jpg=new Uint8Array([255,216,255,1]);
  assert.equal(mimeOf('image/jpeg','photo.jpg',jpg),'image/jpeg');
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
  assert.equal(mimeOf('image/png','qr.png',png),'image/png');
  const webp=new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]);
  assert.equal(mimeOf('image/webp','qr.webp',webp),'image/webp');
});

test('adding, previewing and removing tickets works with no password or WebCrypto',async()=>{
  fakeIndexedDB();const lib=new Library();
  assert.deepEqual(await lib.list(),[]);
  const ticket=await lib.add(fakeFile('QR-ticket.pdf','application/pdf'),
    {title:'Japan 2026',trip:'Takayama → Kyoto'});
  assert.equal(ticket.title,'Japan 2026');
  const found=await lib.get(ticket.id);
  assert.equal(found.type,'application/pdf');
  assert.deepEqual(new Uint8Array(await found.blob.arrayBuffer()),bytes);
  assert.equal((await lib.list())[0].trip,'Takayama → Kyoto');
  assert.ok((await lib.database()).objectStoreNames.contains('files'));
  assert.equal((await lib.all())[0].name,'QR-ticket.pdf');
  await lib.remove(ticket.id);
  assert.equal((await lib.list()).length,0);
  await assert.rejects(()=>lib.get(ticket.id),/nicht gefunden/);
  await assert.rejects(()=>lib.add(fakeFile('huge.pdf','application/pdf',new Uint8Array(MAX_FILE+1))),/10 MB/);
});

test('unencrypted backup is explicitly portable and can restore without password',async()=>{
  fakeIndexedDB();const lib=new Library();
  const item=await lib.add(fakeFile('boarding.pdf','application/pdf'),
    {trip:'DB Hamburg Berlin',title:'ICE Online Ticket'});
  const backup=await lib.backup();
  const content=await backup.text();
  assert.match(content,/livekarte-ticket-library-backup-v1/);
  assert.ok(content.includes('ICE Online Ticket'),'plaintext backup must be clearly disclosed');
  assert.ok(content.includes('DB Hamburg Berlin'));
  assert.equal((await lib.restore(backup)),0,'restoring same backup does not duplicate IDs');
  fakeIndexedDB();const second=new Library();
  assert.equal(await second.restore(backup),1);
  assert.equal((await second.list())[0].id,item.id);
  assert.deepEqual(new Uint8Array(await (await second.get(item.id)).blob.arrayBuffer()),bytes);
  await assert.rejects(()=>second.restore(new Blob(['{"format":"invalid","files":[]}'])),/Format/);
});

test('old encrypted database remains untouched and can be migrated once when explicitly unlocked',async()=>{
  const mock=fakeIndexedDB(),shelf=new Library();
  assert.equal(await shelf.legacyCount(),0,'no old records means migration hidden');
  // Simulate legacy DB with a ciphertext record; migration reads from a
  // separately unlocked Vault instance and does not delete the old store.
  const oldReq=mock.factory.open('livekarte-ticket-vault-v1');
  const oldDb=await new Promise(resolve=>{
    oldReq.onupgradeneeded=()=>oldReq.result.createObjectStore('files',{keyPath:'id'});
    oldReq.onsuccess=()=>resolve(oldReq.result);
  });
  const oldTx=oldDb.transaction('files','readwrite');
  const completed=new Promise(resolve=>oldTx.oncomplete=resolve);
  oldTx.objectStore('files').add({id:'abc123',cipher:'untouched encrypted bytes'});
  await completed;
  assert.equal(await shelf.legacyCount(),1);
  const vault={
    list:async()=>[{id:'abc123'}],
    file:async()=>({metadata:{name:'old-booking.pdf',title:'Legacy ticket',
      trip:'Japan 2026',type:'application/pdf'},
      blob:new Blob([bytes],{type:'application/pdf'})})
  };
  assert.equal(await shelf.importLegacy(vault),1);
  assert.equal((await shelf.list())[0].id,'legacy-abc123');
  assert.equal(await shelf.importLegacy(vault),0,'repeated migration must be idempotent');
  assert.equal(await shelf.legacyCount(),1,'old records survive');
  assert.equal(mock.databases.get('livekarte-ticket-vault-v1').stores.get('files').get('abc123').cipher,
    'untouched encrypted bytes');
});

test('HTML / Pages / service worker only ship password-free ticket UI',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const html=read('index.html'),ui=read('ticket-library-ui.js'),
    wf=read('.github/workflows/pages.yml'),sw=read('sw.js'),
    stamp=read('scripts/stamp_pwa_version.py');
  assert.match(html,/src="ticket-library\.js"/);
  assert.match(html,/src="ticket-library-ui\.js"/);
  assert.doesNotMatch(html,/src="ticket-vault-ui\.js"/);
  assert.match(wf,/cp ticket-vault\.js ticket-library\.js ticket-library-ui\.js public\//);
  assert.match(sw,/'ticket-library\.js','ticket-library-ui\.js'/);
  assert.match(stamp,/\("src", "ticket-library\.js"\)/);
  assert.match(stamp,/\("src", "ticket-library-ui\.js"\)/);
  assert.match(html,/id="ticket-files"/);
  assert.match(html,/ohne Passwort, PIN oder Fingerabdruck/);
  assert.match(html,/Das Backup ist nicht verschlüsselt/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.credentials/);
  assert.doesNotMatch(ui,/localStorage\.setItem|sessionStorage\.setItem|indexedDB\.deleteDatabase/);
});
