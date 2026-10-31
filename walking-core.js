/* Stateless pedestrian routing helpers. No GPS storage, secrets or telemetry.
 * The FOSSGIS demo serves the FOOT profile at /routed-foot/; the "driving"
 * segment is OSRM's protocol placeholder and does not select a car profile.
 */
(function(root){
  'use strict';
  const ENDPOINT='https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
  const TRIP_ENDPOINT='https://routing.openstreetmap.de/routed-foot/trip/v1/driving/';
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
  // Prepare a snapped footpath for GPS progress tracking without network calls.
  // Computations are deliberately stateless: no coordinates/history are stored.
  function prepareNavigation(route){
    if(!route||!Array.isArray(route.points)||route.points.length<2||
       route.points.length>16000 || !Number.isFinite(route.distance)||
       route.distance<=0||route.distance>200000||
       !Number.isFinite(route.duration)||route.duration<=0||route.duration>172800)
      throw new Error('Die Fußwegroute ist für die GPS-Führung ungültig.');
    const cumulative=[0];
    for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i];
      if(!Array.isArray(a)||!Array.isArray(b)||
         a.length!==2||b.length!==2||
         !valid({lat:a[0],lng:a[1]})||
         !valid({lat:b[0],lng:b[1]}))
        throw new Error('Die Route enthält ungültige Wegpunkte.');
      cumulative.push(cumulative[i-1]+metres(
        {lat:a[0],lng:a[1]},{lat:b[0],lng:b[1]}));
    }
    const length=cumulative[cumulative.length-1];
    if(length<1)throw new Error('Fußweg ohne erkennbare Strecke.');
    return {points:route.points,cumulative,length,
      routeDistance:route.distance,routeDuration:route.duration,
      destination:{lat:route.points.at(-1)[0],lng:route.points.at(-1)[1]}};
  }
  function navigationProgress(nav,point,accuracy){
    if(!nav || !Array.isArray(nav.points)||nav.points.length<2 ||
       !Array.isArray(nav.cumulative)||!Number.isFinite(nav.length)||nav.length<=0 ||
       !valid(point))throw new Error('Keine gültigen GPS-Positionsdaten.');
    const mPerDegree=111194.93,r=Math.PI/180;
    let nearest=Infinity,along=0;
    // Project the GPS coordinate onto the nearest footpath segment.
    // A normal small urban route has tens/hundreds of segments; this is
    // offline in-memory math and NEVER requests or transmits GPS coordinates.
    for(let i=0;i<nav.points.length-1;i++){
      const [latA,lngA]=nav.points[i], [latB,lngB]=nav.points[i+1];
      const lonScale=mPerDegree*Math.cos((latA+latB+point.lat)/3*r);
      const dx=(lngB-lngA)*lonScale,dy=(latB-latA)*mPerDegree;
      const px=(point.lng-lngA)*lonScale,py=(point.lat-latA)*mPerDegree;
      const sq=dx*dx+dy*dy;
      const fraction=sq>0?Math.max(0,Math.min(1,(px*dx+py*dy)/sq)):0;
      const lateral=Math.hypot(px-fraction*dx,py-fraction*dy);
      if(lateral<nearest){
        nearest=lateral;
        along=nav.cumulative[i]+(nav.cumulative[i+1]-nav.cumulative[i])*fraction;
      }
    }
    const proportion=Math.max(0,Math.min(1,(nav.length-along)/nav.length));
    const meters=nav.routeDistance*proportion;
    const seconds=nav.routeDuration*proportion;
    const destinationMeters=metres(point,nav.destination);
    const validAccuracy=Number.isFinite(accuracy)&&accuracy>=0?accuracy:Infinity;
    const reliable=validAccuracy<=60;
    const reached=reliable && validAccuracy<=25 && destinationMeters<=22;
    const offRoute=reliable && nearest>Math.max(40,validAccuracy*2.2) && !reached;
    return {
      remainingMeters:meters,remainingSeconds:seconds,
      destinationMeters,offRouteMeters:nearest,accuracy:validAccuracy,
      progressFraction:1-proportion,
      status:!reliable?'poor-gps':reached?'near-goal':offRoute?'off-route':'on-route'
    };
  }
  const MAX_TOUR_STOPS=6;
  function validateTourStopSet(from,stops){
    if(!valid(from)||!Array.isArray(stops)||
       stops.length<2||stops.length>MAX_TOUR_STOPS)
      throw new Error('Bitte 2 bis 6 gültige Ziele für deinen Rundgang auswählen.');
    for(const stop of stops)
      if(!valid(stop))throw new Error('Ein Ziel hat ungültige Koordinaten.');
  }
  function validateTour(from,stops){
    validateTourStopSet(from,stops);
    let previous=from,totalDirect=0;
    for(const stop of stops){

      const segment=metres(previous,stop);
      if(segment>12000)throw new Error('Zwei Stopps sind über 12 km Luftlinie voneinander entfernt. Bitte eine lokale Tour planen.');
      totalDirect+=segment;
      previous=stop;
    }
    if(totalDirect>25000)throw new Error('Dieser Rundgang ist zu lang. Bitte weniger oder näher gelegene Ziele auswählen.');
  }
  function tourRequestUrl(from,stops){
    validateTour(from,stops);
    const fmt=p=>p.lng.toFixed(6)+','+p.lat.toFixed(6);
    return ENDPOINT+[from,...stops].map(fmt).join(';')+
      '?overview=full&geometries=geojson&steps=false&alternatives=false';
  }
  function parseTour(data,from,stops){
    validateTour(from,stops);
    if(!data||data.code!=='Ok'||!Array.isArray(data.routes)||!data.routes[0])
      throw new Error('Der Routingdienst hat keinen durchgehenden Rundgang gefunden.');
    const first=data.routes[0];
    if(!Array.isArray(first.legs)||first.legs.length!==stops.length||
       !Array.isArray(data.waypoints)||data.waypoints.length!==stops.length+1)
      throw new Error('Die Fußwegantwort enthält nicht alle ausgewählten Stopps.');
    // A server can snap a POI to a remote road or ferry. Reject suspicious
    // snap locations instead of pretending the visitor reaches the POI.
    const places=[from,...stops];
    for(let i=0;i<places.length;i++){
      const location=data.waypoints[i]?.location;
      if(!Array.isArray(location)||location.length<2||
         !Number.isFinite(location[0])||!Number.isFinite(location[1]))
        throw new Error('Der Routingdienst hat einen ungültigen Zwischenstopp geliefert.');
      const snap={lat:location[1],lng:location[0]};
      if(metres(snap,places[i])>(i===0?120:150))
        throw new Error('Ein Zwischenstopp liegt zu weit vom Fußweg entfernt. Bitte den Zielpunkt prüfen.');
    }
    const parsed=parseOne(first,from,stops.at(-1));
    if(parsed.distance>40000||parsed.duration>43200)
      throw new Error('Die Rundgangroute ist zu lang. Bitte einen kürzeren Rundgang planen.');
    const legs=first.legs.map(leg=>{
      if(!Number.isFinite(leg?.distance)||leg.distance<0||
         !Number.isFinite(leg?.duration)||leg.duration<0)
        throw new Error('Der Routingdienst hat ungültige Etappen geliefert.');
      return {distance:leg.distance,duration:leg.duration};
    });
    const legSum=legs.reduce((sum,leg)=>sum+leg.distance,0);
    if(Math.abs(legSum-parsed.distance)>Math.max(50,parsed.distance*.12))
      throw new Error('Die gemeldeten Etappen passen nicht zur Gesamtroute.');
    return {...parsed,legs};
  }
  // Progress toward the current tour stop uses only the in-memory already
  // calculated route, its OSRM legs and the current GPS fix. Never fetch here.
  function tourLegProgress(nav,legs,stage,target,point,accuracy){
    if(!Array.isArray(legs)||legs.length<1||
       !Number.isInteger(stage)||stage<0||stage>=legs.length||!valid(target))
      throw new Error('Die aktuelle Rundgang-Etappe ist ungültig.');
    const full=navigationProgress(nav,point,accuracy);
    const leg=legs[stage];
    if(!Number.isFinite(leg?.distance)||leg.distance<=0||
       !Number.isFinite(leg?.duration)||leg.duration<0)
      throw new Error('Ungültige Etappenwerte für die GPS-Navigation.');
    const prior=legs.slice(0,stage).reduce((n,item)=>n+item.distance,0);
    const elapsed=Math.min(leg.distance,Math.max(0,
      nav.routeDistance*full.progressFraction-prior));
    const remaining=Math.max(0,leg.distance-elapsed);
    const validAccuracy=Number.isFinite(accuracy)&&accuracy>=0?accuracy:Infinity;
    const destinationMeters=metres(point,target);
    const arrived=validAccuracy<=25&&destinationMeters<=22;
    const status=full.status==='poor-gps'?'poor-gps'
      :arrived?'near-goal'
      :full.status==='off-route'?'off-route':'on-route';
    return {status,remainingMeters:remaining,
      remainingSeconds:leg.duration*(remaining/leg.distance),
      progressFraction:elapsed/leg.distance,offRouteMeters:full.offRouteMeters,
      destinationMeters,accuracy:validAccuracy};
  }
  // A single OSRM Trip request returns both an optimized open foot tour and
  // its geometry/legs. GPS is only submitted after an explicit user click.
  // The source remains GPS; the last selected destination is not fixed.
  function optimizedTourRequestUrl(from,stops){
    validateTourStopSet(from,stops);
    // Validate a local candidate independently of the manual stop order.
    // Reject intercity/day trips before sending them to the public server.
    validateTour(from,nearestTourOrder(from,stops));
    const fmt=p=>p.lng.toFixed(6)+','+p.lat.toFixed(6);
    return TRIP_ENDPOINT+[from,...stops].map(fmt).join(';')+
      '?roundtrip=false&source=first&destination=any&overview=full&geometries=geojson&steps=false';
  }
  function parseOptimizedTour(data,from,stops){
    validateTourStopSet(from,stops);
    if(!data||data.code!=='Ok'||!Array.isArray(data.trips)||
       data.trips.length!==1||!Array.isArray(data.waypoints)||
       data.waypoints.length!==stops.length+1)
      throw new Error('Der Routingdienst konnte die Rundgang-Reihenfolge nicht optimieren.');
    const order=Array(stops.length+1).fill(-1);
    for(let original=0;original<data.waypoints.length;original++){
      const wp=data.waypoints[original];
      const index=wp?.waypoint_index;
      if(!Number.isInteger(index)||index<0||index>=order.length||
         wp.trips_index!==0||order[index]!==-1)
        throw new Error('Die optimierte Stoppreihenfolge ist ungültig.');
      order[index]=original;
    }
    if(order[0]!==0||order.includes(-1))
      throw new Error('Die optimierte Tour startet nicht am GPS-Standort.');
    const orderedStops=order.slice(1).map(index=>stops[index-1]);
    const route=parseTour({
      code:'Ok',routes:data.trips,
      waypoints:order.map(index=>data.waypoints[index])
    },from,orderedStops);
    return {...route,orderedStops};
  }
  // "Nahe Stopps zuerst" uses only direct geographic distances on-device.
  // Used as a local safety check; actual optimization uses the footpath graph.
  function nearestTourOrder(from,stops){
    validateTourStopSet(from,stops);
    const remaining=stops.slice(),ordered=[];
    let at=from;
    while(remaining.length){
      let closest=0;
      for(let i=1;i<remaining.length;i++)
        if(metres(at,remaining[i])<metres(at,remaining[closest]))closest=i;
      const next=remaining.splice(closest,1)[0];
      ordered.push(next);
      at=next;
    }
    return ordered;
  }
  const api={requestUrl,parse,metres,distanceText,durationText,prepareNavigation,navigationProgress,tourRequestUrl,parseTour,nearestTourOrder,optimizedTourRequestUrl,parseOptimizedTour,tourLegProgress};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteWalkingCore=api;
})(globalThis);
