import {emailConfigured, sendPortalEmail} from '../lib/portal-email.js';
// Cloudflare Pages Function: send a welcome email for a newly created Firebase account.
// Secrets must be configured in Cloudflare, never in browser code.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
});
export async function onRequestPost({ request, env }) {
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==new URL(request.url).origin)return json({error:'Invalid origin'},403);
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return json({ error: 'Authentication required' }, 401);
  if (!env.GST_AUTH_DB || !emailConfigured(env) || !env.FIREBASE_WEB_API_KEY) {
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
    const profile=await env.GST_AUTH_DB.prepare('SELECT account_type,name,business_name,firm_name,mobile,gstin FROM customer_profiles WHERE uid=?').bind(user.localId).first();
    if(!profile||!['business','professional'].includes(profile.account_type))return json({error:'Complete your registration profile first'},409);
    const clean=(v,max=150)=>String(v||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
    const business=profile.account_type==='business';
    const username=clean(profile.name,100)||clean(user.displayName,100)||'Customer';
    const name=(business?clean(profile.business_name):clean(profile.firm_name))||username;
    const type=business?'Business':'Firm';
    const subject='Welcome to Fingenuity Associates | '+type+' Account';
    const loginId=user.email;
    const loginUrl='https://gst-suite.pages.dev/login.html';
    const loginHint='Sign in using your registered email and the password you created during registration. Complete email verification or OTP if prompted.';
    const features=business?['Book GST, Income Tax, TDS and compliance services.','Upload documents and track filing status.','View billing records and support tickets.']:['Manage assigned clients and companies.','Access My Tools and reconciliation modules.','Book services, upload documents and track client filings.'];
    const fields=[ [business?'Business Name':'Firm Name',clean(business?profile.business_name:profile.firm_name)|| (business?name:'Not provided')],['User Name',username],['Email',loginId],['Mobile No.',clean(profile.mobile,20)||'Not provided'],...(business?[['GSTIN No.',clean(profile.gstin,15)||'Not provided']]:[]) ];
    const text=['Dear '+name+',','','Welcome to Fingenuity Associates! Your '+type.toLowerCase()+' account has been created successfully.','','Your '+type+' Account Details',...fields.map(([label,value])=>label+': '+value),'','Your portal includes:',...features.map(x=>'- '+x),'',loginHint,'','Login: '+loginUrl,'','Need assistance? gstpractitioner.rakesh@gmail.com','','Regards,','Team Fingenuity Associates'].join('\n');
    const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

    const html='<div style="background:#f4f7fb;padding:24px 12px;font-family:Arial,sans-serif;color:#17243b;line-height:1.6"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><div style="background:#0b1736;color:white;padding:24px 28px"><img src="https://raw.githubusercontent.com/erkuldeepkushwah/GST-SUITE/main/public/logo.png" alt="Fingenuity Associates logo" width="180" style="display:block;width:180px;max-width:100%;height:auto;background:#fff;padding:8px;border-radius:6px;margin-bottom:8px"><div style="font-size:14px;font-weight:bold;color:#ffffff;margin-bottom:12px">Fingenuity Associates</div><div style="font-size:21px;font-weight:bold">Welcome to Fingenuity Associates</div><div style="font-size:13px;color:#cbd5e1">'+type+' Account Onboarding</div></div><div style="padding:28px"><p>Dear <strong>'+escape(name)+'</strong>,</p><p>Your '+type.toLowerCase()+' account has been created successfully. Welcome to our GST &amp; Tax Services portal.</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:13px;background:#f8fafc">'+fields.map(([k,v])=>'<tr><td style="padding:10px;border-bottom:1px solid #e2e8f0;color:#475569">'+escape(k)+'</td><td style="padding:10px;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere"><strong>'+escape(v)+'</strong></td></tr>').join('')+'</table><p><strong>Get started</strong></p><ul>'+features.map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul><p>'+escape(loginHint)+'</p><p style="margin:24px 0"><a href="'+loginUrl+'" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;border-radius:7px;text-decoration:none;font-weight:bold">Login to Your Dashboard</a></p><p>Regards,<br><strong>Team Fingenuity Associates</strong></p></div><div style="background:#f8fafc;padding:16px 28px;font-size:12px;color:#475569">Support: <a href="mailto:gstpractitioner.rakesh@gmail.com">gstpractitioner.rakesh@gmail.com</a><br>Indore, Madhya Pradesh, India</div></div></div>';
    const delivery=await sendPortalEmail(env,{to:user.email,subject,text,html,id:'welcome-'+user.localId+'-'+created});
    if(!delivery.ok){
      console.warn('Welcome email rejected',{code:delivery.code});
      return json({error:delivery.code==='SENDER_DOMAIN_UNVERIFIED'?'Welcome email requires a verified sending domain.':'Welcome email could not be sent.',code:delivery.code},502);
    }
    return json({accepted:true});
  } catch {
    return json({ error: 'Email service temporarily unavailable' }, 502);
  }
}
