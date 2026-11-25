import {createPrivateKey,sign} from "node:crypto";
import {createInstallationAuth} from "./installation-auth.mjs";
import {createDeviceAuth} from "./device-auth.mjs";
import {createSnapshotBroker} from "./snapshot-broker.mjs";
import {createHandler} from "./http-handler.mjs";
import {createD1Store} from "./d1-store.mjs";
import "../outbox-core.js";
const handlers=new WeakMap();
export default {async fetch(request,env){
 try{
  let handle=handlers.get(env);
  if(!handle){
   const key=createPrivateKey(env.GITHUB_APP_PRIVATE_KEY);
   if(key.asymmetricKeyType!=="rsa")throw new Error("Invalid signer");
   const signJwt=async claims=>{
    const encode=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
    const message=encode({alg:"RS256",typ:"JWT"})+"."+encode(claims);
    return message+"."+sign("RSA-SHA256",Buffer.from(message),key).toString("base64url");
   };
   const auth=createInstallationAuth({appId:env.GITHUB_APP_ID,installationId:env.GITHUB_INSTALLATION_ID,repositoryId:1439289912,signJwt});
   const broker=createSnapshotBroker({auth,core:globalThis.LivekarteOutboxCore,repository:"CobraChris/meine-livekarte-private-sync"});
   handle=createHandler({deviceAuth:createDeviceAuth({store:createD1Store(env.DB)}),broker,origin:"https://cobrachris.github.io"});
   handlers.set(env,handle);
  }
  return await handle(request);
 }catch{return new Response("Service unavailable",{status:503,headers:{"Cache-Control":"no-store"}});}
}};
