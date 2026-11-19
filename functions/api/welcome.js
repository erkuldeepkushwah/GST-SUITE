// Cloudflare Pages Function: send a welcome email for a newly created Firebase account.
// Secrets must be configured in Cloudflare, never in browser code.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
export async function onRequestPost({ request, env }) {
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: 'Authentication required' }, 401);
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL || !env.FIREBASE_WEB_API_KEY) {
    return json({ error: 'Email service not configured' }, 503);
  }
  try {
    // Firebase supplies the recipient and UID; never accept a recipient or password from the client.
    const lookup = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(env.FIREBASE_WEB_API_KEY), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token })
    });
    if (!lookup.ok) return json({ error: 'Invalid session' }, 401);
    const user = (await lookup.json()).users?.[0];
    if (!user?.localId || !user.email || user.disabled) return json({ error: 'Invalid account' }, 403);
    const created = Number(user.createdAt);
    const age = Date.now() - created;
    if (!Number.isFinite(created) || age < -60000 || age > 10 * 60 * 1000) {
      return json({ error: 'Welcome email is available only immediately after signup' }, 403);
    }
    const name = String(user.displayName || 'Customer').slice(0, 100);
    const text = [
      'Dear ' + name + ',', '', 'Welcome to Fingenuity Associates!',
      'Your GST & Tax Services account has been created.', '',
      'Customer ID: ' + user.localId, 'Registered email: ' + user.email,
      '', 'Login: https://gst-suite.pages.dev/login.html',
      'Use the password you chose during registration. If needed, use Forgot Password on the login page.',
      '', 'Team Fingenuity Associates'
    ].join('\n');
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'welcome-' + user.localId + '-' + created
      },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [user.email], subject: 'Welcome to Fingenuity Associates', text })
    });
    if (!sent.ok) return json({ error: 'Welcome email could not be sent' }, 502);
    return json({ accepted: true });
  } catch {
    return json({ error: 'Email service temporarily unavailable' }, 502);
  }
}
