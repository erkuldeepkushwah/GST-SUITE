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
      const failScript=(code,stage,status)=>{console.warn('Apps Script email delivery failed',{code,stage,...(status?{httpStatus:status}:{})});return fail(code);};
      const timestamp=Date.now();
      const payload=JSON.stringify({id,to,subject,text,html});
      const key=await crypto.subtle.importKey('raw',enc.encode(env.GST_APPS_SCRIPT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const signature=hex(await crypto.subtle.sign('HMAC',key,enc.encode(timestamp+'.'+payload)));
      const signal=AbortSignal.timeout(20000);
      let response=await fetch(scriptUrl(env),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({timestamp,payload,signature}),redirect:'manual',signal});
      // Apps Script ContentService responds with a one-time redirect to Googleusercontent.
      // Never forward a signed request body or Authorization header to a redirected host.
      if([301,302,303,307,308].includes(response.status)){
        const location=response.headers.get('Location');
        let target;
        try{target=new URL(location||'');}catch{return failScript('SCRIPT_REDIRECT_INVALID','redirect',response.status);}
        if(target.origin!=='https://script.googleusercontent.com'||target.username||target.password)return failScript('SCRIPT_ACCESS_OR_REDIRECT','redirect',response.status);
        response=await fetch(target.href,{method:'GET',redirect:'manual',signal});
        // Cloudflare Workers do not implement redirect:'error'. Never follow extra hops.
        if(response.status>=300&&response.status<400)return failScript('SCRIPT_REDIRECT_CHAIN','redirect',response.status);
      }
      if(!response.ok)return failScript(response.status===401||response.status===403?'SCRIPT_ACCESS_DENIED':'SCRIPT_HTTP_ERROR','response',response.status);
      const result=await response.json().catch(()=>null);
      if(!result||typeof result!=='object')return failScript('SCRIPT_INVALID_RESPONSE','json');
      if(result.ok===true&&result.id===id)return {ok:true,id};
      if(result.ok===true)return failScript('SCRIPT_RESPONSE_MISMATCH','confirmation');
      const codeMap={UNAUTHORIZED:'SCRIPT_AUTH_FAILED',INVALID:'SCRIPT_INVALID_REQUEST',QUOTA:'EMAIL_RATE_LIMIT',SEND_FAILED:'SCRIPT_SEND_FAILED',BUSY:'SCRIPT_BUSY',DUPLICATE:'SCRIPT_DUPLICATE'};
      return failScript(codeMap[result.code]||'SCRIPT_REJECTED','provider');
    }
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({from:env.RESEND_FROM_EMAIL,to:[to],subject,text,html}),signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>null);
    if(response.ok&&result?.id)return {ok:true,id:result.id};
    const configuration=response.status===403&&(/resend\.dev|domain|testing|verif/i.test(String(result?.message||''))||/resend\.dev/i.test(env.RESEND_FROM_EMAIL));
    return fail(configuration?'SENDER_DOMAIN_UNVERIFIED':response.status===429?'EMAIL_RATE_LIMIT':response.status===401||response.status===403?'EMAIL_CONFIGURATION':'EMAIL_PROVIDER_ERROR');
  }catch(e){const code=e?.name==='TimeoutError'?'EMAIL_TIMEOUT':'EMAIL_PROVIDER_ERROR';console.warn('Portal email transport error',{provider:env.GST_EMAIL_PROVIDER||'resend',code,errorName:typeof e?.name==='string'?e.name.slice(0,35):'Unknown'});return fail(code);}
}
