// Contact form submit goes through Cloudflare Pages Functions, not Gmail or WordPress.
(function(){
 'use strict';
 const form=document.getElementById('demo-contact-form');if(!form)return;
 const box=document.createElement('div');box.className='fg-form-status';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.style.cssText='display:none;margin:14px 0 0;padding:12px 14px;border-radius:10px;font-size:14px;line-height:1.55;border:1px solid transparent';form.append(box);
 const button=form.querySelector('button[type="submit"]');
 const value=name=>String(form.elements.namedItem(name)?.value||'').trim();
 const show=(good,message)=>{box.style.display='block';box.style.background=good?'#ECFDF3':'#FEF3F2';box.style.borderColor=good?'#ABEFC6':'#FECDCA';box.style.color=good?'#067647':'#B42318';box.textContent=message;};
 let sending=false;
 form.addEventListener('submit',async e=>{
  e.preventDefault();e.stopImmediatePropagation();
  if(sending)return;if(!form.checkValidity()){form.reportValidity();return;}
  const data={name:value('name'),email:value('email'),module:value('module'),timeline:value('timeline'),message:value('message'),_honey:value('_honey')};
  if(data.message.length<10){show(false,'Please enter at least 10 characters in your message.');return;}
  sending=true;button.disabled=true;form.setAttribute('aria-busy','true');box.style.display='none';
  const caption=button.querySelector('.elementor-button-text');const label=caption||button;const old=label.textContent;label.textContent='Submitting…';
  try{
   const res=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store',signal:AbortSignal.timeout(20000)});
   const json=await res.json().catch(()=>null);
   if(!res.ok||json?.accepted!==true)throw Error(json?.error||'Submission failed');
   form.reset();show(true,'Your enquiry was submitted successfully. Our team will contact you.');
  }catch(error){show(false,error?.name==='TimeoutError'?'Request timed out. Please check with us before submitting again.':(error?.message||'Unable to send enquiry.'));}
  finally{sending=false;button.disabled=false;form.removeAttribute('aria-busy');label.textContent=old;}
 },true);
})();
