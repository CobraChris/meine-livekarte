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
  async function refreshFiles(){
   const target=context;
   if(!target||!dialog.open)return;
   const files=await shelf().list();
   if(context!==target)return;
   const details=API.get(localStorage,target.key);
   const select=$('rail-existing-select'),list=$('rail-ticket-files');
   select.replaceChildren();
   const placeholder=node('option','Ticket auswählen …');
   placeholder.value='';select.append(placeholder);
   for(const f of files){
    if(details.ticketIds.includes(f.id))continue;
    const option=node('option',f.title+(f.trip?' · '+f.trip:''));
    option.value=f.id;select.append(option);
   }
   $('rail-existing-add').disabled=select.options.length<2;
   list.replaceChildren();
   if(!details.ticketIds.length){
    list.append(node('p','Noch keine Dateien zugeordnet.','rail-ticket-hint'));
   }
   for(const id of details.ticketIds){
    const file=files.find(f=>f.id===id);
    const row=node('div',undefined,'rail-ticket-file');
    row.append(node('span',file?'📎 '+file.title:
      '⚠ Datei nicht mehr in der Ablage vorhanden'));
    if(file){
     const view=node('button','👁 Anzeigen');view.type='button';
     view.onclick=()=>root.dispatchEvent(
       new CustomEvent('livekarte:ticket-open',{detail:{id}}));
     row.append(view);
    }
    const unlink=node('button','✕ Zuordnung lösen');
    unlink.type='button';
    unlink.onclick=()=>{
     try{
      API.unlink(localStorage,target.key,id);
      message('Zuordnung entfernt. Die Ticketdatei bleibt erhalten.');
      onUpdated();
      void refreshFiles().catch(e=>message(e.message,true));
     }catch(e){message('Nicht gespeichert: '+e.message,true);}
    };
    row.append(unlink);list.append(row);
   }
  }
  // methods
  return {open,summary};
 }
 root.LivekarteRailTicketUI=Object.freeze({create});
})(globalThis);
