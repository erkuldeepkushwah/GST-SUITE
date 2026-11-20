// Independent dashboard loader: errors must never leave the secure login screen spinning.
(function(){
 const loading=document.getElementById('loading');
 if(!loading)return;
 function fail(message){
  if(loading.hidden)return;
  clearTimeout(window.__gstDashboardWatchdog);
  const box=document.createElement('div');box.style.cssText='max-width:480px;padding:24px;text-align:center';
  const title=document.createElement('h2');title.textContent='Unable to open dashboard';
  const text=document.createElement('p');text.textContent=message;
  const retry=document.createElement('button');retry.type='button';retry.className='action';retry.textContent='Try again';retry.onclick=()=>location.reload();
  const login=document.createElement('a');login.href='/login.html';login.className='action primary';login.style.marginLeft='10px';login.textContent='Back to Login';
  box.append(title,text,retry,login);loading.replaceChildren(box);
 }
 window.__gstDashboardWatchdog=setTimeout(()=>fail('Secure login is taking too long. Check your internet connection and try again.'),35000);
 import('./dashboard.js?v=fastdirectory1').catch(error=>{
  console.error('Dashboard startup failed',error);
  fail('The dashboard could not load its sign-in modules. Try again or return to Login.');
 });
})();