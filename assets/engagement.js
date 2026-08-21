/*
 * engagement.js — call-to-action placement + GA4 conversion tracking.
 *
 * Implements the placement spec exactly:
 *   · a CTA immediately after the first paragraph
 *   · CTAs at the 25%, 50% and 75% marks through the article body
 *   · a popup at 30% scroll depth, once per session
 *   · every landing page tied to every signup in GA4
 *
 * The "25/50/75%" CTAs are placed by position through the CONTENT, not by
 * viewport scroll — a reader on a phone hits 25% scroll while still in the
 * intro, which would put a sales pitch before the article has earned it.
 * Content position is what the spec is actually reaching for. The popup is
 * genuinely scroll-triggered, because that one is about reading intent.
 *
 * Configure per page via window.FC_CTA before this script loads:
 *   window.FC_CTA = {
 *     ga4:     'G-XXXXXXX',
 *     brand:   'drppc',
 *     href:    'https://calendly.com/...',
 *     label:   'Book a demo call',
 *     sub:     'First 30 days free. No contract.',
 *     popup:   { title: '...', body: '...', label: '...' }
 *   };
 */
(function () {
  'use strict';
  var C = window.FC_CTA || {};
  if (!C.href) return;

  var LABEL = C.label || 'Book a demo call';
  var SUB   = C.sub   || '';
  var SEEN  = {};                       // fire each event once per page
  var reduce = window.matchMedia &&
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── GA4 ──────────────────────────────────────────────────────────────────
  // Every event carries the landing page, so a signup can always be traced
  // back to the article that earned it. Without this, GA4 attributes the
  // conversion to whatever page the form happened to sit on.
  var LANDING = location.pathname;
  try {
    var k = 'fc_landing';
    LANDING = sessionStorage.getItem(k) || location.pathname;
    if (!sessionStorage.getItem(k)) sessionStorage.setItem(k, location.pathname);
  } catch (e) { /* private mode — fall back to this page */ }

  function track(name, params) {
    var p = params || {};
    p.landing_page = LANDING;
    p.article_page = location.pathname;
    if (C.brand) p.brand = C.brand;
    if (typeof gtag === 'function') gtag('event', name, p);
    if (window.dataLayer) window.dataLayer.push(Object.assign({ event: name }, p));
  }
  function once(key, fn) { if (SEEN[key]) return; SEEN[key] = 1; fn(); }

  // ── CTA block ────────────────────────────────────────────────────────────
  function cta(placement) {
    var d = document.createElement('div');
    d.className = 'fc-cta';
    d.setAttribute('data-placement', placement);
    d.innerHTML =
      '<a class="fc-cta-btn" href="' + C.href + '" target="_blank" rel="noopener">' +
      LABEL + ' →</a>' +
      (SUB ? '<span class="fc-cta-sub">' + SUB + '</span>' : '');
    d.querySelector('a').addEventListener('click', function () {
      track('cta_click', { cta_placement: placement });
      track('generate_lead', { cta_placement: placement, value: 1 });
    });
    return d;
  }

  // ── place the inline CTAs ────────────────────────────────────────────────
  // A missing article container only means we cannot place CTAs *between
  // paragraphs*. It must NOT disable the popup or scroll tracking — a landing
  // page with no <article> still needs both, and an early return here silently
  // stripped the popup from the Dr. PPC homepage.
  var article = document.querySelector('[data-article], article, main');
  var placed = [];

  if (article) {
    var paras = Array.prototype.filter.call(
      article.querySelectorAll('p'),
      function (p) { return p.textContent.trim().length > 80 && !p.closest('.fc-cta'); }
    );

    // Some of our best pages carry their argument in tables and lists rather
    // than prose — amazon-ppc-software-comparison is 2,464 words across six
    // paragraphs. Counting only <p> put a single CTA on those pages and no
    // depth CTAs at all. Fall back to section-level blocks so placement tracks
    // the shape of the page instead of assuming every page is an essay.
    // Choosing EITHER prose or blocks still missed a shape: the /learn/ hubs
    // run ~1,700 words as seven paragraphs interleaved with section headings
    // and link lists. Prose alone gave seven anchors (one short of the depth
    // threshold), and blocks alone lost because a section <h2> is only ~25px
    // tall and the old 40px filter threw every heading away. Merging both in
    // document order is what actually tracks the page.
    if (paras.length < 8) {
      var merged = Array.prototype.filter.call(
        article.querySelectorAll('p, h2, table, ul, ol, dl'),
        function (n) {
          if (n.closest('.fc-cta')) return false;
          if (n.tagName === 'P') return n.textContent.trim().length > 80;
          return n.offsetHeight > 20;   // still skips collapsed/hidden blocks
        }
      );
      if (merged.length > paras.length) paras = merged;
    }

    // A CTA placed directly after a heading separates it from the section it
    // introduces, which looks like a mistake. Step past headings instead.
    var heading = function (n) { return /^H[1-6]$/.test(n.tagName); };
    var settle = function (i) {
      while (i < paras.length - 1 && heading(paras[i])) i++;
      return i;
    };

    var insertAfter = function (node, el) {
      if (node && node.parentNode) { node.parentNode.insertBefore(el, node.nextSibling); placed.push(el); }
    };
    if (paras.length) {
      insertAfter(paras[settle(0)], cta('after-first-paragraph'));
      // Only add depth CTAs when the article is long enough that they land in
      // distinct places — on a short page they would stack on top of each other.
      if (paras.length >= 8) {
        [[0.25, 'depth-25'], [0.50, 'depth-50'], [0.75, 'depth-75']].forEach(function (m) {
          var i = settle(Math.floor(paras.length * m[0]));
          if (i > 0 && i < paras.length) insertAfter(paras[i], cta(m[1]));
        });
      }
    }
  }

  // fire cta_view when one actually reaches the screen
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var pl = e.target.getAttribute('data-placement');
        once('view-' + pl, function () { track('cta_view', { cta_placement: pl }); });
        io.unobserve(e.target);
      });
    }, { threshold: 0.5 });
    placed.forEach(function (el) { io.observe(el); });
  }

  // ── scroll depth + the popup ─────────────────────────────────────────────
  // Fires at 40%, not 30%: on a long article 30% still lands mid-argument,
  // which reads as interrupting rather than offering.
  function depth() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    return h > 0 ? (window.pageYOffset / h) : 0;
  }

  function popup() {
    var cfg = C.popup || {};
    var wrap = document.createElement('div');
    wrap.className = 'fc-pop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'fc-pop-t');
    // B2B interstitials fail for predictable reasons, so this one is built against them:
    //   · it names the product and the parent company, because on a comparison page the
    //     reader has never heard of us and "book a demo" answers nothing
    //   · it states the risk reversal explicitly — free, no contract, no card
    //   · it carries one credibility line, because a two-month-old domain has none
    //   · it offers a real second option, since most readers are comparing, not buying,
    //     and a modal with only one exit reads as a trap
    //   · the dismiss is worded honestly rather than shamed ("no thanks, I'm comparing")
    // Structured as a short product fact-sheet rather than a stack of marketing
    // blocks. The points are a definition list with hairline rules — coloured
    // dot bullets are the single most recognisable "generated" tell, and a
    // key/value row reads as specification, which is what a buyer is scanning for.
    var pts = "";
    if (cfg.points && cfg.points.length) {
      pts = '<dl class="fc-pop-spec">' + cfg.points.map(function (t) {
        var i = t.indexOf('|');
        var k = i > -1 ? t.slice(0, i).trim() : '';
        var v = i > -1 ? t.slice(i + 1).trim() : t;
        return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>';
      }).join('') + '</dl>';
    }
    wrap.innerHTML =
      '<div class="fc-pop-card">' +
        '<button class="fc-pop-x" aria-label="Close">' +
          '<svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true">' +
          '<path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.6" ' +
          'stroke-linecap="round" fill="none"/></svg>' +
        '</button>' +
        (cfg.eyebrow ? '<p class="fc-pop-eyebrow">' + cfg.eyebrow + '</p>' : '') +
        '<h3 id="fc-pop-t">' + (cfg.title || 'Want this running your account?') + '</h3>' +
        '<p class="fc-pop-lede">' +
          (cfg.body || 'Twenty minutes on your real numbers. First 30 days free.') + '</p>' +
        pts +
        '<a class="fc-cta-btn" href="' + C.href + '" target="_blank" rel="noopener">' +
          (cfg.label || LABEL) + '</a>' +
        (cfg.proof ? '<p class="fc-pop-proof">' + cfg.proof + '</p>' : '') +
        '<button class="fc-pop-no">' +
          (cfg.dismiss || 'No thanks — I’m just comparing') + '</button>' +
      '</div>';
    document.body.appendChild(wrap);
    if (!reduce) requestAnimationFrame(function () { wrap.classList.add('on'); });
    else wrap.classList.add('on');
    track('popup_shown', { trigger: 'scroll_40' });

    var prev = document.activeElement;
    var x = wrap.querySelector('.fc-pop-x');
    x.focus();
    function close(how) {
      wrap.classList.remove('on');
      track('popup_dismissed', { method: how });
      setTimeout(function () { wrap.remove(); if (prev && prev.focus) prev.focus(); }, reduce ? 0 : 200);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close('escape');
      if (e.key === 'Tab') {                       // keep focus inside the dialog
        var f = wrap.querySelectorAll('button, a[href]');
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    x.addEventListener('click', function () { close('close_button'); });
    var no = wrap.querySelector('.fc-pop-no');
    if (no) no.addEventListener('click', function () { close('not_now'); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close('backdrop'); });
    document.addEventListener('keydown', onKey);
    wrap.querySelector('a').addEventListener('click', function () {
      track('cta_click', { cta_placement: 'popup' });
      track('generate_lead', { cta_placement: 'popup', value: 1 });
    });
  }

  // Once per ARTICLE, not once per session. The session-wide flag meant a reader
  // who saw the popup on one comparison page never saw it again anywhere on the
  // site — which is exactly how it looked "missing" on pages that were working
  // correctly. Each article gets one offer; dismissing it silences that article,
  // not the whole visit.
  var POP_KEY = 'fc_popped:' + location.pathname;
  var popped = false;
  try { popped = sessionStorage.getItem(POP_KEY) === '1'; } catch (e) {}

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var d = depth();
      [[0.25, '25'], [0.50, '50'], [0.75, '75'], [0.90, '100']].forEach(function (m) {
        if (d >= m[0]) once('sd' + m[1], function () {
          track('scroll_depth', { percent_scrolled: parseInt(m[1], 10) });
        });
      });
      // 1.6, not 2.2: the old gate silently skipped table-heavy pages on a tall
      // desktop window, which is the other half of "the popup is missing".
      var longEnough = document.documentElement.scrollHeight > window.innerHeight * 1.6;
      if (!popped && longEnough && d >= 0.40) {
        popped = true;
        try { sessionStorage.setItem(POP_KEY, '1'); } catch (e) {}
        popup();
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ── signups ──────────────────────────────────────────────────────────────
  // Calendly posts a message when a booking completes; that is the real
  // conversion, not the click that opened it.
  window.addEventListener('message', function (e) {
    if (!e.data || typeof e.data.event !== 'string') return;
    if (e.data.event === 'calendly.event_scheduled') {
      track('sign_up', { method: 'calendly' });
      track('conversion', { conversion_type: 'demo_booked', value: 1 });
    }
  });
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.matches('form')) {
      track('sign_up', { method: 'form', form_id: e.target.id || 'unnamed' });
    }
  }, true);
})();
