// Server-side only. Never import from the public browser application.
// Installation token is constrained to a single repository and contents permission.
export function createInstallationAuth({appId,installationId,repositoryId,signJwt,fetchImpl=fetch,now=Date.now}) {
  for (const id of [appId,installationId,repositoryId]) {
    if (!/^[1-9][0-9]*$/.test(String(id))) throw new Error("Invalid GitHub App configuration");
  }
  if (typeof signJwt !== "function") throw new Error("Missing server-side signer");
  let cached=null, pending=null;
  async function mint() {
    const iat=Math.floor(now()/1000)-60;
    const jwt=await signJwt({iss:String(appId),iat,exp:iat+540});
    const response=await fetchImpl("https://api.github.com/app/installations/"+installationId+"/access_tokens",{
      method:"POST",headers:{Authorization:"Bearer "+jwt,Accept:"application/vnd.github+json","Content-Type":"application/json","X-GitHub-Api-Version":"2022-11-28"},
      body:JSON.stringify({repository_ids:[Number(repositoryId)],permissions:{contents:"write"}})
    });
    if(!response.ok) throw new Error("GitHub installation authentication failed ("+response.status+")");
    const data=await response.json();
    const expires=Date.parse(data.expires_at);
    if(typeof data.token!=="string"||!data.token||!Number.isFinite(expires)||expires<=now()+60000)
      throw new Error("Invalid GitHub installation token response");
    cached={token:data.token,expires};
    return cached.token;
  }
  return {
    async getToken(){
      if(cached&&cached.expires>now()+60000)return cached.token;
      if(!pending)pending=mint().finally(()=>{pending=null;});
      return pending;
    },
    invalidate(token){if(cached?.token===token)cached=null;}
  };
}
