/* Local day timetable for previously fetched real pedestrian route legs.
 * No GPS access, network calls, current-time dependency or persistence.
 */
(function(root){
  'use strict';
  const clock=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const int=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
  function minuteOf(time){
    if(typeof time!=='string'||!clock.test(time))
      throw new Error('Bitte eine gültige Startzeit (HH:MM) wählen.');
    const [hours,minutes]=time.split(':').map(Number);
    return hours*60+minutes;
  }
  function clockText(value){
    if(!Number.isFinite(value)||value<0)throw new Error('Ungültige Uhrzeit.');
    const minutes=Math.round(value),days=Math.floor(minutes/1440);
    const local=minutes%1440;
    return String(Math.floor(local/60)).padStart(2,'0')+':'+
      String(local%60).padStart(2,'0')+(days?' (+'+days+' Tag'+(days===1?'':'e')+')':'');
  }
  function visitMinutes(raw){
    if(typeof raw!=='string')return null;
    const str=raw.trim().replace(/,/g,'.');
    // Strings already stored on places, e.g. "30–60 Min." or "1–2 Std."
    const unit='(?:stunden?|std\\.?|h|minuten?|min\\.?)';
    const range=new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:[–—-]|bis)\\s*(\\d+(?:\\.\\d+)?)\\s*('+unit+')','i').exec(str);
    let value;
    if(range){
      const first=Number(range[1]),last=Number(range[2]);
      if(last<first)return null;
      value=(first+last)/2* (/^(?:stund|std|h)/i.test(range[3])?60:1);
    }else{
      const one=new RegExp('(\\d+(?:\\.\\d+)?)\\s*('+unit+')','i').exec(str);
      if(!one)return null;
      value=Number(one[1])*(/^(?:stund|std|h)/i.test(one[2])?60:1);
    }
    if(!Number.isFinite(value)||value<5||value>480)return null;
    return Math.max(5,Math.round(value/5)*5);
  }
  function build({start,stops,legs,visits,windows,buffer=10,lunch=45}){
    const startMinute=minuteOf(start);
    if(!Array.isArray(stops)||stops.length<1||stops.length>6||
       !Array.isArray(legs)||legs.length!==stops.length||
       !Array.isArray(visits)||visits.length!==stops.length||
       !Array.isArray(windows)||windows.length!==stops.length)
      throw new Error('Ziele und echte Gehzeit-Etappen passen nicht zusammen.');
    if(!int(buffer,0,30)||!int(lunch,0,90))
      throw new Error('Ungültiger Zeitpuffer oder Mittagspause.');
    let at=startMinute,ateLunch=false,knownHours=0,unknownHours=0;
    const items=[],warnings=[];
    for(let i=0;i<stops.length;i++){
      if(typeof stops[i]?.name!=='string'||!stops[i].name||
         !Number.isFinite(legs[i]?.duration)||legs[i].duration<0||
         !Number.isFinite(legs[i]?.distance)||legs[i].distance<0)
        throw new Error('Eine Route enthält ungültige Etappenwerte.');
      const visit=visits[i];
      if(!int(visit,5,480))throw new Error('Besuchsdauer muss 5 bis 480 Minuten betragen.');
      const legMinutes=Math.max(1,Math.ceil(legs[i].duration/60));
      const depart=at;
      const arrival=depart+legMinutes;
      let visitStart=arrival,wait=0,windowWarning='';
      const w=windows[i]||{};
      const hasOpen=typeof w.open==='string'&&w.open.length>0;
      const hasClose=typeof w.close==='string'&&w.close.length>0;
      if(hasOpen!==hasClose)
        throw new Error('Öffnung und Schließung für '+stops[i].name+' vollständig angeben.');
      let opening=null,closing=null;
      if(hasOpen){
        opening=minuteOf(w.open);closing=minuteOf(w.close);
        if(opening>=closing)throw new Error('Öffnungsfenster für '+stops[i].name+' ist ungültig.');
        knownHours++;
        // HH:MM windows represent the user's selected DAY, not live-provider hours.
        // A multi-day itinerary cannot reinterpret opening windows automatically.
        if(arrival<opening){
          wait=opening-arrival;visitStart=opening;
        }
        if(visitStart>=closing)windowWarning='Bei Ankunft bereits geschlossen';
        else if(visitStart+visit>closing)windowWarning='Besuch endet nach Schließung';
      }else unknownHours++;
      const visitEnd=visitStart+visit;
      if(windowWarning)warnings.push(stops[i].name+': '+windowWarning+'.');
      let lunchAfter=0,bufferAfter=0;
      if(i<stops.length-1){
        // Pause at a sensible stop, not halfway along an actual footpath.
        if(!ateLunch&&lunch>0&&visitEnd>=11*60+30&&visitEnd<=14*60+30){
          lunchAfter=lunch;ateLunch=true;
        }
        bufferAfter=buffer;
      }
      at=visitEnd+lunchAfter+bufferAfter;
      items.push({
        name:stops[i].name,index:i+1,depart,arrival,visitStart,visitEnd,
        legMinutes,legMeters:legs[i].distance,wait,visitMinutes:visit,
        bufferAfter,lunchAfter,windowWarning,
        hoursKnown:hasOpen,opening,closing,
        schedule:typeof stops[i].schedule==='string'?stops[i].schedule:'',
        note:typeof stops[i].note==='string'?stops[i].note:''
      });
    }
    if(at>=24*60)warnings.push('Der Tagesplan endet nach Mitternacht.');
    return {start:startMinute,end:at,items,warnings,
      walkingMinutes:items.reduce((n,x)=>n+x.legMinutes,0),
      visitingMinutes:items.reduce((n,x)=>n+x.visitMinutes,0),
      waitingMinutes:items.reduce((n,x)=>n+x.wait,0),
      bufferMinutes:items.reduce((n,x)=>n+x.bufferAfter,0),
      lunchMinutes:items.reduce((n,x)=>n+x.lunchAfter,0),
      knownHours,unknownHours,lunchScheduled:ateLunch};
  }
  const api={minuteOf,clockText,visitMinutes,build};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteDayPlan=api;
})(globalThis);
