import {randomBytes, createPublicKey, createHash} from "node:crypto";
// The store must be durable and atomically consume challenges, even across instances.
// Enrollment is privileged and must never be exposed as an unauthenticated route.
export function createDeviceAuth({store,now=Date.now}) {
  const valid=id=>typeof id==="string"&&/^[a-f0-9]{24}$/.test(id);
  const hash=value=>createHash("sha256").update(value).digest("hex");
  return {
    async challenge(device){
      if(!valid(device)||!(await store.getDevice(device))?.enabled)throw new Error("Unauthorized device");
      const nonce=randomBytes(32).toString("base64url");
      await store.saveChallenge(hash(nonce),{device,expires:now()+120000});
      return nonce;
    },
    async authenticate({device,nonce,signature,bodyHash}){
      if(!valid(device)||typeof nonce!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(nonce)||typeof signature!=="string"||!/^[A-Za-z0-9_-]{86}$/.test(signature)||typeof bodyHash!=="string"||!/^[a-f0-9]{64}$/.test(bodyHash))throw new Error("Unauthorized device");
      const record=await store.getDevice(device);
      if(!record?.enabled)throw new Error("Unauthorized device");
      const key=createPublicKey(record.publicKey);
      if(key.asymmetricKeyType!=="ec"||key.asymmetricKeyDetails?.namedCurve!=="prime256v1")throw new Error("Invalid device key");
      const message=Buffer.from("livekarte-sync-v1\nPOST\n/snapshot\n"+device+"\n"+nonce+"\n"+bodyHash);
      const publicKey=await crypto.subtle.importKey('spki',key.export({type:'spki',format:'der'}),{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
      if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,Buffer.from(signature,'base64url'),message))throw new Error("Unauthorized device");
      const challenge=await store.consumeChallenge(hash(nonce),device,now());
      if(!challenge)throw new Error("Expired or used challenge");
      return {authenticated:true,device};
    }
  };
}
