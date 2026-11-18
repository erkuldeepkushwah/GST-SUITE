(function(){
'use strict';
function mount(){
// Work out which screen this is from the path, and fall back to what is
// actually on the page - a clean URL (/dashboard) or a /landing/ copy would
// otherwise slip past a filename comparison and pull in the marketing menu.
const path=(location.pathname||'').toLowerCase();
const page=path.split('/').filter(Boolean).pop()||'';
const match=(name)=>new RegExp('(^|/)'+name+'(/|\\.html)?/?$').test(path);
const isDashboard=match('dashboard')||!!document.getElementById('app');
const isLogin=match('login')||!!document.querySelector('.auth-shell[data-mode="login"], body[data-mode="login"]');
const isSignup=match('signup')||!!document.querySelector('body[data-mode="signup"]');
const item=(href,label,active,klass='')=>'<li><a href="'+href+'"'+(active?' aria-current="page"':'')+(klass?' class="'+klass+'"':'')+'>'+label+'</a></li>';
const nav='<header class="fgsite-header" role="banner"><div class="fgsite-inner">'+
'<a class="fgsite-logo" href="/" aria-label="Fingenuity Associates home"><img src="/logo.png" alt="Fingenuity Associates"></a>'+
'<button type="button" class="fgsite-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="fgsite-menu">☰</button>'+
'<nav aria-label="Main website navigation"><ul class="fgsite-nav" id="fgsite-menu">'+
item('/','Home',false)+item('/about.html','About',false)+item('/app/','Solutions &amp; Modules',false)+item('/service.html','Services',false)+item('/contact.html','Contact',false)+item(isDashboard?'/dashboard.html':'/login.html',isDashboard?'Dashboard':'Login',isDashboard||isLogin||isSignup,'fgsite-login')+
'</ul></nav></div></header>';
const foot='<footer class="fgsite-footer"><div class="fgsite-foot-inner"><div class="fgsite-foot-grid">'+
'<div class="fgsite-foot-brand"><a href="/"><img src="/logo_white.png" alt="Fingenuity Associates"></a><p>GST &amp; Accounts Reconciliation Suite. Professional solutions for GST, banking, TDS and stock reconciliation.</p></div>'+
'<div><h3>Quick Links</h3><ul><li><a href="/">Home</a></li><li><a href="/about.html">About Us</a></li><li><a href="/service.html">Services</a></li><li><a href="/app/">Solutions &amp; Modules</a></li></ul></div>'+
'<div><h3>Get In Touch</h3><ul><li>Indore, Madhya Pradesh, India</li><li><a href="/contact.html">Contact &amp; Support</a></li><li><a href="/login.html">Customer Portal</a></li></ul></div></div>'+
'<div class="fgsite-foot-bottom"><span>© '+new Date().getFullYear()+' Fingenuity Associates. All rights reserved.</span><a href="/contact.html">Contact Us</a></div></div></footer>';
// Activate the uploaded reference artwork only if the image is actually available.
// A missing asset leaves the existing CSS illustration fully visible.
for (const photo of document.querySelectorAll('img[data-banner]')) {
 const activate = () => { if (photo.naturalWidth > 0) photo.parentElement.classList.add('has-reference'); };
 photo.addEventListener('load', activate);
 photo.addEventListener('error', () => { photo.remove(); });
 if (photo.complete) activate();
}
// The customer portal - login, signup and the authenticated dashboard - runs
// without the website navigation. Those screens carry their own header, so the
// marketing menu would only duplicate it and push the form down.
const showSiteNav = !isDashboard && !isLogin && !isSignup;
if (showSiteNav) {
 document.body.insertAdjacentHTML('afterbegin',nav);
 const button=document.querySelector('.fgsite-toggle');
 const list=document.querySelector('.fgsite-nav');
 button.addEventListener('click',()=>{const open=list.classList.toggle('open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');button.textContent=open?'×':'☰';});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&list.classList.contains('open'))button.click();});
 list.addEventListener('click',e=>{if(e.target.closest('a')&&list.classList.contains('open'))button.click();});
}
document.body.insertAdjacentHTML('beforeend',foot);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();