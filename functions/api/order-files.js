import {identity,policy,otpVerified,isFirm} from './roles.js';
import {googleToken,googleUserToken} from './documents.js';
import {ownedOrder} from '../lib/firm-workspace.js';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 try{
 if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
 const u=await identity(request,env);if(!u)return json({error:'Authentication required'},401);
 const db=env.GST_AUTH_DB,uid=u.localId,email=u.email.toLowerCase(),admin=uid==='7arK2z41nhTMyjwasmXKCWR0uw93'&&email==='kuldeep@gmail.com';
 if(!admin&&((await policy(db,uid))?.active===0||!await otpVerified(request,env,u)))return json({error:'Access denied'},403);
 const firm=!admin&&await isFirm(db,uid,email);
 const ticketAccess=async(id)=>db.prepare('SELECT id FROM portal_support_tickets WHERE id=? AND (?=1 OR owner_uid=?)').bind(id,admin?1:0,uid).first();
 const token=async()=>env.GST_GOOGLE_OAUTH_JSON?googleUserToken(env.GST_GOOGLE_OAUTH_JSON):googleToken(env.GST_GOOGLE_SERVICE_ACCOUNT_JSON);
 if(request.headers.get('Content-Type')?.includes('application/json')){
 const b=await request.json();const rec=await db.prepare(b.ticket===true?'SELECT * FROM portal_ticket_files WHERE id=?':'SELECT * FROM firm_order_files WHERE id=?').bind(String(b.id||'')).first();if(!rec||!(b.ticket===true?await ticketAccess(rec.ticket_id):await ownedOrder(db,uid,rec.order_id,firm,admin)))return json({error:'File unavailable'},404);
 const t=await token();const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(rec.drive_id)+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+t}});
 if(!response.ok)return json({error:'Storage download unavailable'},502);
 return new Response(response.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(rec.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(Number(request.headers.get('Content-Length'))>11*1024*1024)return json({error:'Maximum file size 10 MB'},413);
 const form=await request.formData(),orderId=String(form.get('orderId')||''),ticketId=String(form.get('ticketId')||''),file=form.get('file'),kind=String(form.get('kind')||'Document');
 if(ticketId? !await ticketAccess(ticketId):!await ownedOrder(db,uid,orderId,firm,admin))return json({error:'Record unavailable'},403);
 if(!['Document','Final file'].includes(kind)||kind==='Final file'&&!admin)return json({error:'Invalid file type'},403);
 if(!(file instanceof File)||!file.size||file.size>10*1024*1024||!/\.(pdf|jpe?g|png|csv|xlsx?)$/i.test(file.name))return json({error:'Attach a supported file up to 10 MB'},400);
 const id=crypto.randomUUID(),name=file.name.replace(/[\u0000-\u001f]/g,'').slice(0,180),boundary=crypto.randomUUID(),t=await token();
 // Reuse existing secured Other Documents folder. Files are never made public by this endpoint.
 const metadata=JSON.stringify({name:'order-'+id+'-'+name,parents:['1Ez-ghoCwpDgHM-u78qbqrPPyMp0p581R']});
 const body=new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+metadata+'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n',file,'\r\n--'+boundary+'--\r\n']);
 const res=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'multipart/related; boundary='+boundary},body});
 if(!res.ok)return json({error:'Google storage upload failed'},502);
 const drive=await res.json();
 try{const now=Date.now();
 if(ticketId){if(!await ticketAccess(ticketId))throw Error('Access changed');await db.prepare('INSERT INTO portal_ticket_files(id,ticket_id,name,drive_id,size,created_at) VALUES(?,?,?,?,?,?)').bind(id,ticketId,name,drive.id,file.size,now).run();}
 else {if(!await ownedOrder(db,uid,orderId,firm,admin))throw Error('Access changed');
 const writes=[db.prepare('INSERT INTO firm_order_files(id,order_id,uploader_uid,kind,name,drive_id,size,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,orderId,uid,kind,name,drive.id,file.size,now)];
 if(kind==='Document'){
 writes.push(db.prepare("INSERT INTO portal_order_events(id,order_id,status,created_at) SELECT ?,id,'Documents Received',? FROM firm_service_orders WHERE id=? AND status IN ('Paid','Awaiting payment','Documents Required','Documents needed')").bind(crypto.randomUUID(),now,orderId));
 writes.push(db.prepare("UPDATE firm_service_orders SET status='Documents Received',updated_at=? WHERE id=? AND status IN ('Paid','Awaiting payment','Documents Required','Documents needed')").bind(now,orderId));
 }await db.batch(writes);}}
 catch(e){await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(drive.id)+'?supportsAllDrives=true',{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}).catch(()=>null);throw e;}
 return json({saved:true,id,name},201);
 }catch{return json({error:'Order file service unavailable'},503);}
}