import {enhancePortalTableActions} from './portal-action-menu.js?v=actionmenu1';
import {renderClientNotifications} from './workflow-widgets.js?v=actionmenu1';
import {portalCachedRequest,clearPortalApiCache} from './portal-fast-cache.js?v=perf1';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDdJTg0SF66ksdSaJnrWH8dd0ei15M6yoA',
  authDomain: 'paypoint-e14c9.firebaseapp.com',
  projectId: 'paypoint-e14c9',
  storageBucket: 'paypoint-e14c9.firebasestorage.app',
  messagingSenderId: '970332210587',
  appId: '1:970332210587:web:10bedd6bf179372cc78d3e'
};
const auth = getAuth(initializeApp(firebaseConfig));
const app = document.getElementById('app');
const loading = document.getElementById('loading');
const content = document.getElementById('content');
const overview = content.innerHTML;
const sidebar = document.getElementById('sidebar');
const backdrop = document.getElementById('backdrop');
const sections = {
  overview: ['Overview', ''],
  services: ['My Services', 'Your GST return, registration and tax service requests will appear here once a customer-services backend is connected.'],
  reports: ['Reports & Analytics', 'View and export your booking, filing, payment and document reports.'],
  documents: ['Upload Documents', 'Choose a category and attach your tax or accounting documents.'],
  downloads: ['Downloads & Vault', 'Filed returns and document downloads will appear here after customer-specific secure storage is configured.'],
  billing: ['Billing & Invoices', 'Service invoices and payments will appear here after billing integration. No amount is currently due in this preview because billing data is not connected.'],
  support: ['Support Center', 'For assistance, use the official contact page.'],
  notifications: ['Notifications', 'No notification feed is connected yet.'],
  profile: ['My Profile', ''],
  settings: ['Settings', 'Your account is authenticated using Firebase Email/Password. For password reset, use Forgot Password on the Login page.']
};
// Open the existing Solutions & Modules workspace in the user-panel shell.
function createServicesWorkspace(panel) {
  panel.classList.add('services-workspace');
  const title = panel.querySelector('h2');
  if (title) title.textContent = 'Solutions & Modules';
  const intro = panel.querySelector('p');
  if (intro) intro.textContent = 'Work directly in any of the six reconciliation modules. Use the module tabs inside the workspace to switch tools.';
  const frame = document.createElement('iframe');
  frame.className = 'reconciliation-frame';
  frame.title = 'GST Suite reconciliation workspace';
  frame.src = '/app/?embedded=1&module=gst2a';
  frame.loading = 'lazy';
  frame.referrerPolicy = 'same-origin';
  panel.append(frame);

}

let currentUser = null, accountType='legacy', customerProfile=null, portalRole='customer';
const menuConfig={
 business:[['overview','Dashboard','house'],['services','My Services','layers-3'],['documents','Upload Docs','cloud-upload'],['filings','Filing Status','file-check'],['reports','Reports & Analytics','chart-no-axes-combined'],['billing','Invoices','receipt-text'],['support','Support','message-circle'],['profile','Profile','user-round'],['logout','Logout','log-out']],
 firm:[['overview','Dashboard','house'],['assigned','Assigned Clients','users'],['companies','Client Companies','building-2'],['documents','Upload Documents','cloud-upload'],['tools','My Tools','layers-3'],['filings','Filing Status','file-check'],['billing','Invoices','receipt-text'],['support','Support','message-circle'],['profile','Profile','user-round'],['logout','Logout','log-out']],
 legacy:[['overview','Dashboard','house'],['services','My Services','layers-3'],['documents','Upload Docs','cloud-upload'],['filings','Filing Status','file-check'],['reports','Reports & Analytics','chart-no-axes-combined'],['billing','Invoices','receipt-text'],['support','Support','message-circle'],['profile','Profile','user-round'],['logout','Logout','log-out']]
};
Object.assign(sections,{assigned:['Assigned Clients','Clients allocated to your firm by the administrator.'],companies:['Client Companies','Browse all registered clients and companies, including those not assigned to your firm.'],tools:['My Tools','GST reconciliation workspace.'],filings:['Filing Status','Track your filing and task records.']});
const menu=()=>menuConfig[portalRole==='firm'?'firm':accountType==='business'?'business':'legacy'];
function configureCustomerMenu(){
 const nav=document.getElementById('navigation'),bottom=document.querySelector('.sidebar-bottom');nav.replaceChildren();bottom.replaceChildren();
 for(const [key,label,glyph] of menu()){
  const btn=document.createElement('button');btn.type='button';btn.className='nav-item';if(key==='logout'){btn.id='logout';btn.addEventListener('click',logout);}else{btn.dataset.section=key;sections[key][0]=label;}
  const icon=document.createElement('span');icon.className='nav-icon';const i=document.createElement('i');i.dataset.lucide=glyph;icon.append(i);btn.append(icon,document.createTextNode(label));(['profile','settings','logout'].includes(key)?bottom:nav).append(btn);
 }
 document.querySelector('.profile-copy small').textContent=portalRole==='firm'?'Firm':'Client';
 const settings=document.querySelector('#profile-menu [data-section=settings]');if(settings)settings.hidden=!menu().some(x=>x[0]==='settings');
 refreshIcons();
}
function displaySectionError(panel,error){
 if(!panel.isConnected)return;
 const message=document.createElement('p');message.setAttribute('role','alert');message.textContent='Unable to load this section. Please try again.';panel.append(message);
 console.error('Dashboard section failed',error);
}
async function renderBusiness(panel,...args){
 try{const module=await import('./business-workspace.js?v=actionmenu1');if(panel.isConnected)await module.renderBusiness(panel,...args);}catch(e){displaySectionError(panel,e);}
}
async function renderWorkspace(panel,...args){
 try{const module=await import('./firm-workspace.js?v=actionmenu1');if(panel.isConnected)await module.renderWorkspace(panel,...args);}catch(e){displaySectionError(panel,e);}
}
async function appendDocumentUploads(panel,headingText){
 try{const module=await import('./document-upload.js?v=actionmenu1');if(!panel.isConnected)return;
 if(headingText){const heading=document.createElement('h3');heading.textContent=headingText;panel.append(heading);}
 const history=module.createUploadedDocuments(currentUser);
 panel.append(module.createDocumentForm(currentUser,history.refresh),history.element);void history.refresh();
 }catch(e){displaySectionError(panel,e);}
}
async function rawFirmApi(payload){
 const response=await fetch('/api/roles',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await currentUser.getIdToken()},body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(15000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Unable to load firm records');return result;
}
function firmApi(payload){return portalCachedRequest('roles',currentUser?.uid,payload,()=>rawFirmApi(payload));}
async function renderCompanyDirectory(panel){
 const bar=document.createElement('div');bar.className='action-row';bar.style.cssText='display:flex;flex-wrap:wrap;gap:10px;align-items:center';
 const search=document.createElement('input');search.type='search';search.placeholder='Search clients or companies';search.setAttribute('aria-label','Search companies');search.style.cssText='padding:10px;border:1px solid #ccd9eb;border-radius:8px;min-width:0;flex:1';
 const filter=document.createElement('select');filter.setAttribute('aria-label','Assignment status');filter.style.cssText='padding:10px;border:1px solid #ccd9eb;border-radius:8px';for(const [value,label] of [['all','All Clients'],['Assigned to your firm','Assigned to My Firm'],['Unassigned','Unassigned'],['Assigned elsewhere','Assigned Elsewhere']])filter.add(new Option(label,value));
 bar.append(search,filter);panel.append(bar);
 const status=document.createElement('p');status.setAttribute('role','status');panel.append(status);
 const wrap=document.createElement('div');wrap.className='portal-table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable account data table');panel.append(wrap);
 const more=document.createElement('button');more.type='button';more.className='action';more.textContent='Load more';more.hidden=true;panel.append(more);
 let rows=[],next=null,busy=false;
 function draw(){
 const query=search.value.trim().toLowerCase();const filtered=rows.filter(r=>(filter.value==='all'||r.assignmentStatus===filter.value)&&[r.companyName,r.clientName,r.contact].some(v=>String(v||'').toLowerCase().includes(query)));
 wrap.replaceChildren();status.textContent=filtered.length+' of '+rows.length+' loaded clients'+(next?' · More available':'');
 if(!filtered.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='No matching clients.';wrap.append(empty);return;}
 const table=document.createElement('table');table.className='portal-data-table';table.style.cssText='width:100%;border-collapse:collapse;text-align:left;font-size:13px';const head=table.createTHead().insertRow();for(const label of ['Company Name','Client Name','Contact','Account Status','Assignment Status']){const th=document.createElement('th');th.textContent=label;th.style.cssText='padding:12px;background:#f4f8ff;white-space:nowrap';head.append(th);}
 const body=table.createTBody();for(const r of filtered){const tr=body.insertRow();for(const value of [r.companyName,r.clientName,r.contact||'No access',r.accountStatus,r.assignmentStatus]){const td=tr.insertCell();td.textContent=value||'—';td.style.cssText='padding:12px;border-bottom:1px solid #e3eaf3;overflow-wrap:anywhere';}}
 enhancePortalTableActions(table);wrap.append(table);
 }
 async function load(){if(busy)return;busy=true;more.disabled=true;status.textContent='Loading registered clients…';try{const result=await firmApi({action:'firmCompanies',pageToken:next});if(!panel.isConnected)return;rows.push(...result.rows);next=result.nextPageToken||null;more.hidden=!next;draw();}catch(e){status.textContent=e.message;}finally{busy=false;more.disabled=false;}}
 search.oninput=draw;filter.onchange=draw;more.onclick=load;await load();
}
async function showAssignedClient(panel,record){
 const previous=panel.querySelector('.assigned-client-details');previous?.remove();
 const box=document.createElement('section');box.className='assigned-client-details';box.style.cssText='border:1px solid #dbe5f0;border-radius:12px;padding:16px;margin:18px 0;background:#fff';
 const header=document.createElement('div');header.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
 const title=document.createElement('h3');title.textContent='Client Details';
 const close=document.createElement('button');close.type='button';close.className='action';close.textContent='Close';close.onclick=()=>box.remove();header.append(title,close);
 const message=document.createElement('p');message.setAttribute('role','status');message.textContent='Loading client details…';box.append(header,message);panel.append(box);box.scrollIntoView({behavior:'smooth',block:'nearest'});
 try{
 const result=await firmApi({action:'workspaceClientDetails',clientUid:record.id.slice(7)});
 if(!box.isConnected)return;
 const p=result.profile;title.textContent=p.business_name||p.name||'Client Details';message.textContent='';
 const profile=document.createElement('dl');profile.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin:12px 0';
 for(const [label,value] of [['Full Name',p.name],['Mobile Number',p.mobile],['Email Address',p.email],['Business Name',p.business_name],['GSTIN',p.gstin],['Assignment Status',p.assignment_status]]){
 const cell=document.createElement('div');cell.style.cssText='background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;min-width:0';
 const dt=document.createElement('dt');dt.textContent=label;dt.style.cssText='font-size:12px;color:#64748b;margin-bottom:6px';const dd=document.createElement('dd');dd.textContent=value||'Not provided';dd.style.cssText='margin:0;font-weight:600;overflow-wrap:anywhere';cell.append(dt,dd);profile.append(cell);}
 box.append(profile);const h=document.createElement('h3');h.textContent='Booked Services';box.append(h);
 if(!result.orders.length){const empty=document.createElement('p');empty.textContent='No services booked yet.';box.append(empty);return;}
 const wrap=document.createElement('div');wrap.className='portal-table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable account data table');const table=document.createElement('table');table.className='portal-data-table';table.style.cssText='width:100%;border-collapse:collapse;text-align:left;font-size:13px';
 const head=table.createTHead().insertRow();for(const label of ['Service','Filing Period','Due / Requested Date','Date Type','Booked By','Status','Booking Date']){const th=document.createElement('th');th.textContent=label;th.style.cssText='padding:12px;background:#f4f8ff;white-space:nowrap';head.append(th);}
 const body=table.createTBody();for(const o of result.orders){const row=body.insertRow();for(const v of [o.service,o.period,o.due_date,o.due_date_source,o.booked_by,o.status,new Date(o.created_at).toLocaleDateString('en-IN')]){const td=row.insertCell();td.textContent=v||'—';td.style.cssText='padding:12px;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere';}}
 enhancePortalTableActions(table);wrap.append(table);box.append(wrap);
 }catch(e){if(box.isConnected)message.textContent=e.message||'Unable to load client details.';}
}
async function renderFirmRecords(panel,section){

 const message=document.createElement('p');message.textContent='Loading records…';panel.append(message);
 try{const {rows}=await firmApi({action:'firmData'});if(!panel.isConnected)return;
 const map={assigned:['Assigned Clients'],companies:['Assigned Clients'],filings:['Filing & Updates','My Tasks','Document Review'],billing:['Invoices & Payments'],support:['Client Support'],notifications:['Notifications']};
 const records=rows.filter(r=>(map[section]||[]).includes(r.section));message.textContent=records.length?records.length+' record(s)':'No records available yet.';
 if(!records.length)return;const wrap=document.createElement('div');wrap.className='portal-table-scroll';wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Scrollable account data table');const table=document.createElement('table');table.className='portal-data-table';table.style.cssText='width:100%;border-collapse:collapse;text-align:left;font-size:13px';const head=table.createTHead().insertRow();for(const label of ['Title','Client / Reference','Status','Instructions','Action']){const cell=document.createElement('th');cell.textContent=label;cell.style.padding='10px';head.append(cell);}
 const body=table.createTBody();for(const r of records){const tr=body.insertRow();for(const [i,value] of [r.title,r.reference,r.status,r.notes].entries()){const td=tr.insertCell();td.style.cssText='padding:10px;border-bottom:1px solid #e3eaf3';if(i===0&&section==='assigned'&&String(r.id).startsWith('client:')){const name=document.createElement('button');name.type='button';name.className='action';name.style.cssText='border:0;background:transparent;color:#2563eb;text-align:left;padding:0;font-weight:600;text-decoration:underline';name.textContent=value||'Client';name.onclick=()=>showAssignedClient(panel,r);td.append(name);}else td.textContent=value||'—';}const td=tr.insertCell();if(['My Tasks','Document Review','Filing & Updates','Client Support'].includes(r.section)){const sel=document.createElement('select');for(const status of ['Pending','In Progress','Completed'])sel.add(new Option(status,status));sel.value=r.status;const button=document.createElement('button');button.className='action';button.textContent='Update';button.onclick=async()=>{button.disabled=true;try{await firmApi({action:'firmUpdate',id:r.id,status:sel.value});tr.cells[2].textContent=sel.value;message.textContent='Status updated.';}catch(e){message.textContent=e.message;}finally{button.disabled=false;}};td.append(sel,button);}else if(section==='assigned'&&String(r.id).startsWith('client:')){const view=document.createElement('button');view.type='button';view.className='action';view.textContent='View details';view.onclick=()=>showAssignedClient(panel,r);td.append(view);}else if(r.section==='Assigned Clients'&&r.id.startsWith('client:')){
 const open=()=>showAssignedClient(panel,r);
 const button=document.createElement('button');button.type='button';button.className='action';button.textContent='View Details';button.onclick=open;td.append(button);
 const name=document.createElement('button');name.type='button';name.textContent=r.title||'Client';name.style.cssText='background:none;border:0;padding:0;color:#2563eb;font:inherit;font-weight:600;text-align:left;cursor:pointer';name.onclick=open;tr.cells[0].replaceChildren(name);
 }else td.textContent='View only';}
 enhancePortalTableActions(table);wrap.append(table);panel.append(wrap);
 }catch(e){message.textContent=e.message;}
}
function refreshIcons() { if (window.lucide?.createIcons) window.lucide.createIcons(); }
const layout = document.getElementById('dashboard-layout');
const sidebarToggle = document.getElementById('sidebar-toggle');
const isNarrow = () => window.matchMedia('(max-width: 750px)').matches;
function syncSidebarToggle() {
 const expanded = isNarrow() ? sidebar.classList.contains('open') : !layout.classList.contains('sidebar-collapsed');
 sidebarToggle.setAttribute('aria-expanded', String(expanded));
 sidebarToggle.setAttribute('aria-label', expanded ? 'Hide sidebar' : 'Show sidebar');
}
function closeMenu() {
 sidebar.classList.remove('open');
 backdrop.classList.remove('open');
 syncSidebarToggle();
}
sidebarToggle.addEventListener('click', () => {
 closeProfile();
 if (isNarrow()) {
   const opening = !sidebar.classList.contains('open');
   sidebar.classList.toggle('open', opening);
   backdrop.classList.toggle('open', opening);
 } else {
   layout.classList.toggle('sidebar-collapsed');
 }
 syncSidebarToggle();
});
window.addEventListener('resize', () => { if (!isNarrow()) closeMenu(); syncSidebarToggle(); });

function showSection(section,prefill={}) {
  if (!sections[section]||(!menu().some(x=>x[0]===section)&&section!=='notifications')) section = 'overview';
  document.querySelectorAll('[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  closeMenu();
  if(section==='overview'&&portalRole==='customer'){
  content.replaceChildren();const panel=document.createElement('section');panel.className='panel';const title=document.createElement('h2');title.textContent='Welcome, '+(customerProfile?.name||currentUser?.displayName||'Customer');panel.append(title);content.append(panel);
  void renderBusiness(panel,'overview',{api:firmApi,user:currentUser,go:showSection});refreshIcons();return;
  }
  if (section === 'overview') { content.innerHTML = overview; content.querySelector('#welcome-name').textContent = currentUser?.displayName?.trim() || currentUser?.email?.split('@')[0] || 'Customer'; if(portalRole==='firm'){content.querySelector('.welcome p').textContent='Manage assigned clients, filing work and software tools.';const stats=content.querySelector('.stats');stats.replaceChildren();const summary=document.createElement('div');summary.className='panel';stats.append(summary);summary.textContent='Loading firm summary…';firmApi({action:'firmData'}).then(({rows})=>{if(summary.isConnected)summary.textContent='Assigned Clients: '+rows.filter(x=>x.section==='Assigned Clients').length+' · Pending Work: '+rows.filter(x=>x.status==='Pending').length;}).catch(e=>{summary.textContent=e.message;});const box=content.querySelector('.panel h2');if(box)box.textContent='Firm Workspace';content.querySelectorAll('[data-jump=services]').forEach(x=>{x.dataset.jump='assigned';x.textContent='Assigned Clients';});} refreshIcons(); return; }
  const [title, summary] = sections[section];
  content.replaceChildren();
  const panel = document.createElement('section');
  panel.className = 'panel';
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = summary;
  panel.append(h,p);
  if(portalRole==='customer'&&['services','documents','filings','reports','billing','support','profile','notifications'].includes(section)) {
    p.remove();void renderBusiness(panel,section,{api:firmApi,user:currentUser,go:showSection,prefill});
    if(section==='documents'){
      void appendDocumentUploads(panel,'General Document Upload');
    }
  } else if (section === 'services') {
    if(accountType!=='business')createServicesWorkspace(panel);else{const list=document.createElement('p');list.textContent='GST · Income Tax · TDS · Compliance';panel.append(list);}
  } else if (portalRole==='firm' && section==='tools') {
    createServicesWorkspace(panel);
  } else if ((portalRole==='firm'&&['filings','billing','support'].includes(section))||(portalRole==='customer'&&['filings','support'].includes(section))) {
    void renderWorkspace(panel,section,{api:firmApi,user:currentUser,firm:portalRole==='firm',openTool:createServicesWorkspace,refresh:(target)=>showSection(target||section)});
  } else if (portalRole==='firm' && section==='companies') {
    void renderCompanyDirectory(panel);
  } else if (portalRole==='firm' && ['assigned','notifications'].includes(section)) {
    void renderFirmRecords(panel,section);
    if(section==='notifications')void renderClientNotifications(panel,{api:firmApi});
    if(section==='support'){const link=document.createElement('a');link.href='/contact.html';link.textContent='Contact support';link.className='action';panel.append(link);}
  } else if (section === 'documents') {
    void appendDocumentUploads(panel);
  } else if (section === 'profile') {
    p.textContent = 'Your Firebase account information';
    const dl = document.createElement('dl'); dl.className = 'profile-grid';
    const entries = [['Full Name', currentUser?.displayName || 'Not provided'], ['Email Address', currentUser?.email || 'Not available'], ['Email Verified', currentUser?.emailVerified ? 'Yes' : 'No']];
    if(customerProfile){entries.push(['Account Type',accountType==='business'?'Business':'CA / CS / Advocate'],['Mobile Number',customerProfile.mobile]);if(accountType==='business')entries.push(['Business Name',customerProfile.business_name],['GSTIN',customerProfile.gstin]);else entries.push(['Profession',customerProfile.profession],['Firm Name',customerProfile.firm_name||'Not provided']);}
    for (const [key,value] of entries) {
      const dt = document.createElement('dt'); dt.textContent=key;
      const dd = document.createElement('dd'); dd.textContent=value; dl.append(dt,dd);
    }
    panel.append(dl);
  } else {
    const placeholder = document.createElement('div'); placeholder.className='empty';
    placeholder.textContent = 'No customer records available yet.';
    panel.append(placeholder);
    if (section === 'support') {
      const row = document.createElement('div'); row.className='action-row';
      const link = document.createElement('a');link.href='/contact.html';link.textContent='Go to Contact Page';link.className='action primary';row.append(link);panel.append(row);
    }
  }
  content.append(panel);
  refreshIcons();
}
let otpExpiryTimer,otpRefreshBusy=false;
function scheduleOtpExpiry(user,status){
 clearTimeout(otpExpiryTimer);
 if(status.required&&status.expiresAt)otpExpiryTimer=setTimeout(()=>{if(auth.currentUser?.uid===user.uid)void checkOtpSession();},Math.max(0,status.expiresAt-Date.now()));
}
async function checkOtpSession(){
 const user=auth.currentUser;if(!user||otpRefreshBusy)return;otpRefreshBusy=true;
 try{
 const response=await fetch('/api/otp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'status'}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 const state=await response.json();if(auth.currentUser?.uid!==user.uid)return;
 if(response.status===401||response.status===403||(response.ok&&!state.verified)){await signOut(auth);location.replace('/login.html');return;}
 if(response.ok)scheduleOtpExpiry(user,state);
 }catch{}finally{otpRefreshBusy=false;}
}
setInterval(()=>{if(!document.hidden)void checkOtpSession();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void checkOtpSession();});
let authGeneration=0;
function showLoginFailure(message){
 currentUser=null;app.style.display='none';loading.hidden=false;
 loading.replaceChildren();
 const box=document.createElement('div');box.style.cssText='max-width:480px;padding:24px;text-align:center';
 const title=document.createElement('h2');title.textContent='Unable to open dashboard';
 const p=document.createElement('p');p.textContent=message;
 const retry=document.createElement('button');retry.type='button';retry.className='action';retry.textContent='Try again';retry.onclick=()=>location.reload();
 const login=document.createElement('a');login.href='/login.html';login.className='action primary';login.textContent='Back to Login';login.style.marginLeft='10px';
 box.append(title,p,retry,login);loading.append(box);
 clearTimeout(window.__gstDashboardWatchdog);
}
onAuthStateChanged(auth, async user => {
  const generation=++authGeneration;
  if (!user) {clearPortalApiCache();window.location.replace('/login.html'); return; }
  try {
    const token=await user.getIdToken();
    const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};
    const roleResponse=await fetch('/api/roles',{method:'POST',headers,body:JSON.stringify({action:'identify'}),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});
    const role=await roleResponse.json().catch(()=>({}));
    if(!roleResponse.ok)throw Object.assign(Error(role.error||'Account verification failed. Please sign in again.'),{authorization:roleResponse.status===401||roleResponse.status===403});
    if(generation!==authGeneration)return;
    if(role.role==='admin'){window.location.replace('/admin.html');return;}
    if(!['customer','firm'].includes(role.role))throw Object.assign(Error('Access denied'),{authorization:true});
    const result=await fetch('/api/otp',{method:'POST',headers,body:JSON.stringify({action:'status'}),cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});
    const status=await result.json().catch(()=>({}));
    if(!result.ok)throw Object.assign(Error(status.error||'Login verification service is unavailable.'),{authorization:result.status===401||result.status===403});
    if(status.verified!==true)throw Object.assign(Error('Login verification required. Please sign in again.'),{authorization:true});
    if(generation!==authGeneration)return;
    portalRole=role.role;accountType=role.accountType||'legacy';customerProfile=role.profile||null;
    currentUser=user;
   clearPortalApiCache();
    const name=user.displayName?.trim()||user.email?.split('@')[0]||'Customer';
    document.getElementById('top-name').textContent=name;
    document.getElementById('menu-name').textContent=name;
    document.getElementById('menu-email').textContent=user.email||'';
    document.getElementById('avatar').textContent=name.charAt(0).toUpperCase();
    configureCustomerMenu();showSection('overview');
    app.style.display='block';loading.hidden=true;
    clearTimeout(window.__gstDashboardWatchdog);
    scheduleOtpExpiry(user,status);
  }catch(e){
    if(generation!==authGeneration)return;
    console.error('Dashboard authentication or initialization failed',e);
    if(e.authorization){try{await signOut(auth);}catch{}window.location.replace('/login.html');return;}
    showLoginFailure(e.name==='TimeoutError'||e.name==='AbortError'?'Verification timed out. Check your connection and try again.':'The dashboard could not finish loading. Please try again or sign in again.');
  }
},()=>showLoginFailure('Authentication could not be initialized. Please try again.'));
document.getElementById('navigation').addEventListener('click', e => {
  const target = e.target.closest('[data-section]'); if(target) showSection(target.dataset.section);
});
document.querySelector('.sidebar-bottom').addEventListener('click', e => {
  const target = e.target.closest('[data-section]'); if(target) showSection(target.dataset.section);
});
content.addEventListener('click', e => {
  const target = e.target.closest('[data-jump]'); if(target) showSection(target.dataset.jump);
});
document.getElementById('notification-toggle').addEventListener('click', () => {closeProfile();showSection('notifications');});

const profileToggle=document.getElementById('profile-toggle');
const profileMenu=document.getElementById('profile-menu');
function closeProfile(){profileMenu.hidden=true;profileToggle.setAttribute('aria-expanded','false');}
profileToggle.addEventListener('click',()=>{
 const willOpen=profileMenu.hidden;
 profileMenu.hidden=!willOpen;
 profileToggle.setAttribute('aria-expanded',String(willOpen));
});
profileMenu.addEventListener('click',e=>{
 const btn=e.target.closest('[data-section]');
 if(btn){showSection(btn.dataset.section);closeProfile();}
});
document.addEventListener('click',e=>{if(!e.target.closest('.profile-container'))closeProfile();});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'){closeProfile();closeMenu();}

});

backdrop.addEventListener('click',closeMenu);
async function revokeOtpSession(){
 const user=auth.currentUser;if(!user)return;
 const response=await fetch('/api/otp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'logout'}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Unable to terminate verification session');
}
async function logout() {
  const button = document.getElementById('logout');button.disabled = true;
  document.getElementById('profile-logout').disabled = true;
  try { await revokeOtpSession(); clearPortalApiCache(); await signOut(auth); window.location.replace('/login.html'); }
  catch { button.disabled = false; document.getElementById('profile-logout').disabled = false; alert('Could not log out. Please try again.'); }
}

document.getElementById('profile-logout').addEventListener('click',logout);

// Initialize the icon set after DOM and on dashboard section rebuilds.
refreshIcons();
window.addEventListener('load', refreshIcons, { once: true });
syncSidebarToggle();
