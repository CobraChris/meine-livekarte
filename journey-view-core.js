/* Stateless journey presentation model shared by future rail/day panels.
 * No DOM, GPS, storage, ticket mutation, date inference or network access.
 * Railway coordinates/lines belong to the existing route-model-core.
 */
(function(root){
'use strict';
const TICKET_STATES=Object.freeze(['unknown','missing','booked','ready']);
function normalizedStatus(value){
 return TICKET_STATES.includes(value)?value:'unknown';
}
// A local-clock difference is only meaningful when both explicit times
// belong to the same calendar day. Never infer an overnight transfer.
function connectionMinutes(arrival,departure){
 const valid=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 if(typeof arrival!=='string'||typeof departure!=='string'||
    !valid.test(arrival)||!valid.test(departure))return null;
 const minutes=value=>Number(value.slice(0,2))*60+Number(value.slice(3));
 const delta=minutes(departure)-minutes(arrival);
 return delta>=0&&delta<=360?delta:null;
}
function build({journey,planId,ticketFor,phaseFor}){
 if(!journey||!Array.isArray(journey.stops)||
    journey.stops.length<2||journey.stops.length>15)
   throw Error('Ungültiger Reiseabschnitt.');
 if(typeof planId!=='string'||!planId||typeof ticketFor!=='function')
   throw Error('Reiseabschnitt und Ticketstatusfunktion erforderlich.');
 const rows=journey.stops.map((stop,index)=>{
   if(!stop||typeof stop.name!=='string'||!stop.name.trim())
     throw Error('Ungültiger Haltepunkt.');
   const last=index===journey.stops.length-1;
   const ticket=last?null:normalizedStatus(ticketFor(index));
   const phase=last?'arrival':typeof phaseFor==='function'?phaseFor(index):'planned';
   const validPhase=['planned','booked','done'].includes(phase)?phase:'planned';
   const arrival=typeof stop.arrival==='string'?stop.arrival:'';
   const departure=typeof stop.departure==='string'?stop.departure:'';
   // A stop with both arrival and departure has a planned transfer. This
   // does not imply the platforms, walk duration or train are confirmed.
   const layover=connectionMinutes(arrival,departure);
   const transfer=layover===null?'':layover<12
     ?'⚠ '+layover+' Min. Umstieg laut Plan · Zeit knapp, Gleise prüfen'
     :layover+' Min. Umstieg laut Plan · Gleise prüfen';
   return Object.freeze({
     index,number:index+1,name:stop.name,arrival,departure,
     timeLabel:[arrival&&arrival+' an',departure&&departure+' ab'].filter(Boolean).join(' · '),
     description:typeof stop.description==='string'?stop.description:'',
     nextLeg:!last&&typeof stop.leg==='string'?stop.leg:'',
     ticket,phase:validPhase,hasNext:!last,connectionMinutes:layover,
     connectionNote:!last?transfer:''
   });
 });
 const legs=rows.slice(0,-1);
 const openTickets=legs.filter(row=>row.ticket!=='ready').length;
 return Object.freeze({
   planId,title:typeof journey.title==='string'?journey.title:'',
   date:typeof journey.date==='string'?journey.date:'',
   rows:Object.freeze(rows),legCount:legs.length,
   openTickets,allTicketsReady:openTickets===0,
   // Ticket status never changes just because the train time has passed.
   live:false
 });
}
const api=Object.freeze({build,normalizedStatus,connectionMinutes,TICKET_STATES});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteJourneyView=api;
})(globalThis);
