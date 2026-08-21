/*
 * calculator.js — live cost comparison, driven by each page's researched pricing.
 *
 * A static table saying "$179/mo + 3% over $10K" makes the reader do arithmetic
 * they will not do. The whole argument on these pages is that the VARIABLE rate
 * decides the bill, not the subscription — and that argument only lands if the
 * reader can see it at their own spend. So: one slider, real numbers, updating live.
 *
 * Declare the plans on the page before loading this:
 *   window.FC_CALC = {
 *     spend: 25000,                       // starting monthly ad spend
 *     note: "optional line under the table",
 *     plans: [
 *       {name:"Helium 10 Diamond", base:359, pct:2, note:"2% managed spend fee"},
 *       {name:"Teikametrics",      base:179, pct:3, over:10000},
 *       {name:"Quartile",          quote:true,      note:"no public price"},
 *       {name:"Dr. PPC", base:300, pct:3, cap:2500, us:true}
 *     ]
 *   };
 *
 * base  — fixed monthly fee
 * pct   — percent of ad spend
 * over  — pct applies only to spend above this
 * cap   — monthly total is capped here
 * quote — no published price; shown as unknown rather than guessed at
 */
(function () {
  'use strict';
  var C = window.FC_CALC;
  if (!C || !C.plans || !C.plans.length) return;

  var mount = document.querySelector('[data-calc]');
  if (!mount) return;

  var spend = C.spend || 25000;

  function monthly(p, s) {
    if (p.quote) return null;
    var pctPart = 0;
    if (p.pct) {
      var basis = p.over ? Math.max(0, s - p.over) : s;
      pctPart = basis * (p.pct / 100);
    }
    var total = (p.base || 0) + pctPart;
    if (p.cap) total = Math.min(total, p.cap);
    return total;
  }

  function money(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function describe(p) {
    if (p.quote) return p.note || 'Quote only — no published price';
    var bits = [];
    if (p.base) bits.push(money(p.base) + '/mo');
    if (p.pct) bits.push(p.pct + '% of spend' + (p.over ? ' over ' + money(p.over) : ''));
    if (p.cap) bits.push('capped at ' + money(p.cap) + '/mo');
    return bits.join(' + ').replace('+ capped', '· capped');
  }

  mount.innerHTML =
    '<div class="fc-calc">' +
      '<div class="fc-calc-head">' +
        '<label for="fc-calc-range">Your monthly Amazon ad spend</label>' +
        '<output id="fc-calc-out" class="fc-calc-out"></output>' +
      '</div>' +
      '<input id="fc-calc-range" type="range" min="2000" max="300000" step="1000" ' +
             'value="' + spend + '" aria-describedby="fc-calc-out">' +
      '<div class="fc-calc-tw"><table class="fc-calc-tbl">' +
        '<thead><tr><th>Option</th><th>How it prices</th>' +
        '<th class="n">Per month</th><th class="n">Per year</th></tr></thead>' +
        '<tbody id="fc-calc-body"></tbody>' +
      '</table></div>' +
      (C.note ? '<p class="fc-calc-note">' + C.note + '</p>' : '') +
      '<p class="fc-calc-fine">Figures come from each vendor’s own published pricing, ' +
      'read on the date shown at the foot of this page. Where a vendor publishes no rate we ' +
      'say so rather than estimate one — an undisclosed percentage is the single biggest ' +
      'variable in this comparison.</p>' +
    '</div>';

  var range = mount.querySelector('#fc-calc-range');
  var out   = mount.querySelector('#fc-calc-out');
  var body  = mount.querySelector('#fc-calc-body');

  function render() {
    var s = +range.value;
    out.textContent = money(s) + ' / month';

    var priced = C.plans.map(function (p) { return { p: p, m: monthly(p, s) }; })
                        .filter(function (r) { return r.m !== null; });
    var max = Math.max.apply(null, priced.map(function (r) { return r.m; }).concat([1]));

    body.innerHTML = C.plans.map(function (p) {
      var m = monthly(p, s);
      var cells;
      if (m === null) {
        cells = '<td class="n quote">—</td><td class="n quote">not published</td>';
      } else {
        cells = '<td class="n">' + money(m) + '</td>' +
                '<td class="n"><span class="bar" style="--w:' +
                (m / max * 100).toFixed(1) + '%"></span>' + money(m * 12) + '</td>';
      }
      return '<tr class="' + (p.us ? 'us' : '') + '">' +
               '<td>' + p.name + (p.us ? ' <b>← us</b>' : '') + '</td>' +
               '<td class="how">' + describe(p) + '</td>' + cells +
             '</tr>';
    }).join('');
  }

  range.addEventListener('input', render);
  render();

  // one event when someone actually engages — this is a strong intent signal
  var used = false;
  range.addEventListener('change', function () {
    if (used) return;
    used = true;
    if (typeof gtag === 'function') {
      gtag('event', 'calculator_used', {
        spend_selected: +range.value,
        landing_page: location.pathname
      });
    }
  });
})();
