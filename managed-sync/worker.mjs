import {createPrivateKey} from "node:crypto";
import {createInstallationAuth} from "./installation-auth.mjs";
import {createDeviceAuth} from "./device-auth.mjs";
import {createSnapshotBroker} from "./snapshot-broker.mjs";
import {createHandler} from "./http-handler.mjs";
import {createD1Store} from "./d1-store.mjs";
import core from "../outbox-core.js";
const handlers=new WeakMap();
export default {async fetch(request,env){
 try{
  let handle=handlers.get(env);
  if(!handle){
   const key=createPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
   if(key.asymmetricKeyType!=="rsa")throw new Error("Invalid signer");
   const signer=await crypto.subtle.importKey('pkcs8',key.export({type:'pkcs8',format:'der'}),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
   const signJwt=async claims=>{
    const encode=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
    const message=encode({alg:"RS256",typ:"JWT"})+"."+encode(claims);
    return message+"."+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',signer,Buffer.from(message))).toString("base64url");
   };
   const auth=createInstallationAuth({appId:env.GITHUB_APP_ID,installationId:env.GITHUB_INSTALLATION_ID,repositoryId:1439289912,signJwt});
   const broker=createSnapshotBroker({auth,core,repository:"CobraChris/meine-livekarte-private-sync"});
   handle=createHandler({deviceAuth:createDeviceAuth({store:createD1Store(env.DB)}),broker,origin:env.ALLOWED_ORIGIN||"https://cobrachris.github.io"});
   handlers.set(env,handle);
  }
  return await handle(request);
 }catch{return new Response("Service unavailable",{status:503,headers:{"Cache-Control":"no-store"}});}
}};
