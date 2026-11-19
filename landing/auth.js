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
  'auth/weak-password': 'Use a stronger password (at least 6 characters).',
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
form.addEventListener('submit', async event => {
  event.preventDefault();
  let email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  if (!email || !password) return show('Please fill in all required fields.');
  if (mode === 'signup' && password.length < 6) return show('Password must have at least 6 characters.');
  button.disabled = true;
  button.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
  try {
    if (mode === 'signup') {
      const name = form.elements.name.value.trim();
      if (name.length < 2) { show('Enter your full name.'); return; }
      await setPersistence(auth, browserLocalPersistence);
      const account = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(account.user, { displayName: name });
      // Email failures must not undo successful Firebase account creation.
      try {
        const token = await account.user.getIdToken(true);
        const response = await fetch('/api/welcome', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token },
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) console.warn('Welcome email service unavailable.');
      } catch {
        console.warn('Welcome email service unavailable.');
      }
      await signOut(auth);
      window.location.replace('/login.html?registered=1');
      return;
    } else {
      const remember = form.elements.remember.checked;
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      if (/^(?:\+91)?[6-9]\d{9}$/.test(email.replace(/\s/g,''))) { const resolved=await otpApi('resolve',{mobile:email,password},false); email=resolved.email; }
      const account=await signInWithEmailAndPassword(auth, email, password);
      if (!(await completeOtp(account.user))) return;
      show('Signed in successfully. Opening your dashboard…', 'success');
    }
    window.location.assign('/dashboard.html');
  } catch (err) {
    show(err?.otpMessage || explain(err));
  } finally {
    button.disabled = false;
    button.textContent = mode === 'signup' ? 'Create Account' : 'Login';
  }
});
async function otpApi(action, data={}, authenticated=true) {
  const headers={'Content-Type':'application/json'};
  if(authenticated) headers.Authorization='Bearer '+await auth.currentUser.getIdToken();
  const r=await fetch('/api/otp',{method:'POST',headers,body:JSON.stringify({action,...data}),signal:AbortSignal.timeout(15000)});
  const result=await r.json();
  if(!r.ok) throw Object.assign(new Error('OTP request failed'),{otpMessage:result.error||'Unable to complete verification'});
  return result;
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
 verify.onclick=async()=>{const code=inputs.map(x=>x.value).join('');if(code.length!==6)return show('Enter all six digits.');verify.disabled=true;try{await otpApi('verify',{challenge,code});clearInterval(timer);if(!user.emailVerified){try{await sendEmailVerification(user);}catch{}}window.location.assign('/dashboard.html');}catch(e){show(e.otpMessage||'Verification failed.');verify.disabled=false;}};
 box.querySelector('#otp-cancel').onclick=async()=>{clearInterval(timer);await signOut(auth);window.location.assign('/login.html');};
 await requestCode();return false;
}
if (mode === 'login' && new URLSearchParams(window.location.search).get('registered') === '1') {
  show('Account created successfully! Please log in to continue.', 'success');
}
const reset = document.querySelector('#reset-password');
if (reset) reset.addEventListener('click', async event => {
  event.preventDefault();
  const email = form.elements.email.value.trim();
  if (!email) return show('Enter your email above to receive a password reset link.');
  try {
    await sendPasswordResetEmail(auth, email);
    show('If this address is registered, a password reset email will arrive shortly.', 'success');
  } catch(err) { show(explain(err)); }
});
// Dashboard uses Firebase client-side session gating. The existing /app/ remains public;
// real customer document access requires server-side authorization and storage rules.
