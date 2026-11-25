const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const http=require('node:http');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
test('IndexedDB preserves nonextractable device keys and pause across real browser restart',async()=>{
 const allowed=new Set(['device-store.mjs','browser-auth.mjs']);
 const server=http.createServer((req,res)=>{const name=req.url.slice(1);if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<title>Isolated storage test</title>');}if(!allowed.has(name)){res.writeHead(404);return res.end();}res.setHeader('Content-Type','application/javascript');res.end(fs.readFileSync(path.join(__dirname,name)));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'livekarte-storage-'));
 const executablePath=process.env.CHROME_PATH;let context;
 try{
  context=await chromium.launchPersistentContext(directory,{headless:true,executablePath,args:['--no-sandbox']});
  let page=await context.newPage();await page.goto(origin);
  const first=await page.evaluate(async()=>{const {createDeviceStore}=await import('/device-store.mjs');const store=createDeviceStore();const record=await store.prepare('a'.repeat(24));record.paused=true;await store.save(record);let rejected=false;try{await crypto.subtle.exportKey('pkcs8',record.privateKey);}catch{rejected=true;}return {publicKey:record.publicKey,rejected};});
  assert.equal(first.rejected,true);
  await context.close();context=await chromium.launchPersistentContext(directory,{headless:true,executablePath,args:['--no-sandbox']});page=await context.newPage();await page.goto(origin);
  const second=await page.evaluate(async()=>{const {createDeviceStore}=await import('/device-store.mjs');const store=createDeviceStore(),record=await store.load();let mismatchRejected=false;try{await store.prepare('b'.repeat(24));}catch{mismatchRejected=true;}const bytes=new TextEncoder().encode('restart proof');const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},record.privateKey,bytes);const publicKey=await crypto.subtle.importKey('spki',Uint8Array.from(atob(record.publicKey.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)),{name:'ECDSA',namedCurve:'P-256'},true,['verify']);return {publicKey:record.publicKey,paused:record.paused,mismatchRejected,verified:await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,signature,bytes)};});
  assert.equal(second.publicKey,first.publicKey);assert.equal(second.paused,true);assert.equal(second.mismatchRejected,true);assert.equal(second.verified,true);
 }finally{await context?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
