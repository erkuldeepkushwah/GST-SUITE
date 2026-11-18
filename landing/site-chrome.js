(function(){
'use strict';
function mount(){
const page=location.pathname.split('/').pop();
const isDashboard=page==='dashboard.html';
const isLogin=page==='login.html';
const isSignup=page==='signup.html';
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
document.body.insertAdjacentHTML('afterbegin',nav);
document.body.insertAdjacentHTML('beforeend',foot);
const button=document.querySelector('.fgsite-toggle');
const list=document.querySelector('.fgsite-nav');
button.addEventListener('click',()=>{const open=list.classList.toggle('open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close navigation':'Open navigation');button.textContent=open?'×':'☰';});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&list.classList.contains('open'))button.click();});
list.addEventListener('click',e=>{if(e.target.closest('a')&&list.classList.contains('open'))button.click();});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();