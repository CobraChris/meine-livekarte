/* Browser and Node-friendly validation for a private outbound ticket-status snapshot.
 * Contains no authentication and has no dependency on the map, GPS or browsers.
 */
(function(root){
  'use strict';
  const states=['unknown','missing','booked','ready'];
  const sources=['manual','chat-link','encrypted-sync'];
  const devicePattern=/^[0-9a-f]{24}$/;
  const datePattern=/^\d{2}\.\d{2}\.\d{4}$/;
  const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
  function normalizeRepo(raw) {
    const repo=String(raw||'').trim();
    if(!/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(repo)
       || repo.includes('..') || repo.endsWith('.'))
      throw new Error('GitHub-Repository im Format Benutzername/Repository angeben.');
    return repo;
  }
  function normalizeTicket(ticket) {
    if(!ticket || typeof ticket!=='object' || Array.isArray(ticket))
      throw new Error('Ungültige Ticketangabe.');
    const {plan,date,from,to,departure,status,source,updatedAt}=ticket;
    const station=v=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=100;
    if(typeof plan!=='string'||!/^[a-z0-9-]{2,70}$/.test(plan)
       || typeof date!=='string'||!datePattern.test(date)
       || !station(from)||!station(to)
       || typeof departure!=='string'||!timePattern.test(departure)
       || !states.includes(status)||!sources.includes(source)
       || !Number.isSafeInteger(updatedAt)||updatedAt<0)
      throw new Error('Unvollständige oder ungültige Ticketangabe.');
    return {plan,date,from:from.trim(),to:to.trim(),departure,status,source,updatedAt};
  }
  function key(ticket) {
    const t=normalizeTicket(ticket);
    return JSON.stringify([t.plan,t.date,t.from,t.departure,t.to]);
  }
  function normalizeSnapshot(input) {
    if(!input||typeof input!=='object'||Array.isArray(input)
       ||input.v!==1||!devicePattern.test(input.device)
       ||!Array.isArray(input.tickets)||input.tickets.length>250)
      throw new Error('Ungültiges Synchronisierungsformat.');
    const all=new Map();
    for(const raw of input.tickets){
      const t=normalizeTicket(raw);
      const id=key(t);
      const previous=all.get(id);
      if(!previous || previous.updatedAt<=t.updatedAt)all.set(id,t);
    }
    return {v:1,device:input.device,tickets:[...all.values()].sort((a,b)=>key(a).localeCompare(key(b)))};
  }
  function mergeSnapshots(device,local,remote) {
    if(!devicePattern.test(device))throw new Error('Geräte-ID ungültig.');
    if(remote?.device && remote.device!==device)
      throw new Error('Das private Statusdokument gehört zu einem anderen Gerät.');
    const l=normalizeSnapshot({v:1,device,tickets:local||[]});
    const r=remote?normalizeSnapshot(remote):{v:1,device,tickets:[]};
    const merged=new Map(r.tickets.map(t=>[key(t),t]));
    for(const ticket of l.tickets){
      const id=key(ticket),prev=merged.get(id);
      if(!prev||ticket.updatedAt>prev.updatedAt)merged.set(id,ticket);
    }
    return normalizeSnapshot({v:1,device,tickets:[...merged.values()]});
  }
  const api={normalizeRepo,normalizeTicket,key,normalizeSnapshot,mergeSnapshots};
  if(typeof module!=='undefined')module.exports=api;
  else root.LivekarteOutboxCore=api;
})(globalThis);
