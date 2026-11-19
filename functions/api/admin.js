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
 if(!u||u.disabled||u.localId!=='iNoxSD4NGrNXsghUXgxhyqyd9N03'||u.email?.toLowerCase()!=='kuldeep@gmail.com')return respond({error:'Admin access requires the authorized Firebase account'},403);
 const db=env.GST_AUTH_DB;
 const modules=['Customers','Staff & Roles','Services & Masters','Filing & Task Management','Documents & Vault','Invoices & Payments','Notifications','Support / Queries','Settings'];
 const body=await request.text();const input=body?JSON.parse(body):{};const action=input.action||'dashboard';
 if(!db)return respond({error:'Admin database unavailable'},503);
 if(action==='dashboard'){
 const rows=(await db.prepare('SELECT module,status,COUNT(*) AS count,SUM(amount) AS amount FROM admin_records GROUP BY module,status').all()).results;
 const count=(m,s)=>rows.filter(r=>r.module===m&&(!s||r.status===s)).reduce((a,r)=>a+r.count,0);
 return respond({authorized:true,name:u.displayName||'Admin',metrics:{customers:count('Customers'),services:count('Services & Masters','Active'),tasks:count('Filing & Task Management','Pending'),filings:null,invoices:rows.filter(r=>r.module==='Invoices & Payments'&&r.status==='Pending').reduce((a,r)=>a+(r.amount||0),0),revenue:rows.filter(r=>r.module==='Invoices & Payments'&&r.status==='Paid').reduce((a,r)=>a+(r.amount||0),0)}});
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
