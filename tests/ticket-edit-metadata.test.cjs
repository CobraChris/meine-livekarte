const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ui=read('ticket-library-ui.js'),css=read('style.css'),
  lib=read('ticket-library.js');

test('ticket cards expose accessible inline edit, cancel and save without a new attachment upload',()=>{
  assert.match(ui,/const edit=node\('button','✎ Bearbeiten'/);
  assert.match(ui,/const editForm=node\('form',undefined,'ticket-card-editor'\)/);
  assert.match(ui,/editTitle\.value=item\.title/);
  assert.match(ui,/editTrip\.value=item\.trip\|\|''/);
  assert.match(ui,/editForm\.addEventListener\('submit'/);
  assert.match(ui,/event\.preventDefault\(\)/);
  assert.match(ui,/shelf\.updateDetails\(item\.id/);
  assert.match(ui,/edit\.setAttribute\('aria-expanded'/);
  assert.match(ui,/actions\.append\(pin,show,edit,save,remove\)/);
  assert.match(css,/\.ticket-card-editor\[hidden\]/);
  assert.doesNotMatch(ui,/fetch\(|XMLHttpRequest|WebSocket|indexedDB\.deleteDatabase/);
  assert.doesNotMatch(lib,/indexedDB\.deleteDatabase/);
});

test('inline edit updates saved metadata, adjusts search filter and preserves existing card',async()=>{
  const start=ui.indexOf("      const edit=node('button','✎ Bearbeiten'");
  const end=ui.indexOf("      const save=node('button','↓ Original');",start);
  assert.ok(start>0&&end>start);
  const nodes=[];
  const node=(type,text,cls)=>{
    const el={type,text,cls,hidden:false,value:'',
      children:[],attrs:{},tabIndex:0,handlers:{},
      append(...x){this.children.push(...x)},
      setAttribute(k,v){this.attrs[k]=v},
      addEventListener(name,cb){this.handlers[name]=cb},
      focus(){this.focused=true}};
    nodes.push(el);return el;
  };
  const old={id:'ticket-42',title:'Screenshot_400.png',trip:'Japan'};
  const listElement={dataset:{ticketId:'ticket-42'},classList:{add(k){this.added=k}},
    scrollIntoView(o){this.scrolled=o},focus(o){this.focused=o.preventScroll}};
  const search={value:'Screenshot'};
  let update=null,renders=0,lastJob;
  const context={node,item:old,
    $:key=>key==='ticket-search'?search:{children:[listElement]},
    busy:(_,job)=>{lastJob=job();return lastJob;},
    shelf:{async updateDetails(id,v){
      update={id,values:v};
      return {id,title:v.title,trip:v.trip,name:'screen.png',pinned:true};
    }},
    API:{filterTickets(list,term){
      return list.filter(x=>x.title.includes(term));
    }},
    async render(){renders++;},
    status(msg){context.message=msg}
  };
  vm.runInNewContext(ui.slice(start,end)+
    '\nthis.editButton=edit;this.editForm=editForm;this.editTitle=editTitle;this.editTrip=editTrip;this.cancelButton=cancel;',context);
  assert.equal(context.editForm.hidden,true);
  context.editButton.onclick();
  assert.equal(context.editForm.hidden,false);
  assert.equal(context.editButton.attrs['aria-expanded'],'true');
  context.editTitle.value='Hida 8 · Takayama → Nagoya';
  context.editTrip.value='Japan 2026';
  context.editForm.handlers.submit({preventDefault(){this.prevented=true;}});
  await lastJob;
  assert.equal(update.id,old.id);
  assert.equal(update.values.title,'Hida 8 · Takayama → Nagoya');
  assert.equal(update.values.trip,'Japan 2026');
  assert.equal(search.value,'','renamed ticket must not vanish behind an old search filter');
  assert.equal(renders,1);
  assert.equal(listElement.classList.added,'is-edited-ticket');
  assert.equal(listElement.scrolled.block,'nearest');
  assert.equal(listElement.focused,true);
  assert.match(context.message,/Originaldatei.*Pin-Markierung.*erhalten/);
  assert.match(ui,/const current=\[\.\.\.\$\('ticket-files'\)\.children\]/);
});

test('cancel closes form without saving edited fields',()=>{
  const start=ui.indexOf("      const edit=node('button','✎ Bearbeiten'");
  const end=ui.indexOf("      const save=node('button','↓ Original');",start);
  const node=(type,text,cls)=>({type,text,cls,hidden:false,value:'',
    children:[],attrs:{},append(...x){this.children.push(...x)},
    setAttribute(k,v){this.attrs[k]=v},
    addEventListener(name,cb){this.handler=cb},
    focus(){this.focused=true}});
  let calls=0;
  const context={node,item:{id:'test',title:'Originaltitel',trip:'Kyoto'},
    $:()=>({value:'',children:[]}),
    busy:()=>{calls++;},
    shelf:{updateDetails(){calls++}},
    API:{filterTickets:()=>[]},render(){},status(){}};
  vm.runInNewContext(ui.slice(start,end)+
    '\nthis.editButton=edit;this.editForm=editForm;this.editTitle=editTitle;this.editTrip=editTrip;this.cancelButton=cancel;',context);
  context.editButton.onclick();
  context.editTitle.value='Unwanted change';
  context.editTrip.value='No longer Kyoto';
  context.cancelButton.onclick();
  assert.equal(context.editForm.hidden,true);
  assert.equal(context.editTitle.value,'Originaltitel');
  assert.equal(context.editTrip.value,'Kyoto');
  assert.equal(context.editButton.attrs['aria-expanded'],'false');
  assert.equal(calls,0);
});
