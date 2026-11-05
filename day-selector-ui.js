/* Presentational day-selector for all date-aware itineraries.
 * No GPS, network, localStorage, Leaflet or route side effects. */
(function(root){
'use strict';
function create({document,calendar,placeKey}){
 if(!document||!calendar||typeof placeKey!=='function')
  throw Error('Tagesauswahl benötigt Kalender, Dokument und Ortskennungen.');
 const $=id=>document.getElementById(id);
 const node=(tag,txt,css)=>{const e=document.createElement(tag);
  if(txt!==undefined)e.textContent=txt;if(css)e.className=css;return e;};
 function render({context,activeDay,overview,onSelect}){
  if(!context||typeof onSelect!=='function')throw Error('Tageskontext fehlt.');
  const panel=$('city-days'),list=$('city-days-list');
  panel.hidden=!context.days.length;
  $('plan-day-summary').hidden=panel.hidden;
  list.replaceChildren();
  if(panel.hidden)return;
  for(const day of [...context.days,calendar.ALL,calendar.UNASSIGNED]){
   const button=node('button',calendar.dayLabel(day),'city-day-tile');
   if(day===calendar.ALL||day===calendar.UNASSIGNED)
    button.classList.add('city-day-utility');
   button.type='button';button.dataset.dayDate=day;
   button.setAttribute('data-day-date',day);
   button.setAttribute('aria-pressed',String(activeDay===day));
   button.append(node('small',(context.counts[day]||0)+' Ziele'));
   button.onclick=()=>onSelect(day);
   list.append(button);
  }
  const selected=context.isDated,assigned=context.displayGoals;
  const dayIndex=context.days.indexOf(activeDay);
  const overviewDay=selected&&dayIndex>=0
   ?overview?.querySelectorAll?.('details.kyoto-day')?.[dayIndex]:null;
  const title=overviewDay?.querySelector('summary strong')?.textContent?.trim()||'';
  const shortTitle=title.includes(' · ')?title.split(' · ').slice(1).join(' · '):title;
  const region=context.planId==='town-kyoto'?'Kyoto':
   context.plan?.name||'Reiseabschnitt';
  $('city-day-brief-title').textContent=selected
   ?calendar.dayLabel(activeDay)+(shortTitle?' · '+shortTitle:'')
   :activeDay===calendar.ALL?'Alle Reiseziele in '+region:'Merkliste · noch ohne Datum';
  $('city-day-brief-summary').textContent=assigned.length
   ?assigned.slice(0,4).map(p=>p.name).join(' · ')+(assigned.length>4?' · …':'')
   :'Keine Reiseziele zugeordnet.';
  const firstTime=overviewDay?.querySelector('.kyoto-day-timeline time')?.textContent?.trim();
  $('city-day-brief-time').textContent=selected&&firstTime
   ?'Planstart: '+firstTime+' · Zeiten Richtwerte':'';
  $('city-day-brief-open').hidden=!selected;
  $('plan-day-summary').textContent=calendar.dayLabel(activeDay)+' · '+assigned.length+' Ziele';
  const focusLabel=selected?'Standort und Tagesziele zeigen':
   activeDay===calendar.UNASSIGNED?'Merkliste auf Karte zeigen':'Alle '+region+'-Ziele zeigen';
  const fit=$('fit');
  fit.lastElementChild.textContent=focusLabel;
  fit.setAttribute('aria-label',focusLabel);
  fit.title=focusLabel;
  $('city-days-help').textContent=activeDay===calendar.ALL
   ?'Alle Ziele · wähle einen Tag oder die Merkliste'
   :activeDay===calendar.UNASSIGNED?'Noch nicht verplante Orte · Datum am Ziel wählen'
   :'Nur '+calendar.dayLabel(activeDay)+' · Hotel bleibt sichtbar';
 }
 function makePlaceDayPicker({place,context,dayAssignments,onAssign}){
  if(!place||!context?.days.length||place.category==='hotel')return null;
  const box=node('div',undefined,'place-day-picker'),label=node('label','Für Tag:');
  const select=node('select');
  select.setAttribute('aria-label','Kalendertag für '+place.name);
  for(const day of [calendar.UNASSIGNED,...context.days]){
   const opt=node('option',calendar.dayLabel(day));
   opt.value=day;select.append(opt);
  }
  select.value=dayAssignments[placeKey(place)]||calendar.UNASSIGNED;
  select.onchange=()=>onAssign(place,select.value);
  box.append(label,select);
  return box;
 }
 return Object.freeze({render,makePlaceDayPicker});
}
const api={create};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteDaySelectorUI=api;
})(globalThis);
