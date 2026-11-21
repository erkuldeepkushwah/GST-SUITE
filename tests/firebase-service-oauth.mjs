// An isolated OAuth contract test: no Firebase requests, credentials, or live accounts.
import assert from 'node:assert/strict';
import {generateKeyPairSync, webcrypto} from 'node:crypto';
import {onRequestPost} from '../functions/api/roles.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const ADMIN='7arK2z41nhTMyjwasmXKCWR0uw93';
const env={
 FIREBASE_WEB_API_KEY:'synthetic-api-key',
 GST_OTP_MODE:'required',
 FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON:JSON.stringify({
  project_id:'paypoint-e14c9',
  client_email:'mock-service@example.iam.gserviceaccount.com',
  private_key:privateKey
 })
};
const db={
 prepare(sql){
  return {bind(){return {first:async()=>null,all:async()=>({results:[]})};},all:async()=>({results:[]})};
 }
};
env.GST_AUTH_DB=db;
const idToken='x.'+Buffer.from(JSON.stringify({auth_time:Math.floor(Date.now()/1000)})).toString('base64url')+'.y';
let grants=[],lookups=0,oauthCalls=0;
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 const target=String(url);
 if(target.startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=')){
  lookups++;
  return Response.json({users:[{localId:ADMIN,email:'kuldeep@gmail.com',disabled:false}]});
 }
 if(target==='https://oauth2.googleapis.com/token'){
  oauthCalls++;
  const params=new URLSearchParams(options.body);
  grants.push(params.get('grant_type'));
  assert.equal(params.get('grant_type'),'urn:ietf:params:oauth:grant-type:jwt-bearer','RFC 7523 service account JWT grant type');
  const parts=String(params.get('assertion')||'').split('.');
  assert.equal(parts.length,3,'Signed JWT assertion is present');
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  assert.equal(claims.aud,target,'OAuth assertion audience must match token endpoint');
  assert.equal(claims.iss,'mock-service@example.iam.gserviceaccount.com');
  assert.equal(claims.scope,'https://www.googleapis.com/auth/identitytoolkit');
  return Response.json({access_token:'synthetic-machine-token',token_type:'Bearer',expires_in:3600});
 }
 if(target.startsWith('https://identitytoolkit.googleapis.com/v1/projects/paypoint-e14c9/accounts:batchGet?')){
  assert.equal(options.headers.Authorization,'Bearer synthetic-machine-token');
  return Response.json({users:[]});
 }
 throw Error('Unexpected external call: '+target);
};
try{
 const request=()=>new Request('https://portal.example.test/api/roles',{
  method:'POST',headers:{Authorization:'Bearer '+idToken,'Content-Type':'application/json'},
  body:JSON.stringify({action:'directory'})
 });
 for(let i=0;i<2;i++){
  const response=await onRequestPost({request:request(),env});
  assert.equal(response.status,200,'Admin directory should load with valid service account OAuth');
  const result=await response.json();
  assert.equal(result.source,'Firebase Authentication');
 }
 assert.equal(oauthCalls,1,'Machine-to-machine token should be reused during its lifetime');
 assert.equal(lookups,2,'Each user session must still be independently verified');
 assert.deepEqual(grants,['urn:ietf:params:oauth:grant-type:jwt-bearer']);
 console.log('[firebase OAuth] correct JWT grant, signed assertion, directory loading and service-token reuse passed');
}finally{globalThis.fetch=originalFetch;}
