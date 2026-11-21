// Regression: concurrently loaded client and firm data must preserve role scoping.
import assert from 'node:assert/strict';
import {workspace} from '../functions/lib/firm-workspace.js';
let concurrent=0,maxConcurrent=0;
const records=[
 {id:'order-active',client_uid:'client-active',firm_uid:'firm',status:'DOCUMENTS_VERIFIED'},
 {id:'order-disabled',client_uid:'client-disabled',firm_uid:'firm',status:'SUBMITTED'}
];
const clients=[{uid:'client-active',title:'Active Client',reference:'a@test.invalid'},
 {uid:'client-disabled',title:'Disabled Client',reference:'b@test.invalid'}];
function query(sql,params){
 if(sql.includes('firm_service_orders'))return records.filter(o=>sql.includes('WHERE client_uid')?o.client_uid===params[0]:o.firm_uid===params[0]);
 if(sql.includes('portal_support_tickets'))return [{id:'ticket',owner_uid:params[0]}];
 if(sql.includes('firm_billing'))return [{id:'invoice'}];
 if(sql.includes('portal_due_dates'))return [{id:'due'}];
 if(sql.includes('SELECT substr(w.id,8)'))return clients;
 return [];
}
const db={
 prepare(sql){
  return {bind(...params){
   const fetch=async(first)=>{
    concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);
    await Promise.resolve();concurrent--;
    const row=sql.includes('firm_trials')?{starts_at:1,ends_at:2,client_limit:5,tool_limit:10,launches:0}:
      sql.includes('FROM customer_profiles WHERE')?{name:'Test Account',account_type:'business'}:
      sql.includes('portal_profile_requests')?null:undefined;
    if(first)return row;
    return {results:query(sql,params)};
   };
   return {all:()=>fetch(false),first:()=>fetch(true)};
  }};
 }
};
const liveAccounts=async ids=>new Map(ids.filter(uid=>uid!=='client-disabled').map(uid=>[uid,{uid,email:uid+'@example.invalid',disabled:false}]));
const client=await workspace({db,b:{action:'workspaceData'},u:{localId:'client-active'},firm:false,admin:false,liveAccounts});
assert.equal(client.status,200);
const clientData=await client.json();
assert.deepEqual(clientData.orders.map(x=>x.id),['order-active']);
assert.equal(clientData.billing.length,1);
assert.equal(clientData.tickets.length,1);
assert.equal(clientData.dueDates.length,1);
assert.equal(clientData.profile.name,'Test Account');
assert.ok(maxConcurrent>=6,'Independent client D1 reads should run concurrently');
maxConcurrent=0;
const firm=await workspace({db,b:{action:'workspaceData'},u:{localId:'firm'},firm:true,admin:false,liveAccounts});
assert.equal(firm.status,200);
const firmData=await firm.json();
assert.deepEqual(firmData.orders.map(x=>x.id),['order-active'],'Disabled client order must not leak into firm dashboard');
assert.deepEqual(firmData.clients.map(x=>x.uid),['client-active'],'Disabled client must not appear in firm directory');
assert.equal(firmData.clientCount,1);
assert.ok(maxConcurrent>=5,'Independent firm D1 reads should run concurrently');
const denied=await workspace({db,b:{action:'workspaceData'},u:{localId:'admin'},firm:false,admin:true,liveAccounts});
assert.equal(denied.status,403,'Admin should use separate privileged admin dashboard');
console.log('[workspace data] role isolation, active-client filtering, response shape and concurrent reads passed');
