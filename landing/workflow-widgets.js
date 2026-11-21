import {enhancePortalTableActions} from './portal-action-menu.js?v=actionmenu1';
// Booking lifecycle widgets. Render inside existing sidebars; no navigation items are added.
const el=(tag,content,cls)=>{const n=document.createElement(tag);if(content!==undefined)n.textContent=String(content);if(cls)n.className=cls;return n;};
const btn=(name,fn,primary=false)=>{const n=el('button',name,'action'+(primary?' primary':''));n.type='button';n.onclick=fn;return n;};
const field=(label,control)=>{const l=el('label');l.style.cssText='display:grid;gap:5px;margin:9px 0';l.append(el('strong',label),control);return l;};
const input=(type='text',value='')=>{const n=el('input');n.type=type;n.value=value??'';n.style.cssText='padding:9px;border:1px solid #dbe5f0;border-radius:8px;max-width:100%;box-sizing:border-box';return n;};
const select=options=>{const n=el('select');n.style.cssText='padding:9px;border:1px solid #dbe5f0;border-radius:8px;max-width:100%';for(const [v,l] of options)n.add(new Option(l,v));return n;};
const card=()=>{const n=el('section');n.style.cssText='border:1px solid #dbe5f0;border-radius:12px;padding:16px;background:#fff;margin:14px 0;min-width:0';return n;};
const date=v=>v?new Date(typeof v==='number'?v:v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}):'—';
const money=paise=>paise==null?'Quote pending':(Number(paise)/100).toLocaleString('en-IN',{style:'currency',currency:'INR'});
function table(container,columns,data){
 const wrap=el('div');wrap.className='portal-table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable data table');wrap.style.margin='12px 0';const t=el('table');t.className='portal-data-table';t.style.cssText='width:100%;border-collapse:collapse;font-size:13px;text-align:left';
 const h=t.createTHead().insertRow();for(const c of columns){const th=el('th',c);th.style.cssText='padding:10px;background:#eff6ff;white-space:nowrap';h.append(th);}
 const body=t.createTBody();for(const row of data){const tr=body.insertRow();for(const x of row){const td=tr.insertCell();td.style.cssText='padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top;overflow-wrap:anywhere';if(x instanceof Node)td.append(x);else td.textContent=String(x??'—');}}
 enhancePortalTableActions(t);wrap.append(t);container.append(data.length?wrap:el('p','No matching records.','empty'));
}
function pair(box,label,value){const p=el('p');p.style.margin='7px 0';p.append(el('strong',label+': '),el('span',value??'—'));box.append(p);}
const safeAction=async(b,output,job)=>{b.disabled=true;output.textContent='Working…';try{await job();}catch(e){output.textContent=e?.message||'Request failed';}finally{b.disabled=false;}};
const latestPayment=d=>d.payments?.find(x=>x.status==='Submitted'||x.status==='Verified')||null;
const taskNames={SUBMITTED:'To Do',UNDER_REVIEW:'Pending',QUOTE_APPROVED:'Pending',AWAITING_DOCUMENTS:'Documents Pending',DOCUMENTS_VERIFIED:'Documents Verified',IN_PROGRESS:'In Progress',FILED_PENDING_REVIEW:'Work Completed',AWAITING_PAYMENT:'Payment Pending',COMPLETED:'Completed',ON_HOLD:'On Hold',CANCELLED:'Cancelled'};
const taskName=s=>taskNames[s]||s||'—';
const paymentName=(o,last)=>o.payment_verified_at?'Paid':last==='Submitted'?'Verification Pending':last==='Rejected'?'Rejected':o.status==='AWAITING_PAYMENT'&&o.final_approved_at?'Pending':'Not Due';
function badge(value){
 const n=el('span',value);n.style.cssText='display:inline-flex;align-items:center;white-space:nowrap;border-radius:999px;padding:4px 10px;font-weight:650;font-size:12px;';
 const colors={'To Do':['#dbeafe','#1d4ed8'],Pending:['#fef3c7','#92400e'],'Documents Pending':['#fef3c7','#92400e'],'Documents Verified':['#dbeafe','#1d4ed8'],'In Progress':['#ede9fe','#6d28d9'],'Work Completed':['#cffafe','#155e75'],'Payment Pending':['#fef3c7','#92400e'],Completed:['#dcfce7','#166534'],Paid:['#dcfce7','#166534'],'Verification Pending':['#dbeafe','#1e40af'],'Not Due':['#f1f5f9','#475569'],Rejected:['#fee2e2','#991b1b'],Cancelled:['#fee2e2','#991b1b'],'On Hold':['#fee2e2','#991b1b']};
 const [bg,fg]=colors[value]||['#f1f5f9','#334155'];n.style.background=bg;n.style.color=fg;return n;
}
function milestones(box,d){
 box.append(el('h4','Filing Timeline'));
 const event=key=>(d.events||[]).find(x=>x.status===key)?.created_at;
 const rows=[
  ['Booking Confirmed',event('SUBMITTED')||d.order.created_at,d.order.booking_code||d.order.id],
  ['Firm Assigned',event('UNDER_REVIEW'),'Admin assigned responsible firm'],
  ['Documents Verified',d.order.document_verified_at,'Supporting documents verified'],
  ['Filing In Progress',event('IN_PROGRESS'),'Assigned firm started work'],
  ['Return Filed',event('FILED_PENDING_REVIEW'),'Firm submitted final return'],
  ['ARN / Acknowledgement Updated',d.order.arn?event('FILED_PENDING_REVIEW'):null,d.order.arn||'Pending'],
  ['Work Approved',d.order.final_approved_at,'Final work approved by Admin'],
  ['Payment Received',d.order.payment_verified_at,'Bank settlement verified'],
  ['Service Completed',event('COMPLETED'),'Paid and closed']
 ];
 table(box,['Milestone','Recorded at','Evidence'],rows.map(([label,when,evidence])=>[label,when?date(when):'Pending',when?evidence:'—']));
 const history=d.history||[];
 if(history.length){box.append(el('h4','Audit History'));table(box,['Time','Change','Remark'],history.map(x=>[date(x.created_at),x.action||x.to_status,x.detail||'—']));}
}
export async function renderClientServices(panel,{api,go,user,orders,openFiles,prefill={}}){
 const block=card();block.append(el('h3','My Services — Booked Services'));
 const status=select([['All','All statuses'],...Array.from(new Set(orders.map(x=>x.status))).map(x=>[x,x])]);
 const lookup=input('search');lookup.placeholder='Search booking ID, service or period';
 const toolbar=el('div');toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:12px;align-items:center';toolbar.append(field('Service status',status),field('Search',lookup));block.append(toolbar);
 const result=el('div');block.append(result);panel.append(block);
 function draw(){
  result.replaceChildren();
  const q=lookup.value.toLowerCase().trim();
  const list=orders.filter(o=>(status.value==='All'||o.status===status.value)&&
     [o.booking_code,o.id,o.service,o.period].some(v=>String(v||'').toLowerCase().includes(q)));
  table(result,['Booking ID','Service','Financial Year','Period','Task Status','Payment','Actions'],list.map(o=>{
   const actions=el('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:5px';
   actions.append(btn('View Details',()=>open(o)));
   actions.append(btn('Documents',()=>openFiles(o)));
   return [o.booking_code||o.id,o.service,o.financial_year||'—',o.period||'—',badge(taskName(o.status)),badge(paymentName(o)),actions];
  }));
 }
 async function open(o){
  panel.querySelector('.booking-detail')?.remove();
  const box=card();box.classList.add('booking-detail');block.after(box);
  const loading=el('p','Loading booking details…');box.append(loading);
  try{
   const d=await api({action:'workflowDetails',orderId:o.id});loading.remove();
   box.append(el('h3','Booking Details'));
   pair(box,'Booking ID',d.order.booking_code||d.order.id);pair(box,'Category',d.order.category);
   pair(box,'Service',d.order.service);pair(box,'Frequency',d.order.frequency);
   pair(box,'Financial year',d.order.financial_year);pair(box,'Filing period',d.order.period);
   pair(box,'Requested completion',d.order.requested_date||d.order.due_date);
   pair(box,'Task status',taskName(d.order.status));
   pair(box,'Assigned firm',d.assignedFirm?.name||d.assignedFirm?.email||'Awaiting Admin assignment');
   pair(box,'Approved quote',d.quote?money(d.quote.amount_paise)+' (Version '+d.quote.version+')':'Pending Admin approval');
   pair(box,'Payment',paymentName(d.order,latestPayment(d)?.status));
   const documents=d.documents?.filter(x=>x.kind==='Document')||[];
   box.append(el('h4','Document Checklist / Verification'));
   pair(box,'Service requirements',d.catalog?.document_requirements||'Confirm with assigned firm');
   table(box,['Document','Review status','Remarks'],documents.map(x=>[x.name,x.review_status,x.review_note||'—']));
   if(!documents.length)box.append(el('p','No supporting documents uploaded yet.'));
   const actions=el('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
   actions.append(btn('Upload / View Documents',()=>openFiles(o)),btn('Track Filing',()=>go('filings')),btn('Support',()=>go('support')));
   if(d.order.status==='COMPLETED')actions.append(btn('Download Final Return',()=>openFiles(o),true));
   box.append(actions);
   if(d.quote&&d.order.status==='AWAITING_PAYMENT'&&d.order.final_approved_at&&!d.order.payment_verified_at){
    const form=card();form.append(el('h4','Submit payment reference for verification'));
    const method=select([['UPI','UPI'],['Bank Transfer','Bank Transfer'],['Other','Other']]);
    const reference=input('text');reference.placeholder='UTR / transaction reference';reference.maxLength=100;
    form.append(field('Payment method',method),field('Transaction reference',reference));
    const feedback=el('p','This does not process payment. Admin must independently verify settlement.');form.append(feedback);
    const send=btn('Submit payment details',()=>safeAction(send,feedback,async()=>{
     const result=await api({action:'workflowPaymentSubmit',orderId:o.id,method:method.value,transactionRef:reference.value});
     feedback.textContent=result.notice||'Submitted for verification.';reference.value='';
    }),true);form.append(send);box.append(form);
   }
   if(d.quote&&!d.order.final_approved_at)box.append(el('p','Payment will be requested after the firm completes work and Admin approves the final return.'));
   if(d.payments?.length){box.append(el('h4','Payment Submissions'));table(box,['Method','Reference','Amount','Status','Date'],d.payments.map(x=>[x.method,x.transaction_ref,money(x.amount_paise),x.status,date(x.submitted_at)]));}
   milestones(box,d);box.append(btn('Close Details',()=>box.remove()));
   box.scrollIntoView({block:'start',behavior:'smooth'});
  }catch(e){loading.textContent=e.message||'Unable to open booking';}
 }
 status.onchange=draw;lookup.oninput=draw;draw();
 if(prefill.orderId){const match=orders.find(o=>o.id===prefill.orderId);if(match)void open(match);}
}
export async function renderClientNotifications(panel,{api}){
 const box=card(),info=el('p','Loading notifications…');box.append(el('h3','Service Notifications'),info);panel.append(box);
 try{const data=await api({action:'workflowNotifications'});info.remove();
  table(box,['When','Notification'],data.rows.map(x=>[date(x.created_at),x.message]));}
 catch(e){info.textContent=e.message||'Unable to load notifications';}
}
export async function renderReports(panel,{api,user}){
 const box=card();box.append(el('h3','Reports & Analytics'));box.append(el('p','Reports are limited to your account records. Downloads use the same selected filters.'));
 const controls=el('div');controls.style.cssText='display:flex;flex-wrap:wrap;gap:12px';
 const from=input('date'),to=input('date');
 const years=['All','2023-24','2024-25','2025-26','2026-27'];
 const year=select(years.map(x=>[x,x]));
 const kind=select(['Bookings','Payments','Filing Progress','Completed Services','Document Status'].map(x=>[x,x]));
 for(const [name,node] of [['From date',from],['To date',to],['Financial year',year],['Report type',kind]])controls.append(field(name,node));
 box.append(controls);
 const info=el('p','Select filters and click View Report.');info.setAttribute('role','status');box.append(info);
 const result=el('div');box.append(result);panel.append(box);let report=null,page=0;
 const size=20;
 const columns=['Booking ID','Client','Service','Financial Year','Period','Status','Amount (INR)','Created'];
 const values=r=>[r.booking_code||r.id,r.client_name,r.service,r.financial_year||'—',r.period||'—',r.payment?.status||r.status,(r.payment?.amount_paise??r.amount_paise)!=null?money(r.payment?.amount_paise??r.amount_paise):'—',date(r.created_at)];
 const render=()=>{result.replaceChildren();if(!report)return;
  table(result,columns,report.rows.slice(page*size,(page+1)*size).map(values));
  const paging=el('div');paging.style.cssText='display:flex;align-items:center;gap:12px';
  const previous=btn('Previous',()=>{if(page>0){page--;render();}}),next=btn('Next',()=>{if((page+1)*size<report.rows.length){page++;render();}});
  previous.disabled=page===0;next.disabled=(page+1)*size>=report.rows.length;
  paging.append(previous,el('span','Page '+(page+1)+' / '+Math.max(1,Math.ceil(report.rows.length/size))),next);result.append(paging);
 };
 const actions=el('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;margin:12px 0';
 const view=btn('View Report',()=>safeAction(view,info,async()=>{
  if(from.value&&to.value&&from.value>to.value)throw Error('From date cannot be after To date');
  report=await api({action:'workflowReport',from:from.value,to:to.value,financialYear:year.value,reportType:kind.value});page=0;render();
  info.textContent=report.count+' records · Total '+money(report.totalPaise)+' · Generated '+date(report.generatedAt);
 }),true);
 const excel=btn('Download Excel',()=>safeAction(excel,info,async()=>{
  if(!report)throw Error('View the report first');
  const module=await import('./workflow-export.js?v=v1');
  await module.downloadWorkflowExcel(report);
  info.textContent='Excel report generated.';
 }));
 const pdf=btn('Download PDF',()=>safeAction(pdf,info,async()=>{
  if(!report)throw Error('View the report first');
  const module=await import('./portal-pdf.js?v=workflow1');await module.downloadWorkflowReportPdf(report,user);
  info.textContent='PDF report generated.';
 }));
 actions.append(view,excel,pdf);box.append(actions);
}
export async function renderFirmWorkflow(panel,{api,user,orders,openFiles}){
 const box=card();box.append(el('h3','Assigned Filing Workflow'));
 box.append(el('p','Review documents, verify the filing prerequisites and submit the final return for Admin approval.'));
 const target=select([['','Select assigned booking'],...orders.map(o=>[o.id,(o.booking_code||o.id)+' · '+o.client_name+' · '+o.service])]);
 const output=el('div'),feedback=el('p','');
 box.append(field('Assigned booking',target),feedback,output);panel.append(box);
 async function show(){
  output.replaceChildren();if(!target.value)return;
  feedback.textContent='Loading booking…';
  try{
   const d=await api({action:'workflowDetails',orderId:target.value});feedback.textContent='';
   pair(output,'Booking ID',d.order.booking_code||d.order.id);pair(output,'Client',d.order.client_name);
   pair(output,'Service',d.order.service);pair(output,'Status',d.order.status);pair(output,'Required documents',d.catalog?.document_requirements||'Follow service instructions');
   pair(output,'Payment',paymentName(d.order,latestPayment(d)?.status));
   output.append(btn('Open Documents / Upload Final',()=>openFiles(d.order),true));
   output.append(el('h4','Document Review'));
   table(output,['File','Current status','Review'],(d.documents||[]).filter(x=>x.kind==='Document').map(x=>{
    const controls=el('div'),remark=input();remark.placeholder='Reason / note';remark.maxLength=400;
    for(const decision of ['Verified','Rejected']){
     const b=btn(decision,()=>safeAction(b,feedback,async()=>{
      await api({action:'workflowReviewDocument',orderId:d.order.id,fileId:x.id,decision,note:remark.value});
      feedback.textContent='Document review saved.';await show();
     }));controls.append(b);
    }
    controls.append(remark);return[x.name,x.review_status,controls];
   }));
   const start=btn('Start Work / Filing',()=>safeAction(start,feedback,async()=>{
    await api({action:'workflowStartFiling',orderId:d.order.id});await show();
   }),true);start.disabled=d.order.status!=='DOCUMENTS_VERIFIED';output.append(start);
   output.append(el('h4','Submit Filed Return'));
   const arn=input();arn.placeholder='ARN / acknowledgement / reference';arn.maxLength=120;
   const filingDate=input('date');filingDate.max=new Date().toISOString().slice(0,10);
   const submit=btn('Submit for Admin Review',()=>safeAction(submit,feedback,async()=>{
    await api({action:'workflowSubmitFiling',orderId:d.order.id,arn:arn.value,filingDate:filingDate.value});await show();
   }),true);
   submit.disabled=d.order.status!=='IN_PROGRESS';
   output.append(field('ARN / acknowledgement',arn),field('Actual filing date',filingDate),submit);
   milestones(output,d);
  }catch(e){feedback.textContent=e.message||'Unable to load booking';}
 }
 target.onchange=show;
}
export async function renderAdminWorkflow(panel,{api,openFiles}){
 const section=card();section.classList.add('workflow-booking-review');section.append(el('h3','Booking Review — Admin / Firm Handoffs'));
 section.append(el('p','Price approval, firm assignment, payment verification, final review and audit trail. Client records remain private.'));
 const status=el('p','Loading bookings…');section.append(status);
 const toolbar=el('div');toolbar.style.cssText='display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:12px';
 const search=input('search');search.placeholder='Search booking ID, client, email or service';search.setAttribute('aria-label','Search service bookings');search.style.flex='1 1 220px';
 const stage=select([['All','All statuses']]);stage.setAttribute('aria-label','Filter booking status');
 const assigned=select([['All','All firms'],['Unassigned','Unassigned bookings']]);assigned.setAttribute('aria-label','Filter assigned firm');
 const refreshBtn=btn('Refresh Bookings',()=>reload());toolbar.append(search,stage,assigned,refreshBtn);
 const count=el('p','');count.setAttribute('role','status');
 const list=el('div');section.append(toolbar,count,list);panel.append(section);let orders=[],firms=[];
 async function open(order){
  section.querySelector('.admin-booking-review')?.remove();
  const box=card();box.classList.add('admin-booking-review');section.append(box);
  const info=el('p','Loading details…');box.append(info);
  try{
   const d=await api({action:'workflowDetails',orderId:order.id});info.textContent='';
   box.append(el('h4','Booking '+(d.order.booking_code||d.order.id)));
   pair(box,'Financial Year / Frequency',(d.order.financial_year||'—')+' / '+(d.order.frequency||'—'));
   pair(box,'Client',d.order.client_name+' / '+(d.client?.email||''));
   pair(box,'Service',d.order.service+' · '+d.order.period);
   pair(box,'Task status',taskName(d.order.status));pair(box,'Payment status',paymentName(d.order,latestPayment(d)?.status));
   pair(box,'Requested date',d.order.requested_date||d.order.due_date);
   pair(box,'Firm',d.assignedFirm?.email||'Unassigned');
   const notice=el('p','');notice.setAttribute('role','status');box.append(notice);
   const assign=select([['','Select firm'],...firms.map(f=>[f.uid,(f.name||f.email)+' · '+f.email])]);
   if(d.order.firm_uid!==d.order.client_uid)assign.value=d.order.firm_uid;
   const assignBtn=btn('Assign / Reassign Firm',()=>safeAction(assignBtn,notice,async()=>{
    if(!assign.value)throw Error('Select an active firm first.');
    if(order.firm_uid!==order.client_uid&&order.firm_uid!==assign.value&&!confirm('Reassign this client and booking to the selected firm?'))return;
    await api({action:'workflowAssign',orderId:order.id,firmUid:assign.value});notice.textContent='Firm assigned to client and booking.';await reload();await open(order);
   }));
   assignBtn.disabled=!firms.length||['COMPLETED','CANCELLED'].includes(d.order.status);
   box.append(field('Assigned Firm',assign),assignBtn);
   const quote=card();quote.append(el('h4','Admin Approved Quote'));
   pair(quote,'Current quote',d.quote?money(d.quote.amount_paise)+' (v'+d.quote.version+')':'Not approved');
   const amount=input('number',d.quote?String(d.quote.amount_paise/100):'');amount.min='1';amount.step='0.01';
   const save=btn('Approve / Revise Quote',()=>safeAction(save,notice,async()=>{
    if(!Number.isFinite(Number(amount.value))||Number(amount.value)<=0)throw Error('Enter a valid amount');
    await api({action:'workflowQuote',orderId:order.id,amountPaise:Math.round(Number(amount.value)*100)});
    notice.textContent='Quote approved. Payment will be requested after Admin approves the finished work.';await reload();await open(order);
   }),true);quote.append(field('Amount (INR)',amount),save);box.append(quote);
   if(d.payments?.length){
    box.append(el('h4','Payment Verification'));
    for(const p of d.payments){
     const row=card();pair(row,'Payment',p.method+' / '+p.transaction_ref+' / '+money(p.amount_paise));pair(row,'Status',p.status);
     if(p.status==='Submitted'){
      const note=input();note.placeholder='Independent settlement evidence / receipt';note.maxLength=300;
      row.append(field('Evidence / verification note',note));
      for(const decision of ['Verified','Rejected']){
       const button=btn(decision,()=>safeAction(button,notice,async()=>{
        if(decision==='Verified'&&!confirm('Confirm you independently verified settlement with bank/provider records?'))return;
        await api({action:'workflowPaymentVerify',orderId:order.id,paymentId:p.id,decision,receiptNote:note.value});
        await open(order);
       }),decision==='Verified');row.append(button);
      }
     }box.append(row);
    }
   }
   const final=card();final.append(el('h4','Final Review — Approve Work, Then Request Payment'));
   pair(final,'Filing date',d.order.filing_date||'Pending');pair(final,'ARN / Reference',d.order.arn||'Pending');
   pair(final,'Final approved',d.order.final_approved_at?date(d.order.final_approved_at):'No');
   final.append(btn('Manage uploaded files',()=>openFiles(order)));
   const reason=input();reason.placeholder='Rework reason / approval note';reason.maxLength=500;final.append(field('Review remarks',reason));
   for(const decision of ['Approve','Rework']){
    const b=btn(decision==='Approve'?'Approve Final Return':'Request Rework',()=>safeAction(b,notice,async()=>{
     await api({action:'workflowFinalReview',orderId:order.id,decision,note:reason.value});await reload();await open(order);
    }),decision==='Approve');
    b.disabled=d.order.status!=='FILED_PENDING_REVIEW';final.append(b);
   }box.append(final);
   const hold=card();const why=input();why.placeholder='Hold / cancellation reason';why.maxLength=500;
   hold.append(field('Reason',why));for(const state of ['ON_HOLD','CANCELLED']){
    const action=btn(state==='ON_HOLD'?'Put On Hold':'Cancel Booking',()=>safeAction(action,notice,async()=>{
     await api({action:'workflowHold',orderId:order.id,status:state,reason:why.value});await reload();await open(order);
    }));hold.append(action);
   }box.append(hold);
   milestones(box,d);
   box.append(btn('Close Review',()=>box.remove()));box.scrollIntoView({behavior:'smooth',block:'start'});
  }catch(e){info.textContent=e.message||'Unable to load booking';}
 }
 function quickAssign(order){
  section.querySelector('.booking-quick-assign')?.remove();
  section.querySelector('.admin-booking-review')?.remove();
  const box=card();box.classList.add('booking-quick-assign');
  box.append(el('h4',(order.firm_uid===order.client_uid?'Assign':'Reassign')+' Firm — '+(order.booking_code||order.id)));
  pair(box,'Customer',(order.client_name||'Client')+' · '+(order.client_email||'—'));
  pair(box,'Service',order.service+' · '+(order.period||'—'));
  const picker=select([['','Select active firm'],...firms.map(f=>[f.uid,(f.name||f.email)+' · '+f.email])]);
  picker.setAttribute('aria-label','Active firm for service booking');
  if(firms.some(f=>f.uid===order.firm_uid))picker.value=order.firm_uid;
  const feedback=el('p','This assigns the booking and customer to the selected firm. Existing other bookings are unchanged.');
  feedback.setAttribute('role','status');
  const save=btn('Confirm Firm Assignment',()=>safeAction(save,feedback,async()=>{
   if(!picker.value)throw Error('Select an active firm.');
   if(order.firm_uid===picker.value){feedback.textContent='This booking is already assigned to that firm.';return;}
   if(order.firm_uid!==order.client_uid&&!confirm('Reassign this client and booking to the selected firm?')){feedback.textContent='Reassignment cancelled.';return;}
   const choice=firms.find(f=>f.uid===picker.value);
   await api({action:'workflowAssign',orderId:order.id,firmUid:picker.value});
   box.remove();await reload();
   status.textContent='Booking '+(order.booking_code||order.id)+' assigned to '+(choice?.email||'selected firm')+'.';
  }),true);
  save.disabled=!firms.length;
  box.append(field('Select Firm',picker),feedback,save,btn('Cancel',()=>box.remove()));
  section.insertBefore(box,list);box.scrollIntoView({behavior:'smooth',block:'nearest'});picker.focus();
 }
 function draw(){
  list.replaceChildren();const q=search.value.toLowerCase().trim();
  const filtered=orders.filter(o=>
   [o.booking_code,o.id,o.client_name,o.client_email,o.service,o.category,o.financial_year,o.period].some(v=>String(v||'').toLowerCase().includes(q))&&
   (stage.value==='All'||o.status===stage.value)&&
   (assigned.value==='All'||assigned.value==='Unassigned'&&o.firm_uid===o.client_uid||o.firm_uid===assigned.value)
  );
  count.textContent=filtered.length+' of '+orders.length+' bookings shown (latest 300).';
  table(list,['Booking ID','Customer','Email','Service','Financial Year','Filing Period','Assigned Firm','Task Status','Payment Status','Amount','Booked On','Actions'],filtered.map(o=>{
   const actions=el('div');
   actions.append(btn('View Details',()=>open(o),true));
   if(!['COMPLETED','CANCELLED'].includes(o.status))actions.append(btn(o.firm_uid===o.client_uid?'Assign Firm':'Reassign Firm',()=>quickAssign(o)));
   actions.append(btn('Manage Files',()=>openFiles(o)));
   return [o.booking_code||o.id,o.client_name||'Client',o.client_email||'—',o.service||'—',o.financial_year||'—',o.period||'—',o.firm_uid===o.client_uid?'Unassigned':o.assigned_email||'Firm assigned',badge(taskName(o.status)),badge(paymentName(o,o.latest_payment_status)),money(o.quote_amount_paise),date(o.created_at),actions];
  }));
 }
 async function reload(){
  refreshBtn.disabled=true;
  try{
   const r=await api({action:'workflowAdminOrders'});if(!section.isConnected)return;orders=r.orders;firms=r.firms;
   const prevStatus=stage.value,prevFirm=assigned.value;
   stage.replaceChildren();stage.add(new Option('All statuses','All'));
   for(const state of [...new Set(orders.map(o=>o.status).filter(Boolean))].sort())stage.add(new Option(state,state));
   if([...stage.options].some(o=>o.value===prevStatus))stage.value=prevStatus;
   assigned.replaceChildren();assigned.add(new Option('All firms','All'));assigned.add(new Option('Unassigned bookings','Unassigned'));
   for(const f of firms)assigned.add(new Option((f.name||f.email)+' · '+f.email,f.uid));
   if([...assigned.options].some(o=>o.value===prevFirm))assigned.value=prevFirm;
   draw();
   const total=orders.length,todo=orders.filter(o=>o.status==='SUBMITTED').length,working=orders.filter(o=>o.status==='IN_PROGRESS').length,
    due=orders.filter(o=>paymentName(o,o.latest_payment_status)==='Pending').length,paid=orders.filter(o=>o.payment_verified_at).length;
   status.textContent=total+' bookings · To Do: '+todo+' · In Progress: '+working+' · Payment Pending: '+due+' · Paid: '+paid;
  }catch(e){status.textContent=e.message||'Unable to load bookings';}
  finally{refreshBtn.disabled=false;}
 }
 search.oninput=draw;stage.onchange=assigned.onchange=draw;await reload();
 const catalogue=card();catalogue.append(el('h3','Service Catalog & Document Requirements'));
 const description=el('p','Changes affect which services clients can book and what the assigned firm needs to review.');
 catalogue.append(description);section.after(catalogue);
 try{
  const data=await api({action:'workflowCatalog'});
  const rows=data.rows||[];
  table(catalogue,['Service / category','Frequency','Active','Document requirements','Action'],rows.map(r=>{
   const toggle=select([['true','Enabled'],['false','Disabled']]);toggle.value=String(r.active===1);
   const req=el('textarea');req.rows=3;req.maxLength=400;req.value=r.document_requirements||'Supporting documents requested by assigned firm';
   req.style.cssText='padding:8px;min-width:175px;max-width:100%;box-sizing:border-box';
   const save=btn('Save',()=>safeAction(save,description,async()=>{
    await api({action:'workflowCatalogUpdate',service:r.service,active:toggle.value==='true',documentRequirements:req.value});
    description.textContent='Catalog updated for '+r.service;
   }));
   return [r.service+' / '+r.category,r.frequencies,toggle,req,save];
  }));
 }catch(e){description.textContent='Unable to load catalog: '+(e.message||'Unknown error');}
}
