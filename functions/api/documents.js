const sheetId = '1cGVFnYTN8giBwUy37Sreyknx8-BaGEX7DkM-ZNi5hjI';
const folders = new Map([
  ['Sales Invoices', '1QlIwTtrdPT4VF5TjHo2osBREpBkIRlOM'],
  ['Purchase Bills', '1x_QrcTeSKM4U5ZlbYXdGQcURNHi1jySv'],
  ['Bank Statements', '1hsl3D-1CWYfw4Kh6lTeJZHZMOVU6AKcq'],
  ['Expense Sheets', '1ODXVf2ZmaD12tizA5b-wTMgQHjknqznX'],
  ['Other Documents', '1Ez-ghoCwpDgHM-u78qbqrPPyMp0p581R'],
]);
const firebaseApiKey = 'AIzaSyDdJTg0SF66ksdSaJnrWH8dd0ei15M6yoA';
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
  const idToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!idToken) return json({ error: 'Sign in before uploading documents.' }, 401);
  const lookup = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  }).catch(() => null);
  if (!lookup || lookup.status >= 500) return json({ error: 'Sign-in verification is temporarily unavailable.' }, 503);
  const user = lookup.ok ? (await lookup.json()).users?.[0] : null;
  if (!user?.localId) return json({ error: 'Your session expired. Sign in again.' }, 401);
  const userOAuth = env.GST_GOOGLE_OAUTH_JSON;
  const serviceAccount = env.GST_GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!userOAuth && !serviceAccount) {
    return json({ error: 'Google Drive and Sheets are not configured on the upload server.' }, 503);
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
