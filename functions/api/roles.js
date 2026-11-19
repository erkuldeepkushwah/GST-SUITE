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
async function firebaseDirectory(env,email,pageToken){
 if(!env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON)throw Error('FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON is not configured');
 const sa=JSON.parse(env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
 if(sa.project_id!=='paypoint-e14c9'||!sa.client_email||!sa.private_key)throw Error('Firebase service account must belong to paypoint-e14c9');
 const enc=new TextEncoder(),b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 const now=Math.floor(Date.now()/1000),url='https://oauth2.googleapis.com/token';
 const unsigned=b64(enc.encode(JSON.stringify({alg:'RS256',typ:'JWT'})))+'.'+b64(enc.encode(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/identitytoolkit',aud:url,iat:now,exp:now+300})));
 const key=await crypto.subtle.importKey('pkcs8',Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g,'')),c=>c.charCodeAt(0)),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const assertion=unsigned+'.'+b64(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,enc.encode(unsigned))));
 const t=await fetch(url,{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
 if(!t.ok)throw Error('Firebase service account authentication failed');const access=(await t.json()).access_token;
 const base='https://identitytoolkit.googleapis.com/v1/projects/'+encodeURIComponent(sa.project_id);
 const headers={Authorization:'Bearer '+access,'Content-Type':'application/json'};
 const response=email?await fetch(base+'/accounts:lookup',{method:'POST',headers,body:JSON.stringify({email:[email]})}):await fetch(base+'/accounts:batchGet?'+new URLSearchParams({maxResults:'100',...(pageToken?{nextPageToken:pageToken}:{})}),{headers});
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
 const row=await db.prepare('SELECT role FROM staff_roles WHERE uid=? AND email=?').bind(u.localId,email).first();
 const profile=!admin?await db.prepare('SELECT account_type,name,mobile,business_name,gstin,profession,firm_name FROM customer_profiles WHERE uid=?').bind(u.localId).first():null;return json({role:admin?'admin':row||profile?.account_type==='professional'?'firm':'customer',name:u.displayName||email,accountType:row?'professional':profile?.account_type||'legacy',profile});
 }
 if(['clientFirms','assignClient','unassignClient','accountPolicy','directory'].includes(b.action)){
 if(!admin)return json({error:'Admin required'},403);
 if(b.action==='clientFirms'){
 const rows=(await db.prepare("SELECT r.uid,r.email,'Firm' AS role FROM ("+firmSql+") r LEFT JOIN account_policy p ON p.uid=r.uid WHERE COALESCE(p.active,1)=1 ORDER BY r.email").all()).results;
 return json({rows});
 }
 if(b.action==='assignClient'){
 const uid=String(b.uid||''),firmUid=String(b.firmUid||''),mail=String(b.email||'').trim().toLowerCase();
 if(!uid||!firmUid||uid===firmUid||uid===ADMIN||firmUid===ADMIN)return json({error:'Invalid assignment'},400);
 const sr=await db.prepare('SELECT uid,email FROM ('+firmSql+') WHERE uid=?').bind(firmUid).first();
 if(!sr||(await policy(db,firmUid))?.active===0||(await policy(db,uid))?.active===0||await isFirm(db,uid,mail))return json({error:'Select an active client and firm'},400);
 const [c,d]=await Promise.all([firebaseDirectory(env,mail,null),firebaseDirectory(env,sr.email,null)]);
 const client=c.users.find(x=>x.uid===uid&&x.email===mail&&!x.disabled);
 if(!client||!d.users.some(x=>x.uid===firmUid&&x.email===sr.email&&!x.disabled))return json({error:'Active Firebase account not found'},400);
 const id='client:'+uid;
 await db.prepare("INSERT INTO staff_assignments(id,staff_uid,section,title,reference,status,notes,updated) VALUES(?,?,'Assigned Clients',?,?,'Assigned','',?) ON CONFLICT(id) DO UPDATE SET staff_uid=excluded.staff_uid,title=excluded.title,reference=excluded.reference,updated=excluded.updated").bind(id,firmUid,client.name||client.email,client.email,Date.now()).run();
 return json({saved:true,firmEmail:sr.email});
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
 try{const d=await firebaseDirectory(env,b.email?String(b.email).trim().toLowerCase():null,b.pageToken?String(b.pageToken):null);const roles=(await db.prepare(firmSql).all()).results;const map=new Map(roles.map(r=>[r.uid,r]));const clients=new Map((await db.prepare("SELECT w.id,r.email FROM staff_assignments w JOIN ("+firmSql+") r ON r.uid=w.staff_uid WHERE w.section='Assigned Clients' AND w.id LIKE 'client:%'").all()).results.map(x=>[x.id.slice(7),x.email]));const policies=new Map((await db.prepare('SELECT * FROM account_policy').all()).results.map(p=>[p.uid,p]));return json({source:'Firebase Authentication',rows:d.users.filter(x=>x.uid!==ADMIN).map(x=>({...x,assignedFirm:clients.get(x.uid)||null,active:!x.disabled&&policies.get(x.uid)?.active!==0,otp:policies.get(x.uid)?.otp==null?otpDefault(env,x.email):!!policies.get(x.uid).otp,role:map.get(x.uid)?.email===x.email?'Firm':'Customer'})),nextPageToken:d.nextPageToken});}catch(e){return json({error:e.message},503);}
 }
 return json({error:'Invalid admin action'},400);
 }
 if(admin||!await isFirm(db,u.localId,email))return json({error:'Firm access required'},403);
 if(!await otpVerified(request,env,u))return json({error:'Login OTP required'},403);
 if(b.action==='firmData')return json({name:u.displayName||email,email,role:'Firm',rows:(await db.prepare('SELECT id,section,title,reference,status,notes,updated FROM staff_assignments WHERE staff_uid=? ORDER BY updated DESC LIMIT 500').bind(u.localId).all()).results});
 if(b.action==='firmUpdate'){
 const status=String(b.status||'');if(!['Pending','In Progress','Completed'].includes(status))return json({error:'Invalid status'},400);
 const q=await db.prepare("UPDATE staff_assignments SET status=?,updated=? WHERE id=? AND staff_uid=? AND section IN ('My Tasks','Document Review','Filing & Updates','Client Support')").bind(status,Date.now(),String(b.id||''),u.localId).run();return q.meta.changes?json({saved:true}):json({error:'Assignment unavailable'},404);
 }
 return json({error:'Invalid action'},400);
 }catch{return json({error:'Role service unavailable'},503);}
}