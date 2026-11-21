import {financialYears,periodTypes,periodOptions} from './filing-periods.js?v=dashboardfix2';
import {renderClientServices,renderClientNotifications,renderReports} from './workflow-widgets.js?v=workflow1';
const pdfModule=()=>import('./portal-pdf.js?v=due1');
const downloadBillingPdf=async(...args)=>(await pdfModule()).downloadBillingPdf(...args);
const downloadFilingPdf=async(...args)=>(await pdfModule()).downloadFilingPdf(...args);
const downloadFilingListPdf=async(...args)=>(await pdfModule()).downloadFilingListPdf(...args);
const downloadBillingListPdf=async(...args)=>(await pdfModule()).downloadBillingListPdf(...args);
import {showOrderFiles,orderFileFetch} from './firm-workspace.js?v=dashboardfix2';
import {EmailAuthProvider,reauthenticateWithCredential,updatePassword,verifyBeforeUpdateEmail} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;};
const button=(txt,fn,primary=false)=>{const b=el('button',txt,'action'+(primary?' primary':''));b.type='button';b.onclick=fn;return b;};
const date=v=>new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
const money=v=>v==null?'Quote pending':(v/100).toLocaleString('en-IN',{style:'currency',currency:'INR'});
const select=opts=>{const n=el('select');n.style.cssText='padding:10px;border:1px solid #ccd9eb;border-radius:8px;max-width:100%';for(const [v,l] of opts)n.add(new Option(l,v));return n;};
const input=(placeholder,value='',type='text')=>{const n=el('input');n.type=type;n.placeholder=placeholder;n.value=value||'';n.style.cssText='padding:10px;border:1px solid #ccd9eb;border-radius:8px;font:inherit;width:100%;box-sizing:border-box';return n;};
const field=(label,n)=>{const l=el('label');l.style.cssText='display:grid;gap:6px;margin:12px 0;max-width:540px';l.append(el('strong',label),n);return l;};
function table(panel,headers,rows){const wrap=el('div');wrap.style.overflowX='auto';const t=el('table');t.style.cssText='width:100%;border-collapse:collapse;text-align:left;font-size:13px';const h=t.createTHead().insertRow();for(const x of headers){const th=el('th',x);th.style.cssText='padding:12px;background:#f4f8ff;white-space:nowrap';h.append(th);}const body=t.createTBody();for(const row of rows){const tr=body.insertRow();for(const x of row){const td=tr.insertCell();td.style.cssText='padding:12px;border-bottom:1px solid #e3eaf3;vertical-align:top;overflow-wrap:anywhere';if(x instanceof Node)td.append(x);else td.textContent=x??'—';}}wrap.append(t);panel.append(rows.length?wrap:el('p','No records available.','empty'));}
function saveFile(name,blob){const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const locked=async(b,msg,fn)=>{if(b.disabled)return;b.disabled=true;try{await fn();}catch(e){msg.textContent=e.message||'Request failed';}finally{b.disabled=false;}};
export async function showTicketThread(panel,ticket,{api,user,admin=false}){
 panel.querySelector('.ticket-thread')?.remove();const box=el('div',undefined,'ticket-thread');box.style.cssText='border:1px solid #ccd9eb;padding:16px;border-radius:10px;margin:16px 0';panel.append(box);
 const title=el('h3',ticket.subject),msg=el('p','Loading conversation…'),list=el('div'),attachmentList=el('div');box.append(title,msg,list,attachmentList);
 const reply=el('textarea');reply.rows=4;reply.maxLength=3000;reply.placeholder='Write a reply';reply.style.cssText='padding:10px;width:100%;box-sizing:border-box';const send=button('Send reply',()=>locked(send,msg,async()=>{await api({action:'workspaceThreadReply',ticketId:ticket.id,message:reply.value});reply.value='';await load();}),true);
 const file=input('','', 'file');file.accept='.pdf,.jpg,.jpeg,.png,.csv,.xls,.xlsx';const attach=button('Upload attachment',()=>locked(attach,msg,async()=>{if(!file.files.length)throw Error('Select a file');const fd=new FormData();fd.append('ticketId',ticket.id);fd.append('file',file.files[0]);await orderFileFetch(user,fd);file.value='';await load();}));
 box.append(field('Reply',reply),send,field('Attachment (up to 10 MB)',file),attach,button('Close',()=>box.remove()));
 async function load(){const d=await api({action:'workspaceThread',ticketId:ticket.id});if(!box.isConnected)return;msg.textContent=d.status;list.replaceChildren();const messages=[{author:'Customer',body:d.initial},...d.messages];if(d.reply&&!d.messages.some(x=>x.author==='Admin'&&x.body===d.reply))messages.push({author:'Admin',body:d.reply});for(const x of messages){const p=el('div');p.style.cssText='background:#f8fafc;border-radius:8px;padding:12px;margin:8px 0;white-space:pre-wrap';p.append(el('strong',x.author+(x.created_at?' · '+date(x.created_at):'')),el('p',x.body));list.append(p);}reply.disabled=send.disabled=d.status==='Resolved';attachmentList.replaceChildren();table(attachmentList,['Attachments','Action'],d.files.map(x=>[x.name,button('Download',async()=>{try{const r=await orderFileFetch(user,{id:x.id,ticket:true});saveFile(x.name,await r.blob());}catch(e){msg.textContent=e.message;}})]));}
 try{await load();}catch(e){msg.textContent=e.message;}
}
export async function renderBusiness(panel,section,{api,user,go,prefill={}}){
 const msg=el('p','Loading…');msg.setAttribute('role','status');panel.append(msg);
 try{const d=await api({action:'workspaceData'});if(!panel.isConnected)return;msg.textContent='';
 if(section==='overview'){
 const grid=el('div',undefined,'stats');grid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:12px';
 const active=d.orders.filter(o=>!['Completed','Cancelled','Awaiting payment'].includes(o.status)).length,pending=d.orders.filter(o=>['Paid','Documents Required','Documents needed'].includes(o.status)).length;
 const values=[['Active Services',active,'filings'],['Pending Documents',pending,'documents'],['Unpaid Billing',d.billing.filter(b=>b.status!=='Paid').length,'billing']];
 for(const [label,count,target] of values){const card=button('',()=>go(target));card.className='stat';card.style.cssText='text-align:left;cursor:pointer;min-height:100px;background:#fff;border:1px solid #e3eaf3;border-radius:12px;padding:16px';card.append(el('div',label,'stat-label'),el('strong',String(count),'stat-number'));grid.append(card);}panel.append(grid);
 const activeAlerts=d.orders.filter(o=>['Documents Required','Documents needed'].includes(o.status));panel.append(el('h3','Latest updates'));for(const o of activeAlerts){const p=el('p',o.service+' — additional documents required');p.append(button('Upload',()=>go('documents',{orderId:o.id})));panel.append(p);}
 table(panel,['Recent service','Period','Due / requested date','Status'],d.orders.slice(0,5).map(o=>[o.service,o.period||'—',o.due_date||'—',o.status]));return;
 }
 if(section==='services'){
 const dueBooking=false;
 panel.append(el('p',dueBooking?'Choose your service, filing period and requested completion date. Published deadlines are shown separately and must be verified for applicability.':'Choose a service and filing period. Your booking will appear for your assigned firm and in Filing Status. Payment requires an admin quote.'));
 const catalogue=(await api({action:'workflowCatalog'})).rows.filter(x=>x.active===1);
 const mapping={};for(const item of catalogue)(mapping[item.category]??=[]).push(item.service);
 if(!catalogue.length)panel.append(el('p','There are currently no active booking services.'));
 const cat=select(Object.keys(mapping).map(x=>[x,x])),svc=select([]),frequency=select([]),fy=select(financialYears.map(y=>[y,y])),period=select([]);
 const fyField=field('Financial year',fy),periodField=field('Filing period',period);
 const schedule=select([['','Choose my own date']]),requested=input('','', 'date');
 requested.min=new Date(Date.now()+19800000).toISOString().slice(0,10);requested.required=true;
 const dueHint=el('p','Choose a requested completion date, or select a matching published schedule.');dueHint.style.cssText='font-size:13px;color:#64748b';
 const matching=()=>d.dueDates.filter(x=>x.service===svc.value&&[period.value,'FY '+period.value].includes(x.period));
 function syncDate(){const item=matching().find(x=>x.id===schedule.value);requested.readOnly=!!item;if(item)requested.value=item.due_date;dueHint.textContent=item?'Published deadline selected. Confirm applicability to your business.':'Requested completion date (not a statutory deadline).';}
 function syncSchedule(){const prior=schedule.value;schedule.replaceChildren();schedule.add(new Option('Choose my own date',''));for(const x of matching())schedule.add(new Option(x.due_date+' — Published deadline',x.id));if(matching().some(x=>x.id===prior))schedule.value=prior;else if(prior)requested.value='';syncDate();}
 schedule.onchange=()=>{requested.value='';syncDate();};

 const hint=el('p');hint.style.cssText='font-size:13px;color:#64748b;margin:8px 0';
 const current=new Date(),start=current.getMonth()>=3?current.getFullYear():current.getFullYear()-1;const currentFY=start+'-'+String(start+1).slice(-2);if(financialYears.includes(currentFY))fy.value=currentFY;
 function syncPeriods(){const type=frequency.value;period.replaceChildren();for(const [v,l] of periodOptions(type,fy.value))period.add(new Option(l,v));fyField.style.display=periodField.style.display=type==='Not applicable'?'none':'grid';hint.textContent=type==='Quarterly'&&['GSTR-1 Filing','GSTR-3B Filing'].includes(svc.value)?'Quarterly GST filing is subject to QRMP eligibility.':type==='Yearly'?'Financial year runs from 1 April to 31 March.':'';}
 function syncFrequency(){frequency.replaceChildren();const spec=catalogue.find(x=>x.service===svc.value);for(const v of String(spec?.frequencies||'').split(',').filter(Boolean))frequency.add(new Option(v,v));syncPeriods();}
 function sync(){svc.replaceChildren();for(const v of mapping[cat.value]||[])svc.add(new Option(v,v));syncFrequency();}
 if(prefill.service){const found=Object.keys(mapping).find(k=>mapping[k].includes(prefill.service));if(found)cat.value=found;}
 sync();if(prefill.service&&Array.from(svc.options).some(o=>o.value===prefill.service)){svc.value=prefill.service;syncFrequency();}
 if(prefill.period){let matched=false;outer:for(const t of periodTypes(svc.value))for(const y of financialYears){const opts=periodOptions(t,y);const match=opts.find(([v])=>v===prefill.period||('FY '+v)===prefill.period);if(match){frequency.value=t;fy.value=y;syncPeriods();period.value=match[0];matched=true;break outer;}}if(!matched){period.selectedIndex=-1;msg.textContent='Select the correct filing period for this due date.';}}
 cat.onchange=()=>{sync();syncSchedule();};svc.onchange=()=>{syncFrequency();syncSchedule();};frequency.onchange=fy.onchange=()=>{syncPeriods();syncSchedule();};period.onchange=syncSchedule;syncSchedule();
 if(prefill.dueId&&matching().some(x=>x.id===prefill.dueId)){schedule.value=prefill.dueId;syncDate();}
 if(dueBooking){panel.append(el('h3','Schedule a Service'));}
 panel.append(field('Category',cat),field('Service',svc),field('Filing frequency',frequency),fyField,periodField,hint,field('Due date option',schedule),field('Requested completion date',requested),dueHint);
 let key=crypto.randomUUID();
 const book=button('View Summary & Confirm Booking',()=>locked(book,msg,async()=>{
  if(!svc.value||!period.value)throw Error('Choose service and filing period');
  if(!requested.value||!requested.checkValidity())throw Error('Select a valid requested completion date');
  const summary=['BOOKING SUMMARY','Category: '+cat.value,'Service: '+svc.value,'Frequency: '+frequency.value,'Financial year: '+fy.value,'Filing period: '+period.value,'Requested completion: '+requested.value,'Price: Pending Admin quotation','','Confirm this service request?'].join('\n');
  if(!confirm(summary))return;
  const r=await api({action:'workflowBook',category:cat.value,service:svc.value,frequency:frequency.value,financialYear:fy.value,period:period.value,requestedDate:requested.value,requestId:key});
  key=crypto.randomUUID();alert('Booking request received. Booking ID: '+r.bookingId+'\nAdmin will review your booking and confirm the quote.');
  go('services',{orderId:r.id});
 }),true);
 panel.append(book);
 await renderClientServices(panel,{api,user,go,orders:d.orders,openFiles:o=>showOrderFiles(panel,o,api,user),prefill});
 }else if(section==='reports'){
 await renderReports(panel,{api,user});
 }else if(section==='documents'){
 const available=d.orders.filter(o=>o.status!=='Cancelled'),order=select([['','Select order'],...available.map(o=>[o.id,o.service+' · '+(o.period||'—')+' · '+o.status])]);panel.append(field('Order',order));if(prefill.orderId)order.value=prefill.orderId;const show=()=>{panel.querySelector('.order-file-box')?.remove();const o=available.find(x=>x.id===order.value);if(o)void showOrderFiles(panel,o,api,user);};order.onchange=show;show();if(!available.length)panel.append(button('Book a service',()=>go('services'),true));
 }else if(section==='notifications'){
 await renderClientNotifications(panel,{api});
 }else if(section==='filings'){
 const rows=section==='notifications'?d.orders.filter(o=>['Documents Required','Documents needed'].includes(o.status)):d.orders;
 if(section==='filings'){const allPdf=button('Download Report PDF',()=>locked(allPdf,msg,()=>downloadFilingListPdf(rows,user)));panel.append(allPdf);}
 table(panel,['Service','Period','Due / requested date','Date type','Filing status','Action'],rows.map(o=>{const a=el('div');a.append(button('Timeline',()=>locked(a.firstChild,msg,async()=>{const t=await api({action:'workspaceTimeline',orderId:o.id});panel.querySelector('.filing-timeline')?.remove();const box=el('div',undefined,'filing-timeline');box.append(el('h3',o.service+' — Timeline'),el('p','Current status: '+t.status));table(box,['Event','Date / time'],t.rows.map(x=>[x.status,date(x.created_at)]));box.append(button('Documents / final return',()=>showOrderFiles(panel,o,api,user)));panel.append(box);})),button('Documents / return',()=>go('documents',{orderId:o.id})));const pdf=button('Download PDF',()=>locked(pdf,msg,()=>downloadFilingPdf(o,user,api)));a.append(pdf);return[o.service,o.period||'—',o.due_date||'—',o.due_date_source||'—',o.status,a];}));

 }else if(section==='billing'){
 panel.append(el('p','Payment requests and billing summaries. GST tax invoices and online payment require gateway and invoicing configuration.'));
 const statement=button('Download Statement PDF',()=>locked(statement,msg,()=>downloadBillingListPdf(d.billing,user)));panel.append(statement);
 table(panel,['Service','Amount','Payment status','Action'],d.billing.map(x=>{const a=el('div');const pdf=button('Download PDF',()=>locked(pdf,msg,()=>downloadBillingPdf(x,user,d.orders.find(o=>o.id===x.order_id))));a.append(pdf);if(x.status!=='Paid')a.append(button('View Payment Request',()=>go('services',{orderId:x.order_id})));return[x.title,money(x.amount_paise),x.status,a];}));

 }else if(section==='support'){
 const subject=input('Subject'),body=el('textarea');body.rows=4;body.maxLength=3000;body.placeholder='Describe your issue';const order=select([['','No linked order'],...d.orders.map(x=>[x.id,x.service+' · '+(x.period||'')])]);const file=input('','','file');file.accept='.pdf,.jpg,.jpeg,.png,.csv,.xls,.xlsx';panel.append(field('Subject',subject),field('Message',body),field('Order (optional)',order),field('Attachment (optional)',file));
 const create=button('Create Ticket',()=>locked(create,msg,async()=>{const r=await api({action:'workspaceTicket',subject:subject.value,message:body.value,orderId:order.value});if(file.files.length){try{const fd=new FormData();fd.append('ticketId',r.id);fd.append('file',file.files[0]);await orderFileFetch(user,fd);}catch(e){msg.textContent='Ticket created; attachment failed: '+e.message;await showTicketThread(panel,{id:r.id,subject:subject.value},{api,user});return;}}go('support');}),true);panel.append(create,el('h3','My tickets'));
 table(panel,['Subject','Status','Created','Action'],d.tickets.map(t=>[t.subject,t.status,date(t.created_at),button('Open conversation',()=>showTicketThread(panel,t,{api,user}))]));
 }else if(section==='profile'){
 const p=d.profile||{},r=d.profileRequest;panel.append(el('p','Profile updates require admin re-verification. Your current GSTIN and mobile stay unchanged until approval.'));
 const name=input('Business name',r?.status==='Pending verification'?r.business_name:p.business_name),gst=input('GSTIN',r?.status==='Pending verification'?r.gstin:p.gstin),mobile=input('Mobile',r?.status==='Pending verification'?r.mobile:p.mobile,'tel');gst.maxLength=15;mobile.maxLength=10;
 panel.append(field('Business name',name),field('GSTIN',gst),field('Mobile',mobile),el('p','Verification status: '+(r?.status||'Registered profile')));
 const save=button('Submit for verification',()=>locked(save,msg,async()=>{await api({action:'workspaceProfileRequest',businessName:name.value,gstin:gst.value,mobile:mobile.value});go('profile');}),true);panel.append(save);
 const email=input('Email',user.email,'email'),current=input('Current password','','password'),next=input('New password','','password');current.autocomplete='current-password';next.autocomplete='new-password';panel.append(el('h3','Account security'),field('Email',email),field('Current password',current),field('New password',next));
 const reauth=()=>reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,current.value));
 const emailBtn=button('Verify new email',()=>locked(emailBtn,msg,async()=>{if(!email.value||email.value===user.email)throw Error('Enter a new email address');await reauth();await verifyBeforeUpdateEmail(user,email.value);current.value='';msg.textContent='Verification sent to your new email address. Follow the link, then sign in again.';}));
 const passBtn=button('Change password',()=>locked(passBtn,msg,async()=>{if(next.value.length<8)throw Error('Use at least 8 characters');await reauth();await updatePassword(user,next.value);current.value=next.value='';msg.textContent='Password changed.';}));panel.append(emailBtn,passBtn);
 }
 }catch(e){msg.textContent=e.message;}
}
