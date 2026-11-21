// Effective login OTP policy shared by every authenticated API.
// Global mandatory mode overrides legacy per-user OTP opt-outs.
export function otpIsRequired(env, email, policyOtp) {
  if (env.GST_OTP_MODE === 'required') return true;
  if (policyOtp != null) return policyOtp === 1 || policyOtp === true;
  return env.GST_OTP_MODE === 'test' &&
    String(email || '').toLowerCase() === String(env.GST_OTP_TEST_EMAIL || '').toLowerCase();
}
