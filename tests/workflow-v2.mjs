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
     if(sql.includes('workflow_quote_versions'))return null;
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
console.log('[workflow-v2] booking validation, role isolation, payment gate, final approval and filter checks passed');
