import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail, sendEmailVerification, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

const config = {
  apiKey: 'AIzaSyDdJTg0SF66ksdSaJnrWH8dd0ei15M6yoA',
  authDomain: 'paypoint-e14c9.firebaseapp.com',
  projectId: 'paypoint-e14c9',
  storageBucket: 'paypoint-e14c9.firebasestorage.app',
  messagingSenderId: '970332210587',
  appId: '1:970332210587:web:10bedd6bf179372cc78d3e'
};
const auth = getAuth(initializeApp(config));
const form = document.querySelector('#auth-form');
const mode = document.body.dataset.mode;
const notice = document.querySelector('#notice');
const button = form.querySelector('button[type=submit]');
const show = (message, type='error') => { notice.textContent = message; notice.className = 'alert show ' + type; };
const messages = {
  'auth/email-already-in-use': 'This email is already registered. Please log in.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Use a stronger password (at least 8 characters).',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please try again later.',
  'auth/network-request-failed': 'Network error. Check your internet connection.',
  'auth/operation-not-allowed': 'Enable Email/Password in Firebase Console → Authentication → Sign-in method.',
  'auth/unauthorized-domain': 'Add this website domain to Firebase Authentication authorized domains.'
};
const explain = err => messages[err?.code] || 'Unable to complete your request. Please try again.';
document.querySelectorAll('[data-toggle-password]').forEach(el => {
  el.addEventListener('click', () => {
    const input = document.querySelector('#password');
    const revealed = input.type === 'password';
    input.type = revealed ? 'text' : 'password';
    el.textContent = revealed ? 'Hide' : 'Show';
    el.setAttribute('aria-label', revealed ? 'Hide password' : 'Show password');
  });
});

function fieldError(name,message=''){
 const input=form.elements.namedItem(name);if(!input||!input.id)return;
 input.setAttribute('aria-invalid',String(!!message));const el=document.getElementById(input.id+'-error');if(el)el.textContent=message;
}
function signupData(){
 const f=form.elements,type=f.accountType.value;
 const p={accountType:type,name:f.name.value.trim(),mobile:f.mobile.value,email:f.email.value.trim()};
 if(type==='business'){p.businessName=f.businessName.value.trim();p.gstin=f.gstin.value.trim().toUpperCase();}
 else{p.profession=f.profession.value;p.firmName=f.firmName.value.trim();}
 return p;
}
function validateSignup(){
 const p=signupData(),errors={};
 if(p.name.length<2)errors.name='Enter your full name.';
 if(!/^[6-9]\d{9}$/.test(p.mobile))errors.mobile='Enter a 10-digit mobile number starting with 6–9.';
 if(!p.email||!form.elements.email.validity.valid)errors.email='Enter a valid email address.';
 if(form.elements.password.value.length<8)errors.password='Use at least 8 characters.';
 if(p.accountType==='business'){
 if(!p.businessName)errors.businessName='Enter your business name.';
 if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(p.gstin))errors.gstin='Enter a valid 15-character GSTIN.';
 }else if(!['CA','CS','Advocate'].includes(p.profession))errors.profession='Select your profession.';
 Array.from(form.querySelectorAll('input:not([type=radio]),select')).filter(x=>!x.disabled).forEach(x=>fieldError(x.name,errors[x.name]||''));
 const first=Object.keys(errors)[0];if(first){form.elements[first].focus();return null;}return p;
}
if(mode==='signup'&&form.elements.accountType){
 const syncType=()=>{for(const block of form.querySelectorAll('[data-account-fields]')){const visible=block.dataset.accountFields===form.elements.accountType.value;block.hidden=!visible;for(const input of block.querySelectorAll('input,select')){input.disabled=!visible;if(!visible)fieldError(input.name);}}};
 form.querySelectorAll('[name=accountType]').forEach(x=>x.addEventListener('change',syncType));syncType();
 const mobile=form.elements.mobile;mobile.addEventListener('beforeinput',e=>{if(e.data&&/\D/.test(e.data))e.preventDefault();});mobile.addEventListener('input',()=>{mobile.value=mobile.value.replace(/\D/g,'').slice(0,10);});
 const gst=form.elements.gstin;gst.addEventListener('input',()=>{gst.value=gst.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,15);});
 for(const x of form.querySelectorAll('input:not([type=radio]),select')){x.addEventListener('input',()=>fieldError(x.name));x.addEventListener('change',()=>fieldError(x.name));}
}
async function saveSignupProfile(user,profile){
 const response=await fetch('/api/roles',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'registerProfile',profile}),signal:AbortSignal.timeout(15000)});
 const j=await response.json();if(!response.ok){for(const [name,msg] of Object.entries(j.errors||{}))fieldError(name,msg);throw Object.assign(Error(j.error||'Unable to save profile'),{otpMessage:j.error||'Unable to save profile'});}
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  let email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const profile=mode==='signup'?validateSignup():null;
  if(mode==='signup'&&!profile)return;
  if (!email || !password) return show('Please fill in all required fields.');
  button.disabled = true;
  button.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
  try {
    if (mode === 'signup') {
      const name = form.elements.name.value.trim();
      if (name.length < 2) { show('Enter your full name.'); return; }
      await setPersistence(auth, browserLocalPersistence);
      let account;
      if(auth.currentUser&&auth.currentUser.email?.toLowerCase()===email.toLowerCase()){account=await signInWithEmailAndPassword(auth,email,password);}else{account=await createUserWithEmailAndPassword(auth,email,password);}
      await saveSignupProfile(account.user,profile);
      await updateProfile(account.user, { displayName: name });
      try { await identifyRole(account.user); } catch { console.warn('Account directory unavailable; retry on login.'); }
      // Registration stays successful even when the separate welcome notification fails.
      let welcome='not-sent';
      try {
        const token = await account.user.getIdToken(true);
        button.textContent='Sending welcome email…';
        const response=await fetch('/api/welcome',{method:'POST',headers:{Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(20000)});
        const result=await response.json().catch(()=>null);
        if(response.ok&&result?.accepted===true)welcome='accepted';
        else if(result?.code==='SENDER_DOMAIN_UNVERIFIED'||result?.code==='EMAIL_CONFIGURATION')welcome='sender-configuration';
        else console.warn('Welcome email request failed',response.status);
      }catch{console.warn('Welcome email service unavailable.');}
      await signOut(auth);
      window.location.replace('/login.html?registered=1&welcome='+encodeURIComponent(welcome));
      return;
    } else {
      const remember = form.elements.remember.checked;
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      if (/^(?:\+91)?[6-9]\d{9}$/.test(email.replace(/\s/g,''))) { const resolved=await otpApi('resolve',{mobile:email,password},false); email=resolved.email; }
      const account=await signInWithEmailAndPassword(auth, email, password);
      if (account.user.email?.toLowerCase() === 'kuldeep@gmail.com') {
        try {
          const response = await fetch('/api/admin', {method:'POST',headers:{Authorization:'Bearer '+await account.user.getIdToken(true)},cache:'no-store',signal:AbortSignal.timeout(15000)});
          const admin = await response.json();
          if (!response.ok || admin.authorized !== true) throw new Error(admin.error || 'Admin access denied.');
          window.location.replace('/admin.html');
          return;
        } catch (error) {
          await signOut(auth);
          show(error.message || 'Admin authorization failed.');
          return;
        }
      }
      const role = await identifyRole(account.user);
      if (!(await completeOtp(account.user))) return;
      if (role.role === 'firm') { window.location.replace('/dashboard.html'); return; }
      show('Signed in successfully. Opening your dashboard…', 'success');
    }
    window.location.assign('/dashboard.html');
  } catch (err) {
    if(mode==='signup'&&['auth/email-already-in-use','auth/invalid-email','auth/weak-password'].includes(err?.code)){fieldError(err.code==='auth/weak-password'?'password':'email',explain(err));}else show(err?.otpMessage || explain(err));
  } finally {
    button.disabled = false;
    button.textContent = mode === 'signup' ? 'Create Account' : 'Login';
  }
});
async function identifyRole(user){
 const r=await fetch('/api/roles',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'identify'}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 const j=await r.json();if(!r.ok)throw Object.assign(new Error('Role check failed'),{otpMessage:j.error||'Role check failed'});return j;
}
async function otpApi(action, data={}, authenticated=true) {
  const headers={'Content-Type':'application/json'};
  if(authenticated) headers.Authorization='Bearer '+await auth.currentUser.getIdToken();
  const r=await fetch('/api/otp',{method:'POST',headers,body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(15000)});
  const result=await r.json();
  if(!r.ok) throw Object.assign(new Error('OTP request failed'),{otpMessage:result.error||'Unable to complete verification'});
  return result;
}
async function revokeOtpSession(){
 const user=auth.currentUser;if(!user)return;
 const response=await fetch('/api/otp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({action:'logout'}),cache:'no-store',signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Unable to terminate verification session');
}
async function completeOtp(user){
 const state=await otpApi('status');
 if(!state.required||state.verified)return true;
 form.hidden=true;
 document.body.classList.add('otp-step');
 const box=document.createElement('section');box.className='otp-panel';box.setAttribute('aria-label','Email OTP verification');
 box.innerHTML='<svg class="otp-mail-icon" viewBox="0 0 32 28" fill="none" aria-hidden="true"><rect x="1.5" y="3" width="29" height="22" rx="3" stroke="currentColor" stroke-width="2"/><path d="M3 5l13 11L29 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><h2>Verify your email</h2><p class="subtitle" id="otp-info">Sending a 6-digit code to your registered email.</p><div class="otp-digits" id="otp-digits"></div><button type="button" class="primary" id="otp-submit">Verify &amp; Login</button><button type="button" class="link otp-resend" id="otp-resend">Resend OTP</button><button type="button" class="link otp-cancel" id="otp-cancel">Back to Login</button>';
 form.after(box);
 box.insertBefore(notice,box.querySelector('#otp-digits'));
 notice.className='alert';notice.textContent='';
 const inputs=Array.from({length:6},(_,i)=>{const input=document.createElement('input');input.type='text';input.inputMode='numeric';input.maxLength=1;input.autocomplete=i===0?'one-time-code':'off';input.setAttribute('aria-label','OTP digit '+(i+1));box.querySelector('#otp-digits').append(input);return input;});
 inputs.forEach((el,i)=>{el.addEventListener('input',()=>{el.value=el.value.replace(/\D/g,'').slice(0,1);if(el.value&&i<5)inputs[i+1].focus();});el.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!el.value&&i>0)inputs[i-1].focus();});el.addEventListener('paste',e=>{const digits=e.clipboardData.getData('text').replace(/\D/g,'').slice(0,6);if(digits.length===6){e.preventDefault();inputs.forEach((x,j)=>x.value=digits[j]);inputs[5].focus();}});});
 const send=box.querySelector('#otp-resend'),verify=box.querySelector('#otp-submit');let challenge='',timer=null;
 async function requestCode(){send.disabled=true;verify.disabled=true;try{const result=await otpApi('send');challenge=result.challenge;box.querySelector('#otp-info').textContent='Enter the 6-digit code sent to '+result.masked+'.';show('Verification code sent','success');verify.disabled=false;inputs.forEach(x=>x.value='');inputs[0].focus();}catch(e){show(e.otpMessage||'Unable to send OTP.');}let left=30;send.textContent='Resend OTP in 00:30';clearInterval(timer);timer=setInterval(()=>{left--;send.textContent='Resend OTP in 00:'+String(left).padStart(2,'0');if(left<=0){clearInterval(timer);send.disabled=false;send.textContent='Resend OTP';}},1000);}
 send.onclick=requestCode;
 verify.onclick=async()=>{const code=inputs.map(x=>x.value).join('');if(code.length!==6)return show('Enter all six digits.');verify.disabled=true;try{await otpApi('verify',{challenge,code});clearInterval(timer);if(!user.emailVerified){try{await sendEmailVerification(user);}catch{}}const role=await identifyRole(user);window.location.assign(role.role==='admin'?'/admin.html':'/dashboard.html');}catch(e){show(e.otpMessage||'Verification failed.');verify.disabled=false;}};
 box.querySelector('#otp-cancel').onclick=async()=>{clearInterval(timer);try{await revokeOtpSession();}catch{}await signOut(auth);window.location.assign('/login.html');};
 await requestCode();return false;
}
if (mode === 'login' && new URLSearchParams(window.location.search).get('adminDenied') === '1') {
  show('Admin access denied. Please sign in with the authorized administrator account.');
}
if (mode === 'login' && new URLSearchParams(window.location.search).get('registered') === '1') {
  const welcome=new URLSearchParams(window.location.search).get('welcome');
  if(welcome==='accepted')show('Account created successfully! Welcome email accepted for delivery. Please log in to continue.','success');
  else if(welcome==='sender-configuration')show('Account created successfully. Welcome email could not be sent because the email sender is not configured for this recipient. You can log in.','success');
  else if(welcome==='not-sent')show('Account created successfully. Welcome email delivery could not be confirmed. You can log in.','success');
  else show('Account created successfully! Please log in to continue.','success');
}
const reset = document.querySelector('#reset-password');
if (reset) reset.addEventListener('click', event => {
  event.preventDefault();
  if (button.disabled || document.querySelector('#reset-panel')) return;
  const originalParent=notice.parentNode, originalNext=notice.nextSibling;
  const entered=form.elements.email.value.trim();
  document.body.classList.add('otp-step');
  const panel=document.createElement('section');
  panel.id='reset-panel';panel.className='otp-panel';
  panel.setAttribute('aria-labelledby','reset-heading');
  panel.innerHTML='<svg class="otp-mail-icon" viewBox="0 0 32 28" fill="none" aria-hidden="true"><rect x="1.5" y="3" width="29" height="22" rx="3" stroke="currentColor" stroke-width="2"/><path d="M3 5l13 11L29 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><h2 id="reset-heading">Forgot Password?</h2><p class="subtitle">Enter your registered email address to receive a password reset link.</p><form id="password-reset-form"><div class="field" style="text-align:left"><label for="reset-email">Email Address <em>*</em></label><div class="input-wrap"><input id="reset-email" type="email" name="resetEmail" autocomplete="email" placeholder="Enter your registered email" required></div></div><button class="primary" type="submit">Send Reset Link</button></form><button type="button" class="link otp-cancel" id="reset-back">Back to Login</button>';
  form.after(panel);
  const resetForm=panel.querySelector('#password-reset-form');
  panel.insertBefore(notice,resetForm);
  notice.className='alert';notice.textContent='';
  const input=panel.querySelector('#reset-email');
  if (entered.includes('@')) input.value=entered;
  input.focus();
  const send=resetForm.querySelector('button[type=submit]');
  const back=panel.querySelector('#reset-back');
  resetForm.addEventListener('submit',async e=>{
    e.preventDefault();
    if(send.disabled)return;
    send.disabled=true;back.disabled=true;send.textContent='Sending…';
    try{
      await sendPasswordResetEmail(auth,input.value.trim());
      show('If this email is registered, a password reset link has been sent. Check your inbox and spam folder.','success');
    }catch(err){
      if(err?.code==='auth/user-not-found')show('If this email is registered, a password reset link has been sent. Check your inbox and spam folder.','success');
      else show(explain(err));
    }finally{send.disabled=false;back.disabled=false;send.textContent='Send Reset Link';}
  });
  back.onclick=()=>{
    originalParent.insertBefore(notice,originalNext);
    panel.remove();document.body.classList.remove('otp-step');
    notice.className='alert';notice.textContent='';
    reset.focus();
  };
});
// Dashboard uses Firebase client-side session gating. The existing /app/ remains public;
// real customer document access requires server-side authorization and storage rules.
