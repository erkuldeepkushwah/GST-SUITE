import {workspace} from '../lib/firm-workspace.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const ADMIN='7arK2z41nhTMyjwasmXKCWR0uw93';
const sections=['Assigned Clients','My Tasks','Service Management','Document Review','Filing & Updates','Invoices & Payments','Client Support','Notifications'];
async function policy(db,uid){return await db.prepare('SELECT active,otp FROM account_policy WHERE uid=?').bind(uid).first();}
function otpDefault(env,email){return env.GST_OTP_MODE==='required'||(env.GST_OTP_MODE==='test'&&email===String(env.GST_OTP_TEST_EMAIL||'').toLowerCase());}
async function identity(request,env){
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];if(!token)return null;
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!r.ok)return null;const u=(await r.json()).users?.[0];if(!u?.localId||!u.email||u.disabled)return null;
 try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');u.authTime=JSON.parse(atob(p.padEnd(Math.ceil(p.length/4)*4,'='))).auth_time;}catch{return null;}return u;
}
async function otpVerified(request,env,u){
 const p=await policy(env.GST_AUTH_DB,u.localId);const required=p?.otp==null?otpDefault(env,u.email.toLowerCase()):!!p.otp;if(!required)return true;
 const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)gst_otp=([a-f0-9]{64})(?:;|$)/)?.[1];if(!cookie||!env.RESEND_API_KEY)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RESEND_API_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('gst-auth-v1:'+cookie))),x=>x.toString(16).padStart(2,'0')).join('');
 return !!await env.GST_AUTH_DB.prepare('SELECT uid FROM otp_sessions WHERE digest=? AND uid=? AND auth_time=? AND expires>?').bind(hash,u.localId,u.authTime,Date.now()).first();
}

const firmSql="SELECT uid,email FROM staff_roles UNION SELECT a.uid,a.email FROM portal_accounts a JOIN customer_profiles p ON p.uid=a.uid WHERE p.account_type='professional'";
async function isFirm(db,uid,email){return !!await db.prepare("SELECT uid FROM ("+firmSql+") WHERE uid=? AND email=?").bind(uid,email).first();}
// Cache only the short-lived server OAuth credential, never user identity or directory data.
let directoryCredential=null;
async function firebaseDirectory(env,email,pageToken){
 if(!env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON)throw Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not configured');
 const sa=JSON.parse(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
 if(sa.project_id!=='paypoint-e14c9'||!sa.client_email||!sa.private_key)throw Error('Firebase service account must belong to paypoint-e14c9');
 let access=directoryCredential?.config===env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON&&directoryCredential.expiresAt>Date.now()?directoryCredential.access:null;
 if(!access){
 const enc=new TextEncoder(),b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const now=Math.floor(Date.now()/1000),url='https://oauth2.googleapis.com/token';
 const unsigned=b64(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+b64(enc.encode(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/identitytoolkit',aud:url,iat:now,exp:now+300})));
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const assertion=unsigned+'.'+b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(unsigned))));
 const t=await fetch(url,{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!t.ok)throw Error('Firebase service account authentication failed');const token=await t.json();access=token.access_token;
 if(typeof access!=='string'||!access)throw Error('Firebase service account authentication failed');
 const expiresIn=Number(token.expires_in);if(Number.isFinite(expiresIn)&&expiresIn>60)directoryCredential={config:env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON,access,expiresAt:Math.min(Date.now()+300000,now*1000+(expiresIn-60)*1000)};
 }
 const base='https://identitytoolkit.googleapis.com/v1/projects/'+encodeURIComponent(sa.project_id);
 const headers={Authorization:'Bearer '+access,'Content-Type':'application/json'};
 const response=email?await fetch(base+'/accounts:lookup',{method:'POST',headers,body:JSON.stringify({email:[email]})}):await fetch(base+'/accounts:batchGet?'+new URLSearchParams({maxResults:'1000',...(pageToken?{nextPageToken:pageToken}:{})}),{headers});
 if(response.status===401||response.status===403){if(directoryCredential?.access===access)directoryCredential=null;}
 if(!response.ok)throw Error('Firebase directory request failed ('+response.status+'). Check Identity Toolkit API and Firebase Authentication Viewer permission.');
 const result=await response.json();return {users:(result.users||[]).filter(u=>u.localId&&u.email).map(u=>({uid:u.localId,email:u.email.toLowerCase(),name:u.displayName||'',phone:u.phoneNumber||'',verified:!!u.emailVerified,disabled:!!u.disabled,createdAt:u.createdAt||null,lastLoginAt:u.lastLoginAt||null})),nextPageToken:result.nextPageToken||null};
}

export async function onRequestPost({request,env}){
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
 if(!env.GST_AUTH_DB||!env.FIREBASE_WEB_API_KEY)return json({error:'Role service unavailable'},503);
 try{
 const u=await identity(request,env);if(!u)return json({error:'Authentication required'},401);
 const db=env.GST_AUTH_DB;const b=await request.json();const email=u.email.toLowerCase();const admin=u.localId===ADMIN&&email==='kuldeep@gmail.com';
 if(!admin&&(await policy(db,u.localId))?.active===0)return json({error:'Account inactive. Contact administrator.'},403);
 if(b.action==='registerProfile'){
 if(admin||await db.prepare('SELECT uid FROM staff_roles WHERE uid=?').bind(u.localId).first())return json({error:'Customer account required'},403);
 const p=b.profile||{},type=p.accountType,name=String(p.name||'').trim(),mobile=String(p.mobile||''),business=String(p.businessName||'').trim(),gstin=String(p.gstin||'').trim().toUpperCase(),profession=String(p.profession||''),firm=String(p.firmName||'').trim();
 const errors={};if(!['business','professional'].includes(type))errors.accountType='Select account type.';if(name.length<2||name.length>100)errors.name='Enter your full name.';if(!/^[6-9]\d{9}$/.test(mobile))errors.mobile='Enter a valid 10-digit mobile number.';
 if(type==='business'){if(!business||business.length>150)errors.businessName='Enter business name.';if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin))errors.gstin='Enter a valid 15-character GSTIN.';}
 if(type==='professional'){if(!['CA','CS','Advocate'].includes(profession))errors.profession='Select profession.';if(firm.length>150)errors.firmName='Maximum 150 characters.';}
 if(Object.keys(errors).length)return json({error:'Check registration fields.',errors},400);
 await db.prepare('INSERT INTO customer_profiles(uid,account_type,name,mobile,business_name,gstin,profession,firm_name,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(uid) DO NOTHING').bind(u.localId,type,name,mobile,type==='business'?business:null,type==='business'?gstin:null,type==='professional'?profession:null,type==='professional'?firm:null,Date.now()).run();return json({saved:true});
 }
 if(b.action==='identify'){
 await db.prepare('INSERT INTO portal_accounts(uid,email,name,verified,seen_at) VALUES(?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,name=excluded.name,verified=excluded.verified,seen_at=excluded.seen_at').bind(u.localId,email,String(u.displayName||email).slice(0,150),u.emailVerified?1:0,Date.now()).run();
 if(!admin&&u.emailVerified)await db.prepare('UPDATE mobile_accounts SET email=? WHERE uid=? AND email<>?').bind(email,u.localId,email).run();
 const row=await db.prepare('SELECT role FROM staff_roles WHERE uid=? AND email=?').bind(u.localId,email).first();
 const profile=!admin?await db.prepare('SELECT account_type,name,mobile,business_name,gstin,profession,firm_name FROM customer_profiles WHERE uid=?').bind(u.localId).first():null;return json({role:admin?'admin':row||profile?.account_type==='professional'?'firm':'customer',name:u.displayName||email,accountType:row?'professional':profile?.account_type||'legacy',profile});
 }
 if(['clientFirms','assignClient','assignClientByContact','unassignClient','accountPolicy','directory','adminAccountDetails'].includes(b.action)){
 if(!admin)return json({error:'Admin required'},403);
 if(b.action==='adminAccountDetails'){
 const target=String(b.uid||'').trim(),mail=String(b.email||'').trim().toLowerCase();
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(target)||target===ADMIN||!mail||mail.length>254)return json({error:'Invalid account'},400);
 const directory=await firebaseDirectory(env,mail,null);const account=directory.users.find(x=>x.uid===target&&x.email===mail);
 if(!account)return json({error:'Registered account not found'},404);
 const profile=await db.prepare('SELECT account_type,name,mobile,business_name,gstin,profession,firm_name,created_at FROM customer_profiles WHERE uid=?').bind(target).first();
 const mobile=await db.prepare('SELECT mobile FROM mobile_accounts WHERE uid=?').bind(target).first();
 const role=(await isFirm(db,target,mail)||profile?.account_type==='professional')?'Firm':'Customer';
 const p=await policy(db,target);
 const rows=async(sql,...params)=>(await db.prepare(sql).bind(...params).all()).results;
 const assignedFirm=role==='Customer'?await db.prepare("SELECT w.staff_uid AS uid,COALESCE(NULLIF(c.firm_name,''),NULLIF(c.name,''),a.name) AS name,COALESCE(a.email,s.email) AS email, c.mobile FROM staff_assignments w LEFT JOIN customer_profiles c ON c.uid=w.staff_uid LEFT JOIN portal_accounts a ON a.uid=w.staff_uid LEFT JOIN staff_roles s ON s.uid=w.staff_uid WHERE w.id='client:'||? AND w.section='Assigned Clients'").bind(target).first():null;
 const clients=role==='Firm'?await rows("SELECT substr(w.id,8) AS uid,COALESCE(NULLIF(c.name,''),NULLIF(a.name,''),w.title) AS name,COALESCE(NULLIF(c.mobile,''),m.mobile) AS mobile,COALESCE(NULLIF(a.email,''),m.email,w.reference) AS email,c.business_name,c.gstin,w.status FROM staff_assignments w LEFT JOIN customer_profiles c ON c.uid=substr(w.id,8) LEFT JOIN portal_accounts a ON a.uid=substr(w.id,8) LEFT JOIN mobile_accounts m ON m.uid=substr(w.id,8) WHERE w.staff_uid=? AND w.section='Assigned Clients' AND w.id LIKE 'client:%' ORDER BY w.title LIMIT 500",target):[];
 const orders=role==='Firm'?await rows("SELECT o.id,o.client_name,o.service,o.period,o.due_date,o.due_date_source,o.status,o.created_at,CASE WHEN o.firm_uid=o.client_uid THEN 'Business' ELSE 'Firm' END AS booked_by FROM firm_service_orders o WHERE o.firm_uid=? OR (o.firm_uid=o.client_uid AND EXISTS(SELECT 1 FROM staff_assignments w WHERE w.id='client:'||o.client_uid AND w.staff_uid=? AND w.section='Assigned Clients')) ORDER BY o.created_at DESC LIMIT 500",target,target):await rows("SELECT id,client_name,service,period,due_date,due_date_source,status,created_at,CASE WHEN firm_uid=client_uid THEN 'Business' ELSE 'Firm' END AS booked_by FROM firm_service_orders WHERE client_uid=? ORDER BY created_at DESC LIMIT 500",target);
 const billing=await rows("SELECT id,kind,title,amount_paise,status,created_at FROM firm_billing WHERE firm_uid=? ORDER BY created_at DESC LIMIT 500",target);
 return json({profile:{uid:target,role,name:profile?.name||account.name,email:account.email,mobile:profile?.mobile||mobile?.mobile||account.phone,business_name:profile?.business_name||null,gstin:profile?.gstin||null,firm_name:profile?.firm_name||null,profession:profile?.profession||null,created_at:profile?.created_at||Number(account.createdAt)||null,last_login:Number(account.lastLoginAt)||null,active:!account.disabled&&p?.active!==0,verified:account.verified,otp:p?.otp==null?otpDefault(env,mail):!!p.otp},assignedFirm,clients,orders,billing});
 }
 if(b.action==='clientFirms'){
 const rows=(await db.prepare("SELECT r.uid,r.email,'Firm' AS role FROM ("+firmSql+") r LEFT JOIN account_policy p ON p.uid=r.uid WHERE COALESCE(p.active,1)=1 ORDER BY r.email").all()).results;
 return json({rows});
 }
 if(b.action==='assignClient'||b.action==='assignClientByContact'){
 let uid=String(b.uid||''),mail=String(b.email||'').trim().toLowerCase();const firmUid=String(b.firmUid||'');
 if(!firmUid||firmUid===ADMIN)return json({error:'Invalid firm'},400);
 const sr=await db.prepare('SELECT uid,email FROM ('+firmSql+') WHERE uid=?').bind(firmUid).first();
 if(!sr||(await policy(db,firmUid))?.active===0)return json({error:'Select an active firm'},400);
 if(b.action==='assignClientByContact'){
 const contact=String(b.contact||'').trim().toLowerCase();
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)&&contact.length<=254){mail=contact;const d=await firebaseDirectory(env,mail,null);const matches=d.users.filter(x=>x.email===mail&&!x.disabled);if(matches.length!==1)return json({error:'Active registered client not found'},404);uid=matches[0].uid;}
 else{
 const mobile=contact.replace(/[\s()-]/g,'').replace(/^\+91/,'');
 if(!/^[6-9]\d{9}$/.test(mobile))return json({error:'Enter a registered email or valid 10-digit mobile number'},400);
 const found=(await db.prepare("SELECT p.uid,a.email FROM customer_profiles p LEFT JOIN portal_accounts a ON a.uid=p.uid WHERE p.mobile=? AND p.account_type='business' UNION SELECT uid,email FROM mobile_accounts WHERE mobile=?").bind(mobile,mobile).all()).results;
 const distinct=[...new Set(found.map(x=>x.uid))];if(distinct.length!==1)return json({error:distinct.length?'Multiple accounts match this number. Use the registered email.':'No registered client found for this mobile number. Use the registered email.'},distinct.length?409:404);
 uid=distinct[0];const account=found.find(x=>x.uid===uid&&x.email);if(!account)return json({error:'Client profile not linked to an email yet. Use the registered email.'},404);mail=account.email.toLowerCase();
 }
 }
 if(!uid||!mail||uid===firmUid||uid===ADMIN||(await policy(db,uid))?.active===0||await isFirm(db,uid,mail))return json({error:'Select an active client, not a firm or admin'},400);
 const [c,d]=await Promise.all([firebaseDirectory(env,mail,null),firebaseDirectory(env,sr.email,null)]);
 const client=c.users.find(x=>x.uid===uid&&x.email===mail&&!x.disabled);
 if(!client||!d.users.some(x=>x.uid===firmUid&&x.email===sr.email&&!x.disabled))return json({error:'Active Firebase account not found'},400);
 const id='client:'+uid;
 if(b.action==='assignClientByContact'){
 const previous=await db.prepare("SELECT staff_uid FROM staff_assignments WHERE id=? AND section='Assigned Clients'").bind(id).first();
 if(previous&&previous.staff_uid!==firmUid&&b.confirmReassign!==true)return json({error:'Client is already assigned to another firm. Confirm reassignment.',requiresReassign:true,clientEmail:mail},409);
 }
 await db.prepare("INSERT INTO staff_assignments(id,staff_uid,section,title,reference,status,notes,updated) VALUES(?,?,'Assigned Clients',?,?,'Assigned','',?) ON CONFLICT(id) DO UPDATE SET staff_uid=excluded.staff_uid,title=excluded.title,reference=excluded.reference,updated=excluded.updated").bind(id,firmUid,client.name||client.email,client.email,Date.now()).run();
 return json({saved:true,firmEmail:sr.email,clientEmail:client.email,clientName:client.name||client.email});
 }
 if(b.action==='unassignClient'){
 const uid=String(b.uid||'');if(!uid||uid===ADMIN)return json({error:'Invalid client'},400);
 await db.prepare("DELETE FROM staff_assignments WHERE id=? AND section='Assigned Clients'").bind('client:'+uid).run();return json({saved:true});
 }
 if(b.action==='accountPolicy'){
 const target=String(b.uid||''),mail=String(b.email||'').trim().toLowerCase();
 if(!target||target===ADMIN||mail==='kuldeep@gmail.com'||!['active','otp'].includes(b.field)||typeof b.value!=='boolean')return json({error:'Invalid account setting'},400);
 const d=await firebaseDirectory(env,mail,null);if(!d.users.some(x=>x.uid===target&&x.email===mail))return json({error:'Account not found'},404);
 const field=b.field;await db.batch([db.prepare('INSERT INTO account_policy(uid,active,otp) VALUES(?,1,NULL) ON CONFLICT(uid) DO NOTHING').bind(target),db.prepare('UPDATE account_policy SET '+field+'=? WHERE uid=?').bind(b.value?1:0,target),db.prepare('DELETE FROM otp_sessions WHERE uid=?').bind(target),db.prepare('UPDATE otp_challenges SET consumed=1 WHERE uid=?').bind(target)]);
 return json({saved:true});
 }
 if(b.action==='directory'){
 try{const [d,rolesResult,clientsResult,policyResult]=await Promise.all([firebaseDirectory(env,b.email?String(b.email).trim().toLowerCase():null,b.pageToken?String(b.pageToken):null),db.prepare(firmSql).all(),db.prepare("SELECT w.id,r.email FROM staff_assignments w JOIN ("+firmSql+") r ON r.uid=w.staff_uid WHERE w.section='Assigned Clients' AND w.id LIKE 'client:%'").all(),db.prepare('SELECT * FROM account_policy').all()]);const map=new Map(rolesResult.results.map(r=>[r.uid,r]));const clients=new Map(clientsResult.results.map(x=>[x.id.slice(7),x.email]));const policies=new Map(policyResult.results.map(p=>[p.uid,p]));return json({source:'Firebase Authentication',rows:d.users.filter(x=>x.uid!==ADMIN).map(x=>({...x,assignedFirm:clients.get(x.uid)||null,active:!x.disabled&&policies.get(x.uid)?.active!==0,otp:policies.get(x.uid)?.otp==null?otpDefault(env,x.email):!!policies.get(x.uid).otp,role:map.get(x.uid)?.email===x.email?'Firm':'Customer'})),nextPageToken:d.nextPageToken});}catch(e){return json({error:e.message},503);}
 }
 return json({error:'Invalid admin action'},400);
 }
 if(String(b.action||'').startsWith('workspace')){
 const firm=!admin&&await isFirm(db,u.localId,email);
 if(!admin&&!await otpVerified(request,env,u))return json({error:'Login OTP required'},403);
 return await workspace({db,b,u,firm,admin});
 }
 if(admin||!await isFirm(db,u.localId,email))return json({error:'Firm access required'},403);
 if(!await otpVerified(request,env,u))return json({error:'Login OTP required'},403);
 if(b.action==='firmCompanies'){
 const pageToken=String(b.pageToken||'');if(pageToken.length>4096)return json({error:'Invalid page token'},400);
 const d=await firebaseDirectory(env,null,pageToken||null);
 const ids=JSON.stringify(d.users.map(x=>x.uid));
 const q=(await db.prepare("SELECT j.value AS uid,p.account_type,p.name,p.business_name,CASE WHEN f.uid IS NOT NULL THEN 1 ELSE 0 END AS legacy_firm,a.active,w.staff_uid AS assigned_uid FROM json_each(?) j LEFT JOIN customer_profiles p ON p.uid=j.value LEFT JOIN staff_roles f ON f.uid=j.value LEFT JOIN account_policy a ON a.uid=j.value LEFT JOIN staff_assignments w ON w.id='client:'||j.value AND w.section='Assigned Clients'").bind(ids).all()).results;
 const profiles=new Map(q.map(x=>[x.uid,x]));
 const safeName=(value)=>{const name=String(value||'').trim();return name&&!name.includes('@')&&!/^\+?[\d\s()-]{7,}$/.test(name)?name.slice(0,150):'';};
 const rows=d.users.filter(x=>x.uid!==ADMIN&&x.uid!==u.localId&&profiles.get(x.uid)?.account_type!=='professional'&&!profiles.get(x.uid)?.legacy_firm).map(x=>{
 const p=profiles.get(x.uid)||{};const own=p.assigned_uid===u.localId;
 return {companyName:safeName(p.business_name)||'—',clientName:safeName(p.name)||safeName(x.name)||'Registered client',accountStatus:x.disabled||p.active===0?'Inactive':'Active',assignmentStatus:own?'Assigned to your firm':p.assigned_uid?'Assigned elsewhere':'Unassigned',contact:own?x.email:null};
 });
 return json({rows,nextPageToken:d.nextPageToken});
 }
 if(b.action==='firmData')return json({name:u.displayName||email,email,role:'Firm',rows:(await db.prepare('SELECT id,section,title,reference,status,notes,updated FROM staff_assignments WHERE staff_uid=? ORDER BY updated DESC LIMIT 500').bind(u.localId).all()).results});
 if(b.action==='firmUpdate'){
 const status=String(b.status||'');if(!['Pending','In Progress','Completed'].includes(status))return json({error:'Invalid status'},400);
 const q=await db.prepare("UPDATE staff_assignments SET status=?,updated=? WHERE id=? AND staff_uid=? AND section IN ('My Tasks','Document Review','Filing & Updates','Client Support')").bind(status,Date.now(),String(b.id||''),u.localId).run();return q.meta.changes?json({saved:true}):json({error:'Assignment unavailable'},404);
 }
 return json({error:'Invalid action'},400);
 }catch{return json({error:'Role service unavailable'},503);}
}
export {identity,policy,otpVerified,isFirm};
