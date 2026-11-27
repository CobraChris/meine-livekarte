// Deployment-independent broker. The hosting adapter MUST authenticate a
// persistent, revocable device session and supply its device ID. Never trust
// a device ID or repository path supplied by the HTTP caller.
export function createSnapshotBroker({auth,core,repository,fetchImpl=fetch}) {
  if(repository!=="CobraChris/meine-livekarte-private-sync")throw new Error("Repository not allowed");
  if(typeof auth?.getToken!=="function"||typeof core?.normalizeSnapshot!=="function")throw new Error("Missing dependency");
  const root="https://api.github.com/repos/"+repository;
  async function request(url,method="GET",body){
    for(let attempt=0;attempt<2;attempt++){
      const token=await auth.getToken();
      const res=await fetchImpl(url,{method,redirect:"manual",headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json","User-Agent":"Livekarte-Private-Sync","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},...(body?{body:JSON.stringify(body)}:{})});
      if(res.status>=300&&res.status<400)throw new Error("GitHub redirect refused");
      if(res.status===401&&attempt===0){auth.invalidate(token);continue;}
      return res;
    }
  }
  function pathFor(session){
    if(!session||session.authenticated!==true||typeof session.device!=="string"||!/^[a-f0-9]{24}$/.test(session.device))throw new Error("Unauthorized device");
    return root+"/contents/livekarte/status/"+session.device+".json";
  }
  async function verify(){
    const res=await request(root);
    if(!res.ok)throw new Error("Repository unavailable");
    const info=await res.json();
    if(info.private!==true||info.full_name?.toLowerCase()!==repository.toLowerCase())throw new Error("Repository not private");
  }
  return {async publish(session,input){
    const url=pathFor(session);
    if(input?.device!==session.device)throw new Error("Device mismatch");
    const local=core.normalizeSnapshot(input);
    await verify();
    for(let attempt=0;attempt<3;attempt++){
      const res=await request(url);
      let sha,remote=null;
      if(res.status!==404){
        if(!res.ok)throw new Error("Snapshot read failed");
        const data=await res.json();
        if(typeof data.sha!=="string"||typeof data.content!=="string"||data.content.length>160000)throw new Error("Invalid remote file");
        remote=core.normalizeSnapshot(JSON.parse(Buffer.from(data.content,"base64").toString("utf8")));
        sha=data.sha;
      }
      const merged=core.mergeSnapshots(session.device,local.tickets,remote);
      const payload=JSON.stringify(merged);
      if(Buffer.byteLength(payload)>75000)throw new Error("Snapshot too large");
      const written=await request(url,"PUT",{message:"Sync: update private ticket statuses for paired device",content:Buffer.from(payload).toString("base64"),...(sha?{sha}:{})});
      if(written.status===409||written.status===422)continue;
      if(!written.ok)throw new Error("Snapshot write failed");
      return {ok:true,count:merged.tickets.length};
    }
    throw new Error("Snapshot conflict");
  }};
}
