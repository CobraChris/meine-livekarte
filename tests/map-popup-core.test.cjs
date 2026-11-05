'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Popup=require('../map-popup-core.js');

function docFactory(){
 const doc={createElement:()=>surface(doc)};
 return doc;
}
function surface(doc){
 const listeners=new Map();
 const node={
  ownerDocument:doc,className:'',children:[],captured:null,
  addEventListener(type,handler){
   if(!listeners.has(type))listeners.set(type,[]);
   listeners.get(type).push(handler);
  },
  append(child){this.children.push(child);},
  classList:{
   contains:cls=>node.className.split(/\s+/).includes(cls),
   add:cls=>{node.className=[...new Set([...node.className.split(/\s+/),cls])].join(' ');},
   remove:cls=>{node.className=node.className.split(/\s+/).filter(v=>v!==cls).join(' ');}
  },
  setPointerCapture(id){node.captured=id;},
  hasPointerCapture(id){return node.captured===id;},
  releasePointerCapture(id){if(node.captured===id)node.captured=null;},
  dispatch(type,props={}){
   const evt={pointerId:1,pointerType:'touch',button:0,
    clientX:100,clientY:100,target:target('div'),
    defaultPrevented:false,stopped:false,immediateStopped:false,
    preventDefault(){this.defaultPrevented=true;},
    stopPropagation(){this.stopped=true;},
    stopImmediatePropagation(){this.immediateStopped=true;},
    ...props};
   for(const callback of listeners.get(type)||[])callback(evt);
   return evt;
  }
 };
 return node;
}
function target(type){
 return {
  closest(selector){
   if(selector.startsWith('input,select,textarea,label'))
    return ['select','input','textarea','label'].includes(type)?{}:null;
   if(selector.includes('.place-popup-description'))return type==='description'?{}:null;
   return null;
  }
 };
}
function setup({existing=false,scroll=false}={}){
 const doc=docFactory(),content=surface(doc);
 if(existing)content.className='place-popup-pan-surface';
 const events={},pans=[];
 const scrollArea={scrollHeight:scroll?800:100,clientHeight:220,scrollTop:120};
 let open=true,pauses=0;
 const marker={
  isPopupOpen:()=>open,
  on(name,fn){(events[name]??=[]).push(fn);return this;},
  bindPopup(element,options){this.bound={element,options};return this;},
  getPopup(){return {getElement:()=>({querySelector:()=>scrollArea})};},
  emit(name){for(const fn of events[name]||[])fn();}
 };
 const map={getSize:()=>({x:390,y:760}),
  panBy:(delta,options)=>pans.push({delta,options})};
 const Leaflet={point:(a,b)=>({x:a,y:b})};
 Popup.bind({marker,content,map,L:Leaflet,onPanStart:()=>pauses++,
  options:{maxWidth:260}});
 return {marker,surface:marker.bound.element,content,doc,map,pans,scrollArea,
  pauses:()=>pauses,close(){open=false;marker.emit('popupclose');}};
}

test('every date and marker category uses the same popup gesture binder',()=>{
 for(const destination of ['Kyoto 03.11','Nara 04.11','Osaka 05.11',
    'Nikkō','journey station','tour stop','discovered place']){
  const fixture=setup();
  const s=fixture.surface;
  assert.equal(fixture.marker.bound.options.maxWidth,260,destination);
  assert.equal(fixture.marker.bound.options.minWidth,286,destination);
  assert.ok(s.classList.contains('place-popup-pan-surface'),destination);
  assert.equal(s.children[0],fixture.content,destination);
  fixture.marker.emit('popupopen');
  assert.equal(fixture.pauses(),1,destination);
  s.dispatch('pointerdown',{target:target('button')});
  const evt=s.dispatch('pointermove',{clientX:140,clientY:119});
  assert.equal(evt.defaultPrevented,true,destination);
  assert.ok(fixture.pans.length>0,destination);
  assert.deepEqual(fixture.pans[0].delta,[-40,-19],destination);
  s.dispatch('pointerup',{clientX:140,clientY:119});
  assert.equal(s.classList.contains('is-dragging'),false,destination);
 }
});

test('ordinary button or link tap remains clickable; swipe suppresses its click',()=>{
 const f=setup({existing:true}),s=f.surface;
 assert.equal(s,f.content,'existing place popup node is reused');
 s.dispatch('pointerdown',{target:target('button')});
 s.dispatch('pointermove',{clientX:103,clientY:102});
 s.dispatch('pointerup',{clientX:103,clientY:102});
 const tap=s.dispatch('click',{target:target('button')});
 assert.equal(tap.defaultPrevented,false);
 assert.equal(f.pans.length,0);
 s.dispatch('pointerdown',{target:target('button')});
 s.dispatch('pointermove',{clientX:126,clientY:112});
 s.dispatch('pointerup',{clientX:126,clientY:112});
 const swipeClick=s.dispatch('click',{target:target('button')});
 assert.equal(swipeClick.defaultPrevented,true);
 assert.equal(swipeClick.immediateStopped,true);
 // Synthetic click handled; next intentional tap must not be blocked.
 const subsequent=s.dispatch('click',{target:target('button')});
 assert.equal(subsequent.defaultPrevented,false);
});

test('native calendar select and input retain gestures and do not move map',()=>{
 const f=setup(),s=f.surface;
 for(const type of ['select','input','textarea','label']){
  s.dispatch('pointerdown',{target:target(type)});
  s.dispatch('pointermove',{target:target(type),clientX:175,clientY:125});
  s.dispatch('pointerup',{target:target(type),clientX:175,clientY:125});
 }
 assert.equal(f.pans.length,0);
 assert.equal(f.pauses(),0);
});

test('overflowing text scrolls inside its popup rather than moving whole map',()=>{
 const f=setup({scroll:true}),s=f.surface;
 s.dispatch('pointerdown',{target:target('description')});
 s.dispatch('pointermove',{target:target('description'),clientX:105,clientY:145});
 assert.equal(f.scrollArea.scrollTop,75);
 assert.equal(f.pans.length,0);
 s.dispatch('pointerup',{clientX:105,clientY:145});
});

test('closing popup mid-swipe releases pointer capture and dragging state',()=>{
 const f=setup(),s=f.surface;
 s.dispatch('pointerdown',{target:target('link')});
 s.dispatch('pointermove',{clientX:124,clientY:125});
 assert.equal(s.classList.contains('is-dragging'),true);
 assert.equal(s.hasPointerCapture(1),false,'touch uses implicit capture only');
 s.dispatch('lostpointercapture',{pointerId:1});
 assert.equal(s.classList.contains('is-dragging'),true,
   'lost capture during Leaflet reposition must not cancel a touch swipe');
 f.close();
 assert.equal(s.classList.contains('is-dragging'),false);
 assert.equal(s.hasPointerCapture(1),false);
});

test('expanding compact popup details reflows Leaflet popup and avoids clipped actions',async()=>{
 const doc=docFactory(),content=surface(doc);
 let updates=0,open=true;
 const marker={
  bound:null,
  isPopupOpen:()=>open,
  bindPopup(element,options){this.bound={element,options};return this;},
  on(){return this;},
  getPopup(){return {update(){updates++;}};}
 };
 const map={getSize:()=>({x:393,y:500}),panBy:()=>{}};
 const frames=[];
 const oldRAF=globalThis.requestAnimationFrame;
 try{
  globalThis.requestAnimationFrame=fn=>frames.push(fn);
  Popup.bind({marker,content,map,L:{point:(x,y)=>({x,y})}});
  const target=marker.bound.element;
  target.dispatch('toggle',{target:{tagName:'DETAILS'}});
  assert.equal(frames.length,1);
  frames.pop()();
  assert.equal(updates,1,'Leaflet must recalculate height and autopan after Mehr expands');
  open=false;
  target.dispatch('toggle',{target:{tagName:'DETAILS'}});
  assert.equal(updates,1,'closed popups must not be updated');
 }finally{
  if(oldRAF===undefined)delete globalThis.requestAnimationFrame;
  else globalThis.requestAnimationFrame=oldRAF;
 }
});

test('complete long touch swipe remains active after Leaflet popup loses capture',()=>{
 const f=setup(),s=f.surface;
 s.dispatch('pointerdown',{target:target('button'),pointerType:'touch'});
 for(const x of [108,120,132,145,160]){
  s.dispatch('pointermove',{clientX:x,clientY:100,pointerType:'touch'});
  s.dispatch('lostpointercapture',{pointerId:1,pointerType:'touch'});
 }
 assert.equal(f.pans.length,5,
   'each finger movement must pan; never stop after first 8 pixels');
 assert.equal(f.pans.reduce((total,p)=>total+p.delta[0],0),-60);
 s.dispatch('pointerup',{clientX:160,clientY:100});
 assert.equal(s.classList.contains('is-dragging'),false);
});

test('a deliberate tap directly after a swipe is not eaten if no synthetic click fired',()=>{
 const f=setup({existing:true}),s=f.surface;
 s.dispatch('pointerdown',{target:target('button')});
 s.dispatch('pointermove',{clientX:135,clientY:100});
 s.dispatch('pointerup',{clientX:135,clientY:100});
 // Chrome may omit the synthetic click after preventDefault during a drag.
 // The next real pointerdown must disarm the old swipe guard.
 s.dispatch('pointerdown',{target:target('button'),clientX:135,clientY:100});
 s.dispatch('pointerup',{target:target('button'),clientX:135,clientY:100});
 const nextTap=s.dispatch('click',{target:target('button')});
 assert.equal(nextTap.defaultPrevented,false);
 assert.equal(nextTap.immediateStopped,false);
 assert.equal(f.pans.length,1,'the preceding swipe still moved the map');
});

test('long popup text pans the map at both scrolling boundaries',()=>{
 for(const [scrollTop,dy] of [[0,45],[580,-45]]){
  const f=setup({scroll:true}),s=f.surface;
  f.scrollArea.scrollTop=scrollTop;
  s.dispatch('pointerdown',{target:target('description')});
  s.dispatch('pointermove',{target:target('description'),clientY:100+dy});
  assert.equal(f.scrollArea.scrollTop,scrollTop,
   'text cannot scroll beyond its top or bottom edge');
  assert.equal(f.pans.length,1,'at the scroll edge the map must pan');
  assert.deepEqual(f.pans[0].delta,[0,-dy]);
  s.dispatch('pointerup',{clientY:100+dy});
 }
});

test('scrolling long text clamps at limits and never overshoots',()=>{
 const f=setup({scroll:true}),s=f.surface;
 f.scrollArea.scrollTop=20;
 s.dispatch('pointerdown',{target:target('description')});
 s.dispatch('pointermove',{target:target('description'),clientY:165});
 assert.equal(f.scrollArea.scrollTop,0);
 assert.equal(f.pans.length,0,'scroll retains priority until the edge is reached');
 s.dispatch('pointermove',{target:target('description'),clientY:185});
 assert.equal(f.pans.length,1,'next movement pans after reaching the edge');
 s.dispatch('pointerup',{clientY:185});
});
