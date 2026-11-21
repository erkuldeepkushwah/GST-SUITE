// Synthetic regression fixtures only. Never contact production services or mutate live data.
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { onRequestPost as roles } from '../functions/api/roles.js';
import { onRequestPost as otp } from '../functions/api/otp.js';
import { onRequestPost as admin } from '../functions/api/admin.js';
import { onRequestPost as documents } from '../functions/api/documents.js';
import { onRequestPost as orderFiles } from '../functions/api/order-files.js';
import { workspace, ownedOrder } from '../functions/lib/firm-workspace.js';
import { financialYears, periodOptions, validFilingPeriod } from '../landing/filing-periods.js';

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const client='test-client', firm='test-firm', stranger='test-stranger';
const order={id:'test-order',client_uid:client,firm_uid:client,service:'TDS Return',period:'2025-26 Q4 (Jan - Mar)'};
let batches=[],otpRequired=1;
const db={prepare(sql){return {bind(...params){return {sql,params,
  async first(){
    if(sql.includes('SELECT active,otp FROM account_policy'))return {active:1,otp:otpRequired};
    if(sql.includes('SELECT uid FROM ('))return null;
    if(sql.includes('SELECT * FROM firm_service_orders WHERE id='))return params[0]===order.id?order:null;
    if(sql.includes("WHERE w.id='client:'||?")&&sql.includes('w.staff_uid=?'))return params.at(-1)===firm&&params.at(-2)===client?{title:'Test Client',reference:'client@example.test'}:null;
    if(sql.includes('SELECT business_name,name FROM customer_profiles'))return {business_name:'Test Business',name:'Test User'};
    throw Error('Unexpected fixture query');
  }};} };},async batch(queries){batches.push(queries);return []; }};
const env={GST_AUTH_DB:db,FIREBASE_WEB_API_KEY:'fixture',RESEND_API_KEY:'fixture'};
const token='fixture.'+Buffer.from(JSON.stringify({auth_time:Math.floor(Date.now()/1000)})).toString('base64url')+'.fixture';
const request=(body,authenticated=false)=>new Request('https://portal.example.test/api/test',{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url)=>{
  assert.ok(String(url).startsWith('https://identitytoolkit.googleapis.com/v1/accounts:lookup?'),'Unexpected external call');
  return Response.json({users:[{localId:client,email:'client@example.test',displayName:'Test User',emailVerified:true}]});
};
try {
  for(const [handler,action] of [[roles,'identify'],[otp,'status'],[admin,'dashboard'],[documents,'list'],[orderFiles,'download']]){
    assert.equal((await handler({request:request({action}),env})).status,401,'Unauthenticated request must fail');
  }
  assert.equal((await roles({request:request({action:'adminAccountDetails',uid:firm,email:'firm@example.test'},true),env})).status,403,'Client cannot access admin profile');
  assert.equal((await roles({request:request({action:'workspaceData'},true),env})).status,403,'Missing required OTP must deny workspace access');
  otpRequired=0;
  assert.equal((await documents({request:request({action:'list',admin:true},true),env})).status,403,'Client cannot access all documents');
  assert.equal(await ownedOrder(db,client,order.id,false,false),order);
  assert.equal(await ownedOrder(db,firm,order.id,true,false),null,'Unassigned client booking is hidden from firms');
  assert.equal(await ownedOrder(db,stranger,order.id,true,false),null);
  assert.equal(await ownedOrder(db,stranger,order.id,false,false),null);
  assert.equal((await workspace({db,b:{action:'workspaceClientDetails',clientUid:client},u:{localId:stranger},firm:true,admin:false})).status,404);
  assert.equal((await workspace({db,b:{action:'workspaceClientDetails',clientUid:client},u:{localId:client},firm:false,admin:false})).status,403);
  assert.deepEqual(financialYears,['2023-24','2024-25','2025-26','2026-27']);
  assert.deepEqual(periodOptions('Quarterly','2025-26').map(x=>x[0]),['2025-26 Q1 (Apr - Jun)','2025-26 Q2 (Jul - Sep)','2025-26 Q3 (Oct - Dec)','2025-26 Q4 (Jan - Mar)']);
  assert.equal(validFilingPeriod('Income Tax Return','2025-26'),true);
  assert.equal(validFilingPeriod('TDS Return','2025-26 Q5'),false);
  assert.equal((await workspace({db,b:{action:'workspaceDirectBook'},u:{localId:client},firm:false,admin:false})).status,409,'Legacy booking cannot bypass the six-step booking wizard');
  assert.equal((await workspace({db,b:{action:'workspaceBook'},u:{localId:firm},firm:true,admin:false})).status,409,'Firms cannot create unauthorised client bookings');
  assert.equal(batches.length,0,'Legacy booking attempts must not write records');
  console.log('[portal regression] auth, roles, OTP, document admin scope, assignment and financial period checks passed');
} finally {globalThis.fetch=originalFetch;}
