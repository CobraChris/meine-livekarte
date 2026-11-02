/* Pure, reusable calendar-day assignments inside a city travel section.
 * No GPS, network, mutation of saved place files or ticket data.
 */
(function(root){
  'use strict';
  const CITY_DAYS=Object.freeze({
    'town-kyoto':Object.freeze([
      '2026-11-01','2026-11-02','2026-11-03',
      '2026-11-04','2026-11-05','2026-11-06'])
  });
  const UNASSIGNED='unassigned',ALL='all';
  const days=planId=>CITY_DAYS[planId]||[];
  const allowed=(planId,day)=>day===ALL||day===UNASSIGNED||days(planId).includes(day);
  const defaultDay=(planId,today)=>{
    const values=days(planId);
    return typeof today==='string'&&values.includes(today)?today:ALL;
  };
  const dayLabel=day=>day===ALL?'Alle Tage':day===UNASSIGNED?'Merkliste':
    /^\d{4}-\d\d-\d\d$/.test(day)?day.slice(8)+'.'+day.slice(5,7)+'.':'Unbekannt';
  function fromSchedule(schedule){
    if(typeof schedule!=='string')return '';
    const m=/^(\d{2})\.(\d{2})\.(\d{4})\s*·/.exec(schedule.trim());
    if(m)return m[3]+'-'+m[2]+'-'+m[1];
    const short=/^(\d{2})\.(\d{2})\.\s*·/.exec(schedule.trim());
    return short?'2026-'+short[2]+'-'+short[1]:'';
  }
  function seedDayAssignments(places,planAssignments,placeKey,planId){
    const result=Object.create(null);
    for(const place of places){
      if(place.category==='hotel')continue;
      const key=placeKey(place);
      if(!(planAssignments[key]||[]).includes(planId))continue;
      const day=fromSchedule(place.schedule);
      if(days(planId).includes(day))result[key]=day;
    }
    return result;
  }
  function cleanAssignments(raw,places,placeKey){
    const known=new Set(places.map(placeKey));
    const result=Object.create(null);
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return result;
    for(const [key,date] of Object.entries(raw).slice(0,250)){
      if(known.has(key)&&days('town-kyoto').includes(date))result[key]=date;
    }
    return result;
  }
  function selected(places,assignments,day,placeKey){
    if(day===ALL)return places;
    return places.filter(place=>place.category==='hotel'||
      (day===UNASSIGNED?!Object.hasOwn(assignments,placeKey(place)):
        assignments[placeKey(place)]===day));
  }
  function change(assignments,key,day,planId='town-kyoto'){
    if(!allowed(planId,day))throw new Error('Ungültiger Kalendertag.');
    const next=Object.assign(Object.create(null),assignments);
    if(day===UNASSIGNED)delete next[key];
    else if(day!==ALL)next[key]=day;
    return next;
  }
  const api={CITY_DAYS,ALL,UNASSIGNED,days,allowed,defaultDay,dayLabel,
    fromSchedule,seedDayAssignments,cleanAssignments,selected,change};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteMultiDay=api;
})(globalThis);
