const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ui=read('ticket-library-ui.js'),html=read('index.html'),
  css=read('style.css'),core=read('ticket-library.js');

function buildPreviewFixture(){
  const handlers=Object.create(null),revoke=[],create=[];
  const make=id=>({
    id,hidden:false,src:'',href:'',download:'',textContent:'',disabled:false,open:false,
    clientWidth:400,clientHeight:700,offsetWidth:400,offsetHeight:700,
    naturalWidth:0,naturalHeight:0,style:{},attrs:{},events:{},classList:{
      values:new Set(),add(c){this.values.add(c)},remove(c){this.values.delete(c)},
      contains(c){return this.values.has(c)}
    },
    setAttribute(k,v){this.attrs[k]=v;},
    removeAttribute(k){delete this[k];},
    addEventListener(name,fn){this.events[name]=fn;},
    focus(){this.focused=true;},
    showModal(){this.open=true;},
    close(){this.open=false;if(this.events.close)handlers.lastClose=this.events.close;}
  });
  const names=['vault-preview','vault-preview-image','vault-preview-pdf',
    'vault-preview-download','vault-preview-close','vault-preview-scan',
    'vault-preview-scan-exit','vault-preview-title','ticket-scan-stage',
    'ticket-scan-frame','ticket-scan-image','ticket-scan-controls',
    'ticket-scan-out','ticket-scan-in','ticket-scan-zoom'];
  const els=Object.fromEntries(names.map(id=>[id,make(id)]));
  const $=id=>{if(!els[id])throw Error('Missing '+id);return els[id];};
  const snippet=ui.slice(ui.indexOf('  let previewIsImage='),ui.indexOf('  function renderBackupHealth(files){'));
  assert.ok(snippet.startsWith('  let previewIsImage='));
  assert.ok(snippet.includes('function enterScanMode()'));
  const context={
    $,currentPreviewUrl:null,window:{addEventListener(name,fn){handlers[name]=fn}},
    URL:{createObjectURL(blob){create.push(blob);return 'blob:local-ticket-'+create.length},
      revokeObjectURL(url){revoke.push(url)}},
    shelf:{async get(id){return id==='image'?{blob:{},name:'qr.jpg',title:'Kyoto QR',type:'image/jpeg'}:
      {blob:{},name:'ride.pdf',title:'Hida PDF',type:'application/pdf'}}}
  };
  vm.runInNewContext(snippet+'\nthis.viewTicket=viewTicket;this.preview=preview;',context);
  return {els,ctx:context,handlers,create,revoke};
}

test('all image types have QR control mode but PDFs keep their existing preview',()=>{
  for(const id of ['vault-preview-scan','vault-preview-scan-exit','ticket-scan-controls',
    'ticket-scan-stage','ticket-scan-image','ticket-scan-in','ticket-scan-out','ticket-scan-zoom']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/aria-label="Vergrößerter QR-Screenshot zum Vorzeigen"/);
  assert.match(ui,/if\(item\.type!=='application\/pdf'\)/);
  assert.match(ui,/scanButton\.onclick=\(\)=>busy\(scanButton,\(\)=>viewTicket\(item\.id,true\)\)/);
  assert.match(ui,/actions\.insertBefore\(scanButton,edit\)/);
  assert.match(ui,/actions\.append\(pin,show,edit,save,remove\)/);
  assert.match(css,/\.vault-preview\.is-scan-mode/);
  assert.match(css,/height:100dvh;max-height:100dvh/);
  assert.match(css,/background:#fff;color:#000/);
  assert.match(css,/overflow:auto;background:#fff/);
});

test('image QR viewing uses the same local Blob URL, supports zoom and returns to preview',async()=>{
  const {els,ctx,revoke,handlers}=buildPreviewFixture();
  await ctx.viewTicket('image',true);
  assert.equal(els['vault-preview'].open,true);
  assert.equal(els['vault-preview'].classList.contains('is-scan-mode'),true);
  assert.equal(els['vault-preview-scan'].hidden,true);
  assert.equal(els['vault-preview-scan-exit'].hidden,false);
  assert.equal(els['ticket-scan-stage'].hidden,false);
  assert.equal(els['ticket-scan-controls'].hidden,false);
  assert.equal(els['ticket-scan-image'].src,'blob:local-ticket-1');
  assert.equal(els['vault-preview-image'].src,'blob:local-ticket-1');
  assert.equal(els['vault-preview-pdf'].hidden,true);
  const image=els['ticket-scan-image'];
  image.naturalWidth=1600;image.naturalHeight=3200;
  image.events.load();
  assert.equal(els['ticket-scan-zoom'].textContent,'100 %');
  assert.equal(image.style.width,'350px'); // 700 / 3200 * 1600
  assert.equal(image.style.height,'700px');
  assert.equal(els['ticket-scan-out'].disabled,true);
  els['ticket-scan-in'].onclick();
  assert.equal(els['ticket-scan-zoom'].textContent,'150 %');
  assert.equal(image.style.width,'525px');
  assert.equal(image.style.height,'1050px');
  assert.equal(els['ticket-scan-frame'].style.width,'525px');
  assert.equal(els['ticket-scan-frame'].style.height,'1050px');
  els['ticket-scan-in'].onclick();
  els['ticket-scan-in'].onclick();
  assert.equal(els['ticket-scan-zoom'].textContent,'300 %');
  assert.equal(els['ticket-scan-in'].disabled,true);
  els['vault-preview-scan-exit'].onclick();
  assert.equal(els['vault-preview'].classList.contains('is-scan-mode'),false);
  assert.equal(els['ticket-scan-stage'].hidden,true);
  assert.equal(els['vault-preview-scan'].hidden,false);
  assert.equal(revoke.length,0,'switching modes must not discard the file URL');
  els['vault-preview-close'].onclick();
  assert.deepEqual(revoke,['blob:local-ticket-1']);
  assert.equal(els['vault-preview'].open,false);
  assert.equal(els['ticket-scan-image'].src,undefined);
  assert.equal(els['vault-preview-download'].href,undefined);
  if(handlers.lastClose)handlers.lastClose();
  assert.equal(revoke.length,1,'Esc/close cleanup must not double-release the URL');
});

test('PDFs retain normal preview with no control mode, no QR image and unchanged download',async()=>{
  const {els,ctx,revoke}=buildPreviewFixture();
  await ctx.viewTicket('pdf',true);
  assert.equal(els['vault-preview'].open,true);
  assert.equal(els['vault-preview-scan'].hidden,true);
  assert.equal(els['ticket-scan-stage'].hidden,true);
  assert.equal(els['vault-preview-image'].hidden,true);
  assert.equal(els['vault-preview-pdf'].hidden,false);
  assert.equal(els['vault-preview-pdf'].src,'blob:local-ticket-1');
  assert.equal(els['vault-preview-download'].href,'blob:local-ticket-1');
  assert.equal(els['vault-preview-download'].download,'ride.pdf');
  els['vault-preview-scan'].onclick();
  assert.equal(els['vault-preview'].classList.contains('is-scan-mode'),false);
  els['vault-preview-close'].onclick();
  assert.equal(revoke.length,1);
});

test('QR view needs no network, changes only visual sizes and never alters stored tickets',()=>{
  const scan=ui.slice(ui.indexOf('  let previewIsImage='),ui.indexOf('  function renderBackupHealth(files){'));
  assert.doesNotMatch(scan,/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|navigator\.credentials|navigator\.geolocation/);
  assert.doesNotMatch(scan,/localStorage|indexedDB\.deleteDatabase|clear\(\)/);
  assert.match(scan,/const zoomLevels=\[1,1\.5,2,3\]/);
  assert.match(scan,/Math\.min\(stage\.clientWidth\/image\.naturalWidth,/);
  assert.match(scan,/frame\.style\.width=Math\.max\(stage\.clientWidth,width\)/);
  assert.match(scan,/stage\.scrollLeft=Math\.max\(0,/);
  assert.match(scan,/if\(!previewIsImage\|\|!currentPreviewUrl\)return/);
  assert.match(scan,/if\(!scanActive\)return/);
  assert.match(core,/async get\(id\)/);
  assert.match(core,/async backup\(\)/);
});
