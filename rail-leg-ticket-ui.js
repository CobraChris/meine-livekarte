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
   const verified=details.ticketIds.filter(id=>files.some(file=>file.id===id));
   const missing=details.ticketIds.length-verified.length;
   const status=$('rail-ticket-file-status');
   status.classList.toggle('is-saved',verified.length>0 && missing===0);
   status.classList.toggle('is-missing',missing>0);
   status.textContent=missing
     ?'⚠ '+missing+' zugeordnete Datei(en) fehlen auf diesem Gerät. '+
       verified.length+' Datei(en) sind noch lokal gespeichert.'
     :verified.length
       ?'✓ '+verified.length+' Ticketfoto(s)/Datei(en) lokal gespeichert und dieser Fahrt zugeordnet.'
       :'Noch kein Ticketfoto oder PDF für diese Fahrt gespeichert.';
   list.replaceChildren();
   if(!details.ticketIds.length){
    list.append(node('p','Zum Speichern ein Foto machen, eine Datei auswählen oder ein vorhandenes Ticket zuordnen.','rail-ticket-hint'));
   }
   for(const id of details.ticketIds){
    const file=files.find(f=>f.id===id);
    const row=node('div',undefined,'rail-ticket-file');
    if(file){
     const label=node('span',undefined,'rail-ticket-file-label');
     const heading=node('strong','✓ '+(file.type.startsWith('image/')?'Foto':'Datei')+' gespeichert & zugeordnet');
     const filename=node('small',file.title);
     label.append(heading,filename);row.append(label);
    }else{
     row.append(node('span','⚠ Datei nicht mehr in der lokalen Ablage vorhanden'));
    }
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
  async function importFile(input){
   const target=context,file=input.files?.[0];
   if(!target||!file)return;
   input.disabled=true;
   message('⏳ Die Datei wird lokal gespeichert …');
   try{
    const saved=await shelf().add(file,{
     title:(target.route+' · '+file.name).slice(0,100),
     trip:target.title.slice(0,100)
    });
    try{API.link(localStorage,target.key,saved.id);}
    catch(error){
     await shelf().remove(saved.id);
     throw error;
    }
    message('✓ Foto/Datei lokal gespeichert und diesem Fahrtabschnitt zugeordnet. Ticketstatus unverändert.');
    root.dispatchEvent(new Event('livekarte:ticket-library-changed'));
    onUpdated();
    await refreshFiles();
   }catch(error){
    message('⚠ Nicht gespeichert: '+(error.message||'Datei konnte nicht übernommen werden.'),true);
   }finally{
    input.value='';
    input.disabled=false;
   }
  }
  $('rail-camera-input').addEventListener('change',e=>{void importFile(e.currentTarget);});
  $('rail-file-input').addEventListener('change',e=>{void importFile(e.currentTarget);});
  $('rail-existing-add').onclick=async()=>{
   const target=context,id=$('rail-existing-select').value;
   if(!target||!id)return;
   try{
    await shelf().get(id);
    API.link(localStorage,target.key,id);
    message('✓ Vorhandenes Ticket zugeordnet; keine zusätzliche Datei angelegt.');
    onUpdated();
    await refreshFiles();
   }catch(error){message('⚠ '+error.message,true);}
  };
  $('rail-details-save').onclick=()=>{
   if(!context)return;
   try{
    const before=API.get(localStorage,context.key);
    API.save(localStorage,context.key,{
     ...before,reference:$('rail-reference').value,
     note:$('rail-note').value,
     pickupRequired:$('rail-pickup').checked
    });
    message('✓ Referenzcode, Abholhinweis und Notiz gespeichert. Ticketdateien bleiben separat gespeichert.');
    onUpdated();
   }catch(error){message('⚠ Nicht gespeichert: '+error.message,true);}
  };

  return {open,summary};
 }
 root.LivekarteRailTicketUI=Object.freeze({create});
})(globalThis);
