# Google Apps Script email delivery (optional)
This changes the mail transport only. Firebase, login/signup, role checks, OTP generation, expiry, attempts and session-cookie verification are unchanged. The existing Resend provider remains the default until explicitly enabled. **Keep RESEND_API_KEY unchanged** even after switching providers: it is also the existing OTP/session HMAC key. Do not expose it.

1. Sign into the Gmail account that should send the mail. Open https://script.google.com/home/projects/create and paste the contents of `Code.gs`.
2. Generate a random 32-byte secret locally, e.g. `openssl rand -hex 32`. In Apps Script > Project Settings > Script properties add `GST_APPS_SCRIPT_SECRET` with that value. Never commit the secret or share it in chat.
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone (not only signed-in users). Authorize MailApp. The URL is public but every send requires a valid HMAC, short timestamp and replay protection. If your organization prohibits anonymous web apps, do not enable this provider.
4. Copy the deployment URL ending in /exec. In Cloudflare Pages GST-SUITE > Settings > Variables and Secrets (Production), set `GST_APPS_SCRIPT_URL` and the same `GST_APPS_SCRIPT_SECRET` (encrypted secret); set `GST_EMAIL_PROVIDER=apps-script` only when ready. Retain existing Firebase, D1, OTP and Resend bindings. Redeploy the Pages project with these settings.
5. Test a new Business and Firm signup with a controlled email address; check welcome email and OTP only for accounts whose existing OTP policy requires it. Test wrong/expired OTP, retry limit, logout, and unauthorized endpoints. Google Apps Script MailApp accepts a send but does not confirm inbox delivery. Check Apps Script executions and the inbox/spam folder, never log OTP or message body.
6. Limit: consumer Gmail Apps Script generally allows 100 email recipients/day; Google Workspace generally 1,500, subject to quotas. Welcome messages and OTP share this quota. Quota or transport failures return errors and do not bypass OTP. A failed/ambiguous message is not automatically retried by the transport. A new OTP request remains subject to the existing limits.
7. Rollback by setting `GST_EMAIL_PROVIDER=resend` or removing that selector and redeploying; the original Resend sender must still be valid. No automatic cross-provider fallback is used.

Previously missed welcome emails are not backfilled: existing welcome route only accepts newly created Firebase users within ten minutes. Use an authorized manual resend process after verifying accounts, not an anonymous mail endpoint.

## Troubleshooting "OTP email could not be sent"
The login and OTP verification rules are unchanged. The Cloudflare backend now returns a safe `code` alongside the generic error, and logs only transport stage/code/HTTP status (never email, OTP, signed payload or credentials). Run a new OTP attempt and check the response's `code` using browser DevTools > Network > `/api/otp` > Response, or Cloudflare real-time logs.

| Code | Meaning / next step |
| --- | --- |
| `EMAIL_CONFIGURATION` | Secret/URL/provider missing or invalid in Cloudflare Production |
| `SCRIPT_AUTH_FAILED` | Different secret in Script Properties and Cloudflare; confirm both exactly match; regenerate if shared |
| `SCRIPT_ACCESS_OR_REDIRECT` / `SCRIPT_ACCESS_DENIED` | Redeploy as Web app, Execute as Me, access Anyone; authorize permissions; copy the current /exec URL |
| `SCRIPT_INVALID_RESPONSE` | Wrong deployment URL, stale deployment code, or Google access/error HTML response |
| `SCRIPT_SEND_FAILED` | Google MailApp error. Check Apps Script Executions and owner authorization/quota; run `checkSetup` in editor |
| `EMAIL_RATE_LIMIT` | Gmail daily recipient quota exhausted |
| `EMAIL_TIMEOUT` | Script did not respond within 20 seconds; inspect Executions and account access |
| `SCRIPT_INVALID_REQUEST` / `SCRIPT_REJECTED` | Recheck deployed Code.gs against repository and redeploy a new version |

After changing Code.gs, use Deploy > Manage deployments > Edit > Version: New version > Deploy. Do not paste keys into GitHub or client-side JS. Do not disable existing OTP checks to make sending appear successful.
