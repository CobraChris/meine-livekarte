import {test} from "node:test";
import assert from "node:assert/strict";
import {createInstallationAuth} from "./installation-auth.mjs";
test("scopes tokens to one repository, caches and refreshes automatically",async()=>{
 let time=1700000000000,calls=0;
 const auth=createInstallationAuth({appId:1,installationId:2,repositoryId:3,now:()=>time,signJwt:async claims=>{assert.equal(claims.iss,"1");assert.ok(claims.exp-claims.iat<=600);return "mock-jwt";},fetchImpl:async(url,options)=>{
  assert.equal(url,"https://api.github.com/app/installations/2/access_tokens");
  assert.deepEqual(JSON.parse(options.body),{repository_ids:[3],permissions:{contents:"write"}});
  calls++;return {ok:true,json:async()=>({token:"mock-"+calls,expires_at:new Date(time+3600000).toISOString()})};
 }});
 assert.deepEqual(await Promise.all([auth.getToken(),auth.getToken()]),["mock-1","mock-1"]);
 assert.equal(calls,1);time+=3550000;
 assert.equal(await auth.getToken(),"mock-2");auth.invalidate("mock-2");assert.equal(await auth.getToken(),"mock-3");
});
test("does not cache failed authentication",async()=>{
 let calls=0;
 const auth=createInstallationAuth({appId:1,installationId:2,repositoryId:3,signJwt:async()=> "mock",fetchImpl:async()=>{calls++;return {ok:false,status:403};}});
 await assert.rejects(auth.getToken(),/403/);await assert.rejects(auth.getToken(),/403/);assert.equal(calls,2);
});
test("rejects malformed configuration",()=>assert.throws(()=>createInstallationAuth({appId:1,installationId:"../",repositoryId:3,signJwt:()=>""}),/configuration/));
