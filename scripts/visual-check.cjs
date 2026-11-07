'use strict';
// Offline, deterministic screenshot comparisons for shared map controls.
// The actual map tiles are masked in visual capture; we test OUR UI, not
// Google/OSM maps' changing cartographic content.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {PNG}=require('pngjs');
const root=path.resolve(__dirname,'..');
const visual=path.join(root,'test-results','visual');
const current=path.join(visual,'current');
const reference=path.join(visual,'reference');
const diffDir=path.join(visual,'diff');
const LIMIT_PROVIDER=.045; // Provider must not alter shared controls.
const LIMIT_RELEASE=.15;   // Meaningful structural screenshot changes block.
const COLOR_TOLERANCE=28;  // Ignore font antialiasing/color jitter.
function readPng(filename){return PNG.sync.read(fs.readFileSync(filename));}
function compare(a,b,diffFile){
 const left=readPng(a),right=readPng(b);
 if(left.width!==right.width||left.height!==right.height)
  return {ratio:1,sizeMismatch:true,dimensions:[
   left.width,left.height,right.width,right.height]};
 const output=new PNG({width:left.width,height:left.height});
 let changed=0;
 const n=left.width*left.height;
 for(let i=0;i<left.data.length;i+=4){
  const delta=Math.max(...[0,1,2,3].map(j=>Math.abs(left.data[i+j]-right.data[i+j])));
  const bad=delta>COLOR_TOLERANCE;
  if(bad)changed++;
  for(let j=0;j<4;j++)output.data[i+j]=bad
   ?([255,54,110,255][j])
   :([left.data[i],left.data[i+1],left.data[i+2],75][j]);
 }
 if(changed&&diffFile){
  fs.mkdirSync(path.dirname(diffFile),{recursive:true});
  fs.writeFileSync(diffFile,PNG.sync.write(output));
 }
 return {ratio:changed/n,changed,total:n,sizeMismatch:false};
}
function overlaps(a,b){
 const x=Math.min(a.right,b.right)-Math.max(a.left,b.left);
 const y=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
 return x>3&&y>3;
}
function checkLayout(data,name){
 const all=data?.elements||{};
 const required=['.plan-picker','#place-search','#tour-map-tools','.map-actions','#map-provider-switch'];
 for(const selector of required){
  const rect=all[selector];
  assert.ok(rect?.visible,name+': missing '+selector);
  assert.ok(rect.width>=20&&rect.height>=20,name+': unusably small '+selector);
  assert.ok(rect.left>=-3&&rect.right<=data.workspace.width+3,
   name+': clipped horizontally '+selector);
  assert.ok(rect.top>=-3&&rect.bottom<=data.workspace.height+3,
   name+': clipped vertically '+selector);
 }
 const pairs=[
  ['.plan-picker','#place-search'],
  ['.plan-picker','.map-actions'],
  ['#place-search','#tour-map-tools'],
  ['#place-search','.map-actions'],
  ['#tour-map-tools','.map-actions'],
  ['.map-actions','#map-provider-switch']
 ];
 for(const [a,b] of pairs)
  assert.ok(!overlaps(all[a],all[b]),name+': controls overlap: '+a+' and '+b);
 // Count provider buttons instead of guessing a pixel width for labels.
 assert.equal(data.providerButtons.length,4,name+': missing provider buttons');
 for(const button of data.providerButtons)
  assert.ok(button.visible&&button.width>=25&&button.height>=32,
   name+': provider control missing or too small: '+button.id);
}
function main(){
 const manifestFile=path.join(current,'manifest.json');
 if(!fs.existsSync(manifestFile))throw Error('Missing mobile visual manifest');
 const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
 const entries=manifest.scenes;
 assert.ok(Array.isArray(entries)&&entries.length>=8,'Insufficient visual scenes');
 const labels=new Set(entries.map(e=>e.id));
 assert.equal(labels.size,entries.length,'Duplicate visual scene IDs');
 const errors=[],warnings=[],pairs=new Map();
 for(const scene of entries){
  try{checkLayout(scene,scene.id);}catch(error){errors.push(error.message);}
  const token=scene.key+'-'+scene.width;
  if(!pairs.has(token))pairs.set(token,{});
  pairs.get(token)[scene.provider]=scene;
 }
 for(const [token,pair] of pairs){
  if(!pair.osm||!pair.google){
   errors.push(token+': missing OSM/Google parity scene');continue;
  }
  for(const selector of Object.keys(pair.osm.screenshots)){
   const osm=path.join(current,pair.osm.screenshots[selector]);
   const googleName=pair.google.screenshots[selector];
   if(!googleName){errors.push(token+': missing Google '+selector);continue;}
   const google=path.join(current,googleName);
   if(!fs.existsSync(osm)||!fs.existsSync(google)){
    errors.push(token+': missing PNG '+selector);continue;
   }
   const result=compare(osm,google,path.join(diffDir,'provider-'+token+'-'+selector+'.png'));
   if(result.ratio>LIMIT_PROVIDER)
    errors.push(token+' '+selector+': provider pixel diff '+(result.ratio*100).toFixed(1)+'%');
  }
 }
 const refManifest=path.join(reference,'manifest.json');
 if(fs.existsSync(refManifest)){
  const old=JSON.parse(fs.readFileSync(refManifest,'utf8'));
  const byId=new Map((old.scenes||[]).map(e=>[e.id,e]));
  for(const scene of entries){
   const previous=byId.get(scene.id);
   if(!previous){warnings.push('New visual scenario '+scene.id+' has no reference yet');continue;}
   for(const [selector,rel] of Object.entries(scene.screenshots)){
    const oldRel=previous.screenshots?.[selector];
    if(!oldRel)continue;
    const oldPng=path.join(reference,oldRel);
    const newPng=path.join(current,rel);
    if(!fs.existsSync(oldPng))continue;
    const ratio=compare(oldPng,newPng,path.join(diffDir,'release-'+scene.id+'-'+selector+'.png')).ratio;
    if(ratio>LIMIT_RELEASE)
     errors.push(scene.id+' '+selector+': prior-release pixel diff '+(ratio*100).toFixed(1)+'%');
    else if(ratio>LIMIT_PROVIDER)
     warnings.push(scene.id+' '+selector+': minor visual change '+(ratio*100).toFixed(1)+'%');
   }
  }
  console.log('Compared '+entries.length+' scenes with last green main release.');
 }else console.log('No prior visual reference found. Bootstrap mode: provider parity and layout checks still enforced.');
 for(const warning of warnings)console.warn('VISUAL NOTE:',warning);
 if(errors.length){
  for(const error of errors)console.error('VISUAL FAIL:',error);
  throw Error(errors.length+' visual regression check(s) failed; see test-results/visual/diff.');
 }
 console.log('PASS '+entries.length+' visual scenes: provider parity, layout collisions, screenshot regression.');
}
if(require.main===module)try{main();}catch(error){console.error(error.stack);process.exitCode=1;}
module.exports={compare,overlaps,checkLayout};
