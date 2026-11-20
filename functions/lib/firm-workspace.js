import {validFilingPeriod} from '../../landing/filing-periods.js';
const ADMIN='7arK2z41nhTMyjwasmXKCWR0uw93';
const services=['GST Registration','GSTR-1 Filing','GSTR-3B Filing','GST Reconciliation','Income Tax Return','TDS Return','Compliance'];
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const all=async(db,sql,...v)=>(await db.prepare(sql).bind(...v).all()).results;
const ownClient=async(db,firm,client)=>db.prepare("SELECT w.title,w.reference FROM staff_assignments w LEFT JOIN account_policy p ON p.uid=? LEFT JOIN customer_profiles c ON c.uid=? LEFT JOIN staff_roles f ON f.uid=? WHERE w.id='client:'||? AND w.staff_uid=? AND w.section='Assigned Clients' AND COALESCE(p.active,1)=1 AND COALESCE(c.account_type,'legacy')!='professional' AND f.uid IS NULL").bind(client,client,client,client,firm).first();
const assignedCount=async(db,uid)=>(await db.prepare("SELECT COUNT(*) AS n FROM staff_assignments WHERE staff_uid=? AND section='Assigned Clients'").bind(uid).first()).n;
const ownedOrder=async(db,uid,id,firm,admin)=>{const order=await db.prepare('SELECT * FROM firm_service_orders WHERE id=?').bind(id).first();if(!order)return null;if(admin||(!firm&&order.client_uid===uid)|| (firm&&(order.firm_uid===uid||order.firm_uid===order.client_uid)&&await ownClient(db,uid,order.client_uid)))return order;return null;};
export {ownedOrder};
export async function workspace({db,b,u,firm,admin}){
 const uid=u.localId,now=Date.now(),act=b.action;
 const str=(v,n=200)=>String(v||'').trim().slice(0,n);
 if(act==='workspaceDueSave'){
 if(!admin)return json({error:'Admin required'},403);
 const service=str(b.service),period=str(b.period,40),due=str(b.dueDate,10),notes=str(b.notes,250);
 if(!services.includes(service)||!period||!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due)return json({error:'Enter a valid service, period and date'},400);
 await db.prepare("INSERT INTO portal_due_dates(id,service,period,due_date,notes,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET due_date=excluded.due_date,notes=excluded.notes,updated_at=excluded.updated_at").bind(service+'|'+period,service,period,due,notes,now).run();return json({saved:true});
 }
 if(act==='workspaceDueRemove'){
 if(!admin)return json({error:'Admin required'},403);
 await db.prepare('DELETE FROM portal_due_dates WHERE id=?').bind(str(b.id)).run();return json({saved:true});
 }
 if(act==='workspaceProfileRequest'){
 if(admin||firm)return json({error:'Business account required'},403);
 const name=str(b.businessName,150),gstin=str(b.gstin,15).toUpperCase(),mobile=str(b.mobile,10);
 if(!name||!/^[6-9]\d{9}$/.test(mobile)||!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))return json({error:'Enter valid business name, mobile number and GSTIN'},400);
 const p=await db.prepare("SELECT uid FROM customer_profiles WHERE uid=? AND account_type='business'").bind(uid).first();if(!p)return json({error:'Business profile not registered'},403);
 await db.prepare("INSERT INTO portal_profile_requests(uid,business_name,mobile,gstin,status,updated_at) VALUES(?,?,?,?,'Pending verification',?) ON CONFLICT(uid) DO UPDATE SET business_name=excluded.business_name,mobile=excluded.mobile,gstin=excluded.gstin,status=excluded.status,updated_at=excluded.updated_at").bind(uid,name,mobile,gstin,now).run();return json({saved:true});
 }
 if(act==='workspaceProfileReview'){
 if(!admin)return json({error:'Admin required'},403);
 const target=str(b.uid),decision=str(b.decision);
 const p=await db.prepare("SELECT * FROM portal_profile_requests WHERE uid=? AND status='Pending verification'").bind(target).first();
 if(!p||!['Approved','Rejected'].includes(decision)||Number(b.updatedAt)!==p.updated_at)return json({error:'Request changed or unavailable; refresh'},409);
 if(decision==='Approved'){
 const duplicate=await db.prepare("SELECT uid FROM mobile_accounts WHERE mobile=? AND uid<>? UNION SELECT uid FROM customer_profiles WHERE mobile=? AND uid<>?").bind(p.mobile,target,p.mobile,target).first();if(duplicate)return json({error:'Mobile number already belongs to another account'},409);
 const account=await db.prepare('SELECT email FROM portal_accounts WHERE uid=?').bind(target).first();if(!account)return json({error:'Account must sign in first'},409);
 await db.batch([db.prepare("UPDATE customer_profiles SET business_name=?,mobile=?,gstin=? WHERE uid=? AND account_type='business' AND EXISTS(SELECT 1 FROM portal_profile_requests WHERE uid=? AND status='Pending verification' AND updated_at=?)").bind(p.business_name,p.mobile,p.gstin,target,target,p.updated_at),
 db.prepare("DELETE FROM mobile_accounts WHERE uid=? AND EXISTS(SELECT 1 FROM portal_profile_requests WHERE uid=? AND status='Pending verification' AND updated_at=?)").bind(target,target,p.updated_at),
 db.prepare("INSERT INTO mobile_accounts(mobile,uid,email) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM portal_profile_requests WHERE uid=? AND status='Pending verification' AND updated_at=?)").bind(p.mobile,target,account.email,target,p.updated_at),
 db.prepare("UPDATE portal_profile_requests SET status=?,updated_at=? WHERE uid=? AND updated_at=?").bind(decision,now,target,p.updated_at)]);
 }else await db.prepare("UPDATE portal_profile_requests SET status=?,updated_at=? WHERE uid=? AND updated_at=?").bind(decision,now,target,p.updated_at).run();
 return json({saved:true});
 }
 if(act==='workspaceThread'||act==='workspaceThreadReply'){
 const id=str(b.ticketId),ticket=await db.prepare('SELECT * FROM portal_support_tickets WHERE id=?').bind(id).first();
 if(!ticket||(!admin&&ticket.owner_uid!==uid))return json({error:'Ticket unavailable'},404);
 if(act==='workspaceThread'){
 const [messages,files]=await Promise.all([all(db,"SELECT id,author,body,created_at FROM portal_ticket_messages WHERE ticket_id=? ORDER BY created_at ASC LIMIT 500",id),all(db,"SELECT id,name,size,created_at FROM portal_ticket_files WHERE ticket_id=? ORDER BY created_at ASC LIMIT 500",id)]);
 return json({messages,files,subject:ticket.subject,initial:ticket.message,reply:ticket.reply,status:ticket.status});
 }
 const message=str(b.message,3000);if(!message||ticket.status==='Resolved')return json({error:'Enter a message on an open ticket'},400);
 await db.batch([db.prepare('INSERT INTO portal_ticket_messages(id,ticket_id,author,body,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,admin?'Admin':'Customer',message,now),db.prepare("UPDATE portal_support_tickets SET updated_at=? WHERE id=?").bind(now,id)]);return json({saved:true});
 }
 if(act==='workspaceDirectBook'){
 if(admin||firm)return json({error:'Client account required'},403);
 const service=str(b.service),period=str(b.period,40),key=str(b.requestId,80);if(!services.includes(service)||!validFilingPeriod(service,period)||!/^[a-f0-9-]{36}$/i.test(key))return json({error:'Select a valid filing period for this service'},400);
 const requested=String(b.dueDate||'').trim(),publishedId=String(b.dueId||'').trim();
 const today=new Date(now+19800000).toISOString().slice(0,10);
 let dueDate=null,dueDateSource=null;
 if(publishedId){
   if(publishedId.length>250)return json({error:'Invalid due date selection'},400);
   const schedule=await db.prepare('SELECT service,period,due_date FROM portal_due_dates WHERE id=?').bind(publishedId).first();
   if(!schedule||schedule.service!==service||![period,'FY '+period].includes(schedule.period)||schedule.due_date<today||requested!==schedule.due_date)return json({error:'Published due date changed or does not match the selected service and period. Choose it again.'},409);
   dueDate=schedule.due_date;dueDateSource='Published schedule';
 }else if(requested){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(requested)||!Number.isFinite(Date.parse(requested))||new Date(requested).toISOString().slice(0,10)!==requested||requested<today)return json({error:'Choose a valid requested date, today or later'},400);
   dueDate=requested;dueDateSource='Requested by business';
 }
 const p=await db.prepare("SELECT business_name,name FROM customer_profiles WHERE uid=?").bind(uid).first();
 const orderId=uid+':'+key;
 await db.batch([db.prepare("INSERT INTO firm_service_orders(id,firm_uid,client_uid,client_name,service,period,due_date,due_date_source,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'Awaiting payment',?,?) ON CONFLICT(id) DO NOTHING").bind(orderId,uid,uid,p?.business_name||p?.name||u.displayName||'Client',service,period,dueDate,dueDateSource,now,now),
 db.prepare("INSERT INTO firm_billing(id,firm_uid,kind,order_id,title,status,created_at,updated_at) SELECT ?,o.firm_uid,'Service',o.id,o.service||' - '||COALESCE(o.period,''),'Awaiting quote',?,? FROM firm_service_orders o WHERE o.id=? AND NOT EXISTS(SELECT 1 FROM firm_billing b WHERE b.order_id=o.id AND b.kind='Service') ON CONFLICT DO NOTHING").bind(crypto.randomUUID(),now,now,orderId),
 db.prepare("INSERT INTO portal_order_events(id,order_id,status,created_at) SELECT id||':book',id,'Awaiting payment',created_at FROM firm_service_orders WHERE id=? ON CONFLICT DO NOTHING").bind(orderId)]);
 return json({saved:true,id:orderId,paymentConfigured:false});
 }
 if(act==='workspaceTimeline'){
 const order=await ownedOrder(db,uid,str(b.orderId),firm,admin);if(!order)return json({error:'Order unavailable'},403);
 return json({rows:await all(db,'SELECT status,created_at FROM portal_order_events WHERE order_id=? ORDER BY created_at ASC LIMIT 500',order.id),status:order.status,due_date:order.due_date,due_date_source:order.due_date_source});
 }
 if(act==='workspaceAdmin'){
 if(!admin)return json({error:'Admin required'},403);
 const [orders,billing,tickets]=await Promise.all([all(db,"SELECT o.*,a.email AS firm_email FROM firm_service_orders o LEFT JOIN portal_accounts a ON a.uid=o.firm_uid ORDER BY o.created_at DESC LIMIT 500"),all(db,"SELECT b.*,a.email AS firm_email FROM firm_billing b LEFT JOIN portal_accounts a ON a.uid=b.firm_uid ORDER BY b.created_at DESC LIMIT 500"),all(db,"SELECT t.*,a.email AS owner_email FROM portal_support_tickets t LEFT JOIN portal_accounts a ON a.uid=t.owner_uid ORDER BY t.created_at DESC LIMIT 500")]);return json({orders,billing,tickets,dueDates:await all(db,'SELECT * FROM portal_due_dates ORDER BY due_date LIMIT 500'),profileRequests:await all(db,"SELECT r.*,a.email FROM portal_profile_requests r LEFT JOIN portal_accounts a ON a.uid=r.uid WHERE r.status='Pending verification' ORDER BY r.updated_at DESC LIMIT 500"),services});
 }
 if(act==='workspaceAdminQuote'){
 if(!admin)return json({error:'Admin required'},403);
 const amount=Number(b.amountPaise);if(!Number.isSafeInteger(amount)||amount<=0||amount>10000000000)return json({error:'Enter valid amount'},400);
 const q=await db.prepare("UPDATE firm_billing SET amount_paise=?,status='Payment pending',updated_at=? WHERE id=? AND status IN ('Awaiting quote','Payment pending')").bind(amount,now,str(b.id)).run();return q.meta.changes?json({saved:true}):json({error:'Invoice unavailable'},404);
 }
 if(act==='workspaceAdminStatus'){
 if(!admin)return json({error:'Admin required'},403);
 const status=str(b.status),id=str(b.id);if(!['Awaiting payment','Documents Required','Documents Received','In Progress','Filed','Completed','Cancelled'].includes(status))return json({error:'Invalid filing status'},400);
 if(['Filed','Completed'].includes(status)&&!await db.prepare("SELECT id FROM firm_order_files WHERE order_id=? AND kind='Final file' LIMIT 1").bind(id).first())return json({error:'Upload the final file before marking Filed'},400);
 const results=await db.batch([db.prepare('UPDATE firm_service_orders SET status=?,updated_at=? WHERE id=?').bind(status,now,id),db.prepare('INSERT INTO portal_order_events(id,order_id,status,created_at) SELECT ?,id,?,? FROM firm_service_orders WHERE id=?').bind(crypto.randomUUID(),status,now,id)]);return results[0].meta.changes?json({saved:true}):json({error:'Order unavailable'},404);
 }
 if(act==='workspaceAdminReply'){
 if(!admin)return json({error:'Admin required'},403);
 const reply=str(b.reply,3000),status=str(b.status);if(!reply||!['Open','In Progress','Resolved'].includes(status))return json({error:'Reply and status required'},400);
 const id=str(b.id);const results=await db.batch([db.prepare("UPDATE portal_support_tickets SET reply=?,status=?,updated_at=? WHERE id=?").bind(reply,status,now,id),db.prepare('INSERT INTO portal_ticket_messages(id,ticket_id,author,body,created_at) SELECT ?,id,?,?,? FROM portal_support_tickets WHERE id=?').bind(crypto.randomUUID(),'Admin',reply,now,id)]);return results[0].meta.changes?json({saved:true}):json({error:'Ticket unavailable'},404);
 }
 if(act==='workspaceTrial'||act==='workspaceLaunch'||act==='workspacePlanRequest'||act==='workspaceBook'){
 if(!firm||admin)return json({error:'Firm access required'},403);
 if(act==='workspaceTrial'){
 const q=await db.prepare("INSERT INTO firm_trials(uid,starts_at,ends_at,client_limit,tool_limit,launches) VALUES(?,?,?,5,10,0) ON CONFLICT(uid) DO NOTHING").bind(uid,now,now+7*86400000).run();return q.meta.changes?json({saved:true}):json({error:'Free trial already used'},409);
 }
 if(act==='workspaceLaunch'){
 const count=await assignedCount(db,uid);const q=await db.prepare("UPDATE firm_trials SET launches=launches+1 WHERE uid=? AND ends_at>? AND launches<tool_limit AND client_limit>=?").bind(uid,now,count).run();return q.meta.changes?json({allowed:true}):json({error:'Trial expired or limit reached. Request a subscription or upgrade.'},403);
 }
 if(act==='workspacePlanRequest'){
 const request=str(b.request);if(!['Subscribe','Upgrade','Renewal'].includes(request))return json({error:'Invalid plan request'},400);
 const id=crypto.randomUUID();const q=await db.prepare("INSERT INTO firm_billing(id,firm_uid,kind,title,status,created_at,updated_at) SELECT ?,?,'Plan',?,'Awaiting quote',?,? WHERE NOT EXISTS(SELECT 1 FROM firm_billing WHERE firm_uid=? AND kind='Plan' AND status IN ('Awaiting quote','Payment pending'))").bind(id,uid,request+' request',now,now,uid).run();return q.meta.changes?json({saved:true,id}):json({error:'A plan request is already pending. View Invoices.'},409);
 }
 const client=str(b.clientUid),service=str(b.service);if(client===ADMIN||!services.includes(service))return json({error:'Select a client and service'},400);
 const assigned=await ownClient(db,uid,client);if(!assigned)return json({error:'Client must be assigned to your firm'},403);
 const invoice=crypto.randomUUID();let key=str(b.requestId,80);if(!/^[a-f0-9-]{36}$/i.test(key))return json({error:'Invalid booking reference'},400);
 // The request ID is scoped to its firm and reused on retry.
 const orderId=uid+':'+key;
 await db.batch([db.prepare("INSERT INTO firm_service_orders(id,firm_uid,client_uid,client_name,service,status,created_at,updated_at) VALUES(?,?,?,?,?,'Awaiting payment',?,?) ON CONFLICT(id) DO NOTHING").bind(orderId,uid,client,assigned.title||'Client',service,now,now),
 db.prepare("INSERT INTO firm_billing(id,firm_uid,kind,order_id,title,status,created_at,updated_at) SELECT ?,firm_uid,'Service',id,service,'Awaiting quote',?,? FROM firm_service_orders WHERE id=? ON CONFLICT DO NOTHING").bind(invoice,now,now,orderId)]);
 return json({saved:true,id:orderId,paymentConfigured:false});
 }
 if(act==='workspaceAssignedClient'){
 if(!firm||admin)return json({error:'Firm access required'},403);
 const client=str(b.clientUid,128);
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(client)||client===ADMIN)return json({error:'Client unavailable'},404);
 // Resolve contact details only through an active client assignment owned by this firm.
 const profile=await db.prepare("SELECT COALESCE(NULLIF(c.name,''),NULLIF(a.name,''),w.title) AS name,COALESCE(NULLIF(c.mobile,''),m.mobile) AS mobile,COALESCE(NULLIF(a.email,''),NULLIF(m.email,''),w.reference) AS email,c.business_name,c.gstin,w.status AS assignment_status FROM staff_assignments w LEFT JOIN customer_profiles c ON c.uid=? LEFT JOIN portal_accounts a ON a.uid=? LEFT JOIN mobile_accounts m ON m.uid=? LEFT JOIN account_policy p ON p.uid=? LEFT JOIN staff_roles f ON f.uid=? WHERE w.id='client:'||? AND w.staff_uid=? AND w.section='Assigned Clients' AND COALESCE(p.active,1)=1 AND COALESCE(c.account_type,'legacy')!='professional' AND f.uid IS NULL").bind(client,client,client,client,client,client,uid).first();
 if(!profile)return json({error:'Client unavailable or no longer assigned to your firm'},404);
 const orders=await all(db,"SELECT o.id,o.service,o.period,o.due_date,o.due_date_source,o.status,o.created_at FROM firm_service_orders o JOIN staff_assignments w ON w.id='client:'||o.client_uid AND w.section='Assigned Clients' LEFT JOIN account_policy p ON p.uid=o.client_uid LEFT JOIN customer_profiles c ON c.uid=o.client_uid LEFT JOIN staff_roles f ON f.uid=o.client_uid WHERE o.client_uid=? AND w.staff_uid=? AND (o.firm_uid=w.staff_uid OR o.firm_uid=o.client_uid) AND COALESCE(p.active,1)=1 AND COALESCE(c.account_type,'legacy')!='professional' AND f.uid IS NULL ORDER BY o.created_at DESC LIMIT 500",client,uid);
 if(!await ownClient(db,uid,client))return json({error:'Client unavailable or no longer assigned to your firm'},404);
 return json({profile,orders});
 }
 if(act==='workspaceClientDetails'){
 if(!firm||admin)return json({error:'Firm account required'},403);
 const client=str(b.clientUid,128);
 if(!client||!await ownClient(db,uid,client))return json({error:'Client unavailable or not assigned to your firm'},404);
 const profile=await db.prepare("SELECT COALESCE(NULLIF(c.name,''),NULLIF(a.name,''),w.title) AS name,COALESCE(NULLIF(c.mobile,''),m.mobile) AS mobile,COALESCE(NULLIF(a.email,''),m.email) AS email,c.business_name,c.gstin,w.status AS assignment_status FROM staff_assignments w LEFT JOIN customer_profiles c ON c.uid=? LEFT JOIN portal_accounts a ON a.uid=? LEFT JOIN mobile_accounts m ON m.uid=? LEFT JOIN account_policy p ON p.uid=? LEFT JOIN staff_roles f ON f.uid=? WHERE w.id='client:'||? AND w.staff_uid=? AND w.section='Assigned Clients' AND COALESCE(p.active,1)=1 AND COALESCE(c.account_type,'legacy')!='professional' AND f.uid IS NULL").bind(client,client,client,client,client,client,uid).first();
 if(!profile)return json({error:'Client unavailable'},404);
 const orders=await all(db,"SELECT o.id,o.service,o.period,o.due_date,o.due_date_source,o.status,o.created_at,CASE WHEN o.firm_uid=o.client_uid THEN 'Business' ELSE 'Firm' END AS booked_by FROM firm_service_orders o JOIN staff_assignments w ON w.id='client:'||o.client_uid AND w.section='Assigned Clients' LEFT JOIN account_policy p ON p.uid=o.client_uid LEFT JOIN customer_profiles c ON c.uid=o.client_uid LEFT JOIN staff_roles f ON f.uid=o.client_uid WHERE o.client_uid=? AND w.staff_uid=? AND (o.firm_uid=w.staff_uid OR o.firm_uid=o.client_uid) AND COALESCE(p.active,1)=1 AND COALESCE(c.account_type,'legacy')!='professional' AND f.uid IS NULL ORDER BY o.created_at DESC LIMIT 500",client,uid);
 return json({profile,orders});
 }
 if(act==='workspaceData'){
 if(admin)return json({error:'Use administrator workspace'},403);
 const orders=firm?await all(db,"SELECT o.*,CASE WHEN o.firm_uid=o.client_uid THEN 'Business booking' ELSE 'Firm booking' END AS booking_source FROM firm_service_orders o JOIN staff_assignments w ON w.id='client:'||o.client_uid AND w.section='Assigned Clients' LEFT JOIN account_policy p ON p.uid=o.client_uid LEFT JOIN customer_profiles c ON c.uid=o.client_uid LEFT JOIN staff_roles f ON f.uid=o.client_uid WHERE w.staff_uid=? AND (o.firm_uid=w.staff_uid OR o.firm_uid=o.client_uid) AND COALESCE(p.active,1)=1 AND COALESCE(c.account_type,'legacy')!='professional' AND f.uid IS NULL ORDER BY o.created_at DESC LIMIT 500",uid):await all(db,"SELECT id,client_name,service,period,due_date,due_date_source,status,created_at,updated_at FROM firm_service_orders WHERE client_uid=? ORDER BY created_at DESC LIMIT 500",uid);
 const tickets=await all(db,"SELECT id,subject,message,status,reply,order_id,created_at FROM portal_support_tickets WHERE owner_uid=? ORDER BY created_at DESC LIMIT 500",uid);
 if(!firm){const billing=await all(db,"SELECT id,kind,title,amount_paise,status,created_at,order_id FROM firm_billing WHERE firm_uid=? AND kind='Service' ORDER BY created_at DESC LIMIT 500",uid);const dueDates=await all(db,"SELECT * FROM portal_due_dates WHERE due_date>=? ORDER BY due_date LIMIT 500",new Date(now+19800000).toISOString().slice(0,10));const profile=await db.prepare("SELECT business_name,name,mobile,gstin,account_type FROM customer_profiles WHERE uid=?").bind(uid).first();const profileRequest=await db.prepare("SELECT business_name,mobile,gstin,status,updated_at FROM portal_profile_requests WHERE uid=?").bind(uid).first();return json({orders,tickets,billing,dueDates,services,profile,profileRequest,paymentConfigured:false});}
 const clients=await all(db,"SELECT substr(w.id,8) AS uid,w.title,w.reference FROM staff_assignments w LEFT JOIN account_policy a ON a.uid=substr(w.id,8) LEFT JOIN customer_profiles c ON c.uid=substr(w.id,8) LEFT JOIN staff_roles f ON f.uid=substr(w.id,8) WHERE w.staff_uid=? AND w.section='Assigned Clients' AND w.id LIKE 'client:%' AND COALESCE(a.active,1)=1 AND COALESCE(c.account_type,'legacy')!='professional' AND f.uid IS NULL ORDER BY w.title LIMIT 500",uid);
 const trial=await db.prepare("SELECT starts_at,ends_at,client_limit,tool_limit,launches FROM firm_trials WHERE uid=?").bind(uid).first();
 const billing=await all(db,"SELECT id,kind,title,amount_paise,status,created_at,order_id FROM firm_billing WHERE firm_uid=? ORDER BY created_at DESC LIMIT 500",uid);
 return json({orders,tickets,clients,trial,clientCount:await assignedCount(db,uid),services,billing,paymentConfigured:false});
 }
 if(act==='workspaceTicket'){
 if(admin)return json({error:'Customer or firm required'},403);
 const subject=str(b.subject,150),message=str(b.message,3000),orderId=str(b.orderId),client=str(b.clientUid);
 if(!subject||!message)return json({error:'Enter subject and message'},400);
 if(client&&(!firm||!await ownClient(db,uid,client)))return json({error:'Invalid client'},403);
 const order=orderId?await ownedOrder(db,uid,orderId,firm,false):null;
 if(orderId&&(!order||(client&&order.client_uid!==client)))return json({error:'Invalid order'},403);
 const id=crypto.randomUUID();await db.prepare("INSERT INTO portal_support_tickets(id,owner_uid,client_uid,order_id,subject,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'Open',?,?)").bind(id,uid,order?.client_uid||client||null,orderId||null,subject,message,now,now).run();return json({saved:true,id});
 }
 if(act==='workspaceFiles'){
 const order=await ownedOrder(db,uid,str(b.orderId),firm,admin);if(!order)return json({error:'Order unavailable'},403);
 const rows=await all(db,"SELECT id,kind,name,size,created_at,uploader_uid FROM firm_order_files WHERE order_id=? ORDER BY created_at DESC LIMIT 500",order.id);const removable=['Awaiting payment','Paid','Documents Required','Documents needed','Documents Received'].includes(order.status);return json({rows:rows.map(({uploader_uid,...row})=>({...row,canRemove:!admin&&removable&&row.kind==='Document'&&uploader_uid===uid}))});
 }
 return json({error:'Invalid workspace action'},400);
}