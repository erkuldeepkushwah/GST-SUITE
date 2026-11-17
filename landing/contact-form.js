/*!
 * Contact form — same approach as the steves repo: build the message and hand
 * it to the visitor's mail app addressed to the practice's Gmail.
 *
 * No backend, no third-party form service, nothing to activate. If the browser
 * has no mail handler the visitor gets the address and the message to copy.
 */
(function () {
  'use strict';

  var form = document.getElementById('demo-contact-form');
  if (!form) return;

  var action = form.getAttribute('action') || '';
  var m = action.match(/formsubmit\.co\/([^/?#]+)/i);
  var TO = m ? m[1] : 'gstpractitioner.rakesh@gmail.com';

  var status = document.createElement('div');
  status.className = 'fg-form-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'display:none;margin:14px 0 0;padding:12px 14px;border-radius:10px;' +
    'font-size:14px;line-height:1.55;border:1px solid transparent';
  form.appendChild(status);

  function show(kind, html) {
    var skin = {
      ok: ['#ECFDF3', '#ABEFC6', '#067647'],
      err: ['#FEF3F2', '#FECDCA', '#B42318']
    }[kind] || ['#F8FAFC', '#E2E8F0', '#334155'];
    status.style.display = 'block';
    status.style.background = skin[0];
    status.style.borderColor = skin[1];
    status.style.color = skin[2];
    status.innerHTML = html;
  }

  function val(name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? (el.value || '').trim() : '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = val('name');
    var email = val('email');
    var module = val('module');
    var timeline = val('timeline');
    var message = val('message');

    if (!name || !email || !message) {
      show('err', 'Please add your name, email and a line about what you need.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      show('err', 'That email address does not look right.');
      return;
    }

    var subject = 'GST-SUITE enquiry' + (module ? ' — ' + module : '') + ' (' + name + ')';

    var body = [
      'Hello Fingenuity Associates,',
      '',
      module ? 'I am interested in: ' + module : 'I would like to know more about GST-SUITE.',
      '',
      'Here are my details:',
      '',
      'Name: ' + name,
      'Email: ' + email,
      module ? 'Module: ' + module : null,
      timeline ? 'Timeline: ' + timeline : null,
      '',
      'Message / what I reconcile:',
      message,
      '',
      'Looking forward to your response.',
      '',
      'Best regards,',
      name
    ].filter(function (line) { return line !== null; }).join('\r\n');

    var mailto = 'mailto:' + TO +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);

    // hand it to the mail app
    window.location.href = mailto;

    show('ok',
      'Your mail app should open with the message ready to send to <strong>' + TO + '</strong>. ' +
      'Press send there and we reply within one working day. ' +
      'If nothing opened, <a href="' + mailto + '">tap here</a> or write to ' +
      '<a href="mailto:' + TO + '">' + TO + '</a> · ' +
      '<a href="https://wa.me/919981425096" target="_blank" rel="noopener">WhatsApp us</a>.');
  });
})();
