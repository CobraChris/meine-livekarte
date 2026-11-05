/* One shared place presentation for ALL itinerary days and map views.
 * Creates the same compact popup and place card from a place object.
 * No Leaflet, GPS, network, browser storage or route computations in this file.
 * Caller owns markers, application state, and persistence through callbacks.
 */
(function(root){
'use strict';
function create({document,categories,symbols,placeKey,handlers}){
 if(!document||!categories||!symbols||typeof placeKey!=='function'||!handlers)
  throw Error('Ortsdarstellung benötigt Kategorien, Ortskennungen und Aktionen.');
 const $=id=>document.getElementById(id);
 const node=(tag,text,cls)=>{const e=document.createElement(tag);
  if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const {metric,makePlaceDayPicker,walkingButton,route,japaneseButton,
  placeMeta,appendPlaceTiming,tourIsSelected,toggleTourPlace,
  openPlaceEditor,showOnMap,getPlanAssignments,allPlans,saveAssignment}=handlers;
 function begin({planPlacesCount,placesCount,activePlanId}){
  const host=$('places');host.replaceChildren();
  $('count').textContent=planPlacesCount;
  $('empty').hidden=planPlacesCount>0;
  $('demo').hidden=activePlanId!=='all';
  $('empty').querySelector('h3').textContent=activePlanId==='all'
   ?'Hier beginnt dein nächster Ausflug'
   :'Für diesen Abschnitt sind noch keine Orte gespeichert';
  $('empty').querySelector('p').textContent=activePlanId==='all'
   ?'Füge deine Empfehlungen hinzu oder erkunde eine kleine Beispielroute durch Berlin.'
   :'Importiere Ziele, während dieser Abschnitt ausgewählt ist. Deine anderen Ziele bleiben erhalten.';
  $('share').disabled=!planPlacesCount;
  $('clear').disabled=!placesCount;
 }
 function buildPopup(p){
  const inPopup=node('p',metric(p));
  const popup=node('div',undefined,'place-popup-pan-surface');
  const popupHeader=node('div',undefined,'place-popup-header');
  popupHeader.append(node('strong',p.name));
  popup.append(popupHeader);
  const popupDayPicker=makePlaceDayPicker(p);
  if(popupDayPicker)popup.append(popupDayPicker);
  const quickActions=node('div',undefined,'popup-quick-actions popup-compact-actions');
  const popupTourButton=node('button',tourIsSelected(p)?'✓ In Tour':'＋ Tour','tour-pick');
  popupTourButton.type='button';
  popupTourButton.title='Ort direkt zum Rundgang hinzufügen oder entfernen';
  popupTourButton.setAttribute('aria-pressed',String(tourIsSelected(p)));
  popupTourButton.onclick=()=>toggleTourPlace(p,true);
  const popupMore=node('details',undefined,'popup-more');
  const popupMoreSummary=node('summary','⋯ Mehr');
  popupMoreSummary.setAttribute('aria-label','Weitere Aktionen und Informationen für '+p.name);
  const popupMoreBody=node('div',undefined,'popup-more-body');
  const popupEditButton=node('button','✎ Bearbeiten','place-edit');
  popupEditButton.type='button';
  popupEditButton.onclick=()=>openPlaceEditor(p);
  popupMoreBody.append(route(p),popupEditButton);
  const popupJapanese=japaneseButton(p);
  if(popupJapanese)popupMoreBody.append(popupJapanese);
  const metaText=placeMeta(p);
  if(metaText)popupMoreBody.append(node('p',metaText,'place-meta'));
  appendPlaceTiming(popupMoreBody,p);
  const description=node('p',p.description,'place-popup-description');
  popupMoreBody.append(description,inPopup);
  popupMore.append(popupMoreSummary,popupMoreBody);
  const popupWalk=walkingButton(p);
  popupWalk.textContent='🚶 Fußweg';
  quickActions.append(popupWalk,popupTourButton,popupMore);
  popup.append(quickActions);
  return {popup,inPopup};
 }
 function buildCard(p,marker){
  const card=node('article',undefined,'place');
  const top=node('div',undefined,'place-top'),title=node('div');
  title.append(node('div',categories[p.category],'category'),node('h3',p.name));
  top.append(node('span',symbols[p.category],'place-icon'),title);
  const actions=node('div',undefined,'place-actions');
  const show=node('button','Auf Karte');
  show.onclick=()=>showOnMap(p,marker);
  const distance=node('span',metric(p),'distance');
  const tourButton=node('button',tourIsSelected(p)?'✓ Tour':'＋ Tour','tour-pick');
  tourButton.type='button';
  tourButton.setAttribute('aria-pressed',String(tourIsSelected(p)));
  tourButton.title='Ort zu einem Rundgang hinzufügen oder entfernen';
  tourButton.onclick=()=>toggleTourPlace(p);
  actions.append(show,walkingButton(p),tourButton,route(p),distance);
  const editButton=node('button','✎ Bearbeiten','place-edit');
  editButton.type='button';
  editButton.onclick=()=>openPlaceEditor(p);
  actions.append(editButton);
  const placeJapanese=japaneseButton(p);
  if(placeJapanese)actions.append(placeJapanese);
  const assignRow=node('div',undefined,'plan-assign-row');
  const assignSelect=node('select',undefined,'place-plan-select');
  assignSelect.setAttribute('aria-label','Ort '+p.name+' einem Reiseabschnitt zuordnen');
  const tags=getPlanAssignments()[placeKey(p)]||[];
  const options=[{id:'',name:'Keinem Abschnitt zugeordnet'},...allPlans().filter(section=>section.id!=='all')];
  options.forEach(section=>{
   const opt=node('option',section.name);
   opt.value=section.id;
   if(section.id===(tags[0]||''))opt.selected=true;
   assignSelect.append(opt);
  });
  assignSelect.onchange=()=>saveAssignment(p,assignSelect.value);
  assignRow.append(assignSelect);
  const metaText=placeMeta(p);
  if(metaText)card.append(node('p',metaText,'place-meta'));
  appendPlaceTiming(card,p);
  const cardDayPicker=makePlaceDayPicker(p);
  // The visible place title must always be present in EVERY date's list.
  card.append(top,node('p',p.description),actions,assignRow);
  if(cardDayPicker)card.append(cardDayPicker);
  return {card,distance};
 }
 function appendCard(card){$('places').append(card);}
 function showEmptyFilter(){ $('places').append(node('p','Keine Orte in dieser Kategorie.')); }
 return Object.freeze({begin,buildPopup,buildCard,appendCard,showEmptyFilter});
}
const api={create};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.LivekartePlaceUI=api;
})(globalThis);
