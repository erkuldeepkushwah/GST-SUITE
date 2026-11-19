// Administrative authorization is checked on the server, not by browser email alone.
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
 if(!token)return respond({error:'Authentication required'},401);
 if(!env.FIREBASE_WEB_API_KEY)return respond({error:'Admin authentication unavailable'},503);
 try{
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!r.ok)return respond({error:'Invalid session'},401);
 const u=(await r.json()).users?.[0];
 if(!u||u.disabled||u.email?.toLowerCase()!=='kuldeep@gmail.com'||!u.emailVerified)return respond({error:'Admin access requires the authorized, verified Firebase account'},403);
 // No customer data or privileged mutations are exposed by this initial dashboard.
 return respond({authorized:true,name:u.displayName||'Admin',metrics:{customers:null,services:null,tasks:null,filings:null,invoices:null,revenue:null}});
 }catch{return respond({error:'Authentication service unavailable'},503);}
}
