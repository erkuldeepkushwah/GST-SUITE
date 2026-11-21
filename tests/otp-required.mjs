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
const adminUid='7arK2z41nhTMyjwasmXKCWR0uw93';
assert.equal(otpIsRequired(global,'kuldeep@gmail.com',undefined,adminUid),false,'Verified admin skips OTP');
assert.equal(otpIsRequired(global,'KULDEEP@GMAIL.COM',1,adminUid),false,'Admin exception overrides prior opt-in');
assert.equal(otpIsRequired(global,'kuldeep@gmail.com',0,'fake-admin-uid'),true,'Matching email alone cannot bypass OTP');
assert.equal(otpIsRequired(global,'other@example.test',0,adminUid),true,'Matching UID alone cannot bypass OTP');
assert.equal(otpIsRequired(global,'kuldeep@gmail.com',null),true,'Unverified/unknown UID cannot bypass OTP');
assert.equal(otpIsRequired(global,'client@example.test',0,'client-uid'),true,'Client legacy opt-out stays overridden');
assert.equal(otpIsRequired(global,'firm@example.test',0,'firm-uid'),true,'Firm legacy opt-out stays overridden');
console.log('OTP required for client/firm; verified administrator exempt; identity spoof cases passed');
