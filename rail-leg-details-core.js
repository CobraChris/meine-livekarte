'use strict';
(function(root){
 const KEY='livekarte-rail-leg-details-v1', MAX_FILES=8;
 const clean=(value,max)=>String(value??'').trim().slice(0,max);
 function normalize(raw={}){
  const ids=Array.isArray(raw.ticketIds)?raw.ticketIds:[];
  return Object.freeze({
   ticketIds:Object.freeze([...new Set(ids.filter(id=>typeof id==='string'&&id.length>0&&id.length<=100))].slice(0,MAX_FILES)),
   reference:clean(raw.reference,120),
   note:clean(raw.note,500),
   pickupRequired:raw.pickupRequired===true
  });
 }
 function all(storage){
  try{
   const json=JSON.parse(storage.getItem(KEY)||'{}');
   return json&&typeof json==='object'&&!Array.isArray(json)?json:{};
  }catch{return {};}
 }
 function get(storage,key){
  if(typeof key!=='string'||!key)throw Error('Fahrtabschnitt fehlt.');
  return normalize(all(storage)[key]);
 }
 function save(storage,key,details){
  if(typeof key!=='string'||!key||key.length>700)throw Error('Fahrtabschnitt fehlt.');
  const next=normalize(details);
  storage.setItem(KEY,JSON.stringify({...all(storage),[key]:next}));
  return next;
 }
 function link(storage,key,id){
  const value=get(storage,key);
  if(typeof id!=='string'||!id||id.length>100)throw Error('Dokument-ID ungültig.');
  if(value.ticketIds.includes(id))return value;
  if(value.ticketIds.length>=MAX_FILES)throw Error('Maximal acht Dokumente je Fahrt.');
  return save(storage,key,{...value,ticketIds:[...value.ticketIds,id]});
 }
 function unlink(storage,key,id){
  const value=get(storage,key);
  return save(storage,key,{...value,ticketIds:value.ticketIds.filter(x=>x!==id)});
 }
 const api=Object.freeze({KEY,MAX_FILES,normalize,get,save,link,unlink});
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.LivekarteRailLegDetails=api;
})(globalThis);
