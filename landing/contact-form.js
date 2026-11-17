/*!
 * Contact form — posts to FormSubmit and reports back in the page.
 *
 * The form already carries action="https://formsubmit.co/<address>". Without
 * JavaScript that still works: the browser posts and FormSubmit shows its own
 * confirmation. With JavaScript we send the same fields as JSON to FormSubmit's
 * ajax endpoint, stay on the page and show the result inline.
 */
(function () {
  'use strict';

  var form = document.getElementById('demo-contact-form');
  if (!form) return;

  var action = form.getAttribute('action') || '';
  var match = action.match(/formsubmit\.co\/(?:ajax\/)?([^/?#]+)/i);
  if (!match) return;
  var AJAX = 'https://formsubmit.co/ajax/' + match[1];

  // where the plain (no-JS) submit lands - added in the markup too, so keep one
  if (!form.querySelector('input[name="_next"]')) {
    var hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = '_next';
    hidden.value = 'https://gst-suite.pages.dev/thanks.html';
    form.appendChild(hidden);
  }

  if (!form.querySelector('input[name="_captcha"]')) {
    var cap = document.createElement('input');
    cap.type = 'hidden';
    cap.name = '_captcha';
    cap.value = 'false';
    form.appendChild(cap);
  }

  var status = document.createElement('div');
  status.className = 'fg-form-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'display:none;margin:14px 0 0;padding:12px 14px;border-radius:10px;' +
    'font-size:14px;line-height:1.5;border:1px solid transparent';
  form.appendChild(status);

  var button = form.querySelector('button[type="submit"], input[type="submit"]');
  var label = button ? (button.tagName === 'INPUT' ? button.value : button.innerHTML) : '';

  function show(kind, text) {
    var skin = {
      ok: ['#ECFDF3', '#ABEFC6', '#067647'],
      err: ['#FEF3F2', '#FECDCA', '#B42318'],
      wait: ['#EFF8FF', '#B2DDFF', '#175CD3']
    }[kind] || ['#F8FAFC', '#E2E8F0', '#334155'];
    status.style.display = 'block';
    status.style.background = skin[0];
    status.style.borderColor = skin[1];
    status.style.color = skin[2];
    status.textContent = text;
  }

  function hide() { status.style.display = 'none'; }

  function busy(on) {
    if (!button) return;
    button.disabled = on;
    if (on) {
      if (button.tagName === 'INPUT') button.value = 'Sending…';
      else button.innerHTML = 'Sending…';
    } else {
      if (button.tagName === 'INPUT') button.value = label;
      else button.innerHTML = label;
    }
  }

  function collect() {
    var out = {};
    var fields = form.querySelectorAll('input[name], textarea[name], select[name]');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.type === 'hidden' || f.name === '_honey') continue;
      var v = (f.value || '').trim();
      if (v) out[f.name] = v;
    }
    out._subject = 'New GST-SUITE enquiry from the website';
    out._template = 'table';
    return out;
  }

  form.addEventListener('submit', function (e) {
    // let the browser handle it if fetch is unavailable
    if (typeof fetch !== 'function') return;
    e.preventDefault();
    hide();

    var data = collect();
    if (!data.name || !data.email || !data.message) {
      show('err', 'Please add your name, email and a line about what you need.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
      show('err', 'That email address does not look right.');
      return;
    }

    busy(true);
    show('wait', 'Sending…');

    fetch(AJAX, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) { return res.json().catch(function () { return {}; }); })
      .then(function (body) {
        var ok = body && (body.success === 'true' || body.success === true);
        if (ok) {
          form.reset();
          show('ok', 'Thank you — we have your enquiry and reply within one working day. '
            + 'If it is urgent, call +91 731 000 0000.');
          return;
        }
        var msg = (body && (body.message || body.error)) || '';
        if (/activat|confirm/i.test(msg)) {
          show('err', 'The form is not confirmed yet. Please write to '
            + match[1] + ' directly — we are finishing the setup.');
          return;
        }
        show('err', 'Could not send just now. Please email ' + match[1]
          + ' or call +91 731 000 0000.');
      })
      .catch(function () {
        show('err', 'Network problem. Please email ' + match[1] + ' or call +91 731 000 0000.');
      })
      .then(function () { busy(false); });
  });
})();
