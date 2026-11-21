// Synthetic tests, no Firebase, database, network, or real user data.
import assert from 'node:assert/strict';
import {portalCachedRequest,clearPortalApiCache} from '../landing/portal-fast-cache.js';
clearPortalApiCache();
let requests=0;
const read=()=>portalCachedRequest('roles','user-A',{action:'workspaceData'},async()=>({value:++requests}));
const both=await Promise.all([read(),read(),read()]);
assert.equal(requests,1,'Concurrent requests should be merged');
assert.ok(both.every(result=>result.value===1));
assert.equal((await read()).value,1,'Fresh response should be reused');
await portalCachedRequest('roles','user-A',{action:'workflowBook'},async()=>({saved:true}));
assert.equal((await read()).value,2,'Write should invalidate cached data');
const files=()=>portalCachedRequest('roles','user-A',{action:'workspaceFiles',orderId:'test'},async()=>({value:++requests}));
await files();await files();
assert.equal(requests,4,'File list not cached (direct upload is separate)');
assert.equal((await read()).value,2,'Uncached read should not clear other cache');
const other=await portalCachedRequest('roles','user-B',{action:'workspaceData'},async()=>({value:++requests}));
assert.equal(other.value,5,'New account must fetch');
const back=await portalCachedRequest('roles','user-A',{action:'workspaceData'},async()=>({value:++requests}));
assert.equal(back.value,6,'Switching back must not use previous session cache');
clearPortalApiCache();
let failures=0;
for(let i=0;i<2;i++){
 await assert.rejects(()=>portalCachedRequest('admin','user-A',{action:'report'},async()=>{failures++;throw Error('network');}));
}
assert.equal(failures,2,'Failures must never be cached');
const previousNow=Date.now;let clock=100000;Date.now=()=>clock;
try{
 clearPortalApiCache();let count=0;
 const dashboard=()=>portalCachedRequest('admin','user-C',{action:'dashboard'},async()=>({value:++count}));
 assert.equal((await dashboard()).value,1);
 clock+=5001;
 assert.equal((await dashboard()).value,2,'Expired read must revalidate');
}finally{Date.now=previousNow;clearPortalApiCache();}
console.log('[portal performance] cache, concurrent request dedup, expiry, write invalidation and account isolation passed');
