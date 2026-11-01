const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {Vault,validateMime,MAX_FILE,FORMAT}=require('../ticket-vault.js');

function makeDb(){
  const data={meta:new Map(),files:new Map()};
  const db={
    objectStoreNames:{contains:k=>Object.hasOwn(data,k)},
    createObjectStore(k){data[k]=new Map();},
    transaction(names){
      const tx={oncomplete:null,onabort:null,onerror:null,error:null};
      let pending=0;
      function req(fn){
        const r={onsuccess:null,onerror:null,result:undefined,error:null};
        pending++;
        queueMicrotask(()=>{
          try{
            r.result=fn();
            r.onsuccess?.();
          }catch(e){
            r.error=e;tx.error=e;
            r.onerror?.();tx.onabort?.();
          }
          pending--;
          if(pending===0)queueMicrotask(()=>tx.oncomplete?.());
        });
        return r;
      }
      tx.objectStore=store=>{
        const map=data[store];
        if(!map)throw Error('no store '+store);
        return {
          get:k=>req(()=>map.get(k)),
          getAll:()=>req(()=>[...map.values()]),
          add:v=>req(()=>{
            const key=v.id??v.key;
            if(map.has(key))throw Error('Duplicate');
            map.set(key,v);
            return key;
          }),
          put:v=>req(()=>{
            const key=v.id??v.key;
            map.set(key,v);
            return key;
          }),
          delete:k=>req(()=>{map.delete(k);return undefined;})
        };
      };
      return tx;
    }
  };
  const mock={open(){
    const req={onsuccess:null,onerror:null,onupgradeneeded:null,result:null};
    queueMicrotask(()=>{
      req.result=db;
      if(!data.initialized){data.initialized=true;req.onupgradeneeded?.();}
      req.onsuccess?.();
    });
    return req;
  }};
  return {mock,data};
}
const orig=global.indexedDB;
after(()=>{global.indexedDB=orig;});
function setDB(){const state=makeDb();global.indexedDB=state.mock;return state;}
const pdfBytes=new Uint8Array([37,80,68,70,45,49,46,52,10,37,226,227,207,211,10]);
function fakeFile(bytes,type,name){
  const blob=new Blob([bytes],{type});
  return {size:blob.size,type:blob.type,name,
    arrayBuffer:()=>blob.arrayBuffer(),text:()=>blob.text()};
}

test('format gate rejects disguised executable files and unsupported content',()=>{
  assert.equal(validateMime('application/pdf','ticket.pdf',pdfBytes),'application/pdf');
  assert.throws(()=>validateMime('text/html','ticket.html',pdfBytes),/Nur PDF/);
  assert.throws(()=>validateMime('application/pdf','ticket.pdf',new TextEncoder().encode('<script>')),/Dateiinhalt/);
  assert.equal(validateMime('image/png','qr.png',
    new Uint8Array([137,80,78,71,13,10,26,10,0])),'image/png');
  assert.equal(validateMime('image/jpeg','qr.jpeg',
    new Uint8Array([255,216,255,0])),'image/jpeg');
  assert.equal(validateMime('image/webp','qr.webp',
    new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80])),'image/webp');
  assert.throws(()=>validateMime('image/svg+xml','qr.svg',new Uint8Array([1,2,3])));
});

test('encrypted local storage hides metadata and bytes; unlock, file, deletion and backup restoration work',async()=>{
  const db=setDB(),a=new Vault();
  assert.equal(await a.exists(),false);
  await assert.rejects(()=>a.initialize('123'),/mindestens 10/);
  const pass='my secure ticket password 2026';
  await a.initialize(pass);
  assert.equal(await a.exists(),true);
  await assert.rejects(()=>a.initialize(pass),/bereits/);
  const file=fakeFile(pdfBytes,'application/pdf','private-QR-ticket.pdf');
  const saved=await a.add(file,{title:'Private DB ICE 1234',trip:'Deutschland Hamburg Berlin'});
  assert.equal(saved.type,'application/pdf');
  assert.equal((await a.list())[0].trip,'Deutschland Hamburg Berlin');
  const stored=db.data.files.get(saved.id);
  assert.equal(stored.iv.length,16);
  assert.notEqual(stored.cipher.byteLength,0);
  assert.ok(stored.cipher instanceof ArrayBuffer);
  assert.equal(stored.metaCipher.includes('Deutschland'),false);
  assert.equal(stored.metaCipher.includes('ICE'),false);
  assert.notDeepEqual(new Uint8Array(stored.cipher),pdfBytes);
  const clear=await a.file(saved.id);
  assert.equal(clear.metadata.name,'private-QR-ticket.pdf');
  assert.deepEqual(new Uint8Array(await clear.blob.arrayBuffer()),pdfBytes);

  const backup=await a.backup();
  const backupString=await backup.text();
  assert.ok(backupString.includes(FORMAT));
  for(const secret of ['private-QR-ticket','Private DB ICE 1234','Deutschland Hamburg Berlin'])
    assert.equal(backupString.includes(secret),false,'backup leaks '+secret);
  a.lock();
  await assert.rejects(()=>a.list(),/entsperren/);
  await assert.rejects(()=>a.unlock('wrong password 2026'),/falsch/);
  await a.unlock(pass);
  assert.equal((await a.list()).length,1);
  await assert.rejects(()=>a.restore(backup,pass),/leeren Gerät/);
  await a.remove(saved.id);
  assert.equal((await a.list()).length,0);

  setDB();
  const restored=new Vault();
  await assert.rejects(()=>restored.restore(backup,'bad password 123'),/Backup-Passwort/);
  assert.equal(await restored.exists(),false);
  await restored.restore(backup,pass);
  assert.equal((await restored.list()).length,1);
  assert.deepEqual(new Uint8Array(await (await restored.file(saved.id)).blob.arrayBuffer()),pdfBytes);
  restored.lock();
  await assert.rejects(()=>restored.file(saved.id),/entsperren/);
});

test('invalid backups fail before creating a local vault',async()=>{
  setDB();const v=new Vault();
  const pass='correct horse battery 2026';
  const cases=[
    {format:'bad',files:[]},
    {format:FORMAT,config:null,files:[]},
    {format:FORMAT,config:{},files:[]}
  ];
  for(const x of cases){
    const blob=new Blob([JSON.stringify(x)],{type:'application/json'});
    await assert.rejects(()=>v.restore(blob,pass),/Backup|Format|beschädigt/);
    assert.equal(await v.exists(),false);
  }
  const big=fakeFile(new Uint8Array(MAX_FILE+1),'application/pdf','huge.pdf');
  await v.initialize(pass);
  await assert.rejects(()=>v.add(big),/10 MB/);
});

test('web app wiring ships encrypted files via GitHub Pages and supports offline PWA shell',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const html=read('index.html'),sw=read('sw.js'),wf=read('.github/workflows/pages.yml'),
    stamp=read('scripts/stamp_pwa_version.py'),ui=read('ticket-vault-ui.js'),
    css=read('style.css');
  for(const file of ['ticket-vault.js','ticket-vault-ui.js']){
    assert.match(html,new RegExp('<script defer src="'+file.replace('.','\\.')+'"></script>'));
    assert.ok(wf.includes('ticket-vault.js ticket-vault-ui.js public/'));
    assert.ok(sw.includes("'"+file+"'"));
    assert.ok(stamp.includes('("src", "'+file+'")'));
  }
  assert.match(sw,/livekarte-shell-pwa-v22/);
  for(const id of ['ticket-vault','vault-new-password','vault-repeat-password','vault-create',
    'vault-locked','vault-unlock','vault-open-input','vault-trip','vault-add',
    'vault-backup','vault-restore','vault-files','vault-preview','vault-preview-pdf',
    'vault-preview-image','vault-persist'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(css,/\.ticket-vault\[open\]/);
  assert.match(ui,/URL\.revokeObjectURL/);
  assert.match(ui,/Date\.now\(\)-lastUse>idleLimit/);
  assert.match(ui,/confirm\(/);
  assert.match(ui,/\.textContent=/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage\.setItem/);
});


test('first-time setup returns independent recovery key; forgotten password can be safely reset',async()=>{
  const state=setDB(),v=new Vault();
  const oldPassword='safe password phrase v2 a';
  const code=await v.initialize(oldPassword);
  assert.match(code,/^LKV2-[A-F0-9]{64}$/);
  const config=state.data.meta.get('config');
  assert.equal(config.version,2);
  assert.equal(config.iterations,310000);
  assert.deepEqual(Object.keys(config).sort(),['iterations','key','password','recovery','version']);
  assert.equal(JSON.stringify(config).includes(code),false,'plaintext recovery key must not persist');
  assert.equal(JSON.stringify(config).includes(oldPassword),false,'password must not persist');
  const saved=await v.add(fakeFile(pdfBytes,'application/pdf','private-ticket.pdf'),
    {title:'Sensitive booking secret',trip:'Deutschland'});
  const original=state.data.files.get(saved.id);
  v.lock();
  await assert.rejects(()=>v.unlock('wrong password 2026'),/falsch/);
  await assert.rejects(()=>v.resetWithRecovery('LKV2-'+ '0'.repeat(64),'new safe password 2026'),/falsch/);
  assert.deepEqual(state.data.meta.get('config'),config);
  const freshCode=await v.resetWithRecovery(code,'a different secure password 2026');
  assert.match(freshCode,/^LKV2-[A-F0-9]{64}$/);
  assert.notEqual(freshCode,code);
  assert.equal(v.legacy,false);
  assert.equal((await v.list()).length,1);
  assert.equal(state.data.files.get(saved.id).cipher,original.cipher,'password reset must not rewrite ticket ciphertext');
  v.lock();
  await assert.rejects(()=>v.unlock(oldPassword),/falsch/);
  await assert.rejects(()=>v.resetWithRecovery(code,'yet another secure password'),/falsch/);
  await v.unlock('a different secure password 2026');
  assert.deepEqual(new Uint8Array(await (await v.file(saved.id)).blob.arrayBuffer()),pdfBytes);
});

test('password change keeps existing recovery token and ticket ciphertext',async()=>{
  const state=setDB(),v=new Vault();
  const code=await v.initialize('first long password 2026');
  const saved=await v.add(fakeFile(pdfBytes,'application/pdf','my-ticket.pdf'));
  const cipher=state.data.files.get(saved.id).cipher;
  await assert.rejects(()=>v.changePassword('incorrect old password','new password phrase 2026'),/bisherige Passwort/);
  await assert.rejects(()=>v.changePassword('first long password 2026','short'),/mindestens 10/);
  assert.equal(state.data.meta.get('config').version,2);
  const changed=await v.changePassword('first long password 2026','long new password 2027');
  assert.equal(changed,null);
  assert.equal(cipher,state.data.files.get(saved.id).cipher);
  v.lock();
  await assert.rejects(()=>v.unlock('first long password 2026'),/falsch/);
  await v.unlock('long new password 2027');
  const newer=await v.rotateRecovery('long new password 2027');
  assert.match(newer,/^LKV2-[A-F0-9]{64}$/);
  assert.notEqual(code,newer);
  v.lock();
  await assert.rejects(()=>v.resetWithRecovery(code,'another long password 2027'),/falsch/);
  const rolled=await v.resetWithRecovery(newer,'another long password 2027');
  assert.notEqual(rolled,newer);
  assert.equal((await v.list()).length,1);
});

test('encrypted backups restore via recovery token with a fresh password (new device)',async()=>{
  setDB();const original=new Vault();
  const oldPass='backup old password 2026';
  const token=await original.initialize(oldPass);
  const file=await original.add(fakeFile(pdfBytes,'application/pdf','db-ticket.pdf'),
    {trip:'German rail',title:'Private booking'});
  const backup=await original.backup();
  const json=await backup.text();
  assert.ok(json.includes('livekarte-ticket-vault-backup-v2'));
  assert.equal(json.includes('Private booking'),false);
  assert.equal(json.includes(token),false);
  setDB();const restored=new Vault();
  await assert.rejects(()=>restored.restore(backup,'LKV2-'+'0'.repeat(64),'recovery','new password 2026'),/Backup-Passwort|Wiederherstellungsschlüssel/);
  assert.equal(await restored.exists(),false);
  const newToken=await restored.restore(backup,token,'recovery','brand new secure password 2026');
  assert.match(newToken,/^LKV2-[A-F0-9]{64}$/);
  assert.notEqual(newToken,token);
  assert.deepEqual(new Uint8Array(await (await restored.file(file.id)).blob.arrayBuffer()),pdfBytes);
  restored.lock();
  await assert.rejects(()=>restored.unlock(oldPass),/falsch/);
  await restored.unlock('brand new secure password 2026');
  assert.equal((await restored.list())[0].title,'Private booking');
  await assert.rejects(()=>restored.restore(backup,oldPass),/leeren Gerät/);
});

test('legacy v1 vault can migrate all encrypted files atomically when old password is known',async()=>{
  const state=setDB();
  const pass='legacy phrase password 2026';
  const cryptoApi=globalThis.crypto;
  const encode=new TextEncoder();
  const salt=cryptoApi.getRandomValues(new Uint8Array(16));
  const material=await cryptoApi.subtle.importKey('raw',encode.encode(pass),'PBKDF2',false,['deriveKey']);
  const legacyKey=await cryptoApi.subtle.deriveKey(
    {name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},
    material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const encrypt=async bytes=>{
    const iv=cryptoApi.getRandomValues(new Uint8Array(12));
    const cipher=await cryptoApi.subtle.encrypt({name:'AES-GCM',iv},legacyKey,bytes);
    return {iv:Buffer.from(iv).toString('base64'),cipher};
  };
  const proof=await encrypt(encode.encode('livekarte-ticket-vault-verifier-v1'));
  const cfg={key:'config',version:1,iterations:310000,salt:Buffer.from(salt).toString('base64'),
    iv:proof.iv,cipher:Buffer.from(proof.cipher).toString('base64')};
  state.data.meta.set('config',cfg);
  const plaintext={name:'legacy-ticket.pdf',title:'Older train ticket',
    trip:'Japan 2026',type:'application/pdf',size:pdfBytes.length,created:'2026-11-01T00:00:00.000Z'};
  const data=await encrypt(pdfBytes),meta=await encrypt(encode.encode(JSON.stringify(plaintext)));
  const id='a'.repeat(32);
  state.data.files.set(id,{id,iv:data.iv,cipher:data.cipher,metaIv:meta.iv,
    metaCipher:Buffer.from(meta.cipher).toString('base64')});
  const legacy=new Vault();
  await legacy.unlock(pass);
  assert.equal(legacy.legacy,true);
  assert.equal(await legacy.hasRecovery(),false);
  assert.equal((await legacy.list()).length,1);
  await assert.rejects(()=>legacy.upgradeLegacy('bad old password'),/bisherige Passwort/);
  assert.equal(state.data.meta.get('config').version,1);
  const code=await legacy.upgradeLegacy(pass);
  assert.match(code,/^LKV2-[A-F0-9]{64}$/);
  assert.equal(state.data.meta.get('config').version,2);
  assert.equal(legacy.legacy,false);
  assert.equal((await legacy.list())[0].title,'Older train ticket');
  legacy.lock();
  await legacy.unlock(pass);
  assert.deepEqual(new Uint8Array(await (await legacy.file(id)).blob.arrayBuffer()),pdfBytes);
});

test('recovery controls expose password changes and rotated key without network communication',()=>{
  const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
  const html=read('index.html'),ui=read('ticket-vault-ui.js');
  for(const id of ['vault-recovery-display','vault-recovery-code','vault-recovery-copy',
    'vault-recovery-dismiss','vault-forgot','vault-forgot-code','vault-forgot-new',
    'vault-forgot-again','vault-forgot-submit','vault-security','vault-change-old',
    'vault-change-new','vault-change-again','vault-change-submit',
    'vault-rotate-password','vault-rotate-submit','vault-legacy-upgrade',
    'vault-upgrade-password','vault-upgrade-submit','vault-restore-use-recovery',
    'vault-restore-new-password'])
    assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(ui,/vault\.resetWithRecovery\(code,fresh\)/);
  assert.match(ui,/vault\.changePassword\(old,fresh\)/);
  assert.match(ui,/vault\.rotateRecovery\(/);
  assert.match(ui,/vault\.upgradeLegacy\(/);
  assert.match(ui,/vault\.restore\(/);
  assert.match(ui,/vault-recovery-code'\)\.textContent=''/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage\.setItem/);
});
