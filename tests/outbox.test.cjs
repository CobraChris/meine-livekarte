const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const C=require('../outbox-core.js');
const sample={plan:'ride-takayama',date:'30.10.2026',from:'Odawara',
  to:'Nagoya',departure:'10:11',status:'ready',source:'manual',updatedAt:20};
const device='864d9d986ab66ddf2e836a26';

test('private repository name and strict ticket data validation',()=>{
 assert.equal(C.normalizeRepo(' CobraChris/meine-livekarte-private-sync '),
   'CobraChris/meine-livekarte-private-sync');
 for(const bad of ['','CobraChris','../x','a/../b','a/.', 'a//b','a/b?token=x'])
   assert.throws(()=>C.normalizeRepo(bad));
 assert.deepEqual(C.normalizeTicket(sample),sample);
 assert.throws(()=>C.normalizeTicket({...sample,status:'paid'}));
 assert.throws(()=>C.normalizeTicket({...sample,updatedAt:-1}));
 assert.throws(()=>C.normalizeTicket({...sample,departure:'99:99'}));
 assert.throws(()=>C.normalizeTicket({...sample,source:'server-admin'}));
});

test('private snapshots preserve newer local state and reject foreign device',()=>{
 const remote={v:1,device,tickets:[{...sample,status:'missing',updatedAt:10}]};
 const result=C.mergeSnapshots(device,[sample],remote);
 assert.equal(result.tickets.length,1);
 assert.equal(result.tickets[0].status,'ready');
 const newerRemote={v:1,device,tickets:[{...sample,status:'missing',updatedAt:30}]};
 const preserved=C.mergeSnapshots(device,[sample],newerRemote);
 assert.equal(preserved.tickets[0].status,'missing');
 assert.throws(()=>C.mergeSnapshots(device,[sample],{...remote,device:'a'.repeat(24)}));
 assert.throws(()=>C.normalizeSnapshot({v:1,device,tickets:[{...sample,status:'oops'}]}));
 const otherLeg={...sample,from:'Nagoya',to:'Takayama',departure:'11:43',updatedAt:0};
 const combined=C.mergeSnapshots(device,[sample,otherLeg],remote);
 assert.equal(combined.tickets.length,2);
 assert.equal(C.normalizeSnapshot(combined).tickets.length,2);
});

function runBrowser({privateRepo=true}={}){
 const elements={};
 const make=id=>elements[id]||(elements[id]={
   value:'',hidden:false,disabled:false,textContent:'',
   classList:{toggle(){}}
 });
 make('outbox-repo').value='CobraChris/meine-livekarte-private-sync';
 make('outbox-token').value='github_pat_'+'a'.repeat(65);
 const calls=[],listeners={},saves={};
 const localStorage={
   getItem:k=>saves[k]||null,
   setItem:(k,v)=>{saves[k]=v;}
 };
 const response=(status,payload)=>({
   status,ok:status>=200&&status<300,async json(){return payload;}
 });
 const ctx={
   window:{
     LivekarteOutboxCore:C,
     LivekarteExportTicketSnapshot:()=>[sample],
     LivekarteGetDeviceId:async()=>device,
     addEventListener:(type,fn)=>{listeners[type]=fn;}
   },
   document:{getElementById:make,addEventListener:(type,fn)=>{listeners[type]=fn;}},
   localStorage,TextEncoder,TextDecoder,atob,btoa,
   setTimeout:()=>99,clearTimeout:()=>{},
   fetch:async(url,init)=>{
     calls.push({url,init});
     if(init.method==='GET' && url.endsWith('meine-livekarte-private-sync'))
       return response(200,{private:privateRepo,
         full_name:'CobraChris/meine-livekarte-private-sync'});
     if(init.method==='GET' && url.includes('/contents/'))return response(404,{});
     if(init.method==='PUT')return response(201,{});
     throw new Error('Unexpected API call '+url);
   }
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../sync-out.js'),'utf8'),
   ctx,{filename:'sync-out.js'});
 return {elements,calls,saves,listeners};
}

test('outbound browser sync verifies private repository, sends only tickets, and never persists token',async()=>{
 const b=runBrowser();
 await b.elements['outbox-connect'].onclick();
 assert.equal(b.calls.length,3);
 assert.equal(b.calls[0].init.method,'GET');
 const put=b.calls[2];
 assert.equal(put.init.method,'PUT');
 assert.match(put.url,/\/contents\/livekarte\/status\/864d9d986ab66ddf2e836a26\.json$/);
 assert.ok(put.init.headers.Authorization.startsWith('Bearer github_pat_'));
 const body=JSON.parse(put.init.body);
 const decoded=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));
 assert.equal(decoded.device,device);
 assert.equal(decoded.tickets.length,1);
 assert.equal(decoded.tickets[0].status,'ready');
 assert.doesNotMatch(JSON.stringify(decoded),/latitude|longitude|gps|bookingCode|qrCode/i);
 assert.equal(b.elements['outbox-token'].value,'');
 assert.ok(!JSON.stringify(b.saves).includes('github_pat_'));
 assert.equal(b.saves['livekarte-private-sync-repo-v1'],
   'CobraChris/meine-livekarte-private-sync');
 assert.match(b.elements['outbox-status'].textContent,/Privater Ticketstatus synchronisiert/);
});

test('outbound browser sync refuses public repo before any ticket upload',async()=>{
 const b=runBrowser({privateRepo:false});
 await b.elements['outbox-connect'].onclick();
 assert.equal(b.calls.length,1);
 assert.ok(b.calls.every(c=>c.init.method!=='PUT'));
 assert.match(b.elements['outbox-status'].textContent,/NICHT privat/);
 assert.equal(b.elements['outbox-token'].value,'');
 assert.ok(!JSON.stringify(b.saves).includes('github_pat_'));
});

test('private outbound integration is optional, preserves inbound encryption and checks scripts',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const html=read('index.html'),app=read('app.js'),sync=read('sync.js');
 const ci=read('.github/workflows/pages.yml');
 const out=read('sync-out.js');
 for(const script of ['sync.js','outbox-core.js','sync-out.js'])
   assert.match(html,new RegExp('src="'+script.replace('.','\\.')+'"'));
 for(const id of ['outbox-repo','outbox-token','outbox-connect',
   'outbox-upload','outbox-disconnect','outbox-status'])
   assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/github\.com\/new/);
 assert.match(app,/window\.LivekarteExportTicketSnapshot=/);
 assert.match(app,/livekarte:ticket-updated/);
 assert.match(sync,/window\.LivekarteGetDeviceId/);
 assert.match(sync,/crypto\.subtle\.decrypt/);
 assert.match(out,/info\.private!==true/);
 assert.match(out,/mode:'cors',credentials:'omit'/);
 assert.match(out,/accessToken=null/);
 assert.match(out,/github_pat_/);
 assert.doesNotMatch(out,/localStorage\.setItem\([^)]*accessToken/);
 assert.match(ci,/cp index\.html style\.css core\.js app\.js sync\.js outbox-core\.js sync-out\.js public\//);
 assert.match(ci,/node --check sync-out\.js/);
});
