// Deploy as Web App, execute as owner. Set GST_APPS_SCRIPT_SECRET in Script Properties.
// Only HMAC-authenticated requests from the GST-SUITE backend may send mail.
function doPost(e) {
  const result=(data)=>ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  const reject=(code)=>result({ok:false,code:code});
  const hex=(bytes)=>bytes.map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
  const equal=(a,b)=>{if(typeof a!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<b.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
  let lock=null;
  try{
    const raw=e&&e.postData&&e.postData.contents;
    if(typeof raw!=='string'||raw.length>100000)return reject('INVALID');
    const envelope=JSON.parse(raw);
    const props=PropertiesService.getScriptProperties();
    const secret=props.getProperty('GST_APPS_SCRIPT_SECRET')||'';
    if(!/^[a-f0-9]{64}$/i.test(secret)||!Number.isSafeInteger(envelope.timestamp)||Math.abs(Date.now()-envelope.timestamp)>120000||typeof envelope.payload!=='string'||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature))return reject('UNAUTHORIZED');
    const expected=hex(Utilities.computeHmacSha256Signature(envelope.timestamp+'.'+envelope.payload,secret,Utilities.Charset.UTF_8));
    if(!equal(envelope.signature,expected))return reject('UNAUTHORIZED');
    const p=JSON.parse(envelope.payload);
    if(typeof p.id!=='string'||!/^(welcome-|gst-otp-)[A-Za-z0-9_-]{1,180}$/.test(p.id)||typeof p.to!=='string'||p.to.length>254||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(p.to)||typeof p.subject!=='string'||p.subject.length>150||/[\r\n]/.test(p.subject)||typeof p.text!=='string'||typeof p.html!=='string'||p.text.length>15000||p.html.length>60000)return reject('INVALID');
    const permitted=p.id.startsWith('gst-otp-')?p.subject==='OTP Verification':/^Welcome to Fingenuity Associates \| (Business|Firm) Account$/.test(p.subject);
    if(!permitted)return reject('INVALID');
    // Store only hashes and timestamps, never recipients, messages, or OTPs.
    const key='gst_mail_'+hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,p.id,Utilities.Charset.UTF_8));
    const contentHash=hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,envelope.payload,Utilities.Charset.UTF_8));
    lock=LockService.getScriptLock();
    if(!lock.tryLock(5000))return reject('BUSY');
    const now=Date.now();
    const all=props.getProperties();
    Object.keys(all).filter(k=>k.startsWith('gst_mail_')).forEach(k=>{if(Number(all[k].split(':')[0])<now-86400000)props.deleteProperty(k);});
    const previous=props.getProperty(key);
    if(previous){
      const parts=previous.split(':');
      return parts[1]==='sent'&&parts[2]===contentHash?result({ok:true,id:p.id}):reject('DUPLICATE');
    }
    if(MailApp.getRemainingDailyQuota()<1)return reject('QUOTA');
    // Record before sending. An ambiguous failure may require manual investigation;
    // never automatically send the same signed request twice.
    props.setProperty(key,now+':pending:'+contentHash);
    MailApp.sendEmail({to:p.to,subject:p.subject,body:p.text,htmlBody:p.html,name:'Fingenuity Associates'});
    props.setProperty(key,now+':sent:'+contentHash);
    return result({ok:true,id:p.id});
  }catch(err){return reject('SEND_FAILED');}
  finally{if(lock&&lock.hasLock())lock.releaseLock();}
}

// Optional manual diagnostic: select checkSetup in the Apps Script editor and click Run.
// Logs contain only configuration status and remaining quota, never the secret or OTP.
function checkSetup(){
 const secret=PropertiesService.getScriptProperties().getProperty('GST_APPS_SCRIPT_SECRET')||'';
 const details={scriptSecretConfigured:/^[a-f0-9]{64}$/i.test(secret),remainingMailRecipients:MailApp.getRemainingDailyQuota()};
 console.log(JSON.stringify(details));
 return details;
}
