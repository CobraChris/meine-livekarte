'use strict';
(function(root){
 function create({onUpdated}){
  const $=id=>document.getElementById(id);
  const API=root.LivekarteRailLegDetails;
  const dialog=$('rail-ticket-dialog');
  let context=null;
  const shelf=()=>new root.LivekarteTicketLibrary.Library();
  const node=(tag,text,cls)=>{
   const el=document.createElement(tag);
   if(text!==undefined)el.textContent=text;
   if(cls)el.className=cls;
   return el;
  };
  function message(text,error=false){
   const el=$('rail-ticket-message');
   el.textContent=text;
   el.classList.toggle('is-error',error);
  }
  function summary(planId,trip,index){
   const key=root.MapCore.ticketLegKey(planId,trip,index);
   const data=API.get(localStorage,key);
   return (data.ticketIds.length?' · 📎 '+data.ticketIds.length:'')+
    (data.pickupRequired?' · Abholen':'')+
    (data.reference||data.note?' · 📝':'');
  }
  async function open(planId,trip,index){
   if(dialog.open)return;
   if(!root.LivekarteTicketLibrary?.available()){
    throw Error('Lokale Ticketablage ist in diesem Browser nicht verfügbar.');
   }
   const key=root.MapCore.ticketLegKey(planId,trip,index);
   const a=trip.stops[index],b=trip.stops[index+1];
   context={key,route:a.name+' → '+b.name,title:trip.title||'Zugreise'};
   const data=API.get(localStorage,key);
   $('rail-ticket-route').textContent=context.route;
   $('rail-reference').value=data.reference;
   $('rail-note').value=data.note;
   $('rail-pickup').checked=data.pickupRequired;
   $('rail-camera-input').value='';
   $('rail-file-input').value='';
   message('');
   dialog.showModal();
   try{await refreshFiles();}
   catch(error){message('Ticketliste nicht verfügbar: '+error.message,true);}
  }
  $('rail-ticket-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{context=null;});
  $('rail-camera-button').onclick=()=>$('rail-camera-input').click();
  $('rail-file-button').onclick=()=>$('rail-file-input').click();
  // methods
  return {open,summary};
 }
 root.LivekarteRailTicketUI=Object.freeze({create});
})(globalThis);
