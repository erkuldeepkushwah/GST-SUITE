import {financialYears,periodTypes,periodOptions} from '../../landing/filing-periods.js';
import {liveWorkflowFirmOptions} from './live-accounts.js';
const ADMIN='7arK2z41nhTMyjwasmXKCWR0uw93';
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const one=(db,sql,...params)=>db.prepare(sql).bind(...params).first();
const many=async(db,sql,...params)=>(await db.prepare(sql).bind(...params).all()).results;
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const plain=(v,n=300)=>String(v??'').trim().slice(0,n);
const statuses=['SUBMITTED','UNDER_REVIEW','QUOTE_APPROVED','AWAITING_PAYMENT','AWAITING_DOCUMENTS','DOCUMENTS_VERIFIED','IN_PROGRESS','FILED_PENDING_REVIEW','COMPLETED','ON_HOLD','CANCELLED'];
const fyInPeriod=(period,year)=>year==='N/A'&&period==='Not applicable'||period===year||period.startsWith(year+' Q')||periodOptions('Monthly',year).some(([v])=>v===period);
async function audit(db,order,actor,action,previous,next,detail=''){
 const now=Date.now();
 await db.batch([
  db.prepare('INSERT INTO workflow_audit(id,order_id,actor_uid,action,from_status,to_status,detail,created_at) VALUES(?,?,?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),order,actor,action,previous||null,next||null,plain(detail,500),now),
  db.prepare('INSERT INTO portal_order_events(id,order_id,status,created_at) VALUES(?,?,?,?)')
   .bind(crypto.randomUUID(),order,next||action,now)
 ]);
}
async function notify(db,to,order,message){
 if(!to)return;
 await db.prepare('INSERT INTO workflow_notifications(id,target_uid,order_id,message,created_at) VALUES(?,?,?,?,?)')
  .bind(crypto.randomUUID(),to,order,plain(message,250),Date.now()).run();
}
async function change(db,order,next,u,action,detail='',extra=null){
 if(!statuses.includes(next))throw Error('Invalid status');
 const now=Date.now();
 const sql=extra?.sql||'UPDATE firm_service_orders SET status=?,updated_at=? WHERE id=? AND updated_at=?';
 const params=extra?.params||[next,now,order.id,order.updated_at];
 const updated=await db.prepare(sql).bind(...params).run();
 if(!updated.meta.changes)return json({error:'Booking changed; refresh and retry'},409);
 await audit(db,order.id,u.localId,action,order.status,next,detail);
 return json({saved:true,status:next});
}
async function accessible(db,id,u,firm,admin){
 const o=await one(db,'SELECT * FROM firm_service_orders WHERE id=?',id);
 if(!o)return null;
 if(admin||o.client_uid===u.localId||firm&&o.firm_uid===u.localId&&o.firm_uid!==o.client_uid)return o;
 return null;
}
async function detail(db,order){
 const [quotes,payments,documents,events,history,firmAccount,clientAccount,catalog]=await Promise.all([
  many(db,'SELECT id,version,amount_paise,created_at FROM workflow_quote_versions WHERE order_id=? ORDER BY version DESC LIMIT 50',order.id),
  many(db,'SELECT id,quote_version,amount_paise,method,transaction_ref,status,submitted_at,verified_at,receipt_note FROM workflow_payments WHERE order_id=? ORDER BY submitted_at DESC LIMIT 50',order.id),
  many(db,"SELECT f.id,f.name,f.kind,f.size,f.created_at,COALESCE(r.status,'Pending') AS review_status,COALESCE(r.note,'') AS review_note,r.reviewed_at FROM firm_order_files f LEFT JOIN workflow_document_reviews r ON r.file_id=f.id WHERE f.order_id=? ORDER BY f.created_at DESC LIMIT 200",order.id),
  many(db,'SELECT id,status,created_at FROM portal_order_events WHERE order_id=? ORDER BY created_at ASC LIMIT 500',order.id),
  many(db,'SELECT action,from_status,to_status,detail,created_at FROM workflow_audit WHERE order_id=? ORDER BY created_at ASC LIMIT 500',order.id),
  one(db,'SELECT email,name FROM portal_accounts WHERE uid=?',order.firm_uid),
  one(db,'SELECT email,name FROM portal_accounts WHERE uid=?',order.client_uid),
  one(db,'SELECT category,active,frequencies,document_requirements FROM workflow_service_catalog WHERE service=?',order.service)
 ]);
 return {order,quote:quotes[0]||null,quotes,payments,documents,events,history,assignedFirm:order.firm_uid!==order.client_uid?firmAccount:null,client:clientAccount,catalog};
}
function requireAssigned(order,uid,firm){return firm&&order.firm_uid===uid&&order.firm_uid!==order.client_uid;}
export async function workflow({db,b,u,firm,admin,liveAccounts}){
 const action=b.action,uid=u.localId,now=Date.now();
 if(action==='workflowCatalog'){
  const rows=await many(db,'SELECT service,category,active,frequencies,document_requirements FROM workflow_service_catalog ORDER BY category,service');
  return json({rows:admin?rows:rows.filter(x=>x.active===1)});
 }
 if(action==='workflowCatalogUpdate'){
  if(!admin)return json({error:'Admin only'},403);
  const service=plain(b.service,100),active=b.active===true?1:b.active===false?0:null;
  const req=plain(b.documentRequirements,400);
  if(!service||active===null||!req)return json({error:'Choose service, status and document requirements'},400);
  const r=await db.prepare('UPDATE workflow_service_catalog SET active=?,document_requirements=? WHERE service=?').bind(active,req,service).run();
  return r.meta.changes?json({saved:true}):json({error:'Service unavailable'},404);
 }
 if(action==='workflowBook'){
  if(admin||firm)return json({error:'Client only'},403);
  const service=plain(b.service,100),category=plain(b.category,80),frequency=plain(b.frequency,40),
    year=plain(b.financialYear,20),period=plain(b.period,80),requestId=plain(b.requestId,80),date=plain(b.requestedDate,10);
  if(!/^[a-f0-9-]{36}$/i.test(requestId))return json({error:'Invalid booking reference'},400);
  const catalog=await one(db,'SELECT category,active,frequencies FROM workflow_service_catalog WHERE service=?',service);
  if(!catalog||catalog.active!==1||catalog.category!==category||!catalog.frequencies.split(',').includes(frequency)||
     !periodTypes(service).includes(frequency)||!financialYears.includes(year)||!periodOptions(frequency,year).some(([v])=>v===period))
     return json({error:'Select a compatible category, service, frequency, financial year and filing period'},400);
  const today=new Date(now+19800000).toISOString().slice(0,10);
  if(!validDate(date)||date<today)return json({error:'Choose a valid requested completion date'},400);
  const id=uid+':'+requestId,code='GST-'+today.replaceAll('-','')+'-'+requestId.replace(/-/g,'').slice(0,10).toUpperCase();
  const profile=await one(db,'SELECT COALESCE(NULLIF(business_name,\'\'),name) AS name FROM customer_profiles WHERE uid=?',uid);
  const queries=[
    db.prepare("INSERT INTO firm_service_orders(id,firm_uid,client_uid,client_name,service,status,created_at,updated_at,period,due_date,due_date_source,category,frequency,financial_year,booking_code,requested_date) VALUES(?,?,?,?,?,'SUBMITTED',?,?,?,?,? ,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(id,uid,uid,profile?.name||u.displayName||'Client',service,now,now,period,date,'Requested by client',category,frequency,year,code,date),
    db.prepare("INSERT INTO firm_billing(id,firm_uid,kind,order_id,title,status,created_at,updated_at) SELECT ?,o.firm_uid,'Service',o.id,o.service||' - '||o.period,'Awaiting quote',?,? FROM firm_service_orders o WHERE o.id=? AND NOT EXISTS(SELECT 1 FROM firm_billing WHERE order_id=?)")
      .bind(crypto.randomUUID(),now,now,id,id),
    db.prepare("INSERT INTO portal_order_events(id,order_id,status,created_at) VALUES(?,?,'SUBMITTED',?) ON CONFLICT DO NOTHING").bind(id+':submitted',id,now),
    db.prepare("INSERT INTO workflow_audit(id,order_id,actor_uid,action,from_status,to_status,detail,created_at) VALUES(?,?,?,'BOOKING_CREATED',NULL,'SUBMITTED',?,?) ON CONFLICT DO NOTHING")
      .bind(id+':create',id,uid,category+' / '+frequency+' / '+year+' / '+period,now)
  ];
  const results=await db.batch(queries);
  if(results[0].meta.changes)await notify(db,ADMIN,id,'New booking '+code+' · '+service+' · '+(profile?.name||'Client'));
  return json({saved:true,id,bookingId:code,created:!!results[0].meta.changes,status:'SUBMITTED'});
 }
 if(action==='workflowAdminOrders'){
  if(!admin)return json({error:'Admin only'},403);
  const [orders,candidates]=await Promise.all([
    many(db,'SELECT o.*,c.email AS client_email,f.email AS assigned_email, (SELECT MAX(version) FROM workflow_quote_versions q WHERE q.order_id=o.id) AS quote_version FROM firm_service_orders o LEFT JOIN portal_accounts c ON c.uid=o.client_uid LEFT JOIN portal_accounts f ON f.uid=o.firm_uid ORDER BY o.created_at DESC LIMIT 300'),
    many(db,"SELECT a.uid,a.email,COALESCE(NULLIF(TRIM(c.firm_name),''),NULLIF(TRIM(c.name),''),NULLIF(TRIM(a.name),''),a.email) AS name,CASE WHEN c.account_type='professional' THEN 'professional' ELSE 'staff' END AS kind FROM portal_accounts a LEFT JOIN customer_profiles c ON c.uid=a.uid LEFT JOIN staff_roles s ON s.uid=a.uid LEFT JOIN account_policy p ON p.uid=a.uid WHERE ((s.uid IS NOT NULL AND LOWER(TRIM(s.email))=LOWER(TRIM(a.email))) OR c.account_type='professional') AND COALESCE(p.active,1)=1 AND a.uid<>? ORDER BY a.email LIMIT 500",ADMIN)
  ]);
  // Portal accounts can retain old UIDs after Firebase users are deleted and re-registered.
  // Only expose live, active and matching Firebase identities, one option per email.
  const current=await liveAccounts(candidates.map(x=>x.uid));
  const firms=liveWorkflowFirmOptions(candidates,current,ADMIN);
  return json({orders,firms});
 }
 if(action==='workflowReport'){
  const type=plain(b.reportType,40),year=plain(b.financialYear,20),from=plain(b.from,10),to=plain(b.to,10);
  if(!['Bookings','Payments','Filing Progress','Completed Services','Document Status'].includes(type)||
     year&&year!=='All'&&!financialYears.includes(year)||
     from&&!validDate(from)||to&&!validDate(to)||from&&to&&from>to)return json({error:'Invalid report filters'},400);
  const where=admin?'1=1':firm?'o.firm_uid=? AND o.firm_uid<>o.client_uid':'o.client_uid=?';
  const args=admin?[]:[uid];
  let rows=await many(db,"SELECT o.id,o.booking_code,o.client_uid,o.client_name,o.service,o.period,o.category,o.frequency,o.financial_year,o.created_at,o.status,o.due_date,o.payment_verified_at,o.document_verified_at,o.final_approved_at,o.arn,(SELECT MAX(amount_paise) FROM workflow_quote_versions q WHERE q.order_id=o.id) AS amount_paise,(SELECT COUNT(*) FROM firm_order_files f WHERE f.order_id=o.id AND f.kind='Document') AS documents_count FROM firm_service_orders o WHERE "+where+" ORDER BY o.created_at DESC LIMIT 500",...args);
  rows=rows.filter(x=>(!year||year==='All'||x.financial_year===year||(!x.financial_year&&fyInPeriod(x.period||'',year)))&&
   (!from||new Date(x.created_at+19800000).toISOString().slice(0,10)>=from)&&
   (!to||new Date(x.created_at+19800000).toISOString().slice(0,10)<=to)&&
   (type!=='Completed Services'||x.status==='COMPLETED'));
  if(type==='Payments'){
   const ids=rows.map(x=>x.id);const payments=ids.length?await many(db,"SELECT order_id,amount_paise,status,method,transaction_ref,submitted_at,verified_at FROM workflow_payments WHERE order_id IN ("+ids.map(()=>'?').join(',')+") ORDER BY submitted_at DESC",...ids):[];
   const byOrder=new Map();for(const x of payments)if(!byOrder.has(x.order_id))byOrder.set(x.order_id,x);
   rows=rows.map(o=>({...o,payment:byOrder.get(o.id)||null}));
  }
  const total=rows.reduce((sum,r)=>sum+(type==='Payments'?(r.payment?.status==='Verified'?Number(r.payment.amount_paise)||0:0):Number(r.amount_paise)||0),0);
  return json({rows,reportType:type,filters:{from,to,financialYear:year||'All'},count:rows.length,totalPaise:total,generatedAt:now});
 }
 if(action==='workflowNotifications'){
  const rows=await many(db,'SELECT order_id,message,created_at,read_at FROM workflow_notifications WHERE target_uid=? ORDER BY created_at DESC LIMIT 100',uid);
  return json({rows});
 }
 const id=plain(b.orderId,190);
 const order=await accessible(db,id,u,firm,admin);
 if(!order)return json({error:'Booking unavailable or not assigned to your account'},404);
 if(action==='workflowDetails')return json(await detail(db,order));
 if(action==='workflowAssign'){
  if(!admin)return json({error:'Admin only'},403);
  const target=plain(b.firmUid,128);
  if(!target||target===ADMIN||target===order.client_uid)return json({error:'Select a registered firm'},400);
  const role=await one(db,"SELECT a.uid,a.email FROM portal_accounts a LEFT JOIN staff_roles s ON s.uid=a.uid LEFT JOIN customer_profiles c ON c.uid=a.uid LEFT JOIN account_policy p ON p.uid=a.uid WHERE a.uid=? AND ((s.uid IS NOT NULL AND LOWER(TRIM(s.email))=LOWER(TRIM(a.email))) OR c.account_type='professional') AND COALESCE(p.active,1)=1",target);
  if(!role)return json({error:'Firm is unavailable or inactive'},400);
  // A stale D1 record must never receive a live booking assignment.
  const current=await liveAccounts([target]),account=current.get(target);
  if(!account||account.disabled||account.email!==String(role.email||'').trim().toLowerCase())
   return json({error:'Firm account is no longer active in Firebase. Select an active firm.'},409);
  if(['COMPLETED','CANCELLED'].includes(order.status))return json({error:'Cannot reassign a closed booking'},409);
  const next=order.status==='SUBMITTED'?'UNDER_REVIEW':order.status,previous=order.firm_uid;
  const r=await change(db,order,next,u,'FIRM_ASSIGNED',previous+' -> '+target,{
   sql:'UPDATE firm_service_orders SET firm_uid=?,status=?,updated_at=? WHERE id=? AND updated_at=?',
   params:[target,next,now,order.id,order.updated_at]
  });
  if(r.status===200)await notify(db,target,id,'Service assigned: '+order.service+' ('+(order.booking_code||order.id)+')');
  return r;
 }
 if(action==='workflowQuote'){
  if(!admin)return json({error:'Admin only'},403);
  const amount=Number(b.amountPaise);
  if(!Number.isSafeInteger(amount)||amount<100||amount>1e11)return json({error:'Enter a valid quote amount'},400);
  if(['COMPLETED','CANCELLED','IN_PROGRESS','FILED_PENDING_REVIEW'].includes(order.status)||order.payment_verified_at)return json({error:'Quote cannot be revised after verified payment or filing'},409);
  const previous=await one(db,'SELECT MAX(version) AS version FROM workflow_quote_versions WHERE order_id=?',id),version=Number(previous?.version||0)+1;
  const q=await db.prepare('INSERT INTO workflow_quote_versions(id,order_id,version,amount_paise,approved_by,created_at) VALUES(?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),id,version,amount,uid,now).run();
  if(!q.meta.changes)return json({error:'Quote was not saved'},503);
  await db.batch([
   db.prepare("UPDATE firm_billing SET amount_paise=?,status='Payment pending',updated_at=? WHERE order_id=? AND kind='Service'").bind(amount,now,id),
   db.prepare("UPDATE firm_service_orders SET status='AWAITING_PAYMENT',updated_at=? WHERE id=?").bind(now,id),
   db.prepare("UPDATE workflow_payments SET status='Rejected',receipt_note='Superseded quote' WHERE order_id=? AND status='Submitted'").bind(id)
  ]);
  await audit(db,id,uid,'QUOTE_APPROVED_V'+version,order.status,'AWAITING_PAYMENT','Amount paise: '+amount);
  await notify(db,order.client_uid,id,'Quote approved: '+order.service+' · INR '+(amount/100).toFixed(2)+'. Payment confirmation required.');
  return json({saved:true,version,status:'AWAITING_PAYMENT'});
 }
 if(action==='workflowPaymentSubmit'){
  if(admin||firm&&order.client_uid!==uid)return json({error:'Client only'},403);
  if(order.client_uid!==uid)return json({error:'Only the client can submit payment details'},403);
  if(order.payment_verified_at)return json({error:'Payment is already verified'},409);
  const quote=await one(db,'SELECT version,amount_paise FROM workflow_quote_versions WHERE order_id=? ORDER BY version DESC LIMIT 1',id);
  if(!quote)return json({error:'Admin quote is required before payment'},409);
  const ref=plain(b.transactionRef,100),method=plain(b.method,40);
  if(!['UPI','Bank Transfer','Other'].includes(method)||ref.length<5||ref.length>100)return json({error:'Enter payment method and transaction reference'},400);
  const prior=await one(db,"SELECT id FROM workflow_payments WHERE order_id=? AND quote_version=? AND transaction_ref=? AND status IN ('Submitted','Verified')",id,quote.version,ref);
  if(prior)return json({error:'This payment reference is already submitted'},409);
  await db.prepare("INSERT INTO workflow_payments(id,order_id,quote_version,amount_paise,method,transaction_ref,status,submitted_by,submitted_at) VALUES(?,?,?,?,?,?,'Submitted',?,?)")
    .bind(crypto.randomUUID(),id,quote.version,quote.amount_paise,method,ref,uid,now).run();
  await audit(db,id,uid,'PAYMENT_REFERENCE_SUBMITTED',order.status,order.status,'Reference submitted for admin verification');
  return json({saved:true,status:'Submitted',notice:'Payment is not marked paid until admin independently verifies it.'});
 }
 if(action==='workflowPaymentVerify'){
  if(!admin)return json({error:'Admin only'},403);
  const payment=await one(db,"SELECT * FROM workflow_payments WHERE id=? AND order_id=? AND status='Submitted'",plain(b.paymentId,100),id);
  if(!payment)return json({error:'Pending payment not found'},404);
  const decision=plain(b.decision,20),receipt=plain(b.receiptNote,300);
  if(!['Verified','Rejected'].includes(decision)||receipt.length<5)return json({error:'Verification decision and evidence note required'},400);
  const quote=await one(db,'SELECT version,amount_paise FROM workflow_quote_versions WHERE order_id=? ORDER BY version DESC LIMIT 1',id);
  if(!quote||quote.version!==payment.quote_version||quote.amount_paise!==payment.amount_paise)return json({error:'Payment is tied to an outdated quote'},409);
  await db.prepare('UPDATE workflow_payments SET status=?,verified_by=?,verified_at=?,receipt_note=? WHERE id=? AND status=\'Submitted\'')
    .bind(decision,uid,now,receipt,payment.id).run();
  if(decision==='Verified'){
   const docs=await many(db,"SELECT f.id,COALESCE(r.status,'Pending') AS status FROM firm_order_files f LEFT JOIN workflow_document_reviews r ON r.file_id=f.id WHERE f.order_id=? AND f.kind='Document'",id);
   const verifiedDocs=docs.length>0&&docs.every(x=>x.status==='Verified');
   const next=verifiedDocs?'DOCUMENTS_VERIFIED':'AWAITING_DOCUMENTS';
   await db.batch([
    db.prepare("UPDATE firm_service_orders SET status=?,payment_verified_at=?,document_verified_at=COALESCE(document_verified_at,?),updated_at=? WHERE id=?").bind(next,now,verifiedDocs?now:null,now,id),
    db.prepare("UPDATE firm_billing SET status='Paid',updated_at=? WHERE order_id=? AND kind='Service'").bind(now,id)
   ]);
   await audit(db,id,uid,'PAYMENT_VERIFIED_OFFLINE',order.status,next,receipt);
   await notify(db,order.client_uid,id,'Payment verified for '+order.service+'. Upload required documents.');
  }else await audit(db,id,uid,'PAYMENT_REJECTED',order.status,order.status,receipt);
  return json({saved:true});
 }
 if(action==='workflowReviewDocument'){
  if(!requireAssigned(order,uid,firm))return json({error:'Assigned firm only'},403);
  if(['IN_PROGRESS','FILED_PENDING_REVIEW','COMPLETED','CANCELLED'].includes(order.status))return json({error:'Document review is closed after filing starts'},409);
  const file=await one(db,"SELECT id FROM firm_order_files WHERE id=? AND order_id=? AND kind='Document'",plain(b.fileId,90),id);
  if(!file)return json({error:'Supporting document unavailable'},404);
  const result=plain(b.decision,20),note=plain(b.note,400);
  if(!['Verified','Rejected'].includes(result)||result==='Rejected'&&note.length<5)return json({error:'Document review decision and rejection reason required'},400);
  await db.prepare("INSERT INTO workflow_document_reviews(file_id,order_id,status,reviewed_by,reviewed_at,note) VALUES(?,?,?,?,?,?) ON CONFLICT(file_id) DO UPDATE SET status=excluded.status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,note=excluded.note")
    .bind(file.id,id,result,uid,now,note).run();
  const docs=await many(db,"SELECT f.id,COALESCE(r.status,'Pending') AS status FROM firm_order_files f LEFT JOIN workflow_document_reviews r ON r.file_id=f.id WHERE f.order_id=? AND f.kind='Document'",id);
  const allVerified=docs.length>0&&docs.every(x=>x.status==='Verified');
  const next=result==='Rejected'?'AWAITING_DOCUMENTS':allVerified&&order.payment_verified_at?'DOCUMENTS_VERIFIED':order.status;
  await db.prepare('UPDATE firm_service_orders SET status=?,document_verified_at=?,updated_at=? WHERE id=?')
   .bind(next,allVerified?now:null,now,id).run();
  await audit(db,id,uid,'DOCUMENT_'+result.toUpperCase(),order.status,next,note||file.id);
  if(result==='Rejected')await notify(db,order.client_uid,id,'Document correction requested for '+order.service+'. '+note);
  if(allVerified)await notify(db,order.client_uid,id,'Documents verified for '+order.service);
  return json({saved:true,allVerified,status:next});
 }
 if(action==='workflowStartFiling'){
  if(!requireAssigned(order,uid,firm))return json({error:'Assigned firm only'},403);
  if(!order.payment_verified_at)return json({error:'Payment must be independently verified before filing'},409);
  const docs=await many(db,"SELECT f.id,COALESCE(r.status,'Pending') AS status FROM firm_order_files f LEFT JOIN workflow_document_reviews r ON r.file_id=f.id WHERE f.order_id=? AND f.kind='Document'",id);
  if(!docs.length||docs.some(x=>x.status!=='Verified'))return json({error:'Every supporting document must be verified before filing'},409);
  if(!['DOCUMENTS_VERIFIED','AWAITING_DOCUMENTS'].includes(order.status))return json({error:'This booking cannot start filing yet'},409);
  const result=await change(db,order,'IN_PROGRESS',u,'FILING_STARTED','Payment and supporting documents verified');
  if(result.status===200)await notify(db,order.client_uid,id,'Filing in progress: '+order.service);
  return result;
 }
 if(action==='workflowSubmitFiling'){
  if(!requireAssigned(order,uid,firm))return json({error:'Assigned firm only'},403);
  if(order.status!=='IN_PROGRESS')return json({error:'Start filing before submitting a result'},409);
  const final=await one(db,"SELECT id FROM firm_order_files WHERE order_id=? AND kind='Final file' ORDER BY created_at DESC LIMIT 1",id);
  if(!final)return json({error:'Upload a final return PDF before submitting'},409);
  const arn=plain(b.arn,120),filedDate=plain(b.filingDate,10);
  const requiresRef=!['GST Reconciliation','Compliance'].includes(order.service);
  if(!validDate(filedDate)||filedDate>new Date(now+19800000).toISOString().slice(0,10)||
     requiresRef&&arn.length<4||!requiresRef&&arn.length<4)
   return json({error:'Enter the filing date and ARN / acknowledgement or an appropriate filing reference'},400);
  const r=await change(db,order,'FILED_PENDING_REVIEW',u,'FILING_SUBMITTED',arn,{
   sql:"UPDATE firm_service_orders SET status='FILED_PENDING_REVIEW',arn=?,filing_date=?,updated_at=? WHERE id=? AND updated_at=?",
   params:[arn,filedDate,now,id,order.updated_at]
  });
  if(r.status===200)await notify(db,order.client_uid,id,'Filing submitted for final Admin review: '+order.service);
  return r;
 }
 if(action==='workflowFinalReview'){
  if(!admin)return json({error:'Admin only'},403);
  if(order.status!=='FILED_PENDING_REVIEW')return json({error:'The filing is not pending admin review'},409);
  const decision=plain(b.decision,20),note=plain(b.note,500);
  if(!['Approve','Rework'].includes(decision)||decision==='Rework'&&note.length<5)return json({error:'Review decision and rework reason required'},400);
  if(!order.payment_verified_at||!order.document_verified_at||!order.arn||!order.filing_date)return json({error:'Payment, documents and filing reference must be verified'},409);
  const final=await one(db,"SELECT id FROM firm_order_files WHERE order_id=? AND kind='Final file' LIMIT 1",id);
  if(!final)return json({error:'Final return PDF not uploaded'},409);
  const next=decision==='Approve'?'COMPLETED':'IN_PROGRESS';
  const result=await change(db,order,next,u,decision==='Approve'?'FINAL_APPROVED':'REWORK_REQUESTED',note,{
   sql:'UPDATE firm_service_orders SET status=?,final_approved_at=?,final_approved_by=?,updated_at=? WHERE id=? AND updated_at=?',
   params:[next,decision==='Approve'?now:null,decision==='Approve'?uid:null,now,id,order.updated_at]
  });
  if(result.status===200){
   await notify(db,order.client_uid,id,decision==='Approve'?'Final return approved. Download is now available.':'Filing under review: rework requested.');
   if(order.firm_uid!==order.client_uid)await notify(db,order.firm_uid,id,decision==='Approve'?'Final filing approved by Admin.':'Admin requested filing rework: '+note);
  }
  return result;
 }
 if(action==='workflowHold'){
  if(!admin)return json({error:'Admin only'},403);
  const reason=plain(b.reason,500),next=plain(b.status,20);
  if(['COMPLETED','CANCELLED'].includes(order.status))return json({error:'Closed booking cannot be changed'},409);
  if(!['ON_HOLD','CANCELLED'].includes(next)||reason.length<5)return json({error:'Reason is required for hold or cancellation'},400);
  return change(db,order,next,u,'EXCEPTION',reason);
 }
 return json({error:'Unknown workflow action'},400);
}
