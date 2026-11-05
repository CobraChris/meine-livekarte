/* Shared station transfer guide data contract.
 * Never infers a platform, departure time, indoor GPS path or valid ticket.
 * Only renders explicitly provided plan data with provenance.
 */
(function(root){
'use strict';
function labelPlatform(value,sourceUrl){
 if(!value||typeof value.number!=='string'||!value.number.trim())
   return Object.freeze({number:null,label:'Gleis vor Ort prüfen',confidence:'unknown'});
 if(value.confidence==='confirmed' &&
    typeof sourceUrl==='string' && /^https:\/\//.test(sourceUrl))
   return Object.freeze({number:value.number.trim(),label:'Bestätigt laut Quelle',confidence:'confirmed'});
 return Object.freeze({number:value.number.trim(),
   label:'Planwert · Anzeigen vor Ort prüfen',confidence:'planned'});
}
function build({station,arrival,departure,steps,sourceUrl='',ticketStatus='unknown'}={}){
 if(typeof station!=='string'||!station.trim()||!Array.isArray(steps)||
    steps.length<1||steps.length>12)
   throw Error('Bahnhofsname und 1–12 Wegschritte erforderlich.');
 const lines=steps.map((step,index)=>{
   const action=typeof step==='string'?step:step?.action;
   if(typeof action!=='string'||!action.trim()||action.length>500)
     throw Error('Ungültiger Umstiegsschritt.');
   const safe=key=>step&&typeof step==='object'&&
     typeof step[key]==='string'?step[key]:'';
   return Object.freeze({
     number:index+1,text:action.trim(),action:action.trim(),
     title:safe('title'),level:safe('level'),
     sign:safe('sign'),caution:safe('caution')
   });
 });
 const source=typeof sourceUrl==='string'&&/^https:\/\//.test(sourceUrl)?sourceUrl:'';
 const knownTicket=['unknown','missing','booked','ready'].includes(ticketStatus)
   ?ticketStatus:'unknown';
 return Object.freeze({
   station:station.trim(),sourceUrl:source,
   arrivalPlatform:labelPlatform(arrival,source),
   departurePlatform:labelPlatform(departure,source),
   steps:Object.freeze(lines),ticketStatus:knownTicket,
   // Guide cannot turn a ticket into a confirmed booking.
   live:false,indoorGps:false
 });
}
// Pure step-navigation state for every station. An index is just a UI
// position; displaying a step never records actual travel or ticket use.
function stepState(plan,index=0){
 if(!plan||!Array.isArray(plan.steps)||!plan.steps.length)
   throw Error('Umstiegsplan fehlt.');
 const parsed=Number.isInteger(index)?index:0;
 const current=Math.max(0,Math.min(plan.steps.length-1,parsed));
 return Object.freeze({
   number:current+1,total:plan.steps.length,index:current,
   step:plan.steps[current],canBack:current>0,
   canNext:current<plan.steps.length-1,finished:current===plan.steps.length-1
 });
}
const api=Object.freeze({build,labelPlatform,stepState});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteStationTransfer=api;
})(globalThis);
