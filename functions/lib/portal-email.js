// Server-only email transport. Never change RESEND_API_KEY: existing OTP HMAC uses it.
const enc=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const fail=code=>({ok:false,code});
function scriptUrl(env){
  try{const u=new URL(env.GST_APPS_SCRIPT_URL);return u.origin==='https://script.google.com'&&/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname)&&!u.search&&!u.hash&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
export function emailConfigured(env){
  if(env.GST_EMAIL_PROVIDER==='apps-script')return Boolean(scriptUrl(env)&&/^[a-f0-9]{64}$/i.test(env.GST_APPS_SCRIPT_SECRET||''));
  if(env.GST_EMAIL_PROVIDER&&env.GST_EMAIL_PROVIDER!=='resend')return false;
  return Boolean(env.RESEND_API_KEY&&env.RESEND_FROM_EMAIL);
}
export async function sendPortalEmail(env,{to,subject,text,html,id}){
  if(!emailConfigured(env))return fail('EMAIL_CONFIGURATION');
  try{
    if(env.GST_EMAIL_PROVIDER==='apps-script'){
      const timestamp=Date.now();
      const payload=JSON.stringify({id,to,subject,text,html});
      const key=await crypto.subtle.importKey('raw',enc.encode(env.GST_APPS_SCRIPT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode(timestamp+'.'+payload)));
      const signal=AbortSignal.timeout(20000);
      let response=await fetch(scriptUrl(env),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp,payload,signature}),redirect:'manual',signal});
      // ContentService returns its JSON via a one-time Google URL. Never resend the signed body.
      if([301,302,303].includes(response.status)){
        const location=response.headers.get('Location');
        const target=new URL(location||'');
        if(target.origin!=='https://script.googleusercontent.com'||target.username||target.password)return fail('EMAIL_PROVIDER_ERROR');
        response=await fetch(target.href,{method:'GET',redirect:'error',signal});
      }
      if(!response.ok)return fail('EMAIL_PROVIDER_ERROR');
      const result=await response.json();
      if(result?.ok===true&&result.id===id)return {ok:true,id};
      return fail(result?.code==='QUOTA'?'EMAIL_RATE_LIMIT':'EMAIL_PROVIDER_ERROR');
    }
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[to],subject,text,html}),signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>null);
    if(response.ok&&result?.id)return {ok:true,id:result.id};
    const configuration=response.status===403&&(/resend\.dev|domain|testing|verif/i.test(String(result?.message||''))||/resend\.dev/i.test(env.RESEND_FROM_EMAIL));
    return fail(configuration?'SENDER_DOMAIN_UNVERIFIED':response.status===429?'EMAIL_RATE_LIMIT':response.status===401||response.status===403?'EMAIL_CONFIGURATION':'EMAIL_PROVIDER_ERROR');
  }catch{return fail('EMAIL_PROVIDER_ERROR');}
}
