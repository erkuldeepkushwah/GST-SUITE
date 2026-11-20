const fileLimit = 5;
const sizeLimit = 10 * 1024 * 1024;
const supportedExtension = /\.(pdf|jpe?g|png|csv|xlsx?)$/i;

export function createDocumentForm(user, onUploaded) {
  const template = document.getElementById('document-upload-template');
  const form = template.content.firstElementChild.cloneNode(true);
  const input = form.querySelector('input[type="file"]');
  const drop = form.querySelector('.document-drop');
  const list = form.querySelector('.document-files');
  const status = form.querySelector('[role="status"]');
  const submit = form.querySelector('[type="submit"]');
  let files = [];

  function selectFiles(selection) {
    const incoming = Array.from(selection);
    files = [];
    list.replaceChildren();
    if (incoming.length > fileLimit) {
      status.textContent = 'Choose up to 5 files.';
      return;
    }
    if (incoming.some(file => file.size === 0 || file.size > sizeLimit || !supportedExtension.test(file.name))) {
      status.textContent = 'Choose supported, non-empty files up to 10 MB each.';
      return;
    }

    files = incoming;
    status.textContent = '';
    for (const file of files) {
      const item = document.createElement('li');
      item.textContent = file.name;
      list.append(item);
    }
  }

  drop.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    selectFiles(input.files);
    input.value = '';
  });
  drop.addEventListener('dragover', event => {
    event.preventDefault();
    if (!submit.disabled) drop.classList.add('dragging');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop.addEventListener('drop', event => {
    event.preventDefault();
    drop.classList.remove('dragging');
    if (!submit.disabled) selectFiles(event.dataTransfer.files);
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!files.length) {
      status.textContent = 'Attach at least one file.';
      return;
    }
    const body = new FormData(form);
    for (const file of files) body.append('files', file);

    submit.disabled = true;
    drop.disabled = true;
    status.textContent = 'Uploading…';
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/documents', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(result?.saved) || !result.saved.length) {
        throw new Error(result?.error || result?.message || 'Document upload service is unavailable.');
      }
      const failed = new Set(result.errors || []);
      selectFiles(files.filter(file => failed.has(file.name)));
      status.textContent = failed.size
        ? `${result.saved.length} uploaded. Retry the remaining files.`
        : `${result.saved.length} file(s) uploaded.`;
      if(onUploaded)void onUploaded();
    } catch (error) {
      status.textContent = error.message || 'Upload failed. Try again.';
    } finally {
      submit.disabled = false;
      drop.disabled = false;
    }
  });

  return form;
}

export function createUploadedDocuments(user,{admin=false}={}){
 const section=document.createElement('section');section.className='uploaded-documents';section.style.marginTop='24px';
 const heading=document.createElement('h3');heading.textContent=admin?'All Uploaded Documents':'Uploaded Documents';
 const info=document.createElement('p');info.setAttribute('role','status');
 const bar=document.createElement('div');bar.style.cssText='display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:12px 0';
 const search=document.createElement('input');search.type='search';search.placeholder='Search loaded documents';search.setAttribute('aria-label','Search uploaded documents');search.style.cssText='padding:10px;border:1px solid #ccd9eb;border-radius:8px;min-width:0;flex:1';
 bar.append(search);
 const wrap=document.createElement('div');wrap.style.overflowX='auto';
 section.append(heading,bar,info,wrap);
 let rows=[],offset=0,busy=false,hasMore=false,refreshPending=false;
 async function api(body){const response=await fetch('/api/documents',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await user.getIdToken()},body:JSON.stringify({...body,admin}),cache:'no-store'});if(!response.ok){const j=await response.json().catch(()=>null);throw Error(j?.error||'Document request failed');}return response;}
 function draw(){
 const q=search.value.trim().toLowerCase();const filtered=rows.filter(r=>[r.name,r.category,r.uploadedBy].some(x=>String(x||'').toLowerCase().includes(q)));wrap.replaceChildren();info.textContent=filtered.length+' document(s)'+(hasMore?' · Loading additional documents…':'');
 if(!filtered.length){const p=document.createElement('p');p.className='empty';p.textContent='No uploaded documents found.';wrap.append(p);return;}
 const table=document.createElement('table');table.style.cssText='width:100%;border-collapse:collapse;text-align:left;font-size:13px';const head=table.createTHead().insertRow();
 for(const label of ['File Name','Category',...(admin?['Uploaded by']:[]),'Size','Uploaded on','Status','Action']){const th=document.createElement('th');th.textContent=label;th.style.cssText='padding:12px;background:#f4f8ff;white-space:nowrap';head.append(th);}
 const body=table.createTBody();for(const row of filtered){const tr=body.insertRow();const size=Number(row.size);const displaySize=size>=1048576?(size/1048576).toFixed(2)+' MB':(size/1024).toFixed(1)+' KB';
 for(const v of [row.name,row.category,...(admin?[row.uploadedBy]:[]),displaySize,new Date(row.created_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}),'Uploaded']){const td=tr.insertCell();td.textContent=v||'—';td.style.cssText='padding:12px;border-bottom:1px solid #e3eaf3;overflow-wrap:anywhere';}
 const td=tr.insertCell(),button=document.createElement('button');button.type='button';button.className='action';button.textContent='Download';button.onclick=async()=>{button.disabled=true;try{const r=await api({action:'download',id:row.id});const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=row.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){info.textContent=e.message;}finally{button.disabled=false;}};td.append(button);
 if(!admin){const remove=document.createElement('button');remove.type='button';remove.className='action';remove.style.cssText='color:#b91c1c;border-color:#fecaca;margin-left:6px';remove.textContent='Remove';remove.onclick=async()=>{
 if(!confirm('Permanently remove "'+row.name+'"? This will delete the uploaded file.'))return;
 remove.disabled=button.disabled=true;
 try{const response=await api({action:'remove',id:row.id});const result=await response.json();if(result.removed!==true)throw Error('Unable to remove document');rows=rows.filter(x=>x.id!==row.id);offset=Math.max(0,offset-1);draw();info.textContent='Document removed.';await load();}
 catch(e){info.textContent=e.message;}finally{remove.disabled=button.disabled=false;}
 };td.append(remove);}
 }
 wrap.append(table);
 }
 async function load(){if(busy){refreshPending=true;return;}busy=true;info.textContent='Loading documents…';try{let start=0;do{if(!section.isConnected)return;const r=await api({action:'list',offset:start});const d=await r.json();if(!section.isConnected)return;if(start===0)rows=[];rows.push(...d.documents);offset=start+d.documents.length;hasMore=Boolean(d.hasMore);if(hasMore&&offset<=start)throw Error('Unable to load additional documents. Reopen this section to retry.');draw();start=offset;}while(hasMore);}catch(e){info.textContent=e.message;}finally{busy=false;if(refreshPending){refreshPending=false;void load();}}}
 search.oninput=draw;return {element:section,refresh:load};
}
