const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const TourUI=require('../tour-ui.js');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

function fixture(){
  const all=new Map(),events=[];
  function el(tag){
    const result={
      tag,children:[],attributes:{},textContent:'',value:'',type:'',disabled:false,
      hidden:false,open:false,title:'',className:'',scrollOptions:null,
      append(...nodes){this.children.push(...nodes);},
      replaceChildren(...nodes){this.children=nodes;},
      setAttribute(k,v){this.attributes[k]=v;},
      scrollIntoView(options){this.scrollOptions=options;}
    };
    return result;
  }
  const document={createElement:el,getElementById(id){
    if(!all.has(id))all.set(id,el(id));
    return all.get(id);
  }};
  const $=id=>document.getElementById(id);
  let selectedCount=2;
  const handlers={
    selectMapMode:()=>events.push(['mapMode']),
    selectMapPick:()=>events.push(['mapPick']),
    finishMapPick:()=>events.push(['mapDone']),
    selectedCount:()=>selectedCount,
    setSelection:places=>{selectedCount=places.length;events.push(['selection',places.map(p=>p.name)]);},
    removeStop:p=>events.push(['remove',p.name]),
    calculate:optimized=>events.push(['calculate',optimized]),
    dayStopMinutes:p=>p.name==='First'?60:45,
    setVisitMinutes:(p,n)=>events.push(['visit',p.name,n]),
    setOpening:(p,t)=>events.push(['opening',p.name,t]),
    setClosing:(p,t)=>events.push(['closing',p.name,t]),
    setStart:t=>events.push(['start',t]),
    setBuffer:t=>events.push(['buffer',t]),
    setLunch:t=>events.push(['lunch',t]),
    refreshDayPlan:()=>events.push(['refresh'])
  };
  const dayPlanCore={visitMinutes:duration=>duration==='60 Min.'?60:null};
  const ui=TourUI.create({document,dayPlanCore,handlers});
  const first={name:'First',duration:'60 Min.'},second={name:'Second'};
  return {$,ui,events,first,second,handlers};
}
test('tour controls are defined once and keep map pick state and accessible count',()=>{
 const f=fixture();f.ui.bind();
 f.ui.renderMapControls({picking:true,count:2});
 assert.equal(f.$('tour-map-mode').attributes['aria-pressed'],'true');
 assert.equal(f.$('tour-map-counter').textContent,'2/6 Ziele · Kartenpins antippen');
 assert.equal(f.$('tour-map-counter').hidden,false);
 assert.equal(f.$('tour-map-done').textContent,'Fertig · 2');
 assert.equal(f.$('tour-pick-on-map').attributes['aria-pressed'],'true');
 f.$('tour-map-mode').onclick();f.$('tour-pick-on-map').onclick();
 f.$('tour-map-done').onclick();
 assert.deepEqual(f.events.slice(0,3),[['mapMode'],['mapPick'],['mapDone']]);
 assert.equal(f.$('tour-builder').open,true);
 assert.equal(f.$('tour-builder').scrollOptions.block,'start');
 assert.match(f.$('tour-builder-status').textContent,/Jetzt Route optimieren/);
 f.ui.renderMapControls({picking:false,count:6});
 assert.equal(f.$('tour-map-counter').hidden,true);
 assert.equal(f.$('tour-map-done').hidden,true);
 assert.match(f.$('tour-map-counter').textContent,/Maximum erreicht/);
 assert.equal(f.$('tour-pick-on-map').attributes['aria-pressed'],'false');
});
test('tour list offers reorder/remove, preserves stop objects and never modifies its inputs',()=>{
 const f=fixture();f.ui.bind();
 const input=[f.first,f.second];
 f.ui.renderTourBuilder({selected:input,calculating:false,hasRoute:false});
 assert.equal(f.$('tour-count').textContent,'2/6 Ziele');
 assert.equal(f.$('tour-stops').children.length,2);
 assert.equal(f.$('tour-calculate').disabled,false);
 const [one,two]=f.$('tour-stops').children;
 assert.equal(one.children[0].textContent,'1');
 assert.equal(one.children[1].textContent,'First');
 assert.equal(one.children[1].children[0].textContent,'Besuch: 60 Min.');
 const firstControls=one.children[2].children;
 assert.equal(firstControls[0].disabled,true);
 assert.equal(firstControls[1].disabled,false);
 firstControls[1].onclick();
 assert.deepEqual(f.events.at(-1),['selection',['Second','First']]);
 assert.deepEqual(input,[f.first,f.second]);
 assert.equal(f.$('tour-builder').open,true);
 assert.match(f.$('tour-builder-status').textContent,/Reihenfolge angepasst/);
 const secondControls=two.children[2].children;
 assert.equal(secondControls[1].disabled,true);
 secondControls[2].onclick();
 assert.deepEqual(f.events.at(-1),['remove','Second']);
 f.ui.renderTourBuilder({selected:input,calculating:true,hasRoute:true});
 assert.equal(f.$('tour-optimize').disabled,true);
 assert.equal(f.$('tour-calculate').disabled,true);
});
test('empty tour list disables calculation but never removes saved place data',()=>{
 const f=fixture();f.ui.bind();
 f.ui.renderTourBuilder({selected:[],calculating:false,hasRoute:false});
 assert.equal(f.$('tour-stops').children[0].textContent,'Noch keine Ziele ausgewählt.');
 assert.equal(f.$('tour-calculate').disabled,true);
 assert.equal(f.$('tour-clear').disabled,true);
 assert.match(f.$('tour-builder-status').textContent,/Wähle zunächst zwei bis sechs/);
 f.$('tour-clear').onclick();
 assert.deepEqual(f.events.at(-1),['selection',[]]);
 assert.match(f.$('tour-builder-status').textContent,/Deine gespeicherten Orte bleiben erhalten/);
 f.$('tour-optimize').onclick();f.$('tour-calculate').onclick();
 assert.deepEqual(f.events.slice(-2),[['calculate',true],['calculate',false]]);
});
test('day stop setting fields validate and persist only through supplied callbacks',()=>{
 const f=fixture();f.ui.bind();
 f.ui.renderDayControls({
   prefs:{start:'10:30',buffer:10,lunch:45},
   stops:[f.first,f.second],
   stopPrefs:p=>p===f.first?{open:'09:00',close:'17:00'}:{},
   visitMinutes:p=>p===f.first?60:45
 });
 assert.equal(f.$('day-start').value,'10:30');
 assert.equal(f.$('day-buffer').value,'10');
 assert.equal(f.$('day-lunch').value,'45');
 const first=f.$('day-stop-settings').children[0];
 assert.equal(first.children[0].textContent,'1. First');
 const inputs=first.children[2].children.map(label=>label.children[0]);
 assert.deepEqual(inputs.map(x=>x.type),['number','time','time']);
 assert.equal(inputs[0].value,'60');
 assert.equal(inputs[0].min,'5');
 assert.equal(inputs[1].value,'09:00');
 inputs[0].value='75';inputs[0].onchange();
 inputs[1].value='10:00';inputs[1].onchange();
 inputs[2].value='18:00';inputs[2].onchange();
 assert.deepEqual(f.events.slice(-3),[
   ['visit','First','75'],['opening','First','10:00'],['closing','First','18:00']]);
 const second=f.$('day-stop-settings').children[1];
 assert.match(second.children[1].textContent,/45 Min. als Schätzung/);
 f.$('day-start').value='09:30';f.$('day-start').onchange();
 f.$('day-buffer').value='15';f.$('day-buffer').onchange();
 f.$('day-lunch').value='30';f.$('day-lunch').onchange();
 f.$('day-plan-refresh').onclick();
 assert.deepEqual(f.events.slice(-4),[
   ['start','09:30'],['buffer','15'],['lunch','30'],['refresh']]);
});
test('new UI is wired before app, included in offline shell and has no transport/persistence',()=>{
 const ui=read('tour-ui.js'),app=read('app.js'),html=read('index.html'),
   sw=read('sw.js'),workflow=read('.github/workflows/pages.yml'),
   stamp=read('scripts/stamp_pwa_version.py');
 assert.match(app,/const tourUI=window\.LivekarteTourUI\.create\(/);
 assert.match(app,/tourUI\.bind\(\)/);
 assert.match(app,/tourUI\.renderTourBuilder\(/);
 assert.match(app,/tourUI\.renderDayControls\(/);
 assert.match(app,/tourUI\.renderMapControls\(/);
 assert.ok(html.indexOf('src="tour-ui.js"')<html.indexOf('src="app.js"'));
 assert.match(sw,/'tour-ui\.js'/);
 assert.match(workflow,/node --check tour-ui\.js/);
 assert.match(workflow,/cp multi-day-core\.js day-context-core\.js day-selector-ui\.js place-ui\.js tour-ui\.js/);
 assert.match(stamp,/\("src", "tour-ui\.js"\)/);
 assert.doesNotMatch(ui,/\blocalStorage\b|sessionStorage|\bfetch\(|\bgeolocation\b|navigator\.|getCurrentPosition|watchPosition/);
 assert.doesNotMatch(ui,/\bJSON\.stringify\b|indexedDB|setInterval/);
});
