import {initializeApp} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {getAuth,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
const auth=getAuth(initializeApp({apiKey:'AIzaSyDdJTg0SF66ksdSaJnrWH8dd0ei15M6yoA',authDomain:'paypoint-e14c9.firebaseapp.com',projectId:'paypoint-e14c9',storageBucket:'paypoint-e14c9.firebasestorage.app',messagingSenderId:'970332210587',appId:'1:970332210587:web:10bedd6bf179372cc78d3e'}));
const $=id=>document.getElementById(id);
const modules=['Dashboard','Customers','Staff & Roles','Services & Masters','Filing & Task Management','Documents & Vault','Invoices & Payments','Notifications','Support / Queries','Reports & Analytics','Settings'];
const icons=['house','users','shield-check','layers-3','list-checks','folder-open','receipt-text','bell','message-circle','chart-column','settings'];
let data=null,currentUser=null,generation=0;
function icon(name){const i=document.createElement('i');i.dataset.lucide=name;return i;}
function refresh(){window.lucide?.createIcons();}
function narrow(){return matchMedia('(max-width:750px)').matches;}
function sync(){const open=narrow()?$('sidebar').classList.contains('open'):!$('layout').classList.contains('sidebar-collapsed');$('menu').setAttribute('aria-expanded',String(open));}
function closeSidebar(){$('sidebar').classList.remove('open');$('backdrop').classList.remove('open');sync();}
function closeProfile(){$('profile-menu').hidden=true;$('profile-toggle').setAttribute('aria-expanded','false');}
function showPage(name){if(!data)return;const content=$('content');content.replaceChildren();for(const b of $('nav').children)b.classList.toggle('active',b.dataset.page===name);closeSidebar();closeProfile();
if(name==='Dashboard'){
 const welcome=document.createElement('section');welcome.className='welcome';const copy=document.createElement('div');const h=document.createElement('h1');h.append('Welcome, ');const strong=document.createElement('span');strong.id='welcome-name';strong.textContent=data.name;h.append(strong);const p=document.createElement('p');p.textContent='Manage customers, GST services, filings and administrative operations.';copy.append(h,p);welcome.append(copy);content.append(welcome);
 const grid=document.createElement('section');grid.className='stats admin-stats';const fields=[['Total Customers','customers','users'],['Active Services','services','layers-3'],['Pending Tasks','tasks','triangle-alert'],['Filed This Month','filings','calendar-days'],['Pending Invoices','invoices','receipt-text'],['Total Revenue','revenue','wallet']];for(const [label,key,glyph] of fields){const el=document.createElement('article');el.className='stat';const ico=document.createElement('div');ico.className='stat-icon'+(key==='tasks'?' danger':'');ico.append(icon(glyph));const info=document.createElement('div');const title=document.createElement('div');title.className='stat-label';title.textContent=label;const value=document.createElement('div');value.className='stat-number';value.textContent=data.metrics[key]??'—';const note=document.createElement('div');note.className='stat-note';note.textContent=key==='filings'?'Filing dates not connected':'Admin register';info.append(title,value,note);el.append(ico,info);grid.append(el);}content.append(grid);
}else{const panel=document.createElement('section');panel.className='panel';const h=document.createElement('h2');h.textContent=name;panel.append(h);if(name==='My Profile'){const dl=document.createElement('dl');dl.className='profile-grid';for(const [k,v] of [['Name',data.name],['Email',currentUser?.email||''],['Role','Administrator']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd);}panel.append(dl);}else{renderModule(panel,name);}content.append(panel);}refresh();}
modules.forEach((name,i)=>{const b=document.createElement('button');b.type='button';b.className='nav-item';b.dataset.page=name;const span=document.createElement('span');span.className='nav-icon';span.append(icon(icons[i]));b.append(span,document.createTextNode(name));b.onclick=async()=>{if(name==='Dashboard'){try{data=await api({action:'dashboard'});}catch(e){alert(e.message);return;}}showPage(name);};$('nav').append(b);});
function clear(){data=null;currentUser=null;$('app').hidden=true;$('loading').hidden=false;$('content').replaceChildren();}
async function authorize(user){const current=++generation;clear();if(!user){location.replace('/login.html');return;}try{const r=await fetch('/api/admin',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken()},cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok||result.authorized!==true)throw new Error('Access denied');if(current!==generation)return;data=result;currentUser=user;$('admin-name').textContent=result.name;$('menu-name').textContent=result.name;$('menu-email').textContent=user.email||'';$('avatar').textContent=(result.name||'A').charAt(0).toUpperCase();showPage('Dashboard');$('loading').hidden=true;$('app').hidden=false;sync();}catch{if(current===generation)location.replace('/login.html?adminDenied=1');}}
onAuthStateChanged(auth,authorize,()=>location.replace('/login.html'));
async function logout(){try{await signOut(auth);clear();location.replace('/login.html');}catch{alert('Could not log out. Please try again.');}}
$('logout').onclick=logout;$('profile-logout').onclick=logout;$('profile').onclick=()=>showPage('My Profile');$('settings').onclick=()=>showPage('Settings');$('notification-toggle').onclick=()=>showPage('Notifications');
$('menu').onclick=()=>{closeProfile();if(narrow()){const open=$('sidebar').classList.toggle('open');$('backdrop').classList.toggle('open',open);}else $('layout').classList.toggle('sidebar-collapsed');sync();};
$('backdrop').onclick=closeSidebar;$('profile-toggle').onclick=()=>{const open=$('profile-menu').hidden;$('profile-menu').hidden=!open;$('profile-toggle').setAttribute('aria-expanded',String(open));};
document.addEventListener('click',e=>{if(!e.target.closest('.profile-container'))closeProfile();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeProfile();closeSidebar();}});window.addEventListener('resize',()=>{if(!narrow())closeSidebar();sync();});window.addEventListener('load',refresh,{once:true});

async function api(payload){const user=auth.currentUser;if(!user)throw Error('Please sign in again');const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Request failed');return result;}
const make=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
const schemas={
 'Customers':['Customer name','Email / customer reference','Customer notes'],
 'Staff & Roles':['Staff name','Role / email','Responsibilities (record only; not an access grant)'],
 'Services & Masters':['Service name','Service code','Description'],
 'Filing & Task Management':['Task / filing name','Customer / period reference','Due date and task details'],
 'Documents & Vault':['Document title','File reference','Document notes (metadata only)'],
 'Invoices & Payments':['Invoice title','Invoice / customer reference','Payment notes'],
 'Notifications':['Notification title','Recipient / audience','Draft message (record only; not sent)'],
 'Support / Queries':['Query title','Customer / ticket reference','Query and response notes'],
 'Settings':['Setting name','Setting value','Description (record only; not system configuration)']
};
function renderModule(panel,name){
 const status=make('p','','admin-status');status.setAttribute('role','status');panel.append(status);
 if(name==='Reports & Analytics'){
 const p=make('p','Summary of manually maintained administrative registers.');panel.append(p);
 const load=async()=>{try{const {rows}=await api({action:'report'});if(!panel.isConnected)return;const wrap=make('div',undefined,'admin-table-wrap');const table=make('table',undefined,'admin-table');const head=make('tr');['Module','Status','Records','Amount (INR)'].forEach(v=>head.append(make('th',v)));const thead=make('thead');thead.append(head);table.append(thead);const tbody=make('tbody');rows.forEach(r=>{const tr=make('tr');[r.module,r.status,r.count,r.amount??0].forEach(v=>tr.append(make('td',String(v))));tbody.append(tr);});table.append(tbody);wrap.append(table);panel.append(wrap);status.textContent=rows.length?'Report loaded.':'No records yet.';const exportBtn=make('button','Export CSV','action');exportBtn.onclick=()=>{const lines=[['Module','Status','Records','Amount'],...rows.map(r=>[r.module,r.status,r.count,r.amount??0])];const csv=lines.map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));const a=make('a');a.href=url;a.download='gst-admin-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};panel.append(exportBtn);}catch(e){status.textContent=e.message;}};load();return;
 }
 const schema=schemas[name];if(!schema)return;
 panel.append(make('p','Maintain administrative records here. These registers do not automatically synchronize with customer accounts, external payments, document storage or email delivery.'));
 const form=make('form',undefined,'admin-form');let editId=null,rows=[];
 function field(label,type='text'){const l=make('label',label);const input=make(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;l.append(input);form.append(l);return input;}
 const title=field(schema[0]);title.required=true;title.maxLength=150;
 const reference=field(schema[1]);reference.maxLength=250;
 const label=make('label','Status');const select=make('select');for(const v of ['Pending','Active','Completed','Paid','Cancelled','Draft','Inactive']){const opt=make('option',v);opt.value=v;select.append(opt);}label.append(select);form.append(label);
 const amount=field('Amount (INR)','number');amount.min='0';amount.max='1000000000000';amount.step='0.01';amount.value='0';if(name!=='Invoices & Payments')amount.parentElement.hidden=true;
 const notes=field(schema[2],'textarea');notes.maxLength=2000;notes.parentElement.className='wide';
 const actions=make('div',undefined,'action-row wide');const save=make('button','Add Record','action primary');save.type='submit';const cancel=make('button','Clear','action');cancel.type='button';actions.append(save,cancel);form.append(actions);panel.append(form);
 const search=make('input',undefined,'admin-search');search.type='search';search.placeholder='Search records';search.setAttribute('aria-label','Search records');panel.append(search);const wrap=make('div',undefined,'admin-table-wrap');panel.append(wrap);
 function reset(){editId=null;form.reset();amount.value='0';save.textContent='Add Record';}
 cancel.onclick=reset;
 function draw(){wrap.replaceChildren();const q=search.value.toLowerCase();const filtered=rows.filter(r=>[r.title,r.reference,r.status,r.notes].some(v=>String(v||'').toLowerCase().includes(q)));if(!filtered.length){wrap.append(make('p','No matching records.','empty'));return;}const table=make('table',undefined,'admin-table');const head=make('tr');const cols=['Name','Reference','Status',...(name==='Invoices & Payments'?['Amount']:[]),'Notes','Actions'];cols.forEach(v=>head.append(make('th',v)));const thead=make('thead');thead.append(head);table.append(thead);const tbody=make('tbody');for(const r of filtered){const tr=make('tr');[r.title,r.reference,r.status,...(name==='Invoices & Payments'?[r.amount]:[]),r.notes].forEach(v=>tr.append(make('td',String(v??''))));const td=make('td');const edit=make('button','Edit','action');edit.onclick=()=>{editId=r.id;title.value=r.title;reference.value=r.reference;select.value=r.status;amount.value=r.amount;notes.value=r.notes;save.textContent='Save Changes';title.focus();};const del=make('button','Delete','action');del.onclick=async()=>{if(!confirm('Delete this administrative record?'))return;del.disabled=true;try{await api({action:'delete',module:name,id:r.id});if(editId===r.id)reset();await load();status.textContent='Record deleted.';}catch(e){status.textContent=e.message;del.disabled=false;}};td.append(edit,del);tr.append(td);tbody.append(tr);}table.append(tbody);wrap.append(table);}
 async function load(){try{const result=await api({action:'list',module:name});rows=result.rows||[];draw();}catch(e){status.textContent=e.message;}}
 search.oninput=draw;
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await api({action:'save',module:name,id:editId,title:title.value,reference:reference.value,status:select.value,amount:Number(amount.value)||0,notes:notes.value});reset();await load();status.textContent='Record saved.';}catch(e){status.textContent=e.message;}finally{save.disabled=false;}};
 load();
}
