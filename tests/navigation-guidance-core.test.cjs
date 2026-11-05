const {test}=require('node:test');
const assert=require('node:assert/strict');
const {derive}=require('../navigation-guidance-core.js');
test('off-route guidance is only offered after existing tour state confirms it',()=>{
 const progress={status:'off-route',offRoute:false,arrived:false,
   remainingMeters:621.6,remainingSeconds:433};
 const uncertain=derive({progress,accuracy:12,fixAgeMs:300});
 assert.equal(uncertain.kind,'following');
 assert.equal(uncertain.canOfferReroute,false);
 const confirmed=derive({progress:{...progress,offRoute:true},accuracy:12,fixAgeMs:300});
 assert.equal(confirmed.kind,'deviation');
 assert.equal(confirmed.canOfferReroute,true);
 assert.equal(confirmed.distanceMeters,622);
 assert.equal(confirmed.durationSeconds,433);
});
test('stale and imprecise fixes cannot claim a navigation direction',()=>{
 const p={status:'off-route',offRoute:true,remainingMeters:2};
 assert.equal(derive({progress:p,accuracy:9,fixAgeMs:30100}).kind,'waiting');
 assert.equal(derive({progress:p,accuracy:96,fixAgeMs:500}).kind,'uncertain');
 assert.equal(derive({progress:p,accuracy:5,fixAgeMs:NaN}).canOfferReroute,false);
});
test('arrival takes precedence over deviation and no API side effects',()=>{
 const p={status:'near-goal',arrived:true,offRoute:true,remainingMeters:0,remainingSeconds:0};
 const before=JSON.stringify(p);
 const g=derive({progress:p,accuracy:11,fixAgeMs:250});
 assert.equal(g.kind,'arrived');assert.equal(g.canOfferReroute,false);
 assert.equal(JSON.stringify(p),before);
 assert.deepEqual(Object.keys(g).sort(),
 ['canOfferReroute','distanceMeters','durationSeconds','kind','message'].sort());
});
