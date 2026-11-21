import {sendPortalEmail} from '../lib/portal-email.js';
// Email OTP pilot. D1 enforces one-time codes, expiry and attempt limits.
const reply=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const normalize=v=>String(v||'').replace(/^\+91/,'').replace(/\s/g,'');
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function digest(env,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RESEND_API_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('gst-auth-v1:'+value)));}
async function userFor(req,env){
 const token=req.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
 if(!token)return null;
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!r.ok)return null;
 const u=(await r.json()).users?.[0];if(!u?.localId||!u.email||u.disabled)return null;
 try{const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');u.authTime=JSON.parse(atob(p.padEnd(Math.ceil(p.length/4)*4,'='))).auth_time;}catch{return null;}
 return u;
}
const required=(env,u)=>env.GST_OTP_MODE==='required'||(env.GST_OTP_MODE==='test'&&u.email.toLowerCase()===String(env.GST_OTP_TEST_EMAIL||'').toLowerCase());
export async function onRequestPost({request,env}){
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'Invalid origin'},403);
 const db=env.GST_AUTH_DB;if(!db||!env.RESEND_API_KEY||!env.FIREBASE_WEB_API_KEY)return reply({error:'Authentication service unavailable'},503);
 try{
 const body=await request.json();const action=body.action;const now=Date.now();
 if(action==='resolve'){
 // Do not expose a registered email to anonymous callers. Verify password at Firebase first.
 const mobile=normalize(body.mobile);if(!/^[6-9]\d{9}$/.test(mobile)||typeof body.password!=='string'||body.password.length>4096)return reply({error:'Invalid credentials'},401);
 const matches=(await db.prepare("SELECT uid,email FROM mobile_accounts WHERE mobile=? UNION SELECT c.uid,a.email FROM customer_profiles c JOIN portal_accounts a ON a.uid=c.uid WHERE c.mobile=?").bind(mobile,mobile).all()).results;
 const distinct=[...new Set(matches.map(x=>x.uid))];
 if(distinct.length!==1)return reply({error:'Unable to sign in with this mobile number. Use your registered email and password.'},401);
 const candidate=matches.find(x=>x.uid===distinct[0]&&x.email);
 if(!candidate)return reply({error:'Invalid credentials'},401);
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:candidate.email,password:body.password,returnSecureToken:true})});
 if(!r.ok)return reply({error:'Invalid credentials'},401);
 const verified=await r.json();
 if(verified.localId!==candidate.uid)return reply({error:'Invalid credentials'},401);
 const p=await db.prepare('SELECT active FROM account_policy WHERE uid=?').bind(candidate.uid).first();if(p?.active===0)return reply({error:'Invalid credentials'},401);
 return reply({email:verified.email||candidate.email});
 }
 const u=await userFor(request,env);if(!u)return reply({error:'Authentication required'},401);
 if(action==='logout'){
 const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)gst_otp=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(cookie)await db.prepare('DELETE FROM otp_sessions WHERE digest=? AND uid=?').bind(await digest(env,cookie),u.localId).run();
 return reply({loggedOut:true},200,{'Set-Cookie':'gst_otp=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'});
 }
 const policy=await db.prepare('SELECT active,otp FROM account_policy WHERE uid=?').bind(u.localId).first();if(policy?.active===0)return reply({error:'Account inactive. Contact administrator.'},403);
 const needsOtp=policy?.otp==null?required(env,u):!!policy.otp;
 if(action==='register'){
 const n=normalize(body.mobile);if(!/^[6-9]\d{9}$/.test(n))return reply({error:'Enter a valid 10-digit mobile number'},400);
 // Pilot only: prevent existing users claiming arbitrary numbers outside the test cohort.
 if(!needsOtp)return reply({registered:false});
 if(!u.emailVerified)return reply({error:'Verify your email before registering a mobile number'},403);
 await db.prepare('INSERT OR IGNORE INTO mobile_accounts(mobile,uid,email) VALUES(?,?,?)').bind(n,u.localId,u.email).run();
 const row=await db.prepare('SELECT uid,mobile FROM mobile_accounts WHERE uid=?').bind(u.localId).first();
 if(row?.mobile!==n)return reply({error:'Mobile number unavailable or already registered'},409);
 return reply({registered:true});
 }
 if(!needsOtp)return reply({required:false,verified:true});
 if(['send','verify'].includes(action)&&(!Number.isFinite(u.authTime)||now-u.authTime*1000>15*60*1000))return reply({error:'Please sign in again'},403);
 if(action==='status'){
 const cookie=request.headers.get('Cookie')?.match(/(?:^|;\s*)gst_otp=([a-f0-9]{64})(?:;|$)/)?.[1];
 const row=cookie?await db.prepare('SELECT uid,expires FROM otp_sessions WHERE digest=? AND uid=? AND auth_time=? AND expires>?').bind(await digest(env,cookie),u.localId,u.authTime,now).first():null;
 return reply({required:true,verified:!!row,expiresAt:row?.expires||null});
 }
 if(action==='send'){
 if(!Number.isFinite(u.authTime)||now-u.authTime*1000>15*60*1000)return reply({error:'Please sign in again'},403);
 const id=crypto.randomUUID();const a=new Uint32Array(1);do{crypto.getRandomValues(a);}while(a[0]>=4294000000);const code=String(a[0]%1000000).padStart(6,'0');
 const h=await digest(env,id+':'+u.localId+':'+code);
 const inserted=await db.prepare('INSERT INTO otp_challenges(id,uid,digest,expires,attempts,sent_at,consumed) SELECT ?,?,?,?,0,?,0 WHERE NOT EXISTS(SELECT 1 FROM otp_challenges WHERE uid=? AND sent_at>?) AND (SELECT COUNT(*) FROM otp_challenges WHERE uid=? AND sent_at>?)<5').bind(id,u.localId,h,now+300000,now,u.localId,now-30000,u.localId,now-900000).run();
 if(!inserted.meta.changes)return reply({error:'Please wait before requesting another OTP'},429);
 await db.prepare('UPDATE otp_challenges SET consumed=1 WHERE uid=? AND id<>? AND sent_at<=?').bind(u.localId,id,now).run();
 const firstName=String(u.displayName||'Customer').trim().split(/\s+/)[0]||'Customer';
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=['Hi '+firstName+',','','Welcome to Fingenuity Associates!','','Please use the following OTP to complete your login process.','','OTP: '+code,'','This OTP is valid for 5 minutes. Please do not share it with anyone.','','Regards,','Team Fingenuity Associates'].join('\n');
 const html='<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#17243b;max-width:600px;margin:auto;padding:24px"><p>Hi '+esc(firstName)+',</p><p>Welcome to <strong>Fingenuity Associates!</strong></p><p>Please use the following OTP to complete your login process.</p><p><strong>OTP: '+esc(code)+'</strong></p><p>This OTP is valid for 5 minutes. Please do not share it with anyone.</p><p>Regards,<br><strong>Team Fingenuity Associates</strong></p></div>';
 const sent=await sendPortalEmail(env,{to:u.email,subject:'OTP Verification',text,html,id:'gst-otp-'+id});
 if(!sent.ok){await db.prepare('UPDATE otp_challenges SET consumed=1 WHERE id=?').bind(id).run();return reply({error:'OTP email could not be sent',code:sent.code||'EMAIL_PROVIDER_ERROR'},502);}
 return reply({required:true,challenge:id,masked:u.email.slice(0,2)+'***@'+u.email.split('@')[1]});
 }
 if(action==='verify'){
 const id=String(body.challenge||'');const code=String(body.code||'');if(!/^\d{6}$/.test(code))return reply({error:'Enter six digits'},400);
 const hash=await digest(env,id+':'+u.localId+':'+code);
 const r=await db.prepare('UPDATE otp_challenges SET attempts=attempts+1,consumed=CASE WHEN digest=? THEN 1 ELSE consumed END WHERE id=? AND uid=? AND consumed=0 AND expires>? AND attempts<5 RETURNING consumed').bind(hash,id,u.localId,now).first();
 if(!r||r.consumed!==1)return reply({error:'Invalid or expired OTP'},400);
 const raw=hex(crypto.getRandomValues(new Uint8Array(32)));await db.prepare('INSERT INTO otp_sessions(digest,uid,auth_time,expires) VALUES(?,?,?,?)').bind(await digest(env,raw),u.localId,u.authTime,now+36000000).run();
 return reply({verified:true,expiresAt:now+36000000},200,{'Set-Cookie':'gst_otp='+raw+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=36000'});
 }
 return reply({error:'Invalid action'},400);
 }catch{return reply({error:'Authentication service unavailable'},503);}
}
