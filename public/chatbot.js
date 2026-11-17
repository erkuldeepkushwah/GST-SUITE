/*!
 * Fingenuity AI — site chat widget.
 *
 * Talks to the Cloudflare Pages Function at /api/chat, which holds the
 * GEMINI_API_KEY as a runtime secret. No key ever reaches the browser.
 *
 *   POST /api/chat  { messages: [{ role: 'user' | 'model', text }] }
 *   200 -> { reply }   |   4xx/5xx -> { error }
 */
(function () {
  'use strict';
  if (window.__fgChatLoaded) return;
  window.__fgChatLoaded = true;

  var ENDPOINT = '/api/chat';
  var MAX_TURNS = 10;          // keep the last 10 messages, oldest dropped
  var MAX_CHARS = 1500;        // matches the per-message cap upstream
  var STORE = 'fg-chat-history';

  var history = [];            // { role, text }
  var busy = false;
  var opened = false;

  var CSS = ''
    + '.fgc-launcher{position:fixed;right:22px;bottom:22px;z-index:2147483000;display:flex;align-items:center;'
    + 'gap:10px;padding:13px 20px;border:0;border-radius:999px;background:#0159D3;color:#fff;cursor:pointer;'
    + 'font:700 13px/1 Manrope,"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;letter-spacing:.04em;'
    + 'box-shadow:0 14px 30px rgba(1,89,211,.35);transition:transform .2s,background .2s}'
    + '.fgc-launcher:hover{background:#00347D;transform:translateY(-2px)}'
    + '.fgc-launcher svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    + '.fgc-launcher[hidden]{display:none}'
    + '.fgc-panel{position:fixed;right:22px;bottom:22px;z-index:2147483001;width:min(380px,calc(100vw - 32px));'
    + 'height:min(560px,calc(100vh - 40px));display:none;flex-direction:column;background:#fff;border:1px solid #E3E7ED;'
    + 'border-radius:16px;overflow:hidden;box-shadow:0 30px 60px rgba(15,23,42,.22);'
    + 'font:400 14px/1.6 Manrope,"DM Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#2C3338}'
    + '.fgc-panel.fgc-open{display:flex}'
    + '.fgc-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:#0159D3;color:#fff}'
    + '.fgc-head strong{font-size:14px;font-weight:700;letter-spacing:.01em}'
    + '.fgc-head span{font-size:11.5px;opacity:.8}'
    + '.fgc-head .fgc-dot{width:8px;height:8px;border-radius:50%;background:#7CE0A3;flex:0 0 auto}'
    + '.fgc-x{margin-left:auto;width:30px;height:30px;border:0;border-radius:8px;background:rgba(255,255,255,.16);'
    + 'color:#fff;cursor:pointer;font-size:17px;line-height:1}'
    + '.fgc-x:hover{background:rgba(255,255,255,.28)}'
    + '.fgc-body{flex:1;overflow-y:auto;padding:16px;background:#F7F9FC;display:flex;flex-direction:column;gap:10px}'
    + '.fgc-msg{max-width:86%;padding:10px 13px;border-radius:12px;font-size:13.5px;line-height:1.55;'
    + 'white-space:pre-wrap;word-wrap:break-word}'
    + '.fgc-bot{align-self:flex-start;background:#fff;border:1px solid #E3E7ED;border-bottom-left-radius:4px}'
    + '.fgc-me{align-self:flex-end;background:#0159D3;color:#fff;border-bottom-right-radius:4px}'
    + '.fgc-err{align-self:center;background:#FEF2F2;border:1px solid #FECACA;color:#B42318;font-size:12.5px;'
    + 'text-align:center;max-width:100%}'
    + '.fgc-typing{align-self:flex-start;display:flex;gap:4px;padding:12px 14px;background:#fff;border:1px solid #E3E7ED;'
    + 'border-radius:12px;border-bottom-left-radius:4px}'
    + '.fgc-typing i{width:6px;height:6px;border-radius:50%;background:#9AA4B2;animation:fgc-b 1.2s infinite}'
    + '.fgc-typing i:nth-child(2){animation-delay:.15s}.fgc-typing i:nth-child(3){animation-delay:.3s}'
    + '@keyframes fgc-b{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}'
    + '.fgc-chips{display:flex;flex-wrap:wrap;gap:8px;padding:0 16px 12px;background:#F7F9FC}'
    + '.fgc-chip{border:1px solid #C7D9F5;background:#fff;color:#0159D3;border-radius:999px;padding:7px 12px;'
    + 'font:600 12px/1 inherit;cursor:pointer}'
    + '.fgc-chip:hover{background:#EAF1FC}'
    + '.fgc-form{display:flex;gap:8px;padding:12px;border-top:1px solid #E3E7ED;background:#fff}'
    + '.fgc-form input{flex:1;min-width:0;padding:11px 13px;border:1px solid #E3E7ED;border-radius:10px;'
    + 'font:inherit;font-size:13.5px;color:#2C3338;background:#fff}'
    + '.fgc-form input:focus{outline:2px solid #C7D9F5;outline-offset:1px}'
    + '.fgc-form button{width:44px;height:44px;flex:0 0 auto;border:0;border-radius:10px;background:#0159D3;color:#fff;'
    + 'cursor:pointer;display:grid;place-items:center}'
    + '.fgc-form button:disabled{opacity:.45;cursor:not-allowed}'
    + '.fgc-form button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}'
    + '.fgc-foot{padding:0 12px 10px;font-size:10.5px;color:#909090;text-align:center;background:#fff}'
    + '@media (max-width:480px){.fgc-launcher{right:14px;bottom:14px;padding:12px 16px}'
    + '.fgc-panel{right:8px;bottom:8px;width:calc(100vw - 16px);height:calc(100vh - 24px)}}';

  var BUBBLE = '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-4.6A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z"/></svg>';
  var SEND = '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function mount() {
    var style = el('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var launcher = el('button', 'fgc-launcher', BUBBLE + '<span>Ask us</span>');
    launcher.type = 'button';
    launcher.setAttribute('aria-label', 'Open the Fingenuity AI assistant');

    var panel = el('section', 'fgc-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', 'Fingenuity AI assistant');
    panel.innerHTML =
      '<div class="fgc-head"><span class="fgc-dot" aria-hidden="true"></span>'
      + '<div><strong>Fingenuity AI</strong></div>'
      + '<button class="fgc-x" type="button" aria-label="Close the assistant">&times;</button></div>'
      + '<div class="fgc-body" id="fgc-body"></div>'
      + '<div class="fgc-chips" id="fgc-chips"></div>'
      + '<form class="fgc-form"><input id="fgc-input" type="text" autocomplete="off" maxlength="1500" '
      + 'placeholder="Ask about the modules, files or a demo" aria-label="Your message">'
      + '<button type="submit" aria-label="Send">' + SEND + '</button></form>'
      + '<div class="fgc-foot">General guidance, not tax advice. Do not paste client data.</div>';

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    var body = panel.querySelector('#fgc-body');
    var chips = panel.querySelector('#fgc-chips');
    var form = panel.querySelector('form');
    var input = panel.querySelector('#fgc-input');
    var sendBtn = form.querySelector('button');

    function scrollDown() { body.scrollTop = body.scrollHeight; }

    function addMsg(role, text) {
      var cls = role === 'user' ? 'fgc-msg fgc-me' : 'fgc-msg fgc-bot';
      body.appendChild(el('div', cls, null)).textContent = text;
      scrollDown();
    }

    function addErr(text) {
      body.appendChild(el('div', 'fgc-msg fgc-err', null)).textContent = text;
      scrollDown();
    }

    function typing(on) {
      var t = body.querySelector('.fgc-typing');
      if (on && !t) {
        body.appendChild(el('div', 'fgc-typing', '<i></i><i></i><i></i>'));
        scrollDown();
      } else if (!on && t) {
        t.remove();
      }
    }

    function chipsFor(list) {
      chips.innerHTML = '';
      (list || []).forEach(function (label) {
        var b = el('button', 'fgc-chip', null);
        b.type = 'button';
        b.textContent = label;
        b.addEventListener('click', function () { send(label); });
        chips.appendChild(b);
      });
    }

    var START_CHIPS = [
      'Which modules are there?',
      'Which files do I upload?',
      'How do I book a demo?',
      'Is my data uploaded?'
    ];

    function greet() {
      if (body.childElementCount) return;
      addMsg('model', 'Namaste! I can explain the six modules, the files each one needs, or set up a demo. What would you like to know?');
      chipsFor(START_CHIPS);
    }

    function remember() {
      try { sessionStorage.setItem(STORE, JSON.stringify(history.slice(-MAX_TURNS))); } catch (e) {}
    }

    function restore() {
      try {
        var raw = sessionStorage.getItem(STORE);
        if (!raw) return;
        var saved = JSON.parse(raw);
        if (!Array.isArray(saved)) return;
        saved.forEach(function (m) {
          if (m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string') {
            history.push({ role: m.role, text: m.text });
            addMsg(m.role, m.text);
          }
        });
        if (history.length) chipsFor([]);
      } catch (e) {}
    }

    function send(text) {
      var msg = (text || '').trim();
      if (!msg || busy) return;

      busy = true;
      sendBtn.disabled = true;
      chipsFor([]);
      addMsg('user', msg);
      history.push({ role: 'user', text: msg.slice(0, MAX_CHARS) });
      while (history.length > MAX_TURNS) history.shift();
      remember();
      typing(true);

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history })
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function (out) {
          typing(false);
          if (out.ok && out.data && out.data.reply) {
            addMsg('model', out.data.reply);
            history.push({ role: 'model', text: out.data.reply });
            while (history.length > MAX_TURNS) history.shift();
            remember();
          } else {
            var why = (out.data && out.data.error) || 'The assistant is unavailable right now.';
            addErr(why + ' You can also WhatsApp +91 99814 25096 or use the contact page.');
            chipsFor(['How do I book a demo?']);
          }
        })
        .catch(function () {
          typing(false);
          addErr('Could not reach the assistant. Check your connection and try again.');
        })
        .then(function () {
          busy = false;
          sendBtn.disabled = false;
          input.focus();
        });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = '';
      send(v);
    });

    function open() {
      opened = true;
      panel.classList.add('fgc-open');
      launcher.hidden = true;
      restore();
      greet();
      scrollDown();
      setTimeout(function () { input.focus(); }, 60);
    }

    function close() {
      opened = false;
      panel.classList.remove('fgc-open');
      launcher.hidden = false;
    }

    launcher.addEventListener('click', open);
    panel.querySelector('.fgc-x').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && opened) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
