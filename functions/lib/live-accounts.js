// Never revive a deleted UID when someone registers again with the same email.
export async function liveAccountMap(ids,lookup){
 const keys=[...new Set(ids.filter(id=>typeof id==='string'&&id.length&&id.length<=128))];
 if(!keys.length)return new Map();
 const wanted=new Set(keys);
 const users=await lookup(keys);
 return new Map(users.filter(u=>wanted.has(u.uid)&&u.email).map(u=>[u.uid,u]));
}
export function liveFirmRows(rows,current,adminUid){
 const selected=new Map();
 for(const row of rows){
  const user=current.get(row.uid);
  if(!user||user.disabled||row.uid===adminUid||user.email!==String(row.email||'').toLowerCase())continue;
  selected.set(row.uid,{uid:row.uid,email:user.email,role:'Firm'});
 }
 return [...selected.values()].sort((a,b)=>a.email.localeCompare(b.email));
}
