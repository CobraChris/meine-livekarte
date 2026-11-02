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
    }
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
  const api={ENDPOINT,requestUrl,parse,category};
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.LivekartePlaceSearch=api;
})(typeof window==='undefined'?null:window);
