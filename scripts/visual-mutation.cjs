'use strict';
// Mutation checks: a green visual pipeline must actually detect the defects
// it claims to prevent. Everything is generated in an isolated temp folder.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {PNG}=require('pngjs');
const {compare,checkLayout,LIMIT_PROVIDER,LIMIT_RELEASE}=require('./visual-check.cjs');
const rect=(l,t,w,h)=>({visible:true,left:l,top:t,right:l+w,bottom:t+h,width:w,height:h});
function valid(){
 return {
  workspace:{width:393,height:720},
  elements:{
   '.plan-picker':rect(10,12,285,65),
   '#place-search':rect(10,85,285,48),
   '#tour-map-tools':rect(10,145,283,38),
   '.map-actions':rect(333,142,43,135),
   '#map-provider-switch':rect(0,672,393,48)
  },
  providerButtons:['provider-osm','provider-osm-de','provider-google','provider-settings']
   .map((id,i)=>({id,visible:true,width:i===3?42:110,height:38}))
 };
}
test('negative controls reject hidden, clipped, overlapping and undersized map controls',()=>{
 const base=valid();
 assert.doesNotThrow(()=>checkLayout(base,'healthy'));
 let faulty=structuredClone(base);
 faulty.elements['#place-search'].visible=false;
 assert.throws(()=>checkLayout(faulty,'hidden'),/missing #place-search/);
 faulty=structuredClone(base);
 faulty.elements['#tour-map-tools']=rect(10,107,283,38);
 assert.throws(()=>checkLayout(faulty,'overlap'),/controls overlap/);
 faulty=structuredClone(base);
 faulty.elements['.map-actions']=rect(375,142,43,135);
 assert.throws(()=>checkLayout(faulty,'clipped'),/clipped horizontally/);
 faulty=structuredClone(base);
 faulty.providerButtons[2].width=10;
 assert.throws(()=>checkLayout(faulty,'button'),/too small/);
});
function png(width,height,mutate=false){
 const p=new PNG({width,height});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=(y*width+x)*4,damaged=mutate&&x<Math.floor(width*.3);
  p.data[index]=damaged?225:28;
  p.data[index+1]=damaged?51:62;
  p.data[index+2]=damaged?75:70;
  p.data[index+3]=255;
 }
 return PNG.sync.write(p);
}
test('screenshot pixel changes above release and provider thresholds are detectable',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'livekarte-visual-mutation-'));
 try{
  const clean=path.join(temp,'baseline.png'),bad=path.join(temp,'damaged.png');
  const shifted=path.join(temp,'size-mismatch.png');
  fs.writeFileSync(clean,png(100,100));
  fs.writeFileSync(bad,png(100,100,true));
  fs.writeFileSync(shifted,png(90,100));
  assert.equal(compare(clean,clean).ratio,0);
  const changed=compare(clean,bad,path.join(temp,'diff.png'));
  assert.ok(changed.ratio>LIMIT_PROVIDER);
  assert.ok(changed.ratio>LIMIT_RELEASE);
  assert.ok(fs.statSync(path.join(temp,'diff.png')).size>100);
  assert.equal(compare(clean,shifted).ratio,1);
  console.log('PASS visual mutation test detected changed pixels and wrong-sized screenshots');
 }finally{
  fs.rmSync(temp,{recursive:true,force:true});
 }
});
