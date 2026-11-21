// Effective login OTP policy shared by every authenticated API.
// Global mandatory mode overrides legacy per-user OTP opt-outs.
// Exempt only the exact administrator identity verified by Firebase, not an email alone.
export function otpIsRequired(env, email, policyOtp, uid) {
  if (uid === '7arK2z41nhTMyjwasmXKCWR0uw93' &&
      String(email || '').toLowerCase() === 'kuldeep@gmail.com') return false;
  if (env.GST_OTP_MODE === 'required') return true;
  if (policyOtp != null) return policyOtp === 1 || policyOtp === true;
  return env.GST_OTP_MODE === 'test' &&
    String(email || '').toLowerCase() === String(env.GST_OTP_TEST_EMAIL || '').toLowerCase();
}
