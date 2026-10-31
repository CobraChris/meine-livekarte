/* Sight discovery near an existing walking route. Manual Overpass query only.
 * No GPS watch/history and no automatic requests. Pure geometry/parser for tests.
 */
(function(root){
  'use strict';
  const ENDPOINT='https://overpass-api.de/api/interpreter';
  const RAD=Math.PI/180;
  const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&
    Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
  function bounds(points,radius=150){
    if(!Array.isArray(points)||points.length<2||points.length>25000||
       ![100,150,250].includes(radius)||points.some(p=>!Array.isArray(p)||
          p.length!==2||!valid({lat:p[0],lng:p[1]})))
      throw new Error('Bitte zuerst eine gültige lokale Fußroute berechnen.');
    let s=90,n=-90,w=180,e=-180;
    for(const [lat,lng] of points){
      s=Math.min(s,lat);n=Math.max(n,lat);
      w=Math.min(w,lng);e=Math.max(e,lng);
    }
    const mid=(s+n)/2,cos=Math.cos(mid*RAD);
    if(cos<.12||e-w>1)throw new Error('Rundgang-Gebiet zu groß für die Umgebungssuche.');
    const shiftLat=(radius+60)/111200;
    const shiftLng=(radius+60)/(111200*cos);
    const extent={
      south:s-shiftLat,north:n+shiftLat,
      west:w-shiftLng,east:e+shiftLng
    };
    if((extent.north-extent.south)*111200>9500 ||
      (extent.east-extent.west)*111200*cos>9500 ||
      (extent.north-extent.south)*111200*
      (extent.east-extent.west)*111200*cos>26000000)
      throw new Error('Dieser Rundgang ist für eine Umgebungssuche zu weitläufig.');
    return extent;
  }
  function query(points,radius=150){
    const b=bounds(points,radius),fmt=n=>n.toFixed(6);
    const bbox=[b.south,b.west,b.north,b.east].map(fmt).join(',');
    // One bounded query, names required; no background polling.
    const where='('+bbox+')';
    return '[out:json][timeout:15][maxsize:10485760];('+
      'nwr["name"]["tourism"~"^(attraction|museum|gallery|viewpoint|artwork)$"]'+where+';'+
      'nwr["name"]["historic"~"^(castle|monument|memorial|archaeological_site|ruins)$"]'+where+';'+
      ');out center 500;';
  }
  function metres(a,b){
    const x=(b.lng-a.lng)*Math.cos(((a.lat+b.lat)/2)*RAD)*111200;
    const y=(b.lat-a.lat)*111200;
    return Math.hypot(x,y);
  }
  function routeDistance(p,points){
    if(!valid(p)||!Array.isArray(points)||points.length<2)
      throw new Error('Ungültiger Ort oder Fußweg.');
    let min=Infinity;
    for(let i=1;i<points.length;i++){
      const a={lat:points[i-1][0],lng:points[i-1][1]};
      const b={lat:points[i][0],lng:points[i][1]};
      if(!valid(a)||!valid(b))throw new Error('Ungültiger Wegpunkt.');
      const lat=(a.lat+b.lat+p.lat)/3,scale=Math.cos(lat*RAD)*111200;
      const x=(b.lng-a.lng)*scale,y=(b.lat-a.lat)*111200;
      const px=(p.lng-a.lng)*scale,py=(p.lat-a.lat)*111200;
      const len=x*x+y*y;
      const t=len>0?Math.max(0,Math.min(1,(px*x+py*y)/len)):0;
      min=Math.min(min,Math.hypot(px-t*x,py-t*y));
    }
    return min;
  }
  function parse(payload,points,saved=[],radius=150){
    bounds(points,radius);
    if(!payload||!Array.isArray(payload.elements)||payload.remark)
      throw new Error('Der Kartendienst hat keine gültigen Sehenswürdigkeiten geliefert.');
    if(payload.elements.length>500)
      throw new Error('Die Umgebungssuche lieferte zu viele Orte. Bitte engere Route wählen.');
    const selected=[],ids=new Set(),names=new Set();
    const norm=s=>s.toLocaleLowerCase('de-DE').normalize('NFKC').replace(/\s+/g,' ').trim();
    for(const el of payload.elements){
      if(!['node','way','relation'].includes(el?.type)||
         !Number.isSafeInteger(el.id)||el.id<1||ids.has(el.type+':'+el.id))continue;
      ids.add(el.type+':'+el.id);
      const t=el.tags;
      if(!t||typeof t!=='object')continue;
      const name=typeof t['name:de']==='string'&&t['name:de'].trim()?t['name:de']:
        typeof t['name:en']==='string'&&t['name:en'].trim()?t['name:en']:t.name;
      if(typeof name!=='string'||!name.trim()||name.trim().length>120)continue;
      const p={lat:el.lat??el.center?.lat,lng:el.lon??el.center?.lon};
      if(!valid(p))continue;
      const distance=routeDistance(p,points);
      if(distance>radius)continue;
      const acceptedTourism=['attraction','museum','gallery','viewpoint','artwork'];
      const acceptedHistoric=['castle','monument','memorial','archaeological_site','ruins'];
      const tourism=acceptedTourism.includes(t.tourism)?t.tourism:null;
      const historic=acceptedHistoric.includes(t.historic)?t.historic:null;
      if(!tourism&&!historic)continue;
      const key=norm(name);
      if(saved.some(s=>valid(s)&&norm(String(s.name||''))===key&&metres(s,p)<100))continue;
      // Collapse semantically identical OSM node/area duplicates.
      if(names.has(key))continue;
      names.add(key);
      const kind=tourism||historic;
      const tagLabels={
        attraction:'Sehenswürdigkeit',museum:'Museum',gallery:'Galerie',
        viewpoint:'Aussichtspunkt',artwork:'Kunstwerk',castle:'Burg/Schloss',
        monument:'Denkmal',memorial:'Gedenkort',archaeological_site:'Fundstätte',
        ruins:'Ruine'
      };
      selected.push({id:el.type+'/'+el.id,name:name.trim(),lat:p.lat,lng:p.lng,
        category:'sight',distance:Math.round(distance),
        type:tagLabels[kind]||'Sehenswürdigkeit',source:'OpenStreetMap'});
    }
    // Prefer points near the footpath; deterministic tie ordering.
    return selected.sort((a,b)=>a.distance-b.distance||a.name.localeCompare(b.name)).slice(0,12);
  }
  const api={ENDPOINT,bounds,query,parse,routeDistance};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteRouteDiscovery=api;
})(globalThis);
