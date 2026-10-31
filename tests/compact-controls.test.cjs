const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const cp=require('node:child_process');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('map uses compact mobile controls while maintaining keyboard and screen-reader labels',()=>{
  const html=read('index.html'),css=read('style.css'),app=read('app.js');
  assert.match(html,/<div class="map-actions"><button id="fit" type="button" title="Alle Orte" aria-label="Alle Orte">/);
  assert.match(html,/<button id="gps" type="button" aria-pressed="false" aria-label="GPS einschalten"/);
  assert.match(css,/\.map-actions\{\s*position:absolute;z-index:750;\s*left:auto;right:10px;bottom:68px;/);
  assert.match(css,/width:44px;display:flex;flex-direction:column/);
  assert.match(css,/width:44px;height:44px;min-width:44px;min-height:44px/);
  assert.match(css,/\.map-actions button span\{\s*position:absolute!important;/);
  assert.match(app,/\$\('fit'\)\.setAttribute\('aria-label',\$\('fit'\)\.lastElementChild\.textContent\)/);
  assert.match(app,/\$\('gps'\)\.setAttribute\('aria-label','GPS ausschalten/);
  assert.match(css,/\.walk-route-panel\{\s*left:10px;bottom:66px;\s*width:calc\(100% - 75px\)/);
});

test('the button for walking directions is immediately beneath the place name, not below long descriptions',()=>{
  const app=read('app.js');
  const start=app.indexOf("const popup = node('div',undefined,'place-popup-pan-surface');");
  const end=app.indexOf('const marker = L.marker(',start);
  const snippet=app.slice(start,end);
  assert.ok(snippet.includes("popupHeader.append(node('strong',p.name))"));
  assert.ok(snippet.includes("popup.append(popupHeader)"));
  assert.ok(snippet.indexOf('popup.append(popupHeader)')<snippet.indexOf('popup.append(quickActions)'));
  assert.ok(snippet.includes("popup.append(quickActions)"));
  assert.ok(snippet.includes("appendPlaceTiming(popup,p)"));
  assert.ok(snippet.includes("const description=node('p',p.description,'place-popup-description')"));
  assert.ok(snippet.includes("popup.append(description,inPopup)"));
  assert.ok(snippet.indexOf('popup.append(quickActions)')<
    snippet.indexOf('appendPlaceTiming(popup,p)'));
  assert.ok(snippet.indexOf('popup.append(quickActions)')<
    snippet.indexOf("const description=node('p',p.description"));
  assert.match(app,/marker\.bindPopup\(popup,\{\s*maxWidth:320,maxHeight:250,/);
});

test('PWA can display non-destructive update prompt and reload after user action',()=>{
  const html=read('index.html'),sw=read('sw.js'),pwa=read('pwa.js');
  assert.match(html,/src="build-version\.js"/);
  assert.match(html,/id="app-update-banner"/);
  assert.match(html,/id="app-update-now"/);
  assert.match(pwa,/fetch\('\.\/app-version\.json'/);
  assert.match(pwa,/cache:'no-store',credentials:'omit',mode:'same-origin'/);
  assert.match(pwa,/window\.LivekarteAppBuild/);
  assert.match(pwa,/window\.location\.reload\(\)/);
  assert.match(pwa,/document\.addEventListener\('visibilitychange'/);
  assert.match(pwa,/window\.addEventListener\('focus',requestUpdateCheck\)/);
  assert.match(pwa,/window\.addEventListener\('load',requestUpdateCheck\)/);
  assert.doesNotMatch(pwa,/localStorage\.clear\(|indexedDB\.deleteDatabase\(|deleteItem\(/);
  assert.match(sw,/const CACHE_NAME='livekarte-shell-pwa-v15'/);
  assert.match(sw,/'build-version\.js'/);
  assert.match(sw,/fetch\(req,\{cache:'no-store'\}\)/);
  assert.doesNotMatch(sw,/app-version\.json/);
});

test('GitHub publish script stamps unique current SHA on every app asset and produces remote version probe',()=>{
  const stamp=read('scripts/stamp_pwa_version.py');
  const workflow=read('.github/workflows/pages.yml');
  assert.match(workflow,/run: python3 scripts\/stamp_pwa_version\.py/);
  assert.ok(workflow.indexOf('Stamp deployed PWA version')<
    workflow.indexOf('Generate PNG PWA icons'));
  const sha='a'.repeat(40);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'livekarte-pwa-stamp-'));
  try{
    fs.mkdirSync(path.join(dir,'scripts'));
    fs.mkdirSync(path.join(dir,'public'));
    fs.writeFileSync(path.join(dir,'scripts/stamp_pwa_version.py'),stamp);
    const assetTags=[
      ['href','style.css'],['href','vendor/leaflet.css'],
      ['src','vendor/leaflet.js'],['src','core.js'],
      ['src','walking-core.js'],['src','day-plan-core.js'],['src','route-discovery.js'],['src','app.js'],
      ['src','sync.js'],['src','outbox-core.js'],
      ['src','sync-out.js'],['src','build-version.js'],['src','pwa.js']
    ];
    const html=assetTags.map(([k,v])=>'<script '+k+'="'+v+'"></script>').join('\n');
    fs.writeFileSync(path.join(dir,'public/index.html'),html);
    cp.execFileSync('python3',[path.join(dir,'scripts/stamp_pwa_version.py')],{
      env:{...process.env,GITHUB_SHA:sha}
    });
    const output=fs.readFileSync(path.join(dir,'public/index.html'),'utf8');
    for(const [k,v] of assetTags)
      assert.ok(output.includes(k+'="'+v+'?v='+sha+'"'),v);
    const localVersion=fs.readFileSync(path.join(dir,'public/build-version.js'),'utf8');
    assert.match(localVersion,/window\.LivekarteAppBuild=/);
    assert.ok(localVersion.includes(sha));
    const publicVersion=JSON.parse(fs.readFileSync(path.join(dir,'public/app-version.json'),'utf8'));
    assert.deepEqual(publicVersion,{build:sha});
    assert.doesNotMatch(output,/github_pat_|password|location\.coords/i);
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
