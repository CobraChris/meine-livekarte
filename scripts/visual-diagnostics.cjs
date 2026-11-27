'use strict';
// Only deterministic public Nara test popups, never browser profiles or live data.
const fs=require('node:fs'),path=require('node:path');
for(const kind of ['current','reference']){
 const root=path.join(__dirname,'../test-results/visual',kind);
 for(const width of [360,393]){
  const name='nara-popup-v4-'+width+'-osm-popup.png',file=path.join(root,name);
  if(fs.existsSync(file))console.log('NARA_VISUAL_DIAGNOSTIC '+kind+' '+name+' '+fs.readFileSync(file).toString('base64'));
 }
}
