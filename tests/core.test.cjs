const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const p = {name:'Café 東京',lat:52.5,lng:13.4,category:'restaurant',description:'Kaffee & Kuchen'};
test('JSON, wrapper, individual object, code fence and text imports', () => {
 for (const input of [JSON.stringify([p]),JSON.stringify({places:[p]}),JSON.stringify(p),'```json\n'+JSON.stringify([p])+'\n```']) assert.deepEqual(C.parse(input),[p]);
 assert.deepEqual(C.parse('Café 東京;52.5;13.4;restaurant;Kaffee & Kuchen'),[p]);
 assert.equal(C.parse('Bahnhof;0;0;Bahnhof;Start')[0].category,'station');
});
test('reject malformed and oversized imports without accepting invalid coordinates', () => {
 for(const input of ['','{oops','Ort;;;sight','Ort;91;0;sight','Ort;0;181;sight','Ort;NaN;2;sight','Ort;1;2;unknown',JSON.stringify([{...p,lat:null}]),JSON.stringify([{...p,lng:true}]),'a'.repeat(100001)]) assert.throws(()=>C.parse(input));
 assert.throws(()=>C.normalize(Array(201).fill(p)));
 assert.equal(C.parse('Äquator;0;0;sight')[0].lat,0);
});
test('shared links roundtrip Unicode and exclude extra private fields',()=>{
 const hash=C.encode([{...p,gps:{lat:1,lng:2},accuracy:30}]);
 assert.deepEqual(C.decode(hash),[p]); assert.ok(!hash.includes('gps')); assert.ok(!hash.includes('accuracy'));
 assert.equal(C.decode('#other'),null); assert.throws(()=>C.decode('#places=%XX'));
 assert.throws(()=>C.decode('#places='+'x'.repeat(30001)));
});
test('distance uses great-circle meters including same point and antipodes',()=>{
 assert.equal(C.distance(p,p),0);
 assert.ok(Math.abs(C.distance({lat:0,lng:0},{lat:0,lng:1})-111195)<1);
 assert.ok(Number.isFinite(C.distance({lat:0,lng:0},{lat:0,lng:180})));
});
