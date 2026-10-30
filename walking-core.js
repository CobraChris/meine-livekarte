/* Stateless pedestrian routing helpers. No GPS storage, secrets or telemetry.
 * The FOSSGIS demo serves the FOOT profile at /routed-foot/; the "driving"
 * segment is OSRM's protocol placeholder and does not select a car profile.
 */
(function(root){
  'use strict';
  const ENDPOINT='https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
  const maxStraightMeters=30000;
  const valid=point=>point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && Math.abs(point.lat)<=90 && Math.abs(point.lng)<=180;
  function metres(a,b){
    if(!valid(a)||!valid(b))throw new Error('Ungültige GPS- oder Zielkoordinaten.');
    const r=Math.PI/180, dLat=(b.lat-a.lat)*r, dLng=(b.lng-a.lng)*r;
    const h=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2;
    return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function requestUrl(from,to){
    if(!valid(from)||!valid(to))throw new Error('GPS- oder Zielkoordinaten fehlen.');
    if(metres(from,to)>maxStraightMeters)
      throw new Error('Das Ziel liegt über 30 km Luftlinie entfernt. Für längere Strecken bitte Google Maps verwenden.');
    const fmt=p=>p.lng.toFixed(6)+','+p.lat.toFixed(6);
    return ENDPOINT+fmt(from)+';'+fmt(to)+
      '?overview=full&geometries=geojson&steps=false&alternatives=true';
  }
  function parseOne(route,from,to){
    if(!Number.isFinite(route.distance)||route.distance<0||route.distance>200000
       ||!Number.isFinite(route.duration)||route.duration<0||route.duration>172800)
      throw new Error('Der Routingdienst hat ungültige Entfernungs- oder Zeitangaben geliefert.');
    const coords=route.geometry?.coordinates;
    if(route.geometry?.type!=='LineString' || !Array.isArray(coords)
       ||coords.length<2||coords.length>16000)
      throw new Error('Der Routingdienst hat keine gültige Weggeometrie geliefert.');
    const points=coords.map(point=>{
      if(!Array.isArray(point)||point.length<2||point.length>3||
         !Number.isFinite(point[0])||!Number.isFinite(point[1])
         ||Math.abs(point[0])>180||Math.abs(point[1])>90)
        throw new Error('Ungültiger Wegpunkt vom Routingdienst.');
      return [point[1],point[0]];
    });
    const first={lat:points[0][0],lng:points[0][1]};
    const last={lat:points[points.length-1][0],lng:points[points.length-1][1]};
    // Reject routes whose snapped start/end is far from the actual GPS/POI.
    // For very short urban trips an 800 m snap can produce a nonsensical detour.
    const snapLimit=metres(from,to)<2000?120:300;
    if(metres(first,from)>snapLimit || metres(last,to)>snapLimit)
      throw new Error('Der gefundene Fußweg liegt zu weit vom Start oder Ziel entfernt.');
    return {points,distance:route.distance,duration:route.duration};
  }
  function parse(data,from,to){
    if(!data || data.code!=='Ok'||!Array.isArray(data.routes)||!data.routes[0])
      throw new Error('Der Routingdienst hat keinen Fußweg gefunden.');
    // OSRM ranks by routing preference, which need not be shortest on foot.
    // Prefer a genuinely shorter alternative as long as the estimated walk
    // is not meaningfully slower. Malformed alternatives are ignored, never drawn.
    const preferred=parseOne(data.routes[0],from,to);
    let best=preferred, options=1;
    for(const candidate of data.routes.slice(1,4)){
      let alternative;
      try{ alternative=parseOne(candidate,from,to); }catch{ continue; }
      options++;
      const acceptableTime=alternative.duration<=Math.max(
        preferred.duration*1.25,preferred.duration+90
      );
      if(acceptableTime && alternative.distance+15<best.distance)
        best=alternative;
    }
    return {...best,alternativesCompared:options,shorterAlternative:best!==preferred};
  }
  function distanceText(distance){
    if(!Number.isFinite(distance)||distance<0)throw new Error('Ungültige Gehstrecke.');
    return distance<1000?Math.round(distance)+' m'
      :(distance/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km';
  }
  function durationText(seconds){
    if(!Number.isFinite(seconds)||seconds<0)throw new Error('Ungültige Gehzeit.');
    const minutes=Math.max(1,Math.round(seconds/60));
    return minutes<60?minutes+' Min.':Math.floor(minutes/60)+' Std.'+
      (minutes%60?' '+(minutes%60)+' Min.':'');
  }
  const api={requestUrl,parse,metres,distanceText,durationText};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteWalkingCore=api;
})(globalThis);
