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
 if(b.ticket!==true&&rec.kind==='Final file'&&!admin&&!firm){const target=await ownedOrder(db,uid,rec.order_id,firm,false);if(!target?.final_approved_at)return json({error:'Final return awaits admin approval'},403);}
 if(b.action==='remove'){
 if(admin||b.ticket===true||rec.kind!=='Document'||rec.uploader_uid!==uid)return json({error:'Only your own supporting documents can be removed'},403);
 const order=await ownedOrder(db,uid,rec.order_id,firm,false);
 if(!order||!['Awaiting payment','Paid','Documents Required','Documents needed','Documents Received','SUBMITTED','AWAITING_DOCUMENTS','AWAITING_PAYMENT','UNDER_REVIEW','QUOTE_APPROVED'].includes(order.status))return json({error:'Documents cannot be removed after filing begins'},409);
 const now=Date.now();
 // Remove the portal link, retaining the underlying legacy Drive object for tax-record retention.
 const guard="EXISTS(SELECT 1 FROM firm_order_files WHERE id=? AND order_id=? AND uploader_uid=? AND kind='Document')";
 const last="NOT EXISTS(SELECT 1 FROM firm_order_files WHERE order_id=? AND kind='Document' AND id<>?)";
 const q=await db.batch([
 db.prepare("INSERT INTO portal_order_events(id,order_id,status,created_at) SELECT ?,id,'Documents Required',? FROM firm_service_orders WHERE id=? AND status='Documents Received' AND "+guard+" AND "+last).bind(crypto.randomUUID(),now,order.id,rec.id,order.id,uid,order.id,rec.id),
 db.prepare("UPDATE firm_service_orders SET status='Documents Required',updated_at=? WHERE id=? AND status='Documents Received' AND "+guard+" AND "+last).bind(now,order.id,rec.id,order.id,uid,order.id,rec.id),
 db.prepare("DELETE FROM firm_order_files WHERE id=? AND order_id=? AND uploader_uid=? AND kind='Document' AND EXISTS(SELECT 1 FROM firm_service_orders WHERE id=? AND status IN ('Awaiting payment','Paid','Documents Required','Documents needed','Documents Received','SUBMITTED','AWAITING_DOCUMENTS','AWAITING_PAYMENT','UNDER_REVIEW','QUOTE_APPROVED'))").bind(rec.id,order.id,uid,order.id)
 ]);
 if(q[2].meta.changes){
 await db.prepare('INSERT INTO workflow_audit(id,order_id,actor_uid,action,from_status,to_status,detail,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),order.id,uid,'DOCUMENT_REMOVED',order.status,order.status,rec.name,now).run();
 return json({removed:true});
 }
 return json({error:'Document or filing status changed'},409);
 }
 const t=await token();const response=await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(rec.drive_id)+'?alt=media&supportsAllDrives=true',{headers:{Authorization:'Bearer '+t}});
 if(!response.ok)return json({error:'Storage download unavailable'},502);
 return new Response(response.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(rec.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(Number(request.headers.get('Content-Length'))>11*1024*1024)return json({error:'Maximum file size 10 MB'},413);
 const form=await request.formData(),orderId=String(form.get('orderId')||''),ticketId=String(form.get('ticketId')||''),file=form.get('file'),kind=String(form.get('kind')||'Document');
 const uploadOrder=ticketId?null:await ownedOrder(db,uid,orderId,firm,admin);
 if(ticketId?!await ticketAccess(ticketId):!uploadOrder)return json({error:'Record unavailable'},403);
 if(!['Document','Final file'].includes(kind)||kind==='Final file'&&!admin&&!(firm&&uploadOrder.firm_uid===uid&&uploadOrder.firm_uid!==uploadOrder.client_uid))return json({error:'Final return requires assigned firm or admin'},403);
 if(!ticketId&&kind==='Final file'&&!admin&&!['IN_PROGRESS','FILED_PENDING_REVIEW'].includes(uploadOrder.status))return json({error:'Start filing before uploading final return'},409);
 if(!ticketId&&kind==='Document'&&['IN_PROGRESS','FILED_PENDING_REVIEW','COMPLETED','CANCELLED'].includes(uploadOrder.status))return json({error:'Supporting uploads closed at this stage'},409);
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
 writes.push(db.prepare('UPDATE firm_service_orders SET document_verified_at=NULL WHERE id=?').bind(orderId));
 writes.push(db.prepare("INSERT INTO portal_order_events(id,order_id,status,created_at) SELECT ?,id,'Documents Received',? FROM firm_service_orders WHERE id=? AND status IN ('Paid','Awaiting payment','Documents Required','Documents needed')").bind(crypto.randomUUID(),now,orderId));
 writes.push(db.prepare("UPDATE firm_service_orders SET status='Documents Received',updated_at=? WHERE id=? AND status IN ('Paid','Awaiting payment','Documents Required','Documents needed')").bind(now,orderId));
 }
 writes.push(db.prepare('INSERT INTO workflow_audit(id,order_id,actor_uid,action,from_status,to_status,detail,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),orderId,uid,kind==='Final file'?'FINAL_FILE_UPLOADED':'SUPPORTING_DOCUMENT_UPLOADED',uploadOrder.status,uploadOrder.status,name,now));
 if(kind==='Document'&&uploadOrder.firm_uid!==uploadOrder.client_uid)writes.push(db.prepare('INSERT INTO workflow_notifications(id,target_uid,order_id,message,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),uploadOrder.firm_uid,orderId,'New supporting document received: '+name,now));
 await db.batch(writes);}}
 catch(e){await fetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(drive.id)+'?supportsAllDrives=true',{method:'PATCH',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}).catch(()=>null);throw e;}
 return json({saved:true,id,name},201);
 }catch{return json({error:'Order file service unavailable'},503);}
}