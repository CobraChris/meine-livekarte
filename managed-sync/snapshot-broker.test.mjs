import {test} from "node:test";
import assert from "node:assert/strict";
import core from "../outbox-core.js";
import {createSnapshotBroker} from "./snapshot-broker.mjs";
const repo="CobraChris/meine-livekarte-private-sync",device="a".repeat(24),other="b".repeat(24);
const session={authenticated:true,device},input={v:1,device,tickets:[]};
const auth={getToken:async()=>"fake",invalidate:()=>{}};
const resp=(status,body)=>new Response(body===undefined?null:JSON.stringify(body),{status});
test("rejects arbitrary repository, unauthenticated or mismatched devices before I/O",async()=>{
 const fetchImpl=()=>assert.fail("unexpected network");
 assert.throws(()=>createSnapshotBroker({auth,core,repository:"CobraChris/meine-livekarte",fetchImpl}),/not allowed/);
 const broker=createSnapshotBroker({auth,core,repository:repo,fetchImpl});
 await assert.rejects(broker.publish({device},input),/Unauthorized/);
 await assert.rejects(broker.publish(session,{...input,device:other}),/mismatch/);
});
test("refuses public repository before writing",async()=>{
 let calls=0;
 const broker=createSnapshotBroker({auth,core,repository:repo,fetchImpl:async()=>{calls++;return resp(200,{private:false,full_name:repo});}});
 await assert.rejects(broker.publish(session,input),/not private/);assert.equal(calls,1);
});
test("refreshes on 401, retries conflict, writes only scoped snapshot",async()=>{
 let mint=0,invalid=0,calls=0,puts=0;
 const auth={getToken:async()=>String(mint),invalidate:()=>{invalid++;mint++;}};
 const broker=createSnapshotBroker({auth,core,repository:repo,fetchImpl:async(url,opts)=>{
  calls++;
  assert.ok(url==="https://api.github.com/repos/"+repo||url==="https://api.github.com/repos/"+repo+"/contents/livekarte/status/"+device+".json");
  assert.equal(opts.redirect,"manual");
  if(calls===1)return resp(401);
  assert.equal(opts.headers.Authorization,"Bearer 1");
  if(!url.includes("/contents/"))return resp(200,{private:true,full_name:repo});
  if(opts.method==="GET")return resp(404);
  assert.deepEqual(JSON.parse(Buffer.from(JSON.parse(opts.body).content,"base64").toString()),input);
  return resp(++puts===1?409:201);
 }});
 assert.deepEqual(await broker.publish(session,input),{ok:true,count:0});
 assert.equal(invalid,1);assert.equal(puts,2);
});
test("refuses corrupt remote data without writing",async()=>{
 const broker=createSnapshotBroker({auth,core,repository:repo,fetchImpl:async(url,opts)=>{
  assert.equal(opts.method,"GET");
  return url.includes("/contents/")?resp(200,{sha:"s",content:Buffer.from("invalid").toString("base64")}):resp(200,{private:true,full_name:repo});
 }});
 await assert.rejects(broker.publish(session,input));
});
