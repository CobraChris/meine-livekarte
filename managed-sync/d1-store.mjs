export function createD1Store(db){
 return {
  async getDevice(id){const r=await db.prepare("SELECT public_key, enabled FROM devices WHERE id=?").bind(id).first();return r?{publicKey:r.public_key,enabled:r.enabled===1}:null;},
  async saveChallenge(hash,{device,expires}){
   await db.batch([db.prepare("DELETE FROM challenges WHERE expires<=?").bind(Date.now()),db.prepare("INSERT INTO challenges(hash,device,expires) SELECT ?,?,? WHERE (SELECT count(*) FROM challenges WHERE device=?)<20").bind(hash,device,expires,device)]).then(results=>{if(results[1].meta.changes!==1)throw new Error("Challenge limit");});
  },
  async consumeChallenge(hash,device,now){return !!(await db.prepare("DELETE FROM challenges WHERE hash=? AND device=? AND expires>? AND EXISTS (SELECT 1 FROM devices WHERE id=? AND enabled=1) RETURNING hash").bind(hash,device,now,device).first());}
 };
}
