export async function startManagedSync(managedSyncEndpoint){
 const url=new URL(managedSyncEndpoint);
 if(url.protocol!=='https:'||url.pathname!=='/'||url.search||url.hash||url.username||url.password)throw new Error('Invalid managed sync root');
 const {activateManagedSync}=await import('./browser-ui.mjs');
 await activateManagedSync({endpoint:url.origin});
 return true;
}
