/* Free place lookup based on Photon/OpenStreetMap.
 * Searches happen only after the user presses Search, never while typing.
 * Pure functions are shared between browser and Node regression tests.
 */
(function(root){
  'use strict';
  const ENDPOINT='https://photon.komoot.io/api/';
  function requestUrl(query,center){
    if(typeof query!=='string')throw new Error('Bitte ein Ziel eingeben.');
    const q=query.trim().replace(/\s+/g,' ');
    if(q.length<2||q.length>120)throw new Error('Bitte 2 bis 120 Zeichen für das Ziel eingeben.');
    const url=new URL(ENDPOINT);
    url.searchParams.set('q',q);
    url.searchParams.set('limit','6');
    const lat=Number(center?.lat),lon=Number(center?.lng);
    if(center&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
      url.searchParams.set('lat',String(lat));
      url.searchParams.set('lon',String(lon));
      url.searchParams.set('zoom','12');
      url.searchParams.set('location_bias_scale','0.1');
      // The map explicitly determines the regional search area. A soft
      // location bias alone can rank Los Angeles before an Osaka hotel.
      const halfLat=0.8,halfLon=Math.min(2,0.8/Math.max(0.3,Math.cos(lat*Math.PI/180)));
      const minLon=Math.max(-180,lon-halfLon),maxLon=Math.min(180,lon+halfLon);
      const minLat=Math.max(-90,lat-halfLat),maxLat=Math.min(90,lat+halfLat);
      url.searchParams.set('bbox',[minLon,minLat,maxLon,maxLat].map(n=>n.toFixed(5)).join(','));
      if(lat>=24&&lat<=46&&lon>=123&&lon<=146)
        url.searchParams.set('countrycode','JP');
    }
    // Prefer legible romanized / English names where OpenStreetMap has them.
    // If unavailable, Photon still returns the original local-script name.
    url.searchParams.set('lang','en');
    return url.toString();
  }
  function category(p){
    const key=String(p?.osm_key||''),value=String(p?.osm_value||'');
    if(key==='railway'||(key==='public_transport')||
       (key==='amenity'&&['bus_station','ferry_terminal'].includes(value)))return 'station';
    if((key==='tourism'&&['hotel','hostel','guest_house','motel','apartment'].includes(value))||
       (key==='building'&&value==='hotel'))return 'hotel';
    if((key==='amenity'&&['restaurant','cafe','fast_food','bar','pub','food_court','biergarten'].includes(value))||
       (key==='shop'&&['bakery','coffee'].includes(value)))return 'restaurant';
    // Preserve natural landmarks as Nature, rather than generic sights.
    if((key==='natural'&&['peak','volcano','ridge','valley','waterfall','lake','wood','glacier','cave_entrance','beach'].includes(value))||
       (key==='leisure'&&['nature_reserve','park'].includes(value)))return 'nature';
    return 'sight';
  }
  function parse(data){
    if(!data||!Array.isArray(data.features))throw new Error('Ungültige Antwort der Ortssuche.');
    const seen=new Set(),out=[];
    for(const f of data.features.slice(0,30)){
      if(f?.geometry?.type!=='Point'||!Array.isArray(f.geometry.coordinates))continue;
      const [lon,lat]=f.geometry.coordinates;
      if(typeof lat!=='number'||typeof lon!=='number'||!Number.isFinite(lat)||!Number.isFinite(lon)||
         Math.abs(lat)>90||Math.abs(lon)>180)continue;
      const p=f.properties||{};
      const street=[p.street,p.housenumber].filter(x=>typeof x==='string'||typeof x==='number').join(' ').trim();
      const name=String(p.name||street||p.city||'').trim().slice(0,120);
      if(!name)continue;
      const where=[street,p.district||p.suburb,p.city||p.town||p.village,p.state,p.country]
        .filter(x=>typeof x==='string'&&x.trim()).map(x=>x.trim());
      const description=[...new Set(where.filter(x=>x!==name))].join(' · ').slice(0,260);
      const key=lat+','+lon+','+name;
      if(seen.has(key))continue;
      seen.add(key);
      out.push({name,lat,lng:lon,category:category(p),
        description:description||'Ort aus OpenStreetMap (Photon).',
        label:description||'Koordinaten: '+lat.toFixed(5)+', '+lon.toFixed(5)});
      if(out.length===6)break;
    }
    return out;
  }
  function normalizedName(value){
    return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
      .toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  }
  // Always search the user's saved places first, without an API request.
  // Prioritize the current travel section and direct name matches.
  function savedMatches(query,allPlaces,sectionPlaces=[]){
    const q=normalizedName(query);
    if(q.length<2)return [];
    const tokens=q.split(' ').filter(Boolean);
    const current=new Set((sectionPlaces||[]).map(p=>JSON.stringify([p.name,p.lat,p.lng])));
    const matches=[];
    for(const p of allPlaces||[]){
      if(!p||typeof p.name!=='string'||!Number.isFinite(p.lat)||!Number.isFinite(p.lng))continue;
      const name=normalizedName(p.name);
      if(!tokens.every(t=>name.includes(t)))continue;
      const key=JSON.stringify([p.name,p.lat,p.lng]);
      const inSection=current.has(key);
      matches.push({name:p.name,lat:p.lat,lng:p.lng,category:p.category,
        saved:true,inSection,
        label:(inSection?'✓ In dieser Karte gespeichert':'✓ In deinen Orten gespeichert')+
          ' · '+({hotel:'Hotel',station:'Bahnhof',restaurant:'Restaurant',sight:'Sehenswürdigkeit',nature:'Natur'}[p.category]||'Ort'),
        score:(inSection?1000:0)+(name===q?400:name.startsWith(q)?200:0)
      });
    }
    return matches.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,6)
      .map(({score,...place})=>place);
  }
  // Defensive proximity filter: even if the external service ignores bbox,
  // results from the other side of the planet must not fill the list.
  function nearby(found,center,maxKm=115){
    const lat=Number(center?.lat),lng=Number(center?.lng);
    if(!center||!Number.isFinite(lat)||!Number.isFinite(lng))return found;
    const d=(a,b)=>{
      const rad=Math.PI/180;
      const a1=(a.lat-lat)*rad,b1=(a.lng-lng)*rad;
      const h=Math.sin(a1/2)**2+
        Math.cos(lat*rad)*Math.cos(a.lat*rad)*Math.sin(b1/2)**2;
      return 12742*Math.asin(Math.sqrt(Math.min(1,h)));
    };
    return found.filter(p=>d(p,center)<=maxKm)
      .sort((a,b)=>d(a,center)-d(b,center));
  }
  const api={ENDPOINT,requestUrl,parse,category,normalizedName,savedMatches,nearby};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LivekartePlaceSearch=api;
})(typeof window==='undefined'?null:window);
