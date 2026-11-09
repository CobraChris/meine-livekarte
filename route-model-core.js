/* Shared, explicit route geometry contract for all travel days.
 * Does NOT calculate walking streets, rail tracks or departure times.
 * A preview uses straight lines; walking geometry comes ONLY from a validated
 * deliberate OSRM response; rail geometry remains visibly schematic.
 * No GPS reads, storage, network calls, browser API or Leaflet dependency.
 */
(function(root){
  'use strict';
  const note=Object.freeze({
    preview:'Gestrichelte Linie = Luftlinie, kein begehbarer Weg. Reihenfolge nach Entfernung optimiert; Besuchszeiten prüfen. Anreise mit Bahn separat.',
    walking:'Berechnete Fußwege entlang von Straßen und Wegen. Anreise mit Bahn separat.',
    rail:'Gestrichelte Bahnlinie = schematische Verbindung, keine tatsächlichen Gleise oder Live-Zugposition.'
  });
  const styles=Object.freeze({
    preview:Object.freeze({color:'#ffcf78',weight:3,opacity:.85,dashArray:'5 10'}),
    walking:Object.freeze({color:'#ffda79',weight:5,opacity:.95,dashArray:null}),
    rail:Object.freeze({color:'#ffdf86',weight:4,opacity:.85,dashArray:'7 7'})
  });
  function point(value){
    const lat=Array.isArray(value)?value[0]:value?.lat;
    const lng=Array.isArray(value)?value[1]:value?.lng;
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||
       Math.abs(lat)>90||Math.abs(lng)>180)
      throw new Error('Ungültige Koordinaten in der Routenansicht.');
    return Object.freeze([lat,lng]);
  }
  function stopsOf(values,min){
    if(!Array.isArray(values)||values.length<min||values.length>40)
      throw new Error('Ungültige Stoppreihenfolge.');
    return Object.freeze(values.map(stop=>{
      if(typeof stop?.name!=='string'||!stop.name.trim())
        throw new Error('Ein Routenstopp hat keinen Namen.');
      point(stop);
      return Object.freeze({...stop});
    }));
  }
  function geometry(values){
    if(!Array.isArray(values)||values.length<2||values.length>16000)
      throw new Error('Keine gültige Liniengeometrie vorhanden.');
    return Object.freeze(values.map(point));
  }
  function preview(stops,key=''){
    const ordered=stopsOf(stops,2),points=geometry(ordered.map(point));
    const segments=Object.freeze(ordered.slice(1).map((to,i)=>Object.freeze({
      mode:'walk',geometry:'straight',from:ordered[i],to,
      points:Object.freeze([points[i],points[i+1]]),
      distance:null,duration:null
    })));
    return Object.freeze({
      kind:'preview',geometry:'straight',key,real:false,
      stops:ordered,points,segments,legs:Object.freeze([]),
      distance:null,duration:null,style:styles.preview,note:note.preview
    });
  }
  function walking({start,stops,route,key='',purpose='tour'}){
    if(!['day','tour','single'].includes(purpose))throw new Error('Unbekannter Fußwegtyp.');
    point(start);
    const goals=stopsOf(stops,1),points=geometry(route?.points);
    const distance=route?.distance,duration=route?.duration;
    if(!Number.isFinite(distance)||distance<0||
       !Number.isFinite(duration)||duration<0)
      throw new Error('Ungültige echte Gehstrecke.');
    const provided=route?.legs;
    if(provided!==undefined&&(!Array.isArray(provided)||provided.length!==goals.length))
      throw new Error('Die Gehweg-Etappen passen nicht zu den Stopps.');
    const legs=Object.freeze((provided??[{distance,duration}]).map(l=>{
      if(!Number.isFinite(l?.distance)||l.distance<0||
         !Number.isFinite(l?.duration)||l.duration<0)
        throw new Error('Ungültige Gehweg-Etappe.');
      return Object.freeze({distance:l.distance,duration:l.duration});
    }));
    const segments=Object.freeze([Object.freeze({
      mode:'walk',geometry:'routed-foot',from:start,to:goals.at(-1),
      points,distance,duration
    })]);
    const ordered=purpose==='day'?Object.freeze([Object.freeze({...start}),...goals]):goals;
    return Object.freeze({
      kind:'walking',geometry:'routed-foot',purpose,key,real:true,
      stops:ordered,points,segments,legs,distance,duration,
      style:styles.walking,note:note.walking
    });
  }
  function rail(journey){
    const ordered=stopsOf(journey?.stops,2);
    const segments=Object.freeze(ordered.slice(0,-1).map((from,i)=>{
      const to=ordered[i+1],mode=from.mode==='walk'?'walk':'rail';
      const points=geometry([point(from),...(from.via||[]).map(point),point(to)]);
      return Object.freeze({
        mode,geometry:mode==='walk'?'straight':'schematic-rail',
        style:mode==='walk'?styles.preview:styles.rail,from,to,
        points,distance:null,duration:null,
        label:from.leg||'',departure:from.departure||'',arrival:to.arrival||''
      });
    }));
    const points=Object.freeze(segments.flatMap((segment,i)=>
      i===0?segment.points:segment.points.slice(1)));
    return Object.freeze({
      kind:'rail',geometry:'schematic-rail',real:false,
      stops:ordered,points,segments,legs:Object.freeze([]),
      distance:null,duration:null,style:styles.rail,
      note:segments.some(s=>s.mode==='walk')
        ?'Gestrichelte Linien = schematische Reihenfolge von Fußwegen und Zugfahrten; keine echten Gehwege oder Gleisgeometrien. Für Fußwege Google Maps öffnen.'
        :note.rail,
      title:journey.title||'',date:journey.date||''
    });
  }
  const api={preview,walking,rail,styles,note};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteRouteModel=api;
})(globalThis);
