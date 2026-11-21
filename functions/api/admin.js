import {otpVerified} from './roles.js';
import {contactConfigured,listContactEnquiries,updateContactEnquiry} from '../lib/contact-enquiries.js';
// Administrative authorization is checked on the server, not by browser email alone.
const respond=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
 if(!token)return respond({error:'Authentication required'},401);
 if(!env.FIREBASE_WEB_API_KEY)return respond({error:'Admin authentication unavailable'},503);
 try{
 const r=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_WEB_API_KEY),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 if(!r.ok)return respond({error:'Invalid session'},401);
 const u=(await r.json()).users?.[0];
 if(!u||u.disabled||u.localId!=='7arK2z41nhTMyjwasmXKCWR0uw93'||u.email?.toLowerCase()!=='kuldeep@gmail.com')return respond({error:'Admin access requires the authorized Firebase account'},403);
 const db=env.GST_AUTH_DB;
 const modules=['Customers','Services & Masters','Filing & Task Management','Documents & Vault','Invoices & Payments','Notifications','Support / Queries','Settings'];
 const body=await request.text();const input=body?JSON.parse(body):{};const action=input.action||'dashboard';
 if(!db)return respond({error:'Admin database unavailable'},503);
 if(!await otpVerified(request,env,{...u,authTime:(()=>{try{const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(raw.padEnd(Math.ceil(raw.length/4)*4,'='))).auth_time;}catch{return null;}})()}))return respond({error:'Login OTP required'},403);
 if(action==='contactList'){
  if(!contactConfigured(env))return respond({error:'Contact database not configured'},503);
  try{return respond({rows:await listContactEnquiries(env)});}
  catch(e){console.warn('Admin contact query failed',{name:e?.name||'Error'});return respond({error:'Unable to load website enquiries'},503);}
 }
 if(action==='contactUpdate'){
  const id=String(input.id||''),status=String(input.status||''),notes=String(input.notes||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
   !['New','In Progress','Resolved','Closed'].includes(status)||notes.length>3000)return respond({error:'Invalid enquiry update'},400);
  if(!contactConfigured(env))return respond({error:'Contact database not configured'},503);
  try{
   const row=await updateContactEnquiry(env,id,status,notes);
   return row?respond({saved:true,row}):respond({error:'Enquiry not found'},404);
  }catch(e){console.warn('Admin contact update failed',{name:e?.name||'Error'});return respond({error:'Unable to update enquiry'},503);}
 }
 if(action==='dashboard'){
 const rows=(await db.prepare('SELECT module,status,COUNT(*) AS count,SUM(amount) AS amount FROM admin_records GROUP BY module,status').all()).results;
 const count=(m,s)=>rows.filter(r=>r.module===m&&(!s||r.status===s)).reduce((a,r)=>a+r.count,0);
 // Live client bookings and independently verified payments drive admin dashboard metrics.
 const [tasks,financial]=await Promise.all([
  db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END) AS active,SUM(CASE WHEN status='COMPLETED' THEN 1 ELSE 0 END) AS completed,SUM(CASE WHEN status IN ('FILED_PENDING_REVIEW','AWAITING_PAYMENT','COMPLETED') AND substr(COALESCE(filing_date,''),1,7)=? THEN 1 ELSE 0 END) AS filed_month FROM firm_service_orders").bind(new Date(Date.now()+19800000).toISOString().slice(0,7)).first(),
  db.prepare("SELECT COALESCE(SUM(CASE WHEN o.payment_verified_at IS NOT NULL THEN q.amount_paise ELSE 0 END),0) AS paid_paise,COALESCE(SUM(CASE WHEN o.status='AWAITING_PAYMENT' AND o.payment_verified_at IS NULL THEN q.amount_paise ELSE 0 END),0) AS due_paise FROM firm_service_orders o LEFT JOIN workflow_quote_versions q ON q.order_id=o.id AND q.version=(SELECT MAX(version) FROM workflow_quote_versions WHERE order_id=o.id)").first()
 ]);
 const inr=paise=>(Number(paise||0)/100).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
 return respond({authorized:true,name:u.displayName||'Admin',metrics:{
  customers:count('Customers'),services:count('Services & Masters','Active'),
  tasks:Number(tasks?.active||0),filings:Number(tasks?.filed_month||0),
  invoices:inr(financial?.due_paise),revenue:inr(financial?.paid_paise)
 }});
 }
 if(action==='report')return respond({rows:(await db.prepare('SELECT module,status,COUNT(*) AS count,SUM(amount) AS amount FROM admin_records GROUP BY module,status ORDER BY module,status').all()).results});
 if(!modules.includes(input.module))return respond({error:'Invalid module'},400);
 if(action==='list')return respond({rows:(await db.prepare('SELECT * FROM admin_records WHERE module=? ORDER BY updated DESC LIMIT 500').bind(input.module).all()).results});
 if(action==='save'){
 const title=String(input.title||'').trim(),reference=String(input.reference||'').trim(),notes=String(input.notes||'').trim(),status=String(input.status||'Pending'),amount=Number(input.amount||0);
 if(!title||title.length>150||reference.length>250||notes.length>2000||!['Pending','Active','Completed','Paid','Cancelled','Draft','Inactive'].includes(status)||!Number.isFinite(amount)||amount<0||amount>1e12)return respond({error:'Invalid record'},400);
 const id=input.id?String(input.id):crypto.randomUUID();
 if(input.id){const q=await db.prepare('UPDATE admin_records SET title=?,reference=?,status=?,amount=?,notes=?,updated=? WHERE id=? AND module=?').bind(title,reference,status,amount,notes,Date.now(),id,input.module).run();if(!q.meta.changes)return respond({error:'Record not found'},404);}
 else await db.prepare('INSERT INTO admin_records(id,module,title,reference,status,amount,notes,updated) VALUES(?,?,?,?,?,?,?,?)').bind(id,input.module,title,reference,status,amount,notes,Date.now()).run();
 return respond({saved:true,id});
 }
 if(action==='delete'){await db.prepare('DELETE FROM admin_records WHERE id=? AND module=?').bind(String(input.id||''),input.module).run();return respond({deleted:true});}
 return respond({error:'Invalid action'},400);
 }catch{return respond({error:'Authentication service unavailable'},503);}
}
