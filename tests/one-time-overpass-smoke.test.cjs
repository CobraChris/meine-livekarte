const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../route-discovery.js');
test('ONE-TIME Overpass POI corridor: one bounded POST query in Takayama',async()=>{
  const points=[[36.1399,137.2502],[36.1403,137.2506],[36.1408,137.2511]];
  const query=R.query(points,150);
  const url=new URL('https://overpass.private.coffee/api/interpreter');
  url.searchParams.set('data',query);
  const response=await fetch(url,{
    headers:{'Accept':'application/json'},
    signal:AbortSignal.timeout(18000)
  });
  const body=await response.text();
  console.log('ONE-TIME OVERPASS: HTTP',response.status,'CORS',response.headers.get('access-control-allow-origin'),
    'body',body.slice(0,250));
  assert.equal(response.status,200,'Public Overpass endpoint must accept bounded query');
  const parsed=JSON.parse(body);
  assert.ok(Array.isArray(parsed.elements),'Overpass must return elements');
  assert.equal(typeof parsed.remark,'undefined','Overpass must not return an execution error');
  const candidates=R.parse(parsed,points,[],150);
  assert.ok(candidates.every(x=>x.distance<=150));
});
