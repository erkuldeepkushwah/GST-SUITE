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
assert.equal(response.status,409,'Verified documents required before filing');
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
const conflictOrder={id:'test-order',client_uid:'test-client',firm_uid:'test-firm',status:'AWAITING_PAYMENT',final_approved_at:Date.now(),payment_verified_at:null,updated_at:Date.now()};
const conflictDb={prepare(sql){return {bind(...params){return {
 async first(){
  if(sql.includes('SELECT * FROM firm_service_orders'))return conflictOrder;
  if(sql.includes('SELECT * FROM workflow_payments'))return {id:'payment-1',order_id:'test-order',status:'Submitted',quote_version:1,amount_paise:10000};
  if(sql.includes('SELECT version,amount_paise FROM workflow_quote_versions'))return {version:1,amount_paise:10000};
  throw Error('Unexpected payment lock query: '+sql.slice(0,90));
 },
 async run(){return {meta:{changes:0}};}
};}};},async batch(){return [{meta:{changes:0}},{meta:{changes:0}},{meta:{changes:0}}];}};
const locked=await workflow({db:conflictDb,u:admin,firm:false,admin:true,b:{
 action:'workflowPaymentVerify',orderId:'test-order',paymentId:'payment-1',
 decision:'Verified',receiptNote:'Confirmed in bank statement'
}});
assert.equal(locked.status,409,'Concurrent payment review must not report success if another reviewer changed its status');

// Payment-after-work: verified documents -> filing -> Admin approval -> client payment -> completed.
const workOrder={id:'work-order',firm_uid:'test-firm',client_uid:'test-client',booking_code:'GST-TEST',
 status:'UNDER_REVIEW',payment_verified_at:null,document_verified_at:null,final_approved_at:null,updated_at:Date.now(),arn:null,filing_date:null};
const writes=[];
const fixture={
 prepare(sql){return {bind(...params){return {
  async first(){
   if(sql.includes('SELECT * FROM firm_service_orders WHERE id'))return workOrder;
   if(sql.includes('SELECT version,amount_paise FROM workflow_quote_versions'))return {version:1,amount_paise:149900};
   if(sql.includes("firm_order_files WHERE order_id")&&sql.includes("kind='Final file'"))return {id:'final.pdf'};
   if(sql.includes('SELECT * FROM workflow_payments WHERE'))return {id:'pay-1',order_id:workOrder.id,quote_version:1,amount_paise:149900,status:'Submitted'};
   if(sql.includes('SELECT id FROM workflow_payments'))return null;
   throw Error('Unexpected fixture query: '+sql.slice(0,95));
  },
  async all(){return {results:sql.includes('firm_order_files f')?[{id:'doc-1',status:'Verified'}]:[]};},
  async run(){writes.push({sql,params});return {meta:{changes:1}};}
 };}};},
 async batch(queries){writes.push(...queries);return queries.map(()=>({meta:{changes:1}}));}
};
const flow=(action,actor,role={},params={})=>workflow({db:fixture,u:actor,firm:!!role.firm,admin:!!role.admin,b:{action,orderId:workOrder.id,...params}});
response=await flow('workflowPaymentSubmit',client,{}, {method:'UPI',transactionRef:'UTR0000111222'});
assert.equal(response.status,409,'Payment is blocked before final work approval');
response=await flow('workflowStartFiling',firmUser,{firm:true});
assert.equal(response.status,200,'Firm can start with verified docs and no payment');
assert.equal((await response.json()).status,'IN_PROGRESS');
workOrder.status='FILED_PENDING_REVIEW';workOrder.document_verified_at=Date.now();workOrder.arn='ARN12345';workOrder.filing_date=today;
response=await flow('workflowFinalReview',admin,{admin:true},{decision:'Approve',note:'Final return reviewed'});
assert.equal(response.status,200);
assert.equal((await response.json()).status,'AWAITING_PAYMENT','Admin approval creates the payment request');
workOrder.status='AWAITING_PAYMENT';workOrder.final_approved_at=Date.now();
response=await flow('workflowPaymentSubmit',client,{}, {method:'UPI',transactionRef:'UTR0000111222'});
assert.equal(response.status,200,'Client can submit payment reference after approval');
response=await flow('workflowPaymentVerify',admin,{admin:true},{paymentId:'pay-1',decision:'Verified',receiptNote:'Matched bank settlement record'});
assert.equal(response.status,200);
assert.equal((await response.json()).status,'COMPLETED','Verified payment closes booking');
assert.ok(writes.length>0,'Workflow writes issued for verified payments');
console.log('[workflow-v2] pay-last contract, role isolation, verified-docs, Admin review and concurrency checks passed');

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


// Admin booking assignment updates both D1 order owner and Assigned Clients.
// Uses synthetic data only; never touches production accounts or bookings.
const sampleBooking={id:'client-sample:request-a',client_uid:'client-sample',client_name:'Sample Business',firm_uid:'client-sample',service:'GSTR-1 Filing',booking_code:'GST-TEST',status:'SUBMITTED',updated_at:100};
const assignmentWrites=[];
let policyActive=1,conflict=false;
const assignmentDb={
 prepare(sql){return {bind(...params){return {
  sql,params,
  first:async()=>{
   if(sql.startsWith('SELECT * FROM firm_service_orders WHERE id'))return sampleBooking;
   if(sql.includes('SELECT a.uid,a.email FROM portal_accounts'))return {uid:'firm-active',email:'firm@example.test'};
   if(sql.includes('SELECT active FROM account_policy'))return {active:policyActive};
   throw Error('Unexpected assignment read: '+sql);
  },
  run:async()=>{assignmentWrites.push({sql,params});return {meta:{changes:1}};}
 };}};},
 batch:async queries=>{assignmentWrites.push(...queries);return queries.map((_,index)=>({meta:{changes:conflict&&index===0?0:1}}));}
};
const liveClients=new Map([['firm-active',{uid:'firm-active',email:'firm@example.test',disabled:false}],['client-sample',{uid:'client-sample',email:'client@example.test',disabled:false}]]);
const liveFor=async ids=>new Map([...liveClients].filter(([key])=>ids.includes(key)));
const assign=(actor=admin,liveAccounts=liveFor)=>workflow({db:assignmentDb,u:actor,firm:false,admin:actor===admin,liveAccounts,b:{action:'workflowAssign',orderId:sampleBooking.id,firmUid:'firm-active'}});
let assignment=await assign();
assert.equal(assignment.status,200,'Admin can assign a fresh booking');
let assignmentResult=await assignment.json();
assert.equal(assignmentResult.clientAssigned,true,'Assignment also updates the customer-firm relationship');
assert.equal(assignmentResult.status,'UNDER_REVIEW','New booking enters review after firm assignment');
assert.ok(assignmentWrites.some(x=>x.sql.includes('UPDATE firm_service_orders SET firm_uid')),'Booking firm is persisted');
assert.ok(assignmentWrites.some(x=>x.sql.includes('INSERT INTO staff_assignments')),'Firm assigned to client in Firm Panel');
assert.ok(assignmentWrites.some(x=>x.sql.includes('INSERT INTO workflow_audit')),'Audit event exists');
assert.equal(assignmentWrites.filter(x=>x.sql.includes('INSERT INTO workflow_notifications')).length,2,'Firm and client notified');
assignment=await assign({localId:'client-sample'});
assert.equal(assignment.status,403,'Client cannot assign a firm');
const countBefore=assignmentWrites.length;
assignment=await assign(admin,async ids=>new Map([['firm-active',liveClients.get('firm-active')]]));
assert.equal(assignment.status,409,'Deleted client must never be reassigned');
assert.equal(assignmentWrites.length,countBefore,'Deleted client denial causes no database writes');
policyActive=0;
assignment=await assign();
assert.equal(assignment.status,409,'Inactive client must not be assigned');
policyActive=1;
conflict=true;
assignment=await assign();
assert.equal(assignment.status,409,'Concurrent booking changes are rejected');
conflict=false;
console.log('[admin booking assignment] success, role protection, stale user, inactive user, concurrency checks passed');

// UI regression: the live-booking table must appear under the correct admin nav item.
import {readFileSync} from 'node:fs';
const adminUi=readFileSync(new URL('../landing/admin.js',import.meta.url),'utf8');
const bookingUi=readFileSync(new URL('../landing/workflow-widgets.js',import.meta.url),'utf8');
assert.match(adminUi,/name==='Filing & Task Management'\)\{/,'Bookings mounted in Filing & Task Management');
assert.match(adminUi,/renderAdminWorkflow\(bookingPanel/,'Live bookings rendered from backend, not manual records');
assert.match(bookingUi,/\['Booking ID','Customer','Email','Service'/,'Booking table includes client identity');
assert.match(bookingUi,/btn\(o\.firm_uid===o\.client_uid\?'Assign Firm':'Reassign Firm'/,'Admin table has direct assignment action');
assert.match(bookingUi,/action:'workflowAssign',orderId:order\.id,firmUid:picker\.value/,'Row assignment calls the server-side endpoint');
console.log('[admin booking UI] menu placement, table and row assignment actions passed');
