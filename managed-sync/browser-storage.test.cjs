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


test('Managed mode hides all PAT setup while disabled mode retains the existing fallback',async()=>{
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const start=html.indexOf('<details id="outbox-panel"');
 const end=html.indexOf('</details>',start);
 assert.ok(start>=0&&end>start,'Missing outbox panel');
 const panel=html.slice(start,end+'</details>'.length);
 const files=new Set(['style.css','sync-out.js','managed-sync/bootstrap.mjs','managed-sync/browser-ui.mjs','managed-sync/browser-auth.mjs','managed-sync/device-store.mjs']);
 const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  if(url.pathname==='/'){
   const endpoint=url.searchParams.get('managed')==='1'?'https://example.invalid':null;
   res.setHeader('Content-Type','text/html');
   return res.end('<link rel="stylesheet" href="/style.css"><div class="sync-body">'+panel+'</div><script>window.LivekarteOutboxCore={};window.LivekarteExportTicketSnapshot=()=>[];window.LivekarteManagedSyncEndpoint='+JSON.stringify(endpoint)+'</script><script src="/sync-out.js"></script>');
  }
  const file=url.pathname.slice(1);
  if(!files.has(file)){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/javascript');
  res.end(fs.readFileSync(path.join(root,file)));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:393,height:873},isMobile:true,hasTouch:true});
  await page.goto('http://127.0.0.1:'+server.address().port+'/?managed=0');
  await page.locator('#outbox-panel').evaluate(el=>el.open=true);
  assert.equal(await page.locator('#outbox-legacy-setup').isVisible(),true);
  assert.equal(await page.locator('#outbox-managed-help').isVisible(),false);
  await page.goto('http://127.0.0.1:'+server.address().port+'/?managed=1');
  await page.locator('#outbox-panel').evaluate(el=>el.open=true);
  await page.waitForFunction(()=>document.getElementById('outbox-connect').textContent==='Gerät verbinden');
  assert.equal(await page.locator('#outbox-legacy-setup').isVisible(),false);
  assert.equal(await page.locator('#outbox-token').isVisible(),false);
  assert.equal(await page.locator('#outbox-legacy-help').isVisible(),false);
  assert.equal(await page.locator('#outbox-managed-help').isVisible(),true);
  assert.equal(await page.locator('#outbox-connect').isVisible(),true);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
