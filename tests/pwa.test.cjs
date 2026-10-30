const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const root=join(__dirname,'..');
const read=p=>readFileSync(join(root,p),'utf8');

test('installable GitHub Pages manifest has stable identity and real Android icons',()=>{
 const m=JSON.parse(read('manifest.json'));
 assert.equal(m.id,'/meine-livekarte/');
 assert.equal(m.start_url,'./');
 assert.equal(m.scope,'./');
 assert.equal(m.display,'standalone');
 assert.equal(m.lang,'de');
 const specs=m.icons.map(x=>[x.src,x.sizes,x.purpose]);
 assert.deepEqual(specs,[
  ['./icons/livekarte-192.png','192x192','any'],
  ['./icons/livekarte-512.png','512x512','any'],
  ['./icons/livekarte-maskable-512.png','512x512','maskable']
 ]);
 const svg=read('icons/livekarte.svg');
 assert.match(svg,/<svg /);
 assert.match(svg,/C monogram is the dashed route/);
 assert.match(svg,/stroke-dasharray="17 27"/);
 const iconBuild=read('scripts/build_pwa_icons.py');
 for(const icon of m.icons)assert.ok(iconBuild.includes(icon.src.slice('./icons/'.length)));
 const html=read('index.html');
 assert.match(html,/<link rel="manifest" href="manifest\.json">/);
 assert.match(html,/<link rel="icon" href="icons\/livekarte\.svg"/);
 assert.match(html,/id="install-app-card"/);
 assert.match(html,/id="install-app-button"/);
 assert.match(html,/id="offline-notice"/);
 assert.match(html,/src="pwa\.js"/);
 assert.match(html,/src="sync\.js"/);
 assert.match(html,/src="sync-out\.js"/);
});

test('PWA install UI is optional; no browser storage reset or token persistence',()=>{
 const code=read('pwa.js');
 assert.match(code,/beforeinstallprompt/);
 assert.match(code,/appinstalled/);
 assert.match(code,/navigator\.serviceWorker\.register\('\.\/sw\.js'/);
 assert.match(code,/display-mode: standalone/);
 assert.match(code,/install-app-button/);
 assert.match(code,/navigator\.onLine/);
 const executable=code.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 assert.doesNotMatch(executable,/localStorage|indexedDB|caches\.delete/);
 assert.doesNotMatch(code,/accessToken|github_pat_|GPS|geolocation/);
});

test('service worker has a strict shell-only allowlist and never intercepts sync or map tiles',async()=>{
 const callbacks={};
 const scope='https://cobrachris.github.io/meine-livekarte/';
 const store=new Map(),written=[];
 const cache={
  async addAll(urls){
   for(const url of urls)store.set(url,{cached:true,from:url});
  },
  async put(url,response){
   written.push(url);
   store.set(url,response);
  }
 };
 const caches={
  async open(){return cache;},
  async keys(){return ['old-unrelated-app','livekarte-shell-old'];},
  async delete(key){written.push('deleted:'+key);return true;},
  async match(url){return store.get(url);}
 };
 let offline=false,requestCount=0;
 const fakeFetch=async request=>{
  requestCount++;
  if(offline)throw Error('offline');
  return {ok:true,type:'basic',from:request.url,clone(){return {cached:true};}};
 };
 const self={
  registration:{scope},
  addEventListener:(name,fn)=>{callbacks[name]=fn;},
  async skipWaiting(){},
  clients:{async claim(){}}
 };
 vm.runInNewContext(read('sw.js'),{self,caches,fetch:fakeFetch,URL,Set},
   {filename:'sw.js'});
 let installPromise;
 callbacks.install({waitUntil(p){installPromise=p;}});
 await installPromise;
 assert.ok(store.has(scope+'index.html'));
 assert.ok(store.has(scope+'app.js'));
 assert.ok(store.has(scope+'icons/livekarte-192.png'));
 assert.ok(!store.has(scope+'sync/inbox/864d9d986ab66ddf2e836a26.json'));
 let activated;
 callbacks.activate({waitUntil(p){activated=p;}});
 await activated;
 assert.ok(written.includes('deleted:livekarte-shell-old'));
 assert.ok(!written.includes('deleted:old-unrelated-app'));

 async function check(url,{mode='same-origin',method='GET',auth=false}={}){
  let result;
  callbacks.fetch({
   request:{url,mode,method,headers:{has:k=>auth&&k==='Authorization'}},
   respondWith(p){result=p;}
  });
  return result?await result:null;
 }
 assert.equal(await check('https://tile.openstreetmap.org/1/1/1.png'),null);
 assert.equal(await check(scope+'sync/inbox/864d9d986ab66ddf2e836a26.json'),null);
 assert.equal(await check('https://api.github.com/repos/CobraChris/meine-livekarte-private-sync'),null);
 assert.equal(await check(scope+'app.js',{auth:true}),null);
 assert.equal(await check(scope+'app.js',{method:'POST'}),null);
 assert.equal(await check(scope+'private-unlisted.json'),null);
 const online=await check(scope+'app.js');
 assert.equal(online.ok,true);
 assert.ok(written.includes(scope+'app.js'));
 offline=true;
 const offlinePage=await check(scope+'?view=town-takayama',{mode:'navigate'});
 assert.equal(offlinePage.cached,true);
 assert.equal(requestCount,2); // one shell asset and one failed navigation request
});

test('GitHub Pages workflow builds PNGs and includes only needed public assets',()=>{
 const workflow=read('.github/workflows/pages.yml');
 assert.match(workflow,/node --check sw\.js/);
 assert.match(workflow,/node --check pwa\.js/);
 assert.match(workflow,/CairoSVG==2\.8\.2/);
 assert.match(workflow,/python scripts\/build_pwa_icons\.py/);
 assert.match(workflow,/cp index\.html style\.css core\.js(?: walking-core\.js)? app\.js sync\.js outbox-core\.js sync-out\.js pwa\.js sw\.js manifest\.json public\//);
 assert.match(workflow,/cp icons\/livekarte\.svg public\/icons\//);
 assert.match(workflow,/cp -r sync public\//);
 assert.doesNotMatch(workflow,/cp -r scripts public/);
});
