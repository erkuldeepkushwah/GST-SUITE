const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const ADMIN='iNoxSD4NGrNXsghUXgxhyqyd9N03';
const sections=['Assigned Clients','My Tasks','Service Management','Document Review','Filing & Updates','Invoices & Payments','Client Support','Notifications'];
async function identity(request,env){
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];if(!token)return null;
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!r.ok)return null;const u=(await r.json()).users?.[0];if(!u?.localId||!u.email||u.disabled)return null;
 try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');u.authTime=JSON.parse(atob(p.padEnd(Math.ceil(p.length/4)*4,'='))).auth_time;}catch{return null;}return u;
}
async function otpVerified(request,env,u){
 const required=env.GST_OTP_MODE==='required'||(env.GST_OTP_MODE==='test'&&u.email.toLowerCase()===String(env.GST_OTP_TEST_EMAIL||'').toLowerCase());if(!required)return true;
 const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)gst_otp=([a-f0-9]{64})(?:;|$)/)?.[1];if(!cookie||!env.RESEND_API_KEY)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RESEND_API_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);const hash=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('gst-auth-v1:'+cookie))),x=>x.toString(16).padStart(2,'0')).join('');
 return !!await env.GST_AUTH_DB.prepare('SELECT uid FROM otp_sessions WHERE digest=? AND uid=? AND auth_time=? AND expires>?').bind(hash,u.localId,u.authTime,Date.now()).first();
}
export async function onRequestPost({request,env}){
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
 if(!env.GST_AUTH_DB||!env.FIREBASE_WEB_API_KEY)return json({error:'Role service unavailable'},503);
 try{
 const u=await identity(request,env);if(!u)return json({error:'Authentication required'},401);
 const db=env.GST_AUTH_DB;const b=await request.json();const email=u.email.toLowerCase();const admin=u.localId===ADMIN&&email==='kuldeep@gmail.com';
 if(b.action==='identify'){
 await db.prepare('INSERT INTO portal_accounts(uid,email,name,verified,seen_at) VALUES(?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,name=excluded.name,verified=excluded.verified,seen_at=excluded.seen_at').bind(u.localId,email,String(u.displayName||email).slice(0,150),u.emailVerified?1:0,Date.now()).run();
 const row=await db.prepare('SELECT role FROM staff_roles WHERE uid=? AND email=?').bind(u.localId,email).first();
 return json({role:admin?'admin':row?'staff':'customer',staffRole:row?.role||null,name:u.displayName||email});
 }
 if(['assign','revoke','listRoles','assignWork','listWork','removeWork'].includes(b.action)){
 if(!admin)return json({error:'Admin required'},403);
 if(b.action==='listRoles')return json({rows:(await db.prepare('SELECT uid,email,role,assigned_at FROM staff_roles ORDER BY assigned_at DESC LIMIT 500').all()).results});
 if(b.action==='assign'){
 const target=String(b.email||'').trim().toLowerCase();const role=String(b.role||'Staff');if(!['Staff','Tax Associate','Accountant','Support Executive','Filing Executive'].includes(role))return json({error:'Invalid staff role'},400);
 const rows=(await db.prepare('SELECT uid,email FROM portal_accounts WHERE email=? LIMIT 2').bind(target).all()).results;
 if(rows.length!==1||rows[0].uid===ADMIN||target==='kuldeep@gmail.com')return json({error:'Registered account not found or ambiguous. Ask the user to sign in once.'},400);
 await db.prepare('INSERT INTO staff_roles(uid,email,role,assigned_at) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET email=excluded.email,role=excluded.role,assigned_at=excluded.assigned_at').bind(rows[0].uid,target,role,Date.now()).run();return json({saved:true});
 }
 if(b.action==='revoke'){await db.prepare('DELETE FROM staff_roles WHERE uid=?').bind(String(b.uid||'')).run();return json({saved:true});}
 if(b.action==='listWork')return json({rows:(await db.prepare('SELECT w.*,r.email FROM staff_assignments w LEFT JOIN staff_roles r ON r.uid=w.staff_uid ORDER BY w.updated DESC LIMIT 500').all()).results});
 if(b.action==='removeWork'){await db.prepare('DELETE FROM staff_assignments WHERE id=?').bind(String(b.id||'')).run();return json({saved:true});}
 const uid=String(b.uid||''),section=String(b.section||''),title=String(b.title||'').trim(),reference=String(b.reference||'').trim(),notes=String(b.notes||'').trim();if(!sections.includes(section)||!title||title.length>150||reference.length>250||notes.length>2000||!await db.prepare('SELECT uid FROM staff_roles WHERE uid=?').bind(uid).first())return json({error:'Invalid assignment'},400);
 await db.prepare('INSERT INTO staff_assignments(id,staff_uid,section,title,reference,status,notes,updated) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),uid,section,title,reference,'Pending',notes,Date.now()).run();return json({saved:true});
 }
 const staff=await db.prepare('SELECT role FROM staff_roles WHERE uid=? AND email=?').bind(u.localId,email).first();if(!staff||admin)return json({error:'Staff access required'},403);
 if(!await otpVerified(request,env,u))return json({error:'Login OTP required'},403);
 if(b.action==='staffData')return json({name:u.displayName||email,email,role:staff.role,rows:(await db.prepare('SELECT id,section,title,reference,status,notes,updated FROM staff_assignments WHERE staff_uid=? ORDER BY updated DESC LIMIT 500').bind(u.localId).all()).results});
 if(b.action==='staffUpdate'){
 const status=String(b.status||'');if(!['Pending','In Progress','Completed'].includes(status))return json({error:'Invalid status'},400);
 const q=await db.prepare("UPDATE staff_assignments SET status=?,updated=? WHERE id=? AND staff_uid=? AND section IN ('My Tasks','Document Review','Filing & Updates','Client Support')").bind(status,Date.now(),String(b.id||''),u.localId).run();return q.meta.changes?json({saved:true}):json({error:'Assignment unavailable'},404);
 }
 return json({error:'Invalid action'},400);
 }catch{return json({error:'Role service unavailable'},503);}
}