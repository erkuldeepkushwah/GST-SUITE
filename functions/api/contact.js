import {contactConfigured,contactClientHash,contactRateLimited,insertContactEnquiry} from '../lib/contact-enquiries.js';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const validEmail=s=>/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(s);
export async function onRequestPost({request,env}){
 const origin=request.headers.get('Origin');
 if(origin&&origin!==new URL(request.url).origin)return reply({error:'Invalid origin'},403);
 if(!contactConfigured(env))return reply({error:'Contact service not configured'},503);
 const mime=(request.headers.get('Content-Type')||'').toLowerCase();
 if(!mime.includes('application/json')&&!mime.includes('application/x-www-form-urlencoded'))return reply({error:'Unsupported form type'},415);
 if(Number(request.headers.get('Content-Length')||0)>16000)return reply({error:'Form is too large'},413);
 try{
  const raw=await request.text();if(raw.length>16000)return reply({error:'Form is too large'},413);
  const b=mime.includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw));
  if(!b||typeof b!=='object'||Array.isArray(b))return reply({error:'Invalid form'},400);
  if(String(b._honey||'').trim())return reply({accepted:true});
  const name=String(b.name||'').trim().replace(/\s+/g,' ');
  const email=String(b.email||'').trim().toLowerCase();
  const module=String(b.module||'').trim(),timeline=String(b.timeline||'').trim(),message=String(b.message||'').trim();
  if(name.length<2||name.length>120||!validEmail(email)||email.length>254||module.length>120||timeline.length>100||message.length<10||message.length>3000)
   return reply({error:'Enter a valid name, email and message (at least 10 characters).'},400);
  const client=request.headers.get('CF-Connecting-IP')||'email:'+email;
  const ip_hash=await contactClientHash(env,client);
  if(await contactRateLimited(env,ip_hash))return reply({error:'Please wait before sending another enquiry.'},429);
  await insertContactEnquiry(env,{name,email,module,timeline,message,ip_hash});
  return reply({accepted:true},201);
 }catch(e){console.warn('Website contact submission failed',{name:e?.name||'Error'});return reply({error:'Unable to submit enquiry. Please try later.'},503);}
}
