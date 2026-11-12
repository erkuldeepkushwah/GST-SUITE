/* ============================================================
   Fingenuity Associates — shared behaviour
   1. Mobile drawer
   2. Search modal
   3. Module screenshot lightbox
   4. Enquiry + subscribe forms
   ============================================================ */

(function () {
  "use strict";

  /* ---------- 1. mobile drawer ---------- */
  var toggle = document.querySelector(".nav-toggle");

  function closeDrawer() { document.body.classList.remove("menu-open"); }

  if (toggle) {
    toggle.addEventListener("click", function () {
      document.body.classList.toggle("menu-open");
    });
    document.querySelectorAll("[data-close]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.preventDefault();
        closeDrawer();
      });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Esc") closeDrawer();
    });
    window.addEventListener("resize", function () {
      if (window.innerWidth > 980) closeDrawer();
    });
  }

  /* ---------- 2. search ---------- */
  (function () {
    var trigger = document.querySelector(".search-btn");
    if (!trigger) return;

    var ICON = {
      page: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      layers: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
      book: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
      help: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };
    var ARROW = '<svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>';

    var INDEX = [
      { label: "Pages", icon: "page", items: [
        { title: "Home", meta: "Reconciliation suite overview", href: "index.html" },
        { title: "About", meta: "The practice behind the suite", href: "about.html" },
        { title: "Solutions & Modules", meta: "Six modules, module gallery", href: "solutions.html" },
        { title: "Blog", meta: "Notes from the reconciliation desk", href: "blog.html" },
        { title: "Contact", meta: "Book a demo, office address and hours", href: "contact.html" }
      ]},
      { label: "Modules", icon: "layers", items: [
        { title: "GST 2A / 2B reconciliation", meta: "Purchase register against the portal", href: "solutions.html#gst-2a-2b" },
        { title: "GSTR-1 & GSTR-3B reconciliation", meta: "Reported outward supplies against 3B", href: "solutions.html#gstr-1-3b" },
        { title: "GST-Reconciliation", meta: "Any portal file against any books file", href: "solutions.html#gst-reconciliation" },
        { title: "Bank reconciliation", meta: "Statement against cash book", href: "solutions.html#bank" },
        { title: "TDS reconciliation", meta: "Books against 26AS and Form 16A", href: "solutions.html#tds" },
        { title: "Stock reconciliation", meta: "Stock register against the books", href: "solutions.html#stock" }
      ]},
      { label: "Articles", icon: "book", items: [
        { title: "Why the same invoice shows up twice in 2B", meta: "GST 2B · 12 October 2026", href: "blog.html" },
        { title: "Three reasons your 3B does not agree with 1", meta: "GSTR-1 vs 3B · 28 September 2026", href: "blog.html" },
        { title: "Clearing open items without a spreadsheet marathon", meta: "Bank reco · 14 September 2026", href: "blog.html" },
        { title: "Client files that never leave your machine", meta: "Practice · 2 September 2026", href: "blog.html" }
      ]},
      { label: "Help", icon: "help", items: [
        { title: "Does our client data leave our computer?", meta: "Privacy and the in-browser engine", href: "contact.html#privacy" },
        { title: "Can we set a custom matching tolerance?", meta: "₹0 to ₹10, most practices use ₹1", href: "solutions.html" },
        { title: "What format reports are generated?", meta: "Two-sheet Excel: summary and exceptions", href: "solutions.html" }
      ]}
    ];
    var SUGGEST = ["GST 2B", "Bank reco", "TDS 26AS", "Tolerance", "Excel report"];

    var overlay = document.createElement("div");
    overlay.className = "search-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Search this site");
    overlay.innerHTML =
      '<div class="search-panel">' +
        '<div class="search-bar">' +
          '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>' +
          '<input type="text" id="search-input" placeholder="Search modules, articles, pages, help…" autocomplete="off">' +
          '<button class="search-clear" type="button" hidden>Clear</button>' +
          '<button class="search-close" type="button" aria-label="Close search">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="search-body"></div>' +
        '<div class="search-foot"><span>Search Fingenuity Associates</span><span>Press ESC or click outside to close</span></div>' +
      '</div>';
    document.body.appendChild(overlay);

    var input = overlay.querySelector("#search-input");
    var body = overlay.querySelector(".search-body");
    var clearBtn = overlay.querySelector(".search-clear");
    var lastFocus = null;

    function esc(s) {
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function render() {
      var term = input.value.trim().toLowerCase();
      clearBtn.hidden = !term;

      if (!term) {
        body.innerHTML =
          '<div class="search-empty">' +
            '<span class="search-label">Suggested searches</span>' +
            '<div class="search-chips">' +
              SUGGEST.map(function (s) {
                return '<button class="schip" type="button" data-q="' + esc(s) + '">' + esc(s) + "</button>";
              }).join("") +
            "</div>" +
          "</div>";
        return;
      }

      var html = "", total = 0;
      INDEX.forEach(function (group) {
        var hits = group.items.filter(function (it) {
          return (it.title + " " + it.meta).toLowerCase().indexOf(term) > -1;
        });
        if (!hits.length) return;
        total += hits.length;
        html +=
          '<div class="sgroup">' +
            '<div class="sgroup-head">' + ICON[group.icon] +
              "<span>" + group.label + " (" + hits.length + ")</span></div>" +
            hits.map(function (it) {
              return '<button class="shit" type="button" data-href="' + esc(it.href) + '">' +
                "<span><span class=\"shit-title\">" + esc(it.title) + "</span>" +
                '<span class="shit-meta">' + esc(it.meta) + "</span></span>" + ARROW + "</button>";
            }).join("") +
          "</div>";
      });

      body.innerHTML = total
        ? html
        : '<div class="snoresults">No results for “' + esc(input.value.trim()) + '”. Try “GST”, “bank” or “tolerance”.</div>';
    }

    function open() {
      lastFocus = document.activeElement;
      overlay.classList.add("open");
      document.body.classList.add("locked");
      input.value = "";
      render();
      setTimeout(function () { input.focus(); }, 30);
    }
    function close() {
      overlay.classList.remove("open");
      document.body.classList.remove("locked");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    trigger.addEventListener("click", open);
    overlay.querySelector(".search-close").addEventListener("click", close);
    clearBtn.addEventListener("click", function () { input.value = ""; render(); input.focus(); });
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
    input.addEventListener("input", render);

    body.addEventListener("click", function (e) {
      var chip = e.target.closest(".schip");
      if (chip) { input.value = chip.getAttribute("data-q"); render(); input.focus(); return; }
      var hit = e.target.closest(".shit");
      if (hit) window.location.href = hit.getAttribute("data-href");
    });

    document.addEventListener("keydown", function (e) {
      var isOpen = overlay.classList.contains("open");
      if (isOpen && (e.key === "Escape" || e.key === "Esc")) { e.preventDefault(); close(); return; }
      if (isOpen) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); return; }
      var tag = (document.activeElement && document.activeElement.tagName) || "";
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        e.preventDefault();
        open();
      }
    });
  })();

  /* ---------- 3. lightbox ---------- */
  (function () {
    var box = document.querySelector("[data-shot]") ? document.createElement("div") : null;
    if (!box) return;

    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Module screenshot");
    box.innerHTML =
      '<button class="lb-close" type="button" aria-label="Close screenshot">&times;</button>' +
      '<div class="lb-panel"><div data-lb-shot></div>' +
      '<div class="lb-cap"><h3 data-lb-title></h3><p data-lb-cap></p></div></div>';
    document.body.appendChild(box);

    var shotSlot = box.querySelector("[data-lb-shot]");
    var titleSlot = box.querySelector("[data-lb-title]");
    var capSlot = box.querySelector("[data-lb-cap]");
    var lastFocus = null;

    function open(card) {
      var svg = card.querySelector(".shot svg");
      if (!svg) return;
      shotSlot.innerHTML = "";
      shotSlot.appendChild(svg.cloneNode(true));
      var h = card.querySelector("h3");
      var p = card.querySelector(".shot-meta p");
      titleSlot.textContent = h ? h.textContent : "";
      capSlot.textContent = p ? p.textContent : "";
      lastFocus = document.activeElement;
      box.classList.add("open");
      document.body.classList.add("locked");
      box.querySelector(".lb-close").focus();
    }
    function close() {
      box.classList.remove("open");
      document.body.classList.remove("locked");
      shotSlot.innerHTML = "";
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.querySelectorAll("[data-shot]").forEach(function (card) {
      card.addEventListener("click", function () { open(card); });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          open(card);
        }
      });
    });

    box.addEventListener("click", function (e) { if (e.target === box) close(); });
    box.querySelector(".lb-close").addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if ((e.key === "Escape" || e.key === "Esc") && box.classList.contains("open")) close();
    });
  })();

  /* ---------- 4. forms ---------- */
  var enquiry = document.getElementById("enquiry-form");
  if (enquiry) {
    enquiry.addEventListener("submit", function (e) {
      e.preventDefault();
      var nameField = enquiry.querySelector("#name");
      var name = nameField && nameField.value.trim() ? nameField.value.trim().split(" ")[0] : "";
      var card = enquiry.closest(".form-card");
      var sent = document.getElementById("sent");
      var greeting = sent && sent.querySelector("[data-greeting]");
      if (greeting) greeting.textContent = name ? name + ", thank you" : "Thank you";
      if (sent) { sent.classList.add("show"); sent.focus(); }
      if (card) card.classList.add("done");
    });
  }

  var sub = document.getElementById("sub-form");
  if (sub) {
    sub.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = sub.querySelector(".sub-note");
      var input = sub.querySelector("input[type='email']");
      if (note) {
        note.textContent = "Thanks — we've noted " + (input && input.value ? input.value : "your address") + ". One short note a month, no more.";
        note.style.color = "#0E9F6E";
      }
      sub.reset();
    });
  }
})();
