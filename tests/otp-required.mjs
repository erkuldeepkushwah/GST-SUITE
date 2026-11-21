import assert from 'node:assert/strict';
import {otpIsRequired} from '../functions/lib/otp-policy.js';
const global={GST_OTP_MODE:'required'};
for(const email of ['admin@example.test','firm@example.test','client@example.test']){
 assert.equal(otpIsRequired(global,email,undefined),true);
 assert.equal(otpIsRequired(global,email,null),true);
 assert.equal(otpIsRequired(global,email,0),true,'Global mandatory OTP overrides previously disabled accounts');
 assert.equal(otpIsRequired(global,email,1),true);
}
assert.equal(otpIsRequired({GST_OTP_MODE:'test',GST_OTP_TEST_EMAIL:'TEST@example.test'},'test@example.test',null),true);
assert.equal(otpIsRequired({GST_OTP_MODE:'test',GST_OTP_TEST_EMAIL:'test@example.test'},'other@example.test',null),false);
assert.equal(otpIsRequired({},'any@example.test',0),false);
assert.equal(otpIsRequired({},'any@example.test',1),true);
console.log('OTP global required, legacy opt-out, admin/firm/client cases passed');
