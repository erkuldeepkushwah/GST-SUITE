import {identity,policy,otpVerified} from './roles.js';
import {storageConfigured,savePrivateFile,listUploadedDocuments,downloadPrivateFile} from '../lib/supabase-storage.js';
const sheetId = '1cGVFnYTN8giBwUy37Sreyknx8-BaGEX7DkM-ZNi5hjI';
const folders = new Map([
  ['Sales Invoices', '1QlIwTtrdPT4VF5TjHo2osBREpBkIRlOM'],
  ['Purchase Bills', '1x_QrcTeSKM4U5ZlbYXdGQcURNHi1jySv'],
  ['Bank Statements', '1hsl3D-1CWYfw4Kh6lTeJZHZMOVU6AKcq'],
  ['Expense Sheets', '1ODXVf2ZmaD12tizA5b-wTMgQHjknqznX'],
  ['Other Documents', '1Ez-ghoCwpDgHM-u78qbqrPPyMp0p581R'],
]);
const maxFileSize = 10 * 1024 * 1024;
const extension = /\.(pdf|jpe?g|png|csv|xlsx?)$/i;
const encoder = new TextEncoder();

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function googleToken(secret) {
  const { client_email, private_key } = JSON.parse(secret);
  const now = Math.floor(Date.now() / 1000);
  const tokenUrl = 'https://oauth2.googleapis.com/token';
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claims = base64url(encoder.encode(JSON.stringify({
    iss: client_email,
    scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
    aud: tokenUrl, iat: now, exp: now + 300,
  })));
  const pem = private_key.replace(/-----[^-]+-----|\s/g, '');
  const key = await crypto.subtle.importKey(
    'pkcs8', Uint8Array.from(atob(pem), char => char.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const unsigned = `${header}.${claims}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned));
  const response = await fetch(tokenUrl, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error('Google authentication failed');
  return (await response.json()).access_token;
}

async function googleUserToken(secret) {
  const { client_id, client_secret, refresh_token } = JSON.parse(secret);
  if (!client_id || !client_secret || !refresh_token) {
    throw new Error('Incomplete Google OAuth credentials');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id, client_secret, refresh_token,
    }),
  });
  if (!response.ok) throw new Error('Google OAuth refresh failed');
  return (await response.json()).access_token;
}

export async function onRequestPost({ request, env }) {
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
  const user=await identity(request,env).catch(()=>null);
  if(!user)return json({error:'Sign in before uploading documents.'},401);
  const db=env.GST_AUTH_DB;
  try{if((await policy(db,user.localId))?.active===0||!await otpVerified(request,env,user))return json({error:'Access denied'},403);}
  catch{return json({error:'Verification service unavailable'},503);}
  if(request.headers.get('Content-Type')?.includes('application/json')){
    try{
      const b=await request.json();
      const admin=user.localId==='7arK2z41nhTMyjwasmXKCWR0uw93'&&String(user.email||'').toLowerCase()==='kuldeep@gmail.com';
      if(b.admin===true&&!admin)return json({error:'Admin access required'},403);
      const scope={ownerUid:b.admin===true&&admin?null:user.localId};
      if(!storageConfigured(env))return json({error:'Document storage is not configured'},503);
      if(b.action==='list'){
        const offset=Number(b.offset||0);
        if(!Number.isSafeInteger(offset)||offset<0||offset>100000)return json({error:'Invalid page'},400);
        const rows=await listUploadedDocuments(env,{...scope,offset,limit:51});
        const documents=await Promise.all(rows.slice(0,50).map(async r=>{
          let uploadedBy='';
          if(admin&&b.admin===true){
            const p=await db.prepare('SELECT a.email,a.name,p.business_name,p.firm_name FROM portal_accounts a LEFT JOIN customer_profiles p ON p.uid=a.uid WHERE a.uid=?').bind(r.owner_uid).first();
            uploadedBy=p?.firm_name||p?.business_name||p?.email||p?.name||r.owner_uid;
          }
          return {id:r.id,name:r.name,category:r.category,size:r.size,created_at:r.created_at,uploadedBy};
        }));
        return json({documents,hasMore:rows.length>50});
      }
      if(b.action==='download'){
        if(!/^[a-f0-9-]{36}$/i.test(String(b.id||'')))return json({error:'Invalid document'},400);
        const [row]=await listUploadedDocuments(env,{...scope,id:b.id,limit:1});
        if(!row)return json({error:'Document not found'},404);
        const response=await downloadPrivateFile(env,'supabase:'+row.bucket+'/'+row.object_path);
        if(!response.ok)return json({error:'Unable to download document'},502);
        const safeName=String(row.name||'document').replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180);
        return new Response(response.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="'+safeName+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      }
      return json({error:'Unknown action'},400);
    }catch(e){return json({error:/Supabase server credential/.test(e.message||'')?e.message:'Unable to access uploaded documents'},502);}
  }
  const userOAuth = env.GST_GOOGLE_OAUTH_JSON;
  const serviceAccount = env.GST_GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!storageConfigured(env) && !userOAuth && !serviceAccount) {
    return json({ error: 'Document storage is not configured on the upload server.' }, 503);
  }
  if (Number(request.headers.get('Content-Length')) > 5 * maxFileSize + 65536) {
    return json({ error: 'Choose up to five files, 10 MB each.' }, 413);
  }

  const form = await request.formData().catch(() => null);
  const category = form?.get('category');
  const folder = folders.get(category);
  const files = form?.getAll('files') || [];
  if (!folder || files.length < 1 || files.length > 5 || files.some(file =>
    !(file instanceof File) || !extension.test(file.name) || !file.size || file.size > maxFileSize
  )) return json({ error: 'Choose a valid category and up to five supported files, 10 MB each.' }, 400);

  if(storageConfigured(env)){
    const saved=[],errors=[];let storageError='';
    for(const file of files){
      const id=crypto.randomUUID(),name=file.name.replace(/[\u0000-\u001f]/g,'').slice(0,180);
      try{await savePrivateFile(env,{id,bucket:'gst-documents',file,name,ownerUid:user.localId,category});saved.push({id,name});}
      catch(e){errors.push(file.name);if(/Supabase server credential/.test(e.message||''))storageError=e.message;}
    }
    return saved.length?json({saved,errors},201):json({saved,errors,error:storageError||'Supabase document storage could not save the upload.'},502);
  }
  // Preserve the existing Google upload provider until the Supabase server secret is configured.
  const token = await (userOAuth ? googleUserToken(userOAuth) : googleToken(serviceAccount)).catch(() => null);
  if (!token) return json({ error: 'The upload server could not authenticate with Google.' }, 503);
  const authorization = { Authorization: `Bearer ${token}` };
  const saved = [];
  const errors = [];
  for (const file of files) {
    const id = crypto.randomUUID();
    const boundary = crypto.randomUUID();
    const mime = 'application/octet-stream';
    const metadata = JSON.stringify({ name: `${id}-${file.name}`, parents: [folder] });
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, file, `\r\n--${boundary}--\r\n`,
    ]);
    let driveId;
    try {
      const uploaded = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink', {
        method: 'POST', headers: { ...authorization, 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      });
      if (!uploaded.ok) throw new Error(`Drive returned ${uploaded.status}`);
      const drive = await uploaded.json();
      driveId = drive.id;
      const now = new Date().toISOString();
      const record = [id, now, user.localId, user.displayName || '', user.email || '', '', category,
        file.name, file.type || mime, String(file.size), driveId, drive.webViewLink || '', 'Uploaded', 'Pending', '', now];
      const recorded = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/DocumentUploads!A:P:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
        method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: [record] }),
      });
      if (!recorded.ok) throw new Error(`Sheets returned ${recorded.status}`);
      saved.push({ id, name: file.name });
    } catch (error) {
      console.warn('Document upload failed', error.message);
      if (driveId) {
        await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveId)}?supportsAllDrives=true`, {
          method: 'PATCH', headers: { ...authorization, 'Content-Type': 'application/json' },
          body: JSON.stringify({ trashed: true }),
        }).catch(() => null);
      }
      errors.push(file.name);
    }
  }

  return saved.length ? json({ saved, errors }, 201)
    : json({ saved, errors, error: 'Google could not save the upload. Check the configured Google account’s folder and Sheet access.' }, 502);
}

export {googleToken,googleUserToken};
