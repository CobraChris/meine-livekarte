// TEMPORARY one-request endpoint check. Remove before merging (FOSSGIS fair-use).
const {test}=require('node:test');
const assert=require('node:assert/strict');
test('FOSSGIS foot Trip service works with open route, one network request',async()=>{
 const points='13.388860,52.517037;13.397634,52.529407;13.428555,52.523219';
 const url='https://routing.openstreetmap.de/routed-foot/trip/v1/driving/'+points+
   '?roundtrip=false&source=first&destination=any&overview=full&geometries=geojson&steps=false';
 const response=await fetch(url,{signal:AbortSignal.timeout(15000),
   headers:{Accept:'application/json'}});
 const body=await response.text();
 console.log('LIVE FOOT TRIP: HTTP',response.status,'CORS',response.headers.get('access-control-allow-origin'),'body',body.slice(0,250));
 assert.equal(response.status,200,'Trip endpoint must support request');
 const data=JSON.parse(body);
 assert.equal(data.code,'Ok');
 assert.equal(data.waypoints.length,3);
 assert.equal(data.trips.length,1);
 assert.equal(data.trips[0].legs.length,2);
 assert.equal(data.waypoints[0].waypoint_index,0);
 assert.equal(data.trips[0].geometry?.type,'LineString');
 assert.ok(data.trips[0].distance>0);
});