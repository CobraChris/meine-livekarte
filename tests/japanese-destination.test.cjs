const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const JP=require('../japanese-destination.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('app.js'),html=read('index.html'),css=read('style.css');

test('official Tomoya Residence Japanese name, exact postal address and phone appear in printable card',()=>{
 const hotel=JP.get({name:'Tomoya Residence Hotel Kyoto Nijo Takakura',
  lat:35.0137,lng:135.76181});
 assert.ok(hotel);
 assert.equal(hotel.name,'トモヤレジデンスホテル 京都 二条高倉');
 assert.equal(hotel.address,'〒604-0831 京都市中京区二条通高倉西入松屋町58');
 assert.equal(hotel.phone,'075-211-8050');
 assert.equal(hotel.source,'https://www.tomoyaresidencehotel.net/');
 assert.match(JP.driverText(hotel),/^こちらまでお願いします。\n/);
 assert.match(JP.driverText(hotel),/〒604-0831/);
 assert.match(JP.googleMapsLink(hotel),/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/);
});
test('hotel address also appears from assistant shortened place name at same coordinates',()=>{
 const target=JP.get({name:'Tomoya Residence',lat:35.0137,lng:135.76181});
 assert.ok(target?.address);
 assert.equal(target.name,JP.get({name:'Tomoya Residence Hotel Kyoto Nijo Takakura',lat:35.0137,lng:135.76181}).name);
});
test('other supported sights only have Japanese names, never invented street addresses',()=>{
 const places=[
  ['Kyoto Station',34.98535,135.75877,'京都駅'],
  ['Gion Shirakawa / Shinbashi',35.0054743,135.7736461,'祇園白川'],
  ['Ponto-chō',35.00613,135.77109,'先斗町'],
  ['Kiyomizu-dera',34.994722,135.783056,'清水寺'],
  ['Fushimi Inari-Taisha',34.967125,135.773108,'伏見稲荷大社']
 ];
 for(const [name,lat,lng,label] of places){
   const p=JP.get({name,lat,lng});
   assert.equal(p.name,label,name);
   assert.equal(p.address,undefined,name);
   assert.doesNotMatch(JP.driverText(p),/電話：|〒604-/);
 }
});
test('wrong coordinate or unrelated place cannot borrow the hotel address',()=>{
 for(const p of [
  {name:'Tomoya Residence',lat:34.98535,lng:135.75877},
  {name:'Another hotel',lat:35.0137,lng:135.76181},
  {name:'My private hotel',lat:35.0137,lng:135.76181},
  {name:'Tomoya Residence',lat:NaN,lng:135.76181},
  {name:'Tomoya Residence',lat:'35.0137',lng:135.76181},
  {name:'Unrelated cafe',lat:35.001,lng:135.78}
 ])assert.equal(JP.get(p),null);
 assert.equal(JP.driverText(null),'');
 assert.equal(JP.googleMapsLink(null),'');
});
test('dialog and taxi action are available from card, popup, tour assistant and hotel transfer',()=>{
 for(const id of [
  'japanese-driver-dialog','japanese-driver-title','japanese-driver-address',
  'japanese-driver-phone','japanese-driver-copy','japanese-driver-close',
  'japanese-driver-map','japanese-driver-info','next-action-japanese'
 ])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/defer src="japanese-destination.js"/);
 assert.match(app,/const JP=window\.JapaneseDestination/);
 assert.match(app,/function showJapaneseDestination\(place\)/);
 assert.match(app,/const popupJapanese=japaneseButton\(p\)/);
 assert.match(app,/if\(popupJapanese\)quickActions\.append\(popupJapanese\)/);
 assert.match(app,/const placeJapanese=japaneseButton\(p\)/);
 assert.match(app,/if\(placeJapanese\)actions\.append\(placeJapanese\)/);
 assert.match(app,/const hotelJapanese=japaneseButton\(/);
 assert.match(app,/nextActionJapanese\.hidden=!JP\.get\(target\)/);
 assert.match(app,/nextActionJapanese\.onclick=\(\)=>showJapaneseDestination\(target\)/);
 assert.match(css,/#japanese-driver-title/);
 assert.match(css,/\.japanese-driver-address/);
});
test('large Japanese card does not use geocoding, persist codes or access GPS',()=>{
 const start=app.indexOf('  // Japanese taxi/driver card');
 const end=app.indexOf("  const walkingPanel=$('walk-route-panel');",start);
 assert.ok(start>=0&&end>start);
 const body=app.slice(start,end);
 assert.match(body,/driverDialog\.showModal\(\)/);
 assert.match(body,/navigator\.clipboard\.writeText\(JP\.driverText\(driverTarget\)\)/);
 assert.match(body,/driverDialog\.addEventListener\('close'/);
 assert.match(body,/\$\('japanese-driver-map'\)\.href=JP\.googleMapsLink\(target\)/);
 assert.doesNotMatch(body,/fetch\(|geolocation|watchPosition|localStorage|innerHTML|document\.cookie/);
 assert.match(read('sw.js'),/livekarte-shell-pwa-v22/);
 assert.match(read('sw.js'),/japanese-destination\.js/);
});