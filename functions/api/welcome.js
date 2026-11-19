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
    const mobile = env.GST_AUTH_DB ? await env.GST_AUTH_DB.prepare('SELECT mobile FROM mobile_accounts WHERE uid=?').bind(user.localId).first().catch(()=>null) : null;
    const otpRequired = env.GST_OTP_MODE === 'required' || (env.GST_OTP_MODE === 'test' && user.email.toLowerCase() === String(env.GST_OTP_TEST_EMAIL || '').toLowerCase());
    const loginId = mobile?.mobile || user.email;
    const loginHint = 'Login using your ' + (mobile?.mobile ? 'registered mobile number' : 'registered email address') + ' and password' + (otpRequired ? ', then verify the OTP sent to your registered email.' : '.');
    const loginUrl = 'https://gst-suite.pages.dev/login';
    const text = [
      'Dear ' + name + ',', '',
      'Welcome to Fingenuity Associates! Your GST & Tax Services account is now active.', '',
      'Registered Email: ' + user.email,
      'Login ID: ' + loginId,
      'Password: Your registration password', '',
      loginHint, '', 'Login Here: ' + loginUrl, '',
      'Regards,', 'Team Fingenuity Associates'
    ].join('\n');
    const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    const html = '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#17243b;max-width:600px;margin:auto;padding:24px"><p>Dear '+escape(name)+',</p><p>Welcome to <strong>Fingenuity Associates!</strong> Your GST &amp; Tax Services account is now active.</p><ul><li><strong>Registered Email:</strong> '+escape(user.email)+'</li><li><strong>Login ID:</strong> '+escape(loginId)+'</li><li><strong>Password:</strong> Your registration password</li></ul><p>'+escape(loginHint)+'</p><p><strong>Login Here:</strong> <a href="'+loginUrl+'" style="color:#0159d3">'+loginUrl+'</a></p><p>Regards,<br><strong>Team Fingenuity Associates</strong></p></div>';
    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'welcome-' + user.localId + '-' + created
      },
      body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [user.email], subject: 'Welcome to Fingenuity Associates – Account Successfully Created', text, html })
    });
    if (!sent.ok) return json({ error: 'Welcome email could not be sent' }, 502);
    return json({ accepted: true });
  } catch {
    return json({ error: 'Email service temporarily unavailable' }, 502);
  }
}
