// Browser-side signing helper. Private key is nonextractable; persist the
// CryptoKey pair in IndexedDB, not localStorage. Enrollment is operator-approved.
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
export async function generateDeviceKey(){
 const keys=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign","verify"]);
 const publicKey=await crypto.subtle.exportKey("spki",keys.publicKey);
 return {privateKey:keys.privateKey,publicKey:b64(publicKey)};
}
export async function signedSnapshot({endpoint,device,privateKey,snapshot,fetchImpl=fetch}){
 const url=new URL(endpoint);
 if(url.protocol!=="https:"||url.username||url.password||url.search||url.hash)throw new Error("Invalid sync endpoint");
 if(!/^[a-f0-9]{24}$/.test(device)||snapshot?.device!==device)throw new Error("Device mismatch");
 const base=url.href.replace(/\/$/,"");
 const body=JSON.stringify(snapshot);
 if(enc.encode(body).length>75000)throw new Error("Snapshot too large");
 const challenge=await fetchImpl(base+"/challenge",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({device}),credentials:"omit",redirect:"error",cache:"no-store"});
 if(!challenge.ok)throw new Error("Device authorization required");
 const {nonce}=await challenge.json();
 if(typeof nonce!=="string"||!/^[A-Za-z0-9_-]{43}$/.test(nonce))throw new Error("Invalid challenge");
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(body))),x=>x.toString(16).padStart(2,"0")).join("");
 const message="livekarte-sync-v1\nPOST\n/snapshot\n"+device+"\n"+nonce+"\n"+digest;
 const signature=b64(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},privateKey,enc.encode(message)));
 const result=await fetchImpl(base+"/snapshot",{method:"POST",headers:{"Content-Type":"application/json","X-Device":device,"X-Nonce":nonce,"X-Signature":signature},body,credentials:"omit",redirect:"error",cache:"no-store"});
 if(!result.ok)throw new Error("Synchronization failed ("+result.status+")");
 return result.json();
}
