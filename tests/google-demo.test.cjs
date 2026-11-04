const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const G=require('../google-demo.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Google preview module accepts a browser-format demo key, not arbitrary input',()=>{
 assert.equal(G.keyLooksValid('AIza'+'x'.repeat(35)),true);
 for(const value of ['','not-a-key','AIza','../../secret','AIza'+'$'.repeat(35)])
   assert.equal(G.keyLooksValid(value),false);
});
test('Google JS endpoint is the only imported provider API and uses origin referrer',()=>{
 const url=new URL(G.scriptUrl('AIza'+'x'.repeat(35)));
 assert.equal(url.origin,'https://maps.googleapis.com');
 assert.equal(url.pathname,'/maps/api/js');
 assert.equal(url.searchParams.get('loading'),'async');
 assert.equal(url.searchParams.get('auth_referrer_policy'),'origin');
 assert.equal(url.searchParams.get('callback'),'__livekarteDemoReady');
 assert.equal(url.searchParams.get('libraries'),null);
 const code=read('google-demo.js');
 assert.doesNotMatch(code,/fetch\(|PlacesService|computeRoutes|directionsService|places\.googleapis|routes\.googleapis/);
});
test('Google is never loaded on app startup, key only from manual local browser input',()=>{
 const code=read('google-demo.js');
 const before=code.slice(0,code.indexOf("    open.addEventListener('click'"));
 assert.doesNotMatch(before,/document\.head\.append\(script\)/);
 const after=code.slice(code.indexOf("    open.addEventListener('click'"));
 assert.match(after,/document\.head\.append\(script\)/);
 assert.match(code,/localStorage\.getItem\(KEY_STORE\)/);
 assert.match(code,/localStorage\.setItem\(KEY_STORE,key\)/);
 assert.match(code,/localStorage\.removeItem\(KEY_STORE\)/);
 assert.match(code,/root\.gm_authFailure=\(\)=>fail\(/);
 assert.match(code,/script\.onerror=\(\)=>fail\(/);
 assert.match(code,/expiry=setTimeout\(\(\)=>fail\(/);
 assert.match(code,/map\.invalidateSize\(\)/);
 assert.doesNotMatch(code,/github\.com\/repos|window\.LivekarteSync|postMessage|sendBeacon/);
});
test('OSM remains default and Google controls sit below rather than over map',()=>{
 const html=read('index.html'),css=read('style.css'),app=read('app.js');
 for(const id of ['google-demo-map','google-demo-control','google-demo-key',
 'google-demo-start','google-demo-osm','google-demo-forget','google-demo-status'])
   assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/src="google-demo\.js"/);
 assert.match(html,/Google-Bewertungen und Rezensionen sind mit dem Demo-Key nicht verfügbar/);
 assert.match(app,/const googleDemo=window\.LivekarteGoogleDemo\?\.init\(/);
 assert.match(app,/googleDemo\?\.refresh\(\)/);
 assert.match(css,/\.google-demo-map\[hidden\]\{display:none!important\}/);
 assert.match(css,/\.google-demo-control\{/);
 assert.match(css,/\.google-demo-map\{position:absolute;inset:0;z-index:350/);
});
test('build ships only first-party module, never user key or external Google assets',()=>{
 const sw=read('sw.js'),workflow=read('.github/workflows/pages.yml'),
       stamp=read('scripts/stamp_pwa_version.py');
 assert.match(sw,/'google-demo\.js'/);
 assert.doesNotMatch(sw,/maps\.googleapis\.com|AIza/);
 assert.match(workflow,/node --check google-demo\.js/);
 assert.match(workflow,/cp google-demo\.js public\//);
 assert.match(stamp,/\("src", "google-demo\.js"\)/);
});
