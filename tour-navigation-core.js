/* In-memory GPS walking-tour state machine.
 * The app owns the GPS watcher and explicit routing requests. This module
 * only evaluates one supplied fix against a previously calculated footpath.
 * It never stores, transmits, requests or tracks position on its own.
 */
(function(root){
'use strict';
function create(route,walkingCore){
  if(!walkingCore||typeof walkingCore.prepareNavigation!=='function'||
     typeof walkingCore.tourLegProgress!=='function')
    throw new Error('Fußweg-Modul fehlt.');
  if(!route||!Array.isArray(route.stops)||!route.stops.length||
     !Array.isArray(route.legs)||route.legs.length!==route.stops.length)
    throw new Error('Tour hat keine gültigen Fußwegetappen.');
  const prepared=walkingCore.prepareNavigation(route);
  let stage=0,paused=false,nearReadings=0,offReadings=0,arrived=false;
  function update(point,accuracy){
    if(paused)return null;
    const place=route.stops[stage];
    if(!place)return null;
    const progress=walkingCore.tourLegProgress(prepared,route.legs,
      stage,place,point,accuracy);
    // Two consecutive accurate fixes are required. A noisy/other-status
    // sample resets the counter; a confirmed arrival remains confirmed until
    // the user explicitly advances to the next stop.
    nearReadings=progress.status==='near-goal'?nearReadings+1:0;
    offReadings=progress.status==='off-route'?offReadings+1:0;
    if(nearReadings>=2)arrived=true;
    return {
      stage:stage+1,total:route.stops.length,name:place.name,
      status:progress.status,remainingMeters:progress.remainingMeters,
      remainingSeconds:progress.remainingSeconds,
      arrived,offRoute:offReadings>=2
    };
  }
  function pause(){
    paused=true;
  }
  function resume(){
    paused=false;
    nearReadings=0;offReadings=0;
  }
  function next(){
    if(stage>=route.stops.length-1)return false;
    stage++;
    nearReadings=0;offReadings=0;arrived=false;paused=false;
    return true;
  }
  return Object.freeze({
    get stage(){return stage;},
    get paused(){return paused;},
    get arrived(){return arrived;},
    update,pause,resume,next
  });
}
const api=Object.freeze({create});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteTourNavigation=api;
})(globalThis);
