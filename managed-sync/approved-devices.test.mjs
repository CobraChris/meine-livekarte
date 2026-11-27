import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {applyApprovedDevices} from './approved-devices.mjs';
test('deployment approvals enroll and revoke, but never replace a paired key or erase other devices',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE devices(id TEXT PRIMARY KEY,public_key TEXT,enabled INTEGER);CREATE TABLE device_approval_batches(revision TEXT PRIMARY KEY)');
 const db={prepare(s){return{bind(...a){return{async first(){return sql.prepare(s).get(...a);},run(){return sql.prepare(s).run(...a);}};}};},async batch(rows){return rows.map(r=>r.run());}};
 const pub=()=>generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'der',type:'spki'}).toString('base64url');
 const item={device:'a'.repeat(24),publicKey:pub(),enabled:true};
 try{
  await applyApprovedDevices(db,JSON.stringify([item]),'revision-one');assert.equal(sql.prepare('SELECT enabled FROM devices').get().enabled,1);
  await applyApprovedDevices(db,JSON.stringify([{...item,enabled:false}]),'revision-two');assert.equal(sql.prepare('SELECT enabled FROM devices').get().enabled,0);
  await applyApprovedDevices(db,JSON.stringify([item]),'revision-one');assert.equal(sql.prepare('SELECT enabled FROM devices').get().enabled,0);
  await assert.rejects(applyApprovedDevices(db,JSON.stringify([{...item,publicKey:pub()}]),'revision-three'),/replacement/);
  await assert.rejects(applyApprovedDevices(db,JSON.stringify([item,item]),'revision-four'),/approval/);
  await applyApprovedDevices(db,'[]','revision-five');assert.equal(sql.prepare('SELECT count(*) AS n FROM devices').get().n,1);
 }finally{sql.close();}
});
