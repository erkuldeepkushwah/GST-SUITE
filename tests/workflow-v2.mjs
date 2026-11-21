// Synthetic booking lifecycle contracts; no production data is read or mutated.
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {workflow} from '../functions/lib/workflow-v2.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const today=new Date(Date.now()+19800000).toISOString().slice(0,10);
const client={localId:'test-client',displayName:'Example Client'};
const firmUser={localId:'test-firm'};
const admin={localId:'test-admin'};
let calls=[],active=null;
const db={
 prepare(sql){
  return {bind(...params){
   return {
    async first(){
     if(sql.includes('workflow_service_catalog WHERE service'))return {category:'GST',active:1,frequencies:'Monthly,Quarterly'};
     if(sql.includes('customer_profiles WHERE uid'))return {name:'Example Business'};
     if(sql.includes('SELECT * FROM firm_service_orders WHERE id'))return active;
     if(sql.includes('SELECT a.uid,a.email FROM portal_accounts'))return {uid:params[0],email:'old@example.test'};
     if(sql.includes('workflow_quote_versions'))return null;
     if(sql.includes('SELECT * FROM workflow_payments WHERE'))return {id:params[0],order_id:params[1],status:'Submitted'};
     throw Error('Unexpected query: '+sql.slice(0,110));
    },
    async all(){return {results:[]};},
    async run(){calls.push({sql,params});return {meta:{changes:1}};}
   };
  }};
 },
 async batch(queries){return queries.map(q=>{calls.push(q);return {meta:{changes:1}};});}
};
const book=async(overrides={})=>workflow({db,u:client,firm:false,admin:false,b:{
 action:'workflowBook',category:'GST',service:'GSTR-1 Filing',frequency:'Quarterly',
 financialYear:'2026-27',period:'2026-27 Q1 (Apr - Jun)',requestedDate:today,
 requestId:'12345678-1234-1234-1234-123456789abc',...overrides
}});
let response=await book();
assert.equal(response.status,200);
let data=await response.json();
assert.equal(data.saved,true);
assert.match(data.bookingId,/^GST-\d{8}-[A-F0-9]+$/);
assert.equal(data.status,'SUBMITTED');
assert.ok(calls.length>=4,'Booking, pending invoice, event, and audit are written');
response=await book({frequency:'Monthly'});
assert.equal(response.status,400,'Incompatible filing frequency is rejected');
response=await workflow({db,u:firmUser,firm:true,admin:false,b:{
 action:'workflowBook',category:'GST',service:'GSTR-1 Filing',frequency:'Quarterly',financialYear:'2026-27',period:'2026-27 Q1 (Apr - Jun)',requestedDate:today,requestId:'12345678-1234-1234-1234-123456789abc'
}});
assert.equal(response.status,403,'Firm cannot create a client-only booking');
response=await workflow({db,u:client,firm:false,admin:false,b:{action:'workflowReport',reportType:'Bookings',from:'2026-11-22',to:'2026-11-21',financialYear:'All'}});
assert.equal(response.status,400,'Reverse report dates rejected');
active={id:'test-order',firm_uid:'test-firm',client_uid:'test-client',status:'DOCUMENTS_VERIFIED',payment_verified_at:null,updated_at:Date.now()};
response=await workflow({db,u:firmUser,firm:true,admin:false,b:{action:'workflowStartFiling',orderId:'test-order'}});
assert.equal(response.status,409,'Cannot file without verified settlement');
response=await workflow({db,u:client,firm:false,admin:false,b:{action:'workflowFinalReview',orderId:'test-order',decision:'Approve'}});
assert.equal(response.status,403,'Client cannot approve final return');
response=await workflow({db,u:admin,firm:false,admin:true,b:{action:'workflowFinalReview',orderId:'test-order',decision:'Approve'}});
assert.equal(response.status,409,'Admin cannot approve without submitted filing');
active={...active,firm_uid:active.client_uid};
response=await workflow({db,u:firmUser,firm:true,admin:false,b:{action:'workflowStartFiling',orderId:'test-order'}});
assert.equal(response.status,404,'Unassigned firm cannot access client booking');
active={id:'test-order',firm_uid:'test-firm',client_uid:'test-client',status:'AWAITING_DOCUMENTS',payment_verified_at:Date.now(),updated_at:Date.now()};
response=await workflow({db,u:admin,firm:false,admin:true,b:{action:'workflowPaymentVerify',orderId:'test-order',paymentId:'second-payment',decision:'Verified',receiptNote:'Bank settlement confirmed'}});
assert.equal(response.status,409,'Duplicate verified payment must be blocked');
const conflictOrder={id:'test-order',client_uid:'test-client',firm_uid:'test-firm',status:'AWAITING_PAYMENT',payment_verified_at:null,updated_at:Date.now()};
const conflictDb={prepare(sql){return {bind(...params){return {
 async first(){
  if(sql.includes('SELECT * FROM firm_service_orders'))return conflictOrder;
  if(sql.includes('SELECT * FROM workflow_payments'))return {id:'payment-1',order_id:'test-order',status:'Submitted',quote_version:1,amount_paise:10000};
  if(sql.includes('SELECT version,amount_paise FROM workflow_quote_versions'))return {version:1,amount_paise:10000};
  throw Error('Unexpected payment lock query: '+sql.slice(0,90));
 },
 async run(){return {meta:{changes:0}};}
};}};}};
const locked=await workflow({db:conflictDb,u:admin,firm:false,admin:true,b:{
 action:'workflowPaymentVerify',orderId:'test-order',paymentId:'payment-1',
 decision:'Verified',receiptNote:'Confirmed in bank statement'
}});
assert.equal(locked.status,409,'Concurrent payment review must not report success if another reviewer changed its status');

console.log('[workflow-v2] booking validation, role isolation, payment gate, final approval and filter checks passed');

import {liveWorkflowFirmOptions} from '../functions/lib/live-accounts.js';
const sampleRows=[
 {uid:'stale-k',email:'same@example.test',name:'Old Firm'},
 {uid:'firm1',email:'same@example.test',name:'Real Firm',kind:'professional'},
 {uid:'firm1',email:'same@example.test',name:'Real Firm',kind:'professional'},
 {uid:'staff1',email:'staff@example.test',name:'Active Staff',kind:'staff'},
 {uid:'inactive',email:'inactive@example.test',name:'Inactive',kind:'professional'},
 {uid:'changed',email:'previous@example.test',name:'Changed Email',kind:'professional'},
 {uid:'admin',email:'admin@example.test',name:'Admin',kind:'professional'}
];
const current=new Map([
 ['firm1',{uid:'firm1',email:'same@example.test',disabled:false}],
 ['staff1',{uid:'staff1',email:'staff@example.test',disabled:false}],
 ['inactive',{uid:'inactive',email:'inactive@example.test',disabled:true}],
 ['changed',{uid:'changed',email:'new@example.test',disabled:false}],
 ['admin',{uid:'admin',email:'admin@example.test',disabled:false}]
]);
const cleaned=liveWorkflowFirmOptions(sampleRows,current,'admin');
assert.deepEqual(cleaned,[
 {uid:'firm1',email:'same@example.test',name:'Real Firm'},
 {uid:'staff1',email:'staff@example.test',name:'Active Staff'}
],'No duplicate, deleted, disabled, changed-email, or admin users in picker');
console.log('[firm dropdown] Firebase active UID filtering and email deduplication passed');
active={...active,status:'SUBMITTED',firm_uid:'test-client'};
const mutationsBefore=calls.length;
response=await workflow({db,u:admin,firm:false,admin:true,liveAccounts:async()=>new Map(),b:{
 action:'workflowAssign',orderId:'test-order',firmUid:'deleted-firm'
}});
assert.equal(response.status,409,'An orphaned Firebase firm UID must not receive a booking assignment');
assert.equal(calls.length,mutationsBefore,'Stale firm validation must not mutate bookings');
console.log('[firm dropdown] stale UID assignment fails closed');

