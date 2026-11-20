export const financialYears=['2023-24','2024-25','2025-26','2026-27'];
export const quarters=['Apr - Jun','Jul - Sep','Oct - Dec','Jan - Mar'];
const months=['April','May','June','July','August','September','October','November','December','January','February','March'];
export function periodTypes(service){
 if(service==='GST Registration')return ['Not applicable'];
 if(service==='Income Tax Return')return ['Yearly'];
 if(service==='TDS Return')return ['Quarterly'];
 if(['GSTR-1 Filing','GSTR-3B Filing'].includes(service))return ['Monthly','Quarterly'];
 return ['Monthly','Quarterly','Yearly'];
}
export function periodOptions(type,fy){
 if(type==='Not applicable')return [['Not applicable','Not applicable']];
 if(!financialYears.includes(fy))return [];
 if(type==='Yearly')return [[fy,fy]];
 if(type==='Quarterly')return quarters.map((q,i)=>[fy+' Q'+(i+1)+' ('+q+')','Q'+(i+1)+' | '+q+' '+(i===3?Number(fy.slice(0,4))+1:fy.slice(0,4))]);
 if(type==='Monthly')return months.map((m,i)=>{const v=m+' '+(Number(fy.slice(0,4))+(i>=9?1:0));return [v,v];});
 return [];
}
export function validFilingPeriod(service,value){
 return periodTypes(service).some(t=>financialYears.some(fy=>periodOptions(t,fy).some(([v])=>v===value)));
}
