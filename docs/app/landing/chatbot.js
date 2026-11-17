/* GST-SUITE / Fingenuity Associates — shared chatbot widget.
   Text-only conversations; never send uploaded reconciliation files or GST data. */
(() => {
  if (window.__fingenuityChatMounted) return;
  window.__fingenuityChatMounted = true;
  const style = document.createElement('style');
  style.textContent = `
#fg-ai-open {position:fixed;z-index:99998;bottom:22px;right:22px;display:flex;align-items:center;gap:9px;background:#0159d3;color:#fff;border:0;border-radius:999px;padding:13px 18px;box-shadow:0 10px 30px #00347d40;cursor:pointer;font:700 14px system-ui,sans-serif}
#fg-ai-open:hover{background:#003e9f}#fg-ai-open svg{width:20px;height:20px}#fg-ai-open:focus-visible,#fg-ai-panel button:focus-visible,#fg-ai-input:focus-visible{outline:3px solid #89bbff;outline-offset:2px}
#fg-ai-panel{position:fixed;z-index:99999;bottom:84px;right:20px;width:min(390px,calc(100vw - 24px));height:min(560px,calc(100dvh - 104px));display:none;flex-direction:column;background:#fff;color:#142035;border:1px solid #cbdaf0;border-radius:18px;box-shadow:0 16px 56px #0b17364d;overflow:hidden;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
#fg-ai-panel.fg-ai-visible{display:flex}
#fg-ai-head{background:linear-gradient(110deg,#00347d,#0159d3);color:#fff;padding:15px;display:flex;align-items:center;gap:10px;flex-shrink:0}
#fg-ai-head strong{font-size:15px;color:#fff!important}#fg-ai-head small{display:block;color:#e7f1ff;font-size:11px}
#fg-ai-close{margin-left:auto;background:#ffffff26;border:0;color:white;border-radius:10px;width:34px;height:34px;cursor:pointer;font-size:24px;line-height:1}
#fg-ai-msgs{flex:1;min-height:0;overflow:auto;padding:16px 12px;display:flex;flex-direction:column;gap:11px;background:#f6f9ff}
.fg-ai-msg{white-space:pre-wrap;overflow-wrap:anywhere;max-width:91%;padding:10px 13px;border-radius:13px;font-size:13px;line-height:1.55}
.fg-ai-bot{align-self:flex-start;background:white;border:1px solid #deebfb;color:#172033}
.fg-ai-user{align-self:flex-end;background:#0159d3;color:white}
#fg-ai-status{font-size:11px;min-height:18px;padding:0 14px;background:white;color:#51647b}
#fg-ai-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e2eaf7;background:#fff;align-items:flex-end}
#fg-ai-input{flex:1;resize:none;min-width:0;min-height:42px;max-height:112px;border:1px solid #cad9ef;border-radius:11px;padding:10px;outline:0;font:14px system-ui,sans-serif;color:#172033;background:#fff}
#fg-ai-send{min-width:65px;min-height:42px;background:#0159d3;color:white;border:0;border-radius:10px;font-weight:700;cursor:pointer}#fg-ai-send:disabled{opacity:.5;cursor:wait}
#fg-ai-note{font-size:10px;color:#56647b;padding:0 12px 9px;background:#fff}
@media(max-width:600px){#fg-ai-open{right:14px;bottom:14px;padding:13px}#fg-ai-open span{display:none}#fg-ai-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:min(620px,calc(100dvh - 16px));border-radius:17px}}
`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id='fg-ai-open'; btn.type='button'; btn.setAttribute('aria-label','Open GST-SUITE AI assistant');
  btn.setAttribute('aria-expanded','false');
  btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9H13a8.48 8.48 0 0 1 8 8v.5Z"/><path d="M8 12h8M12 8v8"/></svg><span>Ask Fingenuity AI</span>';
  const panel = document.createElement('section');
  panel.id='fg-ai-panel'; panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Fingenuity AI assistant');panel.setAttribute('aria-modal','false');
  panel.innerHTML='<div id="fg-ai-head"><span aria-hidden="true">✦</span><div><strong>Fingenuity AI Assistant</strong><small>GST • Bank • TDS • Stock reconciliation</small></div><button type="button" id="fg-ai-close" aria-label="Close chat">×</button></div><div id="fg-ai-msgs" role="log" aria-live="polite" aria-relevant="additions"></div><div id="fg-ai-status" aria-live="polite"></div><form id="fg-ai-form"><textarea id="fg-ai-input" maxlength="1500" rows="1" placeholder="Ask about a module..." aria-label="Your message" required></textarea><button type="submit" id="fg-ai-send">Send</button></form><div id="fg-ai-note">Please don’t share GSTIN, invoices, passwords or personal data. AI responses may contain mistakes.</div>';
  document.body.append(btn,panel);
  const messages=panel.querySelector('#fg-ai-msgs'),input=panel.querySelector('#fg-ai-input'),send=panel.querySelector('#fg-ai-send'),status=panel.querySelector('#fg-ai-status');
  const history=[];
  const add=(who,msg)=>{const el=document.createElement('div');el.className='fg-ai-msg '+(who==='user'?'fg-ai-user':'fg-ai-bot');el.textContent=msg;messages.append(el);messages.scrollTop=messages.scrollHeight};
  add('model','Namaste! I can help with GST 2A/2B, GSTR-1 & 3B, GST reconciliation, Bank, TDS and Stock modules. How can I help?');
  const toggle=(open)=>{panel.classList.toggle('fg-ai-visible',open);btn.style.display=open?'none':'';btn.setAttribute('aria-expanded',String(open));if(open)input.focus();else btn.focus()};
  btn.addEventListener('click',()=>toggle(true));panel.querySelector('#fg-ai-close').addEventListener('click',()=>toggle(false));
  document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&panel.classList.contains('fg-ai-visible'))toggle(false)});
  input.addEventListener('keydown',(e)=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();if(!send.disabled)panel.querySelector('form').requestSubmit()}});
  panel.querySelector('#fg-ai-form').addEventListener('submit',async(e)=>{
    e.preventDefault();const text=input.value.trim();if(!text||send.disabled)return;
    input.value='';add('user',text);history.push({role:'user',text});send.disabled=true;status.textContent='Thinking…';
    try {
      const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:history.slice(-12)}),signal:AbortSignal.timeout(30000)});
      const data=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(data.error||'Chat service unavailable. Please try again.');
      const answer=String(data.reply||'No response received.').slice(0,4000);add('model',answer);history.push({role:'model',text:answer});
    }catch(err){
      const msg=err instanceof Error?err.message:'Unable to connect right now.';
      add('model',msg);history.pop();
    }finally{status.textContent='';send.disabled=false;input.focus()}
  });
})();
