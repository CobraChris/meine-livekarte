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
  // methods
  return {open,summary};
 }
 root.LivekarteRailTicketUI=Object.freeze({create});
})(globalThis);
