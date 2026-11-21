// Accessible per-row Actions menu. Move existing controls, never copy/recreate handlers.
// The menu is rendered in document.body so scrollable data grids cannot clip it.
let opened=null,sequence=0;
export function actionColumnIndices(labels){
 return labels.map((value,index)=>/^(action|actions|files)$/i.test(String(value||'').trim())?index:-1).filter(i=>i>=0);
}
export function installPortalActionMenu(cell,label='Actions'){
 if(!cell||cell.dataset.portalActionsEnhanced==='true')return false;
 if(!cell.querySelector('button,a[href]'))return false;
 const options=document.createElement('div');
 options.className='portal-action-options';
 while(cell.firstChild)options.append(cell.firstChild);
 const trigger=document.createElement('button');
 trigger.type='button';trigger.className='portal-action-trigger';
 trigger.setAttribute('aria-label',label);
 trigger.setAttribute('title',label);
 trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
 const id='portal-action-'+(++sequence);
 trigger.setAttribute('aria-controls',id);
 const lines=document.createElement('span');lines.className='portal-action-lines';
 lines.setAttribute('aria-hidden','true');
 for(let i=0;i<3;i++)lines.append(document.createElement('span'));
 trigger.append(lines);
 const popup=document.createElement('div');
 popup.id=id;popup.className='portal-action-popup';popup.setAttribute('role','menu');
 popup.setAttribute('aria-label',label);
 popup.append(options);
 for(const control of popup.querySelectorAll('button,a[href]')){
  control.setAttribute('role','menuitem');
  if(/^(delete|remove|unassign|deactivate|reject|cancel booking)/i.test(control.textContent.trim()))control.classList.add('portal-action-danger');
 }
 let isOpen=false;
 function close(focus=false){
  if(!isOpen)return;
  isOpen=false;trigger.setAttribute('aria-expanded','false');popup.remove();
  document.removeEventListener('pointerdown',onOutside,true);
  document.removeEventListener('keydown',onKey,true);
  document.removeEventListener('scroll',onScroll,true);
  window.removeEventListener('resize',onResize);
  if(opened===close)opened=null;
  if(focus&&trigger.isConnected)trigger.focus();
 }
 function onOutside(event){if(!popup.contains(event.target)&&!trigger.contains(event.target))close();}
 function onScroll(event){if(!popup.contains(event.target))close();}
 function onResize(){close();}
 function onKey(event){
  if(event.key==='Escape'){event.preventDefault();close(true);}
  else if((event.key==='ArrowDown'||event.key==='ArrowUp')&&popup.contains(document.activeElement)){
   event.preventDefault();
   const items=[...popup.querySelectorAll('button:not(:disabled),a[href]')];
   const at=items.indexOf(document.activeElement);
   if(items.length)items[(at+(event.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
  }
 }
 trigger.addEventListener('click',()=>{
  if(isOpen){close();return;}
  opened?.();
  document.body.append(popup);
  isOpen=true;trigger.setAttribute('aria-expanded','true');
  const rect=trigger.getBoundingClientRect();
  const width=popup.offsetWidth,height=popup.offsetHeight;
  popup.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';
  const below=window.innerHeight-rect.bottom;
  popup.style.top=(below<Math.min(height+8,220)&&rect.top>height?
    Math.max(8,rect.top-height-4):
    Math.max(8,Math.min(rect.bottom+4,window.innerHeight-height-8)))+'px';
  opened=close;
  document.addEventListener('pointerdown',onOutside,true);
  document.addEventListener('keydown',onKey,true);
  document.addEventListener('scroll',onScroll,true);
  window.addEventListener('resize',onResize);
  const first=popup.querySelector('button:not(:disabled),a[href]');
  first?.focus();
 });
 popup.addEventListener('click',event=>{
  if(event.target.closest?.('button,a[href]'))close();
 });
 cell.append(trigger);cell.dataset.portalActionsEnhanced='true';
 return true;
}
export function enhancePortalTableActions(table){
 if(!table?.tHead)return 0;
 const indices=actionColumnIndices([...table.tHead.rows[0].cells].map(cell=>cell.textContent));
 let count=0;
 for(const body of table.tBodies)for(const row of body.rows)for(const index of indices){
  if(installPortalActionMenu(row.cells[index], 'Actions for row'))count++;
 }
 return count;
}
