const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const ui=read('ticket-library-ui.js'),html=read('index.html'),css=read('style.css');

test('file selection and successful save have separate, adjacent mobile feedback',()=>{
  const section=html.slice(html.indexOf('id="ticket-file-area"'),html.indexOf('id="ticket-files"'));
  for(const id of ['ticket-file','ticket-picked-note','ticket-add','ticket-save-confirmation',
    'ticket-saved-label','ticket-saved-open'])
    assert.ok(section.includes('id="'+id+'"'),id);
  assert.ok(section.indexOf('id="ticket-picked-note"')>section.indexOf('id="ticket-file"'));
  assert.ok(section.indexOf('id="ticket-save-confirmation"')>section.indexOf('id="ticket-add"'));
  assert.match(section,/id="ticket-picked-note"[^>]*aria-live="polite" hidden/);
  assert.match(section,/id="ticket-save-confirmation"[^>]*aria-live="polite" hidden/);
  assert.match(css,/\.vault-file\.is-new-ticket/);
  assert.match(css,/\.ticket-picked-note\.is-error/);
  assert.match(css,/\.ticket-save-confirmation\[hidden\]/);
  assert.doesNotMatch(ui,/indexedDB\.deleteDatabase|localStorage\.clear|sessionStorage\.clear/);
});

test('saved document is highlighted, focused, scrolled into view and can be opened directly',()=>{
  const begin=ui.indexOf('  function revealSavedTicket(item){');
  const end=ui.indexOf('  async function renderShared(){',begin);
  assert.ok(begin>0&&end>begin);
  let scrolled=null,focused=false,viewed=null;
  const marker={};
  const header={prepend(child){this.child=child;}};
  const classNames=[];
  const card={dataset:{ticketId:'test-123'},classList:{add:name=>classNames.push(name)},
    querySelector:selector=>selector==='.vault-file-heading'?header:null,
    scrollIntoView(options){scrolled=options;},
    focus(options){focused=options.preventScroll;}};
  const confirmation={hidden:true};
  const savedLabel={textContent:''};
  const openBtn={onclick:null};
  const els={'ticket-save-confirmation':confirmation,'ticket-saved-label':savedLabel,
    'ticket-saved-open':openBtn,'ticket-files':{children:[card]}};
  const context={
    $:id=>els[id],
    node:(type,text,cls)=>({type,text,cls}),
    busy:(_,job)=>job(),
    viewTicket:id=>{viewed=id;}
  };
  vm.runInNewContext(ui.slice(begin,end)+'\nthis.revealSavedTicket=revealSavedTicket;',context);
  context.revealSavedTicket({id:'test-123',title:'QR nach Kyoto'});
  assert.equal(confirmation.hidden,false);
  assert.match(savedLabel.textContent,/Ticket gespeichert: QR nach Kyoto/);
  assert.ok(classNames.includes('is-new-ticket'));
  assert.equal(header.child.text,'✓ Gerade gespeichert');
  assert.equal(scrolled.block,'center');
  assert.equal(focused,true);
  openBtn.onclick();
  assert.equal(viewed,'test-123');
});

test('file selection explains not yet saved and clears stale success when choosing next image',()=>{
  const start=ui.indexOf("  $('ticket-file').addEventListener('change',");
  const end=ui.indexOf("  $('ticket-trip-current').onclick=",start);
  assert.ok(start>0&&end>start);
  const note={hidden:true,textContent:'',classList:{remove(){}}};
  const picker={files:[{name:'qr-screen.png'}],addEventListener(_,fn){this.changed=fn}};
  const inputs={
    'ticket-file':picker,'ticket-picked-note':note,
    'ticket-title':{value:''},'ticket-save-confirmation':{hidden:false}
  };
  vm.runInNewContext(ui.slice(start,end),{$:id=>inputs[id]});
  picker.changed();
  assert.match(note.textContent,/Ausgewählt: qr-screen\.png/);
  assert.match(note.textContent,/noch nicht gespeichert/);
  assert.equal(note.hidden,false);
  assert.equal(inputs['ticket-save-confirmation'].hidden,true);
  assert.equal(inputs['ticket-title'].value,'qr-screen.png');
  picker.files=[];
  picker.changed();
  assert.equal(note.hidden,true);
});

test('successful save resets picker only after IndexedDB save and reveals the saved card',async()=>{
  const start=ui.indexOf("  $('ticket-add').onclick=");
  const end=ui.indexOf("  $('ticket-backup').onclick=",start);
  assert.ok(start>0&&end>start);
  const selected={name:'screen.png'};
  const picker={files:[selected],value:'screen.png'};
  const note={textContent:'',hidden:true,classList:{add(){},remove(){}}};
  const els={
    'ticket-file':picker,'ticket-picked-note':note,'ticket-title':{value:'Tokyo ticket'},
    'ticket-trip':{value:'Japan'},'ticket-save-confirmation':{hidden:false},
    'ticket-add':{onclick:null}
  };
  const operations=[];
  const context={
    $:id=>els[id],busy:(_,action)=>action(),
    shelf:{async add(file,info){
      operations.push('add');assert.equal(picker.value,'screen.png');
      assert.equal(info.title,'Tokyo ticket');assert.equal(file,selected);
      return {id:'new-uuid',title:'Tokyo ticket'};
    }},
    async render(){operations.push('render');},
    revealSavedTicket(item){operations.push('reveal');assert.equal(item.id,'new-uuid');},
    status(message){operations.push(message);}
  };
  vm.runInNewContext(ui.slice(start,end),context);
  await els['ticket-add'].onclick();
  assert.equal(picker.value,'');
  assert.equal(els['ticket-title'].value,'');
  assert.equal(note.hidden,true);
  assert.deepEqual(operations.slice(0,3),['add','render','reveal']);
  assert.ok(operations[3].includes('Gespeicherte Tickets'));
});

test('save failure leaves the selected file available to retry and displays inline error',async()=>{
  const start=ui.indexOf("  $('ticket-add').onclick=");
  const end=ui.indexOf("  $('ticket-backup').onclick=",start);
  const picker={files:[{name:'wrong.pdf'}],value:'wrong.pdf'};
  const note={textContent:'',hidden:true,classList:{add(name){this.error=name},remove(){}}};
  const els={
    'ticket-file':picker,'ticket-picked-note':note,'ticket-title':{value:'Ticket'},
    'ticket-trip':{value:''},'ticket-save-confirmation':{hidden:false},
    'ticket-add':{onclick:null}
  };
  vm.runInNewContext(ui.slice(start,end),{
    $:id=>els[id],busy:(_,action)=>action(),
    shelf:{async add(){throw Error('Dateiinhalt ist ungültig');}},
    render(){throw Error('render must not be called')},
    revealSavedTicket(){throw Error('no saved ticket')},
    status(){}
  });
  await assert.rejects(()=>els['ticket-add'].onclick(),/ungültig/);
  assert.equal(picker.value,'wrong.pdf');
  assert.match(note.textContent,/Nicht gespeichert: Dateiinhalt ist ungültig/);
  assert.equal(note.classList.error,'is-error');
  assert.equal(els['ticket-save-confirmation'].hidden,true);
});

test('Android shared-ticket confirmation uses same highlight as manual saving',()=>{
  assert.match(ui,/await SHARE\.remove\(item\.id\);[\s\S]*?await render\(\);await renderShared\(\);[\s\S]*?revealSavedTicket\(saved\)/);
  assert.match(ui,/revealSavedTicket\(item\)/);
  assert.match(ui,/card\.dataset\.ticketId=item\.id/);
  assert.match(ui,/card\.scrollIntoView\(\{behavior:'smooth',block:'center'\}\)/);
});
