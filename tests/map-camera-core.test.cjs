'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const Camera=require('../map-camera-core.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('one camera state machine serves Kyoto, Nara, Osaka, Nikkō and custom days',()=>{
 const dates=['Kyoto 03.11','Nara 04.11','Osaka 05.11','Nikkō','eigene Tagesplanung'];
 for(const day of dates){
   const camera=Camera.create();
   assert.equal(camera.mode,'manual',day);
   assert.equal(camera.isFollowing(),false,day);
   assert.equal(camera.transition('gps-follow'),true,day);
   assert.equal(camera.isFollowing(),true,day);
   assert.equal(camera.transition('gps-follow'),false,day);
   assert.equal(camera.transition('day-goals'),true,day);
   assert.equal(camera.isFollowing(),false,day);
   assert.equal(camera.transition('overview'),true,day);
   assert.equal(camera.mode,'overview',day);
   assert.equal(camera.transition('manual'),true,day);
   assert.equal(camera.mode,'manual',day);
 }
});

test('programmatic GPS and fit movements preserve mode; actual manual gestures interrupt',()=>{
 const camera=Camera.create();
 let simulatedZoom=0;
 function onZoom(){simulatedZoom++;if(!camera.isProgrammatic())camera.transition('manual');}
 camera.move('gps-follow',()=>{assert.equal(camera.isProgrammatic(),true);onZoom();});
 assert.equal(camera.mode,'gps-follow','GPS setView cannot cancel its own follow mode');
 camera.move('overview',()=>{onZoom();});
 assert.equal(camera.mode,'overview','fitting GPS + goals preserves overview mode');
 camera.move('day-goals',()=>{onZoom();});
 assert.equal(camera.mode,'day-goals');
 onZoom();assert.equal(camera.mode,'manual','user zoom exits day goals mode');
 camera.transition('gps-follow');
 onZoom();assert.equal(camera.mode,'manual','user pinch exits GPS follow mode');
 assert.equal(simulatedZoom,5);
 assert.equal(camera.isProgrammatic(),false);
});

test('nested camera actions unwind correctly even when a map callback fails',()=>{
 const camera=Camera.create();
 assert.throws(()=>camera.move('overview',()=>{
   camera.move('day-goals',()=>{throw new Error('map unavailable');});
 }),/map unavailable/);
 assert.equal(camera.isProgrammatic(),false,'no stale programmatic guard after an exception');
 camera.transition('manual');
 assert.throws(()=>camera.transition('gps-off'),/Unbekannter Kartenmodus/);
 assert.throws(()=>camera.move('silent',()=>{}),/Ungültige Kartenaktion/);
});

test('the shared camera governs view changes across the app, not destination names',()=>{
 const app=read('app.js'),html=read('index.html');
 const workflow=read('.github/workflows/pages.yml'),sw=read('sw.js');
 assert.match(app,/const camera=window\.LivekarteMapCamera\.create\(\)/);
 assert.match(app,/function setCameraMode\(mode\)\{/);
 assert.match(app,/function withCameraView\(mode,action\)\{/);
 assert.match(app,/function fit\(items = mapFocusPlaces\(\)\)\{/);
 assert.match(app,/withCameraView\('day-goals',\(\)=>map\.fitBounds\(/);
 assert.match(app,/withCameraView\('overview',\(\)=>map\.fitBounds\(/);
 assert.match(app,/withCameraView\('gps-follow',\(\)=>map\.setView\(/);
 assert.match(app,/map\.on\('zoomstart', \(\) => \{ if \(!camera\.isProgrammatic\(\)\) pauseGPSFollow\(\); \}\)/);
 assert.match(app,/map\.on\('dragstart', \(\) => \{ if \(!camera\.isProgrammatic\(\)\) pauseGPSFollow\(\); \}\)/);
 assert.doesNotMatch(app,/\blet following\b|\bfollowing\s*=\s*(?:true|false)/,
   'a second mutable GPS-follow boolean would bypass the shared mode');
 assert.match(html,/src="map-camera-core\.js"/);
 assert.ok(html.indexOf('map-camera-core.js')<html.indexOf('app.js'));
 assert.match(sw,/'map-camera-core\.js'/);
 assert.match(workflow,/node --check map-camera-core\.js/);
 assert.match(workflow,/cp map-popup-core\.js map-camera-core\.js public\//);
 const camera=require('../map-camera-core.js');
 assert.deepEqual(camera.MODES,['manual','gps-follow','day-goals','overview']);
});
