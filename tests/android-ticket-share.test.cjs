const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const S=require('../ticket-share-inbox.js');
const old=globalThis.indexedDB;
after(()=>{globalThis.indexedDB=old;});
function database(){
  const stores=new Map();
  const db={
    objectStoreNames:{contains:name=>stores.has(name)},
    createObjectStore(name){stores.set(name,new Map());},
    close(){},
    transaction(name){
      const tx={oncomplete:null,onerror:null,onabort:null,error:null};
      let queued=0;
      const request=callback=>{
        const r={onsuccess:null,onerror:null,result:null,error:null};
        queued++;
        queueMicrotask(()=>{
          try{r.result=callback();r.onsuccess?.();}
          catch(e){r.error=e;tx.error=e;r.onerror?.();tx.onabort?.();}
          queued--;
          if(queued===0)queueMicrotask(()=>tx.oncomplete?.());
        });return r;
      };
      tx.objectStore=name=>{
        const map=stores.get(name);if(!map)throw Error('missing object store');
        return {
          getAll:()=>request(()=>[...map.values()]),
          add:r=>request(()=>{if(map.has(r.id))throw Error('duplicate');map.set(r.id,r);return r.id;}),
          delete:id=>request(()=>{map.delete(id);})
        };
      };return tx;
    }
  };
  globalThis.indexedDB={open(name,version){
    assert.equal(name,S.DB_NAME);assert.equal(version,1);
    const req={result:null,onupgradeneeded:null,onsuccess:null,onerror:null};
    queueMicrotask(()=>{
      req.result=db;
      if(!stores.has('pending'))req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  }};
  return stores;
}
const pdf=new Uint8Array([37,80,68,70,45,49,46,55,10,37,72,69,76,76,79]);
function input(name='booked-ticket.pdf',type='application/pdf',bytes=pdf){
  const blob=new Blob([bytes],{type});
  return {name,type,size:blob.size,arrayBuffer:()=>blob.arrayBuffer()};
}
test('share target declares exact POST multipart file types on installed PWA',()=>{
  const m=JSON.parse(read('manifest.json'));
  assert.equal(m.id,'/meine-livekarte/');
  assert.equal(m.share_target.action,'./share-ticket');
  assert.equal(m.share_target.method,'POST');
  assert.equal(m.share_target.enctype,'multipart/form-data');
  assert.equal(m.share_target.params.files.length,1);
  assert.equal(m.share_target.params.files[0].name,'ticket');
  for(const type of ['application/pdf','image/png','image/jpeg','image/webp','.pdf','.png','.jpg','.jpeg','.webp'])
    assert.ok(m.share_target.params.files[0].accept.includes(type),type);
});

test('incoming file is validated, stays pending and only saved after explicit confirmation',async()=>{
  const stores=database();
  const id=await S.store(input());
  assert.equal(typeof id,'string');
  let pending=await S.pending();
  assert.equal(pending.length,1);
  assert.equal(pending[0].name,'booked-ticket.pdf');
  assert.equal(pending[0].type,'application/pdf');
  assert.deepEqual(new Uint8Array(await pending[0].blob.arrayBuffer()),pdf);
  assert.deepEqual([...stores.keys()],['pending']);
  assert.equal(stores.get('pending').size,1);
  await S.remove(id);
  pending=await S.pending();
  assert.equal(pending.length,0);
});

test('invalid shared HTML and spoofed PDF/JPEG are rejected and never queued',async()=>{
  database();
  await assert.rejects(()=>S.store(input('unsafe.html','text/html',new TextEncoder().encode('<script>x</script>'))),/Dateityp/);
  await assert.rejects(()=>S.store(input('wrong.pdf','application/pdf',new TextEncoder().encode('<script>x</script>'))),/Dateiinhalt/);
  await assert.rejects(()=>S.store(input('too-large.pdf','application/pdf',new Uint8Array(S.MAX_BYTES+1))),/10 MB/);
  assert.equal((await S.pending()).length,0);
  const jpg=new Uint8Array([255,216,255,1]);
  const j=await S.store(input('qr.jpeg','image/jpeg',jpg));
  assert.equal((await S.pending())[0].type,'image/jpeg');
  await S.remove(j);
});

test('pending share queue never silently overwrites earlier requests',async()=>{
  database();
  for(let i=0;i<S.MAX_PENDING;i++)await S.store(input('t'+i+'.pdf'));
  const saved=await S.pending();
  assert.equal(saved.length,S.MAX_PENDING);
  await assert.rejects(()=>S.store(input('sixth.pdf')),/zuerst geteilte Tickets/);
  assert.equal((await S.pending()).length,S.MAX_PENDING);
  assert.ok(saved.every(r=>r.blob instanceof Blob));
});

test('worker intercepts exact share-target POST locally and redirects with 303',async()=>{
  const callbacks={},scope='https://cobrachris.github.io/meine-livekarte/';
  let stored=null,requests=0;
  const self={
    registration:{scope},
    addEventListener(name,cb){callbacks[name]=cb},
    LivekarteTicketShareInbox:{
      async store(file){stored=file;}
    }
  };
  const imports=[];
  const fakeResponse={redirect(url,status){return {url,status}}};
  const ctx={self,importScripts(name){imports.push(name)},URL,
    Response:fakeResponse,Set,caches:{},fetch(){requests++;throw Error('network should not be used');}};
  vm.runInNewContext(read('sw.js'),ctx,{filename:'sw.js'});
  assert.deepEqual(imports,['./ticket-share-inbox.js']);
  let response;
  function fire(url,method,form){
    response=null;
    callbacks.fetch({request:{url,method,
      headers:{has(){return false}},
      formData:async()=>form},respondWith(p){response=p;}});
    return response;
  }
  const file=input();
  const served=fire(scope+'share-ticket','POST',{get:key=>key==='ticket'?file:null});
  assert.ok(served,'share route must be intercepted');
  const answer=await served;
  assert.equal(answer.status,303);
  assert.equal(answer.url,scope+'?shared-ticket=ready#ticket-vault');
  assert.equal(stored,file);
  assert.equal(requests,0);
  assert.equal(fire(scope+'elsewhere','POST',{}),null);
  assert.equal(fire('https://example.com/meine-livekarte/share-ticket','POST',{}),null);
  const bad=await fire(scope+'share-ticket','POST',{get:()=>null});
  assert.equal(bad.url,scope+'?shared-ticket=missing#ticket-vault');
});

test('user explicitly previews, saves or discards; no automatic import on share',()=>{
  const html=read('index.html'),ui=read('ticket-library-ui.js'),
    sw=read('sw.js'),workflow=read('.github/workflows/pages.yml'),
    stamp=read('scripts/stamp_pwa_version.py');
  for(const id of ['ticket-shared','ticket-shared-name','ticket-shared-preview',
    'ticket-shared-save','ticket-shared-discard','ticket-shared-title-input','ticket-shared-trip'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/src="ticket-share-inbox\.js"/);
  assert.match(ui,/async function renderShared\(\)/);
  assert.match(ui,/await SHARE\.pending\(\)/);
  assert.match(ui,/shelf\.add\(file/);
  assert.match(ui,/await SHARE\.remove\(item\.id\)/);
  assert.match(ui,/confirm\('Geteilte Datei verwerfen/);
  assert.match(ui,/root\.open=true/);
  assert.match(ui,/new URLSearchParams\(window\.location\.search\)/);
  assert.match(sw,/'ticket-share-inbox\.js'/);
  assert.match(workflow,/cp ticket-vault\.js ticket-library\.js ticket-library-ui\.js ticket-share-inbox\.js public\//);
  assert.match(stamp,/\("src", "ticket-share-inbox\.js"\)/);
  const source=read('ticket-share-inbox.js');
  assert.doesNotMatch(source,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage/);
  assert.doesNotMatch(source,/indexedDB\.deleteDatabase/);
});
