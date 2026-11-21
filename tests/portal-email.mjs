import assert from 'node:assert/strict';
import { webcrypto, createHmac } from 'node:crypto';
import { emailConfigured, sendPortalEmail } from '../functions/lib/portal-email.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const secret='a'.repeat(64);
const env={GST_EMAIL_PROVIDER:'apps-script',GST_APPS_SCRIPT_URL:'https://script.google.com/macros/s/fixture/exec',GST_APPS_SCRIPT_SECRET:secret};
const mail={id:'gst-otp-fixture',to:'test@example.test',subject:'OTP Verification',text:'Fixture',html:'<p>Fixture</p>'};
assert.equal(emailConfigured(env),true);
assert.equal(emailConfigured({...env,GST_APPS_SCRIPT_URL:'https://example.test/exec'}),false);
assert.equal(emailConfigured({...env,GST_APPS_SCRIPT_SECRET:'short'}),false);
const original=globalThis.fetch;let calls=0;
try{
 globalThis.fetch=async(url,opts)=>{
   calls++;
   if(calls===1){
     assert.equal(url,env.GST_APPS_SCRIPT_URL);
     assert.equal(opts.method,'POST');assert.equal(opts.redirect,'manual');
     const body=JSON.parse(opts.body);
     assert.deepEqual(JSON.parse(body.payload),mail);
     assert.equal(body.signature,createHmac('sha256',secret).update(body.timestamp+'.'+body.payload).digest('hex'));
     return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?fixture=1'}});
   }
   assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');assert.equal(opts.body,undefined);
   return Response.json({ok:true,id:mail.id});
 };
 assert.deepEqual(await sendPortalEmail(env,mail),{ok:true,id:mail.id});assert.equal(calls,2);
 // Follow the one-time Googleusercontent redirect exactly once; never follow a second hop.
 calls=0;
 globalThis.fetch=async(url,opts)=>{
   calls++;
   if(calls===1)return new Response(null,{status:302,headers:{Location:'https://script.googleusercontent.com/macros/echo?fixture=2'}});
   assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');
   return new Response(null,{status:302,headers:{Location:'https://other.example.test/'}});
 };
 assert.deepEqual(await sendPortalEmail(env,mail),{ok:false,code:'SCRIPT_REDIRECT_CHAIN'});
 assert.equal(calls,2);
  globalThis.fetch=async()=>Response.json({ok:false,code:'QUOTA'});
 assert.deepEqual(await sendPortalEmail(env,mail),{ok:false,code:'EMAIL_RATE_LIMIT'});
 globalThis.fetch=async()=>Response.json({ok:true,id:'different'});
 assert.equal((await sendPortalEmail(env,mail)).ok,false);
 globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://example.test/'}});
 assert.equal((await sendPortalEmail(env,mail)).ok,false);
 globalThis.fetch=async()=>{throw Error('network');};
 assert.equal((await sendPortalEmail(env,mail)).ok,false);
 globalThis.fetch=async()=>Response.json({message:'testing domain'},{status:403});
 assert.equal((await sendPortalEmail({RESEND_API_KEY:'fixture',RESEND_FROM_EMAIL:'onboarding@resend.dev'},mail)).code,'SENDER_DOMAIN_UNVERIFIED');
 console.log('Email transport synthetic checks passed');
}finally{globalThis.fetch=original;}
