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
   return Object.freeze({
     index,number:index+1,name:stop.name,
     arrival:typeof stop.arrival==='string'?stop.arrival:'',
     departure:typeof stop.departure==='string'?stop.departure:'',
     description:typeof stop.description==='string'?stop.description:'',
     nextLeg:!last&&typeof stop.leg==='string'?stop.leg:'',
     ticket,phase:validPhase,hasNext:!last
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
const api=Object.freeze({build,normalizedStatus,TICKET_STATES});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekarteJourneyView=api;
})(globalThis);
