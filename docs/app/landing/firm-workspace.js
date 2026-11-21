import {renderFirmWorkflow,renderReports} from './workflow-widgets.js?v=workflow1';
const pdfModule=()=>import('./portal-pdf.js?v=due1');
const downloadBillingPdf=async(...args)=>(await pdfModule()).downloadBillingPdf(...args);
const downloadFilingPdf=async(...args)=>(await pdfModule()).downloadFilingPdf(...args);
const downloadFilingListPdf=async(...args)=>(await pdfModule()).downloadFilingListPdf(...args);
const downloadBillingListPdf=async(...args)=>(await pdfModule()).downloadBillingListPdf(...args);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(label,fn,primary=false)=>{const b=el('button',label,'action'+(primary?' primary':''));b.type='button';b.onclick=fn;return b;};
const date=v=>new Date(v).toLocaleDateString('en-IN');
const money=v=>v==null?'Quote pending':(v/100).toLocaleString('en-IN',{style:'currency',currency:'INR'});
const select=(options)=>{const n=el('select');n.style.cssText='padding:10px;border:1px solid #cbd5e1;border-radius:8px;max-width:100%';for(const [v,l] of options)n.add(new Option(l,v));return n;};
const field=(label,n)=>{const l=el('label');l.style.cssText='display:grid;gap:6px;margin:10px 0;max-width:540px';l.append(el('strong',label),n);return l;};
const input=(placeholder,multi=false)=>{const n=el(multi?'textarea':'input');n.placeholder=placeholder;n.style.cssText='padding:10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;max-width:100%';return n;};
function table(target,headers,rows){
 const wrap=el('div');wrap.style.overflowX='auto';const t=el('table');t.style.cssText='width:100%;border-collapse:collapse;text-align:left;font-size:13px';const h=t.createTHead().insertRow();headers.forEach(v=>{const th=el('th',v);th.style.cssText='padding:10px;background:#f4f8ff;white-space:nowrap';h.append(th);});
 for(const row of rows){const tr=t.insertRow();for(const v of row){const td=tr.insertCell();td.style.cssText='padding:10px;border-bottom:1px solid #e3eaf3;vertical-align:top;overflow-wrap:anywhere';if(v instanceof Node)td.append(v);else td.textContent=v??'—';}}
 wrap.append(t);target.append(rows.length?wrap:el('p','No records yet.','empty'));
}
function downloadText(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function orderFileFetch(user,body){const headers={Authorization:'Bearer '+await user.getIdToken()};if(!(body instanceof FormData)){headers['Content-Type']='application/json';body=JSON.stringify(body);}const r=await fetch('/api/order-files',{method:'POST',headers,body,cache:'no-store'});if(!r.ok){const j=await r.json().catch(()=>null);throw Error(j?.error||'File request failed');}return r;}
export async function showOrderFiles(panel,order,api,user,admin=false){
 panel.querySelector('.order-file-box')?.remove();const box=el('div',undefined,'order-file-box');box.style.cssText='padding:16px;border:1px solid #dbe5f0;border-radius:10px;margin-top:16px';panel.append(box);box.append(el('h3',order.service+' — '+order.client_name));const msg=el('p','Loading files…');box.append(msg);
 const file=el('input');file.type='file';file.accept='.pdf,.jpg,.jpeg,.png,.csv,.xlsx,.xls';
 const kind=select(admin?[['Document','Supporting document'],['Final file','Final file']]:[['Document','Supporting document']]);
 const list=el('div');const upload=btn('Upload',async()=>{if(!file.files.length){msg.textContent='Choose a file first.';return;}upload.disabled=true;try{const fd=new FormData();fd.append('orderId',order.id);fd.append('kind',kind.value);fd.append('file',file.files[0]);await orderFileFetch(user,fd);file.value='';await load();msg.textContent='File uploaded.';}catch(e){msg.textContent=e.message;}finally{upload.disabled=false;}},true);
 box.append(field('File type',kind),field('Attach file (up to 10 MB)',file),upload,list,btn('Close',()=>box.remove()));
 async function load(){const {rows}=await api({action:'workspaceFiles',orderId:order.id});list.replaceChildren();table(list,['File','Type','Date','Action'],rows.map(f=>{
 const actions=el('div');const download=btn('Download',async()=>{try{const r=await orderFileFetch(user,{id:f.id});const url=URL.createObjectURL(await r.blob());const a=el('a');a.href=url;a.download=f.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){msg.textContent=e.message;}});actions.append(download);
 if(f.canRemove&&!admin){const remove=btn('Remove',async()=>{if(!confirm('Remove this supporting document from the order?'))return;remove.disabled=download.disabled=true;try{await orderFileFetch(user,{action:'remove',id:f.id});await load();msg.textContent='Document removed from order.';}catch(e){msg.textContent=e.message;}finally{remove.disabled=download.disabled=false;}});remove.style.color='#b91c1c';actions.append(remove);}
 return [f.name,f.kind,date(f.created_at),actions];}));msg.textContent=rows.length+' file(s)';}
 try{await load();}catch(e){msg.textContent=e.message;}
}
export async function renderWorkspace(panel,section,{api,user,firm,openTool,refresh}){
 const msg=el('p','Loading…');msg.setAttribute('role','status');panel.append(msg);
 const pdf=(label,fn)=>{const b=btn(label,async()=>{b.disabled=true;try{await fn();msg.textContent='PDF downloaded.';}catch(e){msg.textContent=e.message||'PDF download failed';}finally{b.disabled=false;}});return b;};
 const run=async(button,action,after)=>{button.disabled=true;try{await api(action);if(after)after();else refresh();}catch(e){msg.textContent=e.message;}finally{button.disabled=false;}};
 try{const d=await api({action:'workspaceData'});if(!panel.isConnected)return;msg.textContent='';
 if(section==='tools'){
 const t=d.trial,active=t&&t.ends_at>Date.now(),allowed=active&&t.launches<t.tool_limit&&d.clientCount<=t.client_limit;
 panel.append(el('h3',active?'Free Trial':t?'Trial expired':'Choose your plan'),el('p',t?'Trial: '+date(t.starts_at)+' – '+date(t.ends_at):'Start a one-time 7-day trial (5 clients and 10 workspace launches).'));
 if(t)table(panel,['Usage','Used','Limit'],[['Clients',d.clientCount,t.client_limit],['Staff','Not available','Staff role removed'],['Workspace launches',t.launches,t.tool_limit]]);
 panel.append(el('p','Paid plan requests require an admin quote. Online checkout is not configured.'));
 if(!t){const start=btn('Start Free Trial',()=>run(start,{action:'workspaceTrial'}),true);panel.append(start);}
 if(allowed){const launch=btn('Open My Tools',()=>run(launch,{action:'workspaceLaunch'},()=>openTool(panel)),true);panel.append(launch);}
 for(const request of ['Subscribe','Upgrade','Renewal']){const b=btn(request,()=>run(b,{action:'workspacePlanRequest',request}));panel.append(b);}
 panel.append(btn('View plan invoices',()=>refresh('billing')));
 }else if(section==='orders'){
 panel.append(el('p','Book services for your assigned clients. The firm is responsible for payment. The admin will provide a quote; online payment is not yet configured.'));
 const c=select([['','Choose assigned client'],...d.clients.map(x=>[x.uid,x.title+' · '+x.reference])]);const svc=select([['','Choose service'],...d.services.map(x=>[x,x])]);panel.append(field('Client',c),field('Service',svc));
 let key=crypto.randomUUID();const book=btn('Book & Request Payment',async()=>{if(!c.value||!svc.value){msg.textContent='Select client and service.';return;}book.disabled=true;c.disabled=svc.disabled=true;try{await api({action:'workspaceBook',clientUid:c.value,service:svc.value,requestId:key});key=crypto.randomUUID();refresh('filings');}catch(e){msg.textContent=e.message;}finally{book.disabled=false;c.disabled=svc.disabled=false;}},true);panel.append(book);
 panel.append(el('h3','Booked Services'));
 table(panel,['Client / Business','Service','Filing period','Due / requested date','Date type','Booked by','Status','Action'],d.orders.map(o=>[o.client_name,o.service,o.period||'—',o.due_date||'—',o.due_date_source||'—',o.booking_source||'Firm booking',o.status,btn('View documents',()=>showOrderFiles(panel,o,api,user))]));
 }else if(section==='filings'){
 const filter=select([['','All clients'],...new Map(d.orders.map(o=>[o.client_uid||o.client_name,o.client_name]))]);if(firm)panel.append(field('Filter by client',filter));
 const selected=()=>d.orders.filter(o=>!filter.value||(o.client_uid||o.client_name)===filter.value);
 panel.append(pdf('Download Report PDF',()=>downloadFilingListPdf(selected(),user)));
 const result=el('div');panel.append(result);function draw(){result.replaceChildren();table(result,['Client','Service','Filing period','Due / requested date','Date type','Booked by','Filing status','Booked','Action'],selected().map(o=>{const actions=el('div');actions.append(btn('Documents / Final file',()=>showOrderFiles(panel,o,api,user)),pdf('Download PDF',()=>downloadFilingPdf(o,user,api)));return [o.client_name,o.service,o.period||'—',o.due_date||'—',o.due_date_source||'—',o.booking_source||'Firm booking',o.status,date(o.created_at),actions];}));}
 filter.onchange=draw;draw();
 await renderFirmWorkflow(panel,{api,user,orders:d.orders,openFiles:o=>showOrderFiles(panel,o,api,user)});
 await renderReports(panel,{api,user});
 }else if(section==='billing'){
 const f=select([['','All invoices'],['Plan','Plan'],['Service','Service']]);panel.append(field('Invoice type',f));const wrap=el('div');panel.append(wrap);
 const selected=()=>d.billing.filter(x=>!f.value||x.kind===f.value);
 panel.insertBefore(pdf('Download Statement PDF',()=>downloadBillingListPdf(selected(),user)),wrap);
 function draw(){wrap.replaceChildren();table(wrap,['Type','Description','Amount','Payment status','Action'],selected().map(x=>{const actions=el('div');actions.append(pdf('Download PDF',()=>downloadBillingPdf(x,user,d.orders.find(o=>o.id===x.order_id))));if(x.status!=='Paid')actions.append(btn('Pay now',()=>{msg.textContent=x.amount_paise==null?'Wait for the admin quote.':'Online checkout is not configured. Contact support for payment instructions.';}));return [x.kind,x.title,money(x.amount_paise),x.status,actions];}));}f.onchange=draw;draw();
 }else if(section==='support'){
 const subject=input('Ticket subject'),message=input('Describe your issue',true);message.rows=5;panel.append(field('Subject',subject),field('Message',message));
 const c=select([['','General support'],...(d.clients||[]).map(x=>[x.uid,x.title])]);const o=select([['','No linked order'],...d.orders.map(x=>[x.id,x.client_name+' — '+x.service])]);if(firm)panel.append(field('Link client (optional)',c));panel.append(field('Link order (optional)',o));const create=btn('Create Ticket',()=>{if(!subject.value.trim()||!message.value.trim()){msg.textContent='Enter subject and message.';return;}return run(create,{action:'workspaceTicket',subject:subject.value,message:message.value,clientUid:c.value,orderId:o.value});},true);panel.append(create,el('h3','My tickets'));table(panel,['Subject','Message','Status','Admin reply','Created'],d.tickets.map(x=>[x.subject,x.message,x.status,x.reply||'Awaiting reply',date(x.created_at)]));
 }
 }catch(e){msg.textContent=e.message;}
}
