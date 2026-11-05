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
   if(typeof step!=='string'||!step.trim()||step.length>240)
     throw Error('Ungültiger Umstiegsschritt.');
   return Object.freeze({number:index+1,text:step.trim()});
 });
 const source=typeof sourceUrl==='string'&&/^https:\/\//.test(sourceUrl)?sourceUrl:'';
 const knownTicket=['unknown','buy','booked','ready'].includes(ticketStatus)
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
const api=Object.freeze({build,labelPlatform});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteStationTransfer=api;
})(globalThis);
