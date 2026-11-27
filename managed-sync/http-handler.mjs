import {createHash} from "node:crypto";
// HTTP adapter, independent of hosting. Device identity is derived only after
// signature verification. CORS is not an authentication mechanism.
export function createHandler({deviceAuth,broker,origin}){
 if(typeof origin!=="string"||!origin.startsWith("https://")||new URL(origin).origin!==origin)throw new Error("Invalid origin");
 return async function handle(request){
  const headers={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-Device, X-Nonce, X-Signature","Cache-Control":"no-store","Content-Type":"application/json","Vary":"Origin"};
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(request.headers.get("origin")!==origin)return reply(403,{error:"Forbidden"});
  const path=new URL(request.url).pathname;
  if(path!=="/challenge"&&path!=="/snapshot")return reply(404,{error:"Not found"});
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return reply(405,{error:"Method not allowed"});
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))return reply(415,{error:"JSON required"});
  try{
   const reader=request.body?.getReader();
   if(!reader)return reply(400,{error:"Missing body"});
   const chunks=[];let size=0;
   while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>75000){await reader.cancel();return reply(413,{error:"Body too large"});}chunks.push(Buffer.from(value));}
   const bytes=Buffer.concat(chunks);
   const input=JSON.parse(bytes.toString("utf8"));
   if(path==="/challenge")return reply(200,{nonce:await deviceAuth.challenge(input.device)});
   const session=await deviceAuth.authenticate({device:request.headers.get("x-device"),nonce:request.headers.get("x-nonce"),signature:request.headers.get("x-signature"),bodyHash:createHash("sha256").update(bytes).digest("hex")});
   return reply(200,await broker.publish(session,input));
  }catch{return reply(400,{error:"Request rejected"});}
 };
}
