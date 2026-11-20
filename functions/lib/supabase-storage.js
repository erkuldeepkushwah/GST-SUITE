// Server-only private storage adapter. Firebase and D1 authorization remain in API handlers.
const BASE='https://wdzzylnsjqcglqnxmkns.supabase.co';
const BUCKETS=new Set(['gst-documents','gst-final-returns','gst-support-attachments']);
const TYPES={pdf:'application/pdf',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',csv:'text/csv',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png'};
export const storageConfigured=env=>Boolean(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY);
function headers(env,extra={}){
 const key=String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!key)throw Error('Supabase Storage is not configured');
 if(!key.startsWith('sb_secret_')){
  let role;try{const payload=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');role=JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'='))).role;}catch{}
  if(role!=='service_role')throw Error('Supabase server credential must be a Secret API key, not a Publishable or anon key.');
 }
 return {apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),...extra};
}
function parse(ref){
 const m=String(ref).match(/^supabase:([a-z-]+)\/([0-9a-f-]{36})$/);
 if(!m||!BUCKETS.has(m[1]))throw Error('Invalid private storage reference');
 return {bucket:m[1],path:m[2]};
}
export const isSupabaseFile=ref=>typeof ref==='string'&&ref.startsWith('supabase:');
async function checked(response){if(!response.ok){const body=await response.text().catch(()=> '');if(/row.level security|permission denied/i.test(body)||response.status===401||response.status===403)throw Error('Supabase server credential lacks storage permission. Check the Secret API key in Cloudflare.');throw Error('Supabase request failed ('+response.status+')');}return response;}
export async function removePrivateFile(env,ref){
 const {bucket,path}=parse(ref);
 await checked(await fetch(BASE+'/storage/v1/object/'+bucket,{method:'DELETE',headers:headers(env,{'Content-Type':'application/json'}),body:JSON.stringify({prefixes:[path]})}));
 await checked(await fetch(BASE+'/rest/v1/gst_uploaded_documents?id=eq.'+encodeURIComponent(path),{method:'DELETE',headers:headers(env)}));
}
export async function savePrivateFile(env,{id,bucket,file,name,ownerUid,category,contextId=null}){
 const ref='supabase:'+bucket+'/'+id;parse(ref);
 const mime=TYPES[String(name).split('.').pop().toLowerCase()]||'application/octet-stream';
 if(!file.size||file.size>10485760)throw Error('Invalid file size');
 await checked(await fetch(BASE+'/storage/v1/object/'+bucket+'/'+id,{method:'POST',headers:headers(env,{'Content-Type':mime,'x-upsert':'false'}),body:file}));
 try{
  await checked(await fetch(BASE+'/rest/v1/gst_uploaded_documents',{method:'POST',headers:headers(env,{'Content-Type':'application/json',Prefer:'return=minimal'}),body:JSON.stringify({id,owner_uid:ownerUid,bucket,object_path:id,name,category,context_id:contextId,size:file.size,mime_type:mime})}));
 }catch(e){await removePrivateFile(env,ref).catch(()=>{});throw e;}
 return ref;
}
export async function downloadPrivateFile(env,ref){
 const {bucket,path}=parse(ref);
 return fetch(BASE+'/storage/v1/object/authenticated/'+bucket+'/'+path,{headers:headers(env)});
}
