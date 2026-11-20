import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
const navy=[11,23,54],muted=[90,105,125],company='Fingenuity Associates';
const safe=v=>String(v??'-').replace(/₹/g,'INR ').replace(/[–—]/g,'-');
const date=v=>v==null||!Number.isFinite(new Date(v).getTime())?'-':new Date(v).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const amount=v=>v==null?'Quote pending':'INR '+(Number(v)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const account=u=>safe(u?.displayName||u?.email||'Account holder');
const key=v=>String(v||'report').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,100);
async function start(title,subtitle,user){
 const doc=new jsPDF({unit:'mm',format:'a4',compress:true});doc.setProperties({title:company+' | '+title,author:company,subject:subtitle});
 let x=16;
 try{const r=await fetch('/logo.png');if(!r.ok)throw Error('Logo unavailable');const data=await r.arrayBuffer();const bytes=new Uint8Array(data);const prop=doc.getImageProperties(bytes);const scale=Math.min(42/prop.width,20/prop.height);doc.addImage(bytes,'PNG',16,12,prop.width*scale,prop.height*scale);x=63;}catch{}
 doc.setFont('helvetica','bold');doc.setTextColor(...navy);doc.setFontSize(15);doc.text(company,x,17);
 doc.setFont('helvetica','normal');doc.setTextColor(...muted);doc.setFontSize(8.5);
 doc.text(['13, Sector A, Industrial Estate (Scheme No 51),','Indore, Madhya Pradesh 452015','+91 78692 79607 / +91 99814 25096','gstpractitioner.rakesh@gmail.com'],x,22,{lineHeightFactor:1.4});
 doc.setDrawColor(37,99,235);doc.setLineWidth(.65);doc.line(16,43,194,43);
 doc.setFont('helvetica','bold');doc.setTextColor(...navy);doc.setFontSize(20);doc.text(title,16,54);
 doc.setFont('helvetica','normal');doc.setTextColor(...muted);doc.setFontSize(9);
 const lines=doc.splitTextToSize(safe(subtitle),178);doc.text(lines,16,61);
 let y=61+lines.length*4.5;const a=doc.splitTextToSize('Prepared for: '+account(user),178);doc.text(a,16,y);y+=a.length*4.5;
 doc.text('Generated: '+date(Date.now())+' IST',16,y);return {doc,y:y+7};
}
function grid(doc,head,body,y,widths){
 if(y>258){doc.addPage();y=18;}
 const columnStyles=Object.fromEntries(widths.map((w,i)=>[i,{cellWidth:w}]));
 autoTable(doc,{startY:y,head:[head],body:body.map(row=>row.map(safe)),margin:{left:16,right:16,top:17,bottom:20},theme:'grid',styles:{font:'helvetica',fontSize:9,cellPadding:3.1,overflow:'linebreak',lineColor:[220,227,237],lineWidth:.15,textColor:navy},headStyles:{fillColor:navy,textColor:255,fontStyle:'bold'},alternateRowStyles:{fillColor:[247,249,253]},showHead:'everyPage',columnStyles});
 return doc.lastAutoTable.finalY+6;
}
function note(doc,value,y){
 doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(...muted);const lines=doc.splitTextToSize(safe(value),178);
 if(y+lines.length*4>268){doc.addPage();y=18;}doc.text(lines,16,y,{lineHeightFactor:1.45});
}
function finish(doc,name){
 const pages=doc.getNumberOfPages();for(let i=1;i<=pages;i++){doc.setPage(i);doc.setDrawColor(220,227,237);doc.setLineWidth(.2);doc.line(16,280,194,280);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...muted);doc.text(company+' | Computer-generated document',16,285);doc.text('Page '+i+' of '+pages,194,285,{align:'right'});}
 doc.save(name+'.pdf');
}
export async function downloadBillingPdf(record,user,order){
 const {doc,y}=await start('BILLING SUMMARY',record.status==='Paid'?'Payment status: Paid | Billing record':'Payment request / pro forma summary',user);
 let end=grid(doc,['Billing details','Information'],[['Billing reference',record.id],['Order reference',record.order_id||'-'],['Issued on',date(record.created_at)],['Billing type',record.kind||'Service'],['Client / business',order?.client_name||account(user)],['Filing period',order?.period||'-'],['Payment status',record.status]],y,[51,127]);
 end=grid(doc,['#','Description','Amount'],[['1',record.title,amount(record.amount_paise)]],end,[13,115,50]);
 end=grid(doc,['Total billing amount','Value'],[['Amount',amount(record.amount_paise)],['Payment status',record.status]],end,[115,63]);
 note(doc,'This is a billing summary, not a GST tax invoice or payment receipt. Tax breakdown and statutory invoice details have not been provided. Do not use this document to claim input tax credit.',end+3);
 finish(doc,'billing-'+key(record.id));
}
export async function downloadFilingPdf(order,user,api){
 const t=await api({action:'workspaceTimeline',orderId:order.id});const {doc,y}=await start('FILING STATUS REPORT','Service order and filing progress',user);
 let end=grid(doc,['Order details','Information'],[['Order reference',order.id],['Client / business',order.client_name||account(user)],['Service',order.service],['Filing period',order.period||'-'],['Due / requested date',t.due_date||order.due_date||'-'],['Date type',t.due_date_source||order.due_date_source||'-'],['Booked on',date(order.created_at)],['Current filing status',t.status||order.status],['Last updated',date(order.updated_at)]],y,[51,127]);
 end=grid(doc,['#','Filing status event','Date / time (IST)'],t.rows?.length?t.rows.map((r,i)=>[i+1,r.status,date(r.created_at)]):[['-','No recorded timeline events','-']],end,[13,101,64]);
 note(doc,'Portal status report only. This is not a statutory return, filing acknowledgement or proof of tax payment. Official final documents remain available separately.',end+3);finish(doc,'filing-'+key(order.id));
}
export async function downloadFilingListPdf(orders,user){
 const {doc,y}=await start('FILING STATUS REPORT','Service orders | Current selection',user);
 const end=grid(doc,['#','Client / service','Period','Due / requested date','Status'],orders.length?orders.map((o,i)=>[i+1,safe(o.client_name)+'\n'+safe(o.service),o.period||'-',safe(o.due_date)+'\n'+safe(o.due_date_source),o.status]):[['-','No records','-','-','-']],y,[10,56,35,42,35]);
 note(doc,'Records shown: '+orders.length+'. Portal status report only; official filing acknowledgements remain separate.',end+3);finish(doc,'filing-status-report');
}
export async function downloadBillingListPdf(records,user){
 const {doc,y}=await start('BILLING STATEMENT','Billing records | Current selection',user);
 const end=grid(doc,['#','Reference / description','Type','Status','Amount'],records.length?records.map((r,i)=>[i+1,safe(r.id)+'\n'+safe(r.title),r.kind||'Service',r.status,amount(r.amount_paise)]):[['-','No records','-','-','-']],y,[10,70,20,36,42]);
 note(doc,'Records shown: '+records.length+'. This statement is not a GST tax invoice or a payment receipt.',end+3);finish(doc,'billing-statement');
}
