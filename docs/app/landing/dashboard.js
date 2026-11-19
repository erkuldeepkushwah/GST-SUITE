import { createDocumentForm } from './document-upload.js';
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

let currentUser = null;
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

function showSection(section) {
  if (!sections[section]) section = 'overview';
  document.querySelectorAll('[data-section]').forEach(b => b.classList.toggle('active', b.dataset.section === section));
  closeMenu();
  if (section === 'overview') { content.innerHTML = overview; content.querySelector('#welcome-name').textContent = currentUser?.displayName?.trim() || currentUser?.email?.split('@')[0] || 'Customer'; refreshIcons(); return; }
  const [title, summary] = sections[section];
  content.replaceChildren();
  const panel = document.createElement('section');
  panel.className = 'panel';
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = summary;
  panel.append(h,p);
  if (section === 'services') {
    createServicesWorkspace(panel);
  } else if (section === 'documents') {
    panel.append(createDocumentForm(currentUser));
  } else if (section === 'profile') {
    p.textContent = 'Your Firebase account information';
    const dl = document.createElement('dl'); dl.className = 'profile-grid';
    const entries = [['Full Name', currentUser?.displayName || 'Not provided'], ['Email Address', currentUser?.email || 'Not available'], ['Email Verified', currentUser?.emailVerified ? 'Yes' : 'No']];
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
onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace('/login.html'); return; }
  try {
    const roleResponse=await fetch('/api/roles',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'identify'}),cache:'no-store'});
    const role=await roleResponse.json();if(!roleResponse.ok)throw Error('Role check failed');
    if(role.role==='staff'||role.role==='admin'){window.location.replace(role.role==='staff'?'/staff.html':'/admin.html');return;}
    if(role.role!=='customer')throw Error('Access denied');
    const result=await fetch('/api/otp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'status'}),cache:'no-store'});
    const status=await result.json();
    if(!result.ok||status.verified!==true)throw new Error('Login verification required');
     scheduleOtpExpiry(user,status);
  } catch {
    await signOut(auth);
    window.location.replace('/login.html');
    return;
  }
  currentUser = user;
  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Customer';
  document.getElementById('top-name').textContent = name;
  document.getElementById('menu-name').textContent = name;
  document.getElementById('menu-email').textContent = user.email || '';
  document.getElementById('avatar').textContent = name.charAt(0).toUpperCase();
  app.style.display = 'block'; loading.hidden = true;
  showSection('overview');
}, () => { window.location.replace('/login.html'); });
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
  try { await revokeOtpSession(); await signOut(auth); window.location.replace('/login.html'); }
  catch { button.disabled = false; document.getElementById('profile-logout').disabled = false; alert('Could not log out. Please try again.'); }
}
document.getElementById('logout').addEventListener('click',logout);
document.getElementById('profile-logout').addEventListener('click',logout);

// Initialize the icon set after DOM and on dashboard section rebuilds.
refreshIcons();
window.addEventListener('load', refreshIcons, { once: true });
syncSidebarToggle();
