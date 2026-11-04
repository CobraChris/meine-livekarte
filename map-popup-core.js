/* One popup interaction contract for ALL Leaflet markers.
 * Data-driven pages (Kyoto/Nara/Osaka, tours, journey, discovery) use the
 * same binder; native controls remain tappable and swipes pan the map.
 * No location data, storage or network access.
 */
(function(root){
  'use strict';
  const NATIVE_INPUT='input,select,textarea,label,[contenteditable="true"],[role="slider"],[data-no-map-pan]';
  function attachPan({marker,surface,map,onPanStart}){
    let pointerId=null,startX=0,startY=0,lastX=0,lastY=0;
    let dragging=false,fromText=false,skipClickUntil=0;
    function release(event){
      if(pointerId===null || (event.pointerId!==undefined&&event.pointerId!==pointerId))return;
      const id=pointerId,wasDragging=dragging;
      pointerId=null;dragging=false;fromText=false;
      surface.classList.remove('is-dragging');
      if(wasDragging)skipClickUntil=Date.now()+450;
      try{
        if(surface.hasPointerCapture?.(id))surface.releasePointerCapture(id);
      }catch{/* Capturing is optional; marker remains open after release. */}
    }
    surface.addEventListener('pointerdown',event=>{
      if((event.pointerType==='mouse'&&event.button!==0) ||
         pointerId!==null || !marker.isPopupOpen())return;
      // Inputs and select menus have native gestures. Buttons, links and
      // disclosure headers allow *swipes* but retain normal tap behavior.
      if(event.target.closest?.(NATIVE_INPUT))return;
      pointerId=event.pointerId;
      startX=lastX=event.clientX;
      startY=lastY=event.clientY;
      fromText=!!event.target.closest?.('.place-popup-description,.popup-more-body,p');
    });
    surface.addEventListener('pointermove',event=>{
      if(pointerId===null||pointerId!==event.pointerId||!marker.isPopupOpen())return;
      const dx=event.clientX-lastX,dy=event.clientY-lastY;
      if(!dragging){
        if(Math.hypot(event.clientX-startX,event.clientY-startY)<8)return;
        dragging=true;
        surface.classList.add('is-dragging');
        onPanStart?.();
        try{surface.setPointerCapture?.(pointerId);}catch{/* Unsupported; no capture required. */}
      }
      event.preventDefault();event.stopPropagation();
      lastX=event.clientX;lastY=event.clientY;
      if(!Number.isFinite(dx)||!Number.isFinite(dy)||
         Math.abs(dx)>110||Math.abs(dy)>110)return;
      const scroll=marker.getPopup?.()?.getElement?.()?.querySelector?.('.leaflet-popup-content');
      if(fromText&&scroll&&scroll.scrollHeight>scroll.clientHeight+4&&
         Math.abs(dy)>Math.abs(dx)*1.4){
        scroll.scrollTop-=dy;return;
      }
      if(dx||dy)map.panBy([-dx,-dy],{animate:false});
    });
    // A swipe that begins on an action must not activate that action.
    // Capture-phase click suppression is limited to the immediately
    // following synthetic click; ordinary taps remain unchanged.
    surface.addEventListener('click',event=>{
      if(Date.now()>skipClickUntil)return;
      skipClickUntil=0;
      event.preventDefault();event.stopImmediatePropagation?.();
    },true);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])
      surface.addEventListener(type,release);
    marker.on('popupclose',()=>release({pointerId}));
  }
  function bind({marker,content,map,L,onPanStart,options={}}){
    if(!marker||!content||!map||!L)throw new Error('Popup requires marker, content, map and Leaflet');
    const useExisting=content.classList?.contains?.('place-popup-pan-surface');
    const doc=content.ownerDocument||root.document;
    const surface=useExisting?content:doc.createElement('div');
    if(!useExisting){
      surface.className='place-popup-pan-surface';
      surface.append(content);
    }
    // Every marker receives the same mobile-safe spacing and interaction
    // behavior, with small option overrides where content requires it.
    marker.bindPopup(surface,{
      minWidth:Math.min(286,Math.max(205,map.getSize().x-76)),
      maxWidth:320,maxHeight:300,
      offset:L.point(0,-24),autoPan:true,
      autoPanPaddingTopLeft:L.point(18,76),
      autoPanPaddingBottomRight:L.point(18,40),
      ...options
    });
    attachPan({marker,surface,map,onPanStart});
    marker.on('popupopen',()=>onPanStart?.());
    return marker;
  }
  const api={bind,attachPan};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.LivekarteMapPopup=api;
})(globalThis);
