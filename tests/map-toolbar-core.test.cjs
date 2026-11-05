const {test}=require('node:test');
const assert=require('node:assert/strict');
const {build}=require('../map-toolbar-core.js');
test('every day and rail section has the identical three-button contract',()=>{
 for(const kind of ['all','city','journey','custom']){
  const entries=build({kind});
  assert.deepEqual(entries.map(x=>x.id),['expand-map','fit','gps']);
  assert.ok(entries.every(x=>x.label&&x.action));
 }
 assert.equal(build({kind:'journey'})[1].label,'Route zeigen');
 assert.equal(build({kind:'city'})[1].label,'Ziele zeigen');
});
test('GPS distinguishes acquisition, manual panning and explicit following',()=>{
 assert.match(build({gpsOn:false})[2].label,/einschalten/);
 assert.match(build({gpsOn:true,gpsFix:false})[2].label,/ermittelt/);
 assert.equal(build({gpsOn:true,gpsFix:true,cameraMode:'manual'})[2].pressed,false);
 assert.equal(build({gpsOn:true,gpsFix:true,cameraMode:'gps-follow'})[2].pressed,true);
 assert.equal(build({expanded:true})[0].pressed,true);
});
test('toolbar state is immutable and never stores location coordinates',()=>{
 const controls=build({kind:'city',gpsOn:true,gpsFix:true,cameraMode:'gps-follow'});
 assert.ok(Object.isFrozen(controls));
 assert.ok(controls.every(Object.isFrozen));
 assert.doesNotMatch(JSON.stringify(controls),/latitude|longitude|lat|lng/);
});
