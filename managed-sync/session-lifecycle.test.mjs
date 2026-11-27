import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDeviceAuth} from './device-auth.mjs';
import {generateDeviceKey,signedSnapshot} from './browser-auth.mjs';
import {createPublicKey,createHash} from 'node:crypto';
test('stored device identity survives service restart; expired and replayed challenges fail closed',async()=>{
 const device='a'.repeat(24),keys=await generateDeviceKey();let now=1000;
 const row={enabled:true,publicKey:createPublicKey({key:Buffer.from(keys.publicKey,'base64url'),format:'der',type:'spki'}).export({type:'spki',format:'pem'})};
 const challenges=new Map();const store={getDevice:async()=>row,saveChallenge:async(k,v)=>challenges.set(k,v),consumeChallenge:async(k,d,t)=>{const c=challenges.get(k);if(!c||c.device!==d||c.expires<=t||!row.enabled)return false;challenges.delete(k);return true;}};
 let auth=createDeviceAuth({store,now:()=>now});let signed;
 await signedSnapshot({endpoint:'https://staging.invalid',device,privateKey:keys.privateKey,snapshot:{v:1,device,tickets:[]},fetchImpl:async(url,options)=>{
  if(url.endsWith('/challenge'))return Response.json({nonce:await auth.challenge(device)});
  signed={device,nonce:options.headers['X-Nonce'],signature:options.headers['X-Signature'],bodyHash:createHash('sha256').update(options.body).digest('hex')};return Response.json({ok:true});
 }});
 auth=createDeviceAuth({store,now:()=>now});
 assert.equal((await auth.authenticate(signed)).device,device);
 await assert.rejects(auth.authenticate(signed),/used/);
 now+=120001;
 // Restore the exact, valid signature against a durable unused challenge.
 challenges.set(createHash('sha256').update(signed.nonce).digest('hex'),{device,expires:now-1});
 await assert.rejects(auth.authenticate(signed),/Expired/);
 row.enabled=false;await assert.rejects(auth.challenge(device),/Unauthorized/);
 assert.equal(keys.privateKey.extractable,false);
});
