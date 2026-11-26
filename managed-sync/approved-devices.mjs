import {createPublicKey} from 'node:crypto';
export async function applyApprovedDevices(db,raw,revision){
 if(raw===undefined)return;
 if(typeof revision!=='string'||!/^[a-z0-9-]{8,100}$/.test(revision))throw Error('Missing device approval revision');
 if(await db.prepare('SELECT revision FROM device_approval_batches WHERE revision=?').bind(revision).first())return;
 const devices=JSON.parse(raw);
 if(!Array.isArray(devices)||devices.length>100)throw Error('Invalid approved devices');
 const ids=new Set(),rows=[];
 for(const item of devices){
  if(!item||Object.keys(item).sort().join(',')!=='device,enabled,publicKey'||!/^[a-f0-9]{24}$/.test(item.device)||typeof item.publicKey!=='string'||item.publicKey.length>400||typeof item.enabled!=='boolean'||ids.has(item.device))throw Error('Invalid device approval');
  ids.add(item.device);
  const key=createPublicKey({key:Buffer.from(item.publicKey,'base64url'),format:'der',type:'spki'});
  if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw Error('Invalid approved public key');
  const pem=key.export({format:'pem',type:'spki'});
  const existing=await db.prepare('SELECT public_key FROM devices WHERE id=?').bind(item.device).first();
  if(existing&&existing.public_key!==pem)throw Error('Device key replacement requires a separate migration');
  rows.push({id:item.device,pem,enabled:item.enabled?1:0});
 }
 await db.batch([...rows.map(row=>db.prepare('INSERT INTO devices(id,public_key,enabled) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM device_approval_batches WHERE revision=?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled WHERE devices.public_key=excluded.public_key AND NOT EXISTS(SELECT 1 FROM device_approval_batches WHERE revision=?)').bind(row.id,row.pem,row.enabled,revision,revision)),db.prepare('INSERT OR IGNORE INTO device_approval_batches(revision) VALUES(?)').bind(revision)]);
}
