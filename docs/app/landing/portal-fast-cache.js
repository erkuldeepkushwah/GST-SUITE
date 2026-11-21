// In-memory request coalescing for authenticated portal API reads.
// It is intentionally NOT HTTP caching, localStorage, or a substitute for server auth.
// Every request is still verified by the backend; mutations invalidate read snapshots.
const lifetimes=Object.freeze({
 workspaceData:5000,firmData:5000,workspaceAdmin:3500,
 workflowCatalog:8000,workflowAdminOrders:4500,workflowDetails:4000,
 workflowNotifications:3500,workflowReport:6500,workspaceTimeline:4000,
 dashboard:5000,report:7000,list:4500,contactList:3500,
 directory:3500,adminAccountDetails:4000,clientFirms:5000,firmCompanies:5000,
 workspaceClientDetails:4000
});
const uncachedReads=new Set(['workspaceFiles','workspaceThread','identify','status','workspaceClientThread']);
const snapshots=new Map(),ongoing=new Map();
let generation=0,lastUser='';
const MAX_ENTRIES=120;
export function clearPortalApiCache(){
 generation++;snapshots.clear();ongoing.clear();
}
export function portalCachedRequest(scope,userId,payload,request){
 const user=String(userId||'');
 if(!user)return Promise.resolve().then(request);
 if(user!==lastUser){clearPortalApiCache();lastUser=user;}
 const ttl=lifetimes[payload?.action]||0;
 if(!ttl){
  if(uncachedReads.has(payload?.action))return Promise.resolve().then(request);
  clearPortalApiCache();
  return Promise.resolve().then(request).then(result=>{clearPortalApiCache();return result;});
 }
 const key=user+'|'+scope+'|'+JSON.stringify(payload);
 const now=Date.now(),saved=snapshots.get(key);
 if(saved&&saved.expires>now)return Promise.resolve(saved.result);
 if(saved)snapshots.delete(key);
 if(ongoing.has(key))return ongoing.get(key);
 const current=generation;
 let job;
 job=Promise.resolve().then(request).then(result=>{
  if(generation===current&&lastUser===user){
   if(snapshots.size>=MAX_ENTRIES)snapshots.delete(snapshots.keys().next().value);
   snapshots.set(key,{result,expires:Date.now()+ttl});
  }
  return result;
 }).finally(()=>{if(ongoing.get(key)===job)ongoing.delete(key);});
 ongoing.set(key,job);
 return job;
}
