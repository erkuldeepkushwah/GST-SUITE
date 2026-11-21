import * as XLSX from 'xlsx';
const display=val=>{
 const s=String(val??'');
 return /^[=+\-@\t\r]/.test(s)?"'"+s:s;
};
export async function downloadWorkflowExcel(report){
 const filters=report.filters||{};
 const rows=Array.isArray(report.rows)?report.rows:[];
 const wb=XLSX.utils.book_new();
 const title=[
  ['Fingenuity Associates — GST & Tax Services'],
  ['Report type',report.reportType],['From date',filters.from||'All'],['To date',filters.to||'All'],
  ['Financial year',filters.financialYear||'All'],['Generated at (IST)',new Date(report.generatedAt).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})],
  ['Records',rows.length],['Amount in INR',(Number(report.totalPaise)||0)/100],[],
  ['Booking ID','Client','Category','Service','Frequency','Financial Year','Filing Period','Requested Completion','Booking Status','Amount INR','Payment Status','Created (IST)']
 ];
 for(const r of rows){
  title.push([r.booking_code||r.id,r.client_name,r.category||'',r.service,r.frequency||'',r.financial_year||'',r.period||'',r.due_date||'',r.status,
   (Number(r.payment?.amount_paise??r.amount_paise)||0)/100,r.payment?.status||'—',
   new Date(r.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'})]);
 }
 const safe=title.map(row=>row.map((cell,index)=>{
  if(typeof cell==='number')return cell;
  return display(cell);
 }));
 const ws=XLSX.utils.aoa_to_sheet(safe);
 ws['!cols']=[{wch:31},{wch:23},{wch:19},{wch:25},{wch:14},{wch:16},{wch:27},{wch:22},{wch:23},{wch:15},{wch:18},{wch:23}];
 XLSX.utils.book_append_sheet(wb,ws,'Filtered Report');
 const content=XLSX.write(wb,{bookType:'xlsx',type:'array'});
 const blob=new Blob([content],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const href=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=href;a.download='GST-'+String(report.reportType||'report').replace(/[^a-z0-9_-]/gi,'-')+'.xlsx';document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(href),1000);
}
