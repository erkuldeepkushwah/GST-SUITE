import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

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
  const email = form.elements.email.value.trim();
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
      show('Account created! Opening your dashboard…', 'success');
    } else {
      const remember = form.elements.remember.checked;
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      await signInWithEmailAndPassword(auth, email, password);
      show('Signed in successfully. Opening your dashboard…', 'success');
    }
    window.location.assign('/dashboard.html');
  } catch (err) {
    show(explain(err));
  } finally {
    button.disabled = false;
    button.textContent = mode === 'signup' ? 'Create Account' : 'Login';
  }
});
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
