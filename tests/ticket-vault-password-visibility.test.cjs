const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const html=read('index.html'),ui=read('ticket-vault-ui.js'),css=read('style.css');

test('every vault password input has an id and is eligible for a single eye control',()=>{
 const vault=html.slice(html.indexOf('<details id="ticket-vault"'),html.indexOf('<dialog id="vault-preview"'));
 const fields=[...vault.matchAll(/<input[^>]*type="password"[^>]*>/g)].map(x=>x[0]);
 assert.ok(fields.length>=11,'password, passkey, recovery and backup inputs must be covered');
 for(const tag of fields)assert.match(tag,/id="vault-[^"]+"/);
 assert.match(ui,/root\.querySelectorAll\('input\[type="password"\]'\)/);
 assert.match(ui,/input\.closest\('\.vault-password-field'\)/);
 assert.match(ui,/toggle\.setAttribute\('aria-controls',input\.id\)/);
 assert.match(css,/\.vault-password-field>input/);
 assert.match(css,/padding-right:54px!important/);
 assert.match(css,/\.vault-password-eye:focus-visible/);
});

test('eye toggle changes visibility and accessibility state, but never changes the secret',()=>{
 const start=ui.indexOf('  function installPasswordVisibility(){');
 const stop=ui.indexOf('  installPasswordVisibility();',start);
 assert.ok(start>0&&stop>start);
 const segment=ui.slice(start,stop)+'\ninstallPasswordVisibility();\nthis.hideAll=hideVisiblePasswords;';
 assert.doesNotMatch(segment,/fetch\(|localStorage|sessionStorage|clipboard|navigator\.credentials|\.value\s*=/);
 const inputs=Array.from({length:12},(_,i)=>({
   id:'vault-test-'+i,type:'password',value:'super secret '+i,
   parentNode:{insertBefore(){}},closest(){return null}
 }));
 const buttons=[];
 const document={
   createElement(tag){
     const obj={tag,attrs:{},children:[],
       setAttribute(name,value){this.attrs[name]=value},
       append(...elements){this.children.push(...elements)}};
     if(tag==='button')buttons.push(obj);
     return obj;
   }
 };
 const root={querySelectorAll(selector){
   if(selector==='input[type="password"]')return inputs;
   if(selector==='.vault-password-eye')return buttons;
   throw Error('Unexpected selector '+selector);
 }};
 const context={root,document};
 vm.runInNewContext(segment,context);
 assert.equal(buttons.length,inputs.length);
 for(let i=0;i<inputs.length;i++){
   const input=inputs[i],eye=buttons[i];
   assert.equal(input.type,'password');
   assert.equal(eye.attrs['aria-label'],'Passwort anzeigen');
   assert.equal(eye.attrs['aria-pressed'],'false');
   assert.equal(eye.attrs['aria-controls'],input.id);
   assert.equal(eye.type,'button');
   eye.onclick();
   assert.equal(input.type,'text');
   assert.equal(eye.attrs['aria-label'],'Passwort verbergen');
   assert.equal(eye.attrs['aria-pressed'],'true');
   assert.equal(input.value,'super secret '+i);
   eye.onclick();
   assert.equal(input.type,'password');
   assert.equal(eye.attrs['aria-pressed'],'false');
 }
 buttons[0].onclick();
 buttons[5].onclick();
 context.hideAll();
 assert.ok(inputs.every(input=>input.type==='password'),'locking hides any revealed secret');
 assert.ok(buttons.every(button=>button.attrs['aria-pressed']==='false'));
 assert.match(ui,/function lock\(\)\{\s*hideVisiblePasswords\(\)/);
});

test('eye toggle does not replace passkey button or the backup/password logic',()=>{
 for(const id of ['vault-biometric-enable','vault-biometric-password',
   'vault-change-old','vault-rotate-password','vault-unlock','vault-forgot-new'])
    assert.ok(html.includes('id="'+id+'"'));
 assert.match(ui,/await vault\.enableBiometric\(password\)/);
 assert.match(ui,/await vault\.restore\(/);
 assert.match(ui,/await vault\.changePassword\(old,fresh\)/);
 assert.match(ui,/installPasswordVisibility\(\);/);
});
