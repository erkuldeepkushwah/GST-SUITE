/* ============================================================
   Fingenuity Associates — shared behaviour
   1. Mobile navigation toggle
   2. Module screenshot lightbox (solutions.html)
   3. Enquiry + subscribe forms (client-side only, no backend)
   ============================================================ */

(function () {
  "use strict";

  /* ---------- 1. mobile nav ---------- */
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("primary-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // close after tapping a link (useful on single-page anchors)
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a") && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });

    // reset the menu if the viewport grows past the breakpoint
    window.addEventListener("resize", function () {
      if (window.innerWidth > 980 && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- 2. lightbox ---------- */
  var lightbox = document.getElementById("lightbox");

  if (lightbox) {
    var lightboxShot = lightbox.querySelector("[data-lightbox-shot]");
    var lightboxTitle = lightbox.querySelector("[data-lightbox-title]");
    var lightboxCaption = lightbox.querySelector("[data-lightbox-caption]");
    var closeBtn = lightbox.querySelector(".lightbox-close");
    var lastFocused = null;

    function openLightbox(card) {
      var svg = card.querySelector(".shot svg");
      var title = card.querySelector("h3");
      var caption = card.querySelector(".shot-meta p");
      if (!svg) return;

      lightboxShot.innerHTML = "";
      lightboxShot.appendChild(svg.cloneNode(true));
      lightboxTitle.textContent = title ? title.textContent : "";
      lightboxCaption.textContent = caption ? caption.textContent : "";

      lastFocused = document.activeElement;
      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-locked");
      if (closeBtn) closeBtn.focus();
    }

    function closeLightbox() {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-locked");
      lightboxShot.innerHTML = "";
      if (lastFocused && lastFocused.focus) lastFocused.focus();
    }

    // open from any gallery card — mouse or keyboard
    document.querySelectorAll("[data-shot]").forEach(function (card) {
      card.addEventListener("click", function () {
        openLightbox(card);
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          openLightbox(card);
        }
      });
    });

    // click outside the panel closes
    lightbox.addEventListener("click", function (e) {
      if (e.target === lightbox) closeLightbox();
    });
    if (closeBtn) closeBtn.addEventListener("click", closeLightbox);

    // Esc closes, Tab stays inside the panel
    document.addEventListener("keydown", function (e) {
      if (!lightbox.classList.contains("is-open")) return;

      if (e.key === "Escape" || e.key === "Esc") {
        e.preventDefault();
        closeLightbox();
        return;
      }

      if (e.key === "Tab") {
        var focusables = lightbox.querySelectorAll("button, [href], input, [tabindex]:not([tabindex='-1'])");
        if (!focusables.length) return;
        var first = focusables[0];
        var last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* ---------- 3. forms ---------- */
  var enquiryForm = document.getElementById("enquiry-form");

  if (enquiryForm) {
    enquiryForm.addEventListener("submit", function (e) {
      e.preventDefault();

      var nameField = enquiryForm.querySelector("#name");
      var name = nameField && nameField.value.trim() ? nameField.value.trim().split(" ")[0] : "";
      var card = enquiryForm.closest(".form-card");
      var status = document.getElementById("enquiry-status");
      var greeting = status && status.querySelector("[data-greeting]");

      if (greeting) {
        greeting.textContent = name ? name + ", thank you" : "Thank you";
      }
      if (status) status.classList.add("is-shown");
      if (card) card.classList.add("is-sent");
      if (status) status.focus();
    });
  }

  var subscribeForm = document.getElementById("subscribe-form");

  if (subscribeForm) {
    subscribeForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = subscribeForm.querySelector(".subscribe-note");
      var input = subscribeForm.querySelector("input[type='email']");
      if (note) {
        note.textContent = "Thanks — we've noted " + (input && input.value ? input.value : "your address") + ". One short note a month, no more.";
        note.style.color = "#15803D";
      }
      subscribeForm.reset();
    });
  }
})();
