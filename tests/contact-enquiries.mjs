// Synthetic contract test. Does not reach live Supabase or send messages.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {onRequestPost as contact} from '../functions/api/contact.js';
import {onRequestPost as admin} from '../functions/api/admin.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const prior=globalThis.fetch;
let submitted=0,latest=null,recent=false;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(url,opts={})=>{
 assert.ok(String(url).startsWith('https://wdzzylnsjqcglqnxmkns.supabase.co/rest/v1/gst_contact_enquiries'));
 assert.equal(opts.headers.apikey,'sb_secret_synthetic_only');
 if((opts.method||'GET')==='GET')return json(recent?[{created_at:new Date().toISOString()}]:[]);
 if(opts.method==='POST'){submitted++;latest=JSON.parse(opts.body);return new Response('',{status:201});}
 throw Error('Unexpected database method');
};
const env={SUPABASE_SECRET_KEY:'sb_secret_synthetic_only'};
const good={name:'Example User',email:'test@example.invalid',module:'GST',timeline:'This month',message:'Please contact me about GST reconciliation.',_honey:''};
const req=(body,origin='https://portal.example.test')=>new Request('https://portal.example.test/api/contact',{method:'POST',headers:{'Content-Type':'application/json','Origin':origin,'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)});
try{
 let result=await contact({request:req(good),env});assert.equal(result.status,201);assert.equal((await result.json()).accepted,true);
 assert.equal(submitted,1);assert.equal(latest.email,good.email);assert.match(latest.ip_hash,/^[a-f0-9]{64}$/);
 result=await contact({request:req(good,'https://evil.example.test'),env});assert.equal(result.status,403);assert.equal(submitted,1);
 result=await contact({request:req({...good,message:'short'}),env});assert.equal(result.status,400);assert.equal(submitted,1);
 result=await contact({request:req({...good,_honey:'filled'}),env});assert.equal(result.status,200);assert.equal(submitted,1);
 recent=true;result=await contact({request:req(good),env});assert.equal(result.status,429);assert.equal(submitted,1);
 result=await admin({request:new Request('https://portal.example.test/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'contactList'})}),env});
 assert.equal(result.status,401);
 console.log('[contact enquiries] submission, validation, spam protection, and admin authorization passed');
}finally{globalThis.fetch=prior;}
