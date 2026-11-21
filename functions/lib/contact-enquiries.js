// Supabase contacts: only server-side callers can read/write private enquiries.
const BASE='https://wdzzylnsjqcglqnxmkns.supabase.co';
export const contactConfigured=env=>Boolean(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY);
function headers(env,extra={}){
 const key=String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
 if(!key)throw Error('Supabase contact key not configured');
 if(!key.startsWith('sb_secret_')){
  let role;
  try{const part=key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');role=JSON.parse(atob(part.padEnd(Math.ceil(part.length/4)*4,'='))).role;}catch{}
  if(role!=='service_role')throw Error('Supabase server secret key required');
 }
 return {apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),...extra};
}
async function checked(env,path,options={}){
 const response=await fetch(BASE+path,{...options,headers:headers(env,options.headers||{}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Contact database rejected request ('+response.status+')');
 return response;
}
export async function contactClientHash(env,client){
 const data=new TextEncoder().encode(String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||'')+':contact:'+client);
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
}
export async function contactRateLimited(env,ipHash){
 const q=new URLSearchParams({select:'created_at',ip_hash:'eq.'+ipHash,created_at:'gte.'+new Date(Date.now()-3600000).toISOString(),order:'created_at.desc',limit:'10'});
 const rows=await (await checked(env,'/rest/v1/gst_contact_enquiries?'+q)).json();
 if(!Array.isArray(rows))throw Error('Invalid contact response');
 return rows.length>=10||rows.some(x=>Date.parse(x.created_at)>Date.now()-60000);
}
export async function insertContactEnquiry(env,item){
 await checked(env,'/rest/v1/gst_contact_enquiries',{method:'POST',headers:{'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(item)});
}
export async function listContactEnquiries(env){
 const q=new URLSearchParams({select:'id,name,email,module,timeline,message,status,admin_notes,created_at,updated_at',order:'created_at.desc',limit:'200'});
 const rows=await (await checked(env,'/rest/v1/gst_contact_enquiries?'+q)).json();
 if(!Array.isArray(rows))throw Error('Invalid contact response');
 return rows;
}
export async function updateContactEnquiry(env,id,status,notes){
 const q=new URLSearchParams({id:'eq.'+id,select:'id,status,admin_notes,updated_at'});
 const res=await checked(env,'/rest/v1/gst_contact_enquiries?'+q,{method:'PATCH',headers:{'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({status,admin_notes:notes,updated_at:new Date().toISOString()})});
 const rows=await res.json();
 return Array.isArray(rows)&&rows.length===1?rows[0]:null;
}
