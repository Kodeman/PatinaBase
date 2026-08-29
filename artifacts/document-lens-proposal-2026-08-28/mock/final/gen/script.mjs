export const SCRIPT = String.raw`
/* The Smart Lens -- one IIFE-shaped init inside try/catch, in SPEC C.7 order:
   fit, lens, focus, spine, motion, devbar, ink, pointAt, sheet, ready.

   HOST GUARD: the Artifact host inserts this file into a live page's body AFTER
   load, so DOMContentLoaded and window.onload have already fired and a naive
   DOMContentLoaded listener never runs -- the page would publish, open, and be
   dead. Init is a named function behind a readyState guard, and the whole body
   is inside try/catch so one host-side surprise leaves the CSS-painted rest
   state standing rather than a blank stage.

   Listeners: one click, one keydown, one pointermove, one focusin, one focusout
   on document; one scroll and one resize per frame. Never one per row -- 36
   Pieces lines times three frames is a listener census nobody can reason about. */

function __mockInit() {
try {
  var STAGE = document.getElementById('stage');
  var FRAMES = [];
  var KEYS = ['1440', '1280', '390'];
  var NATIVE = { '1440': [1440, 900], '1280': [1280, 800], '390': [390, 844] };
  var LANDING_CLEAR = 72;   /* --doc-landing-clear, a declared constant */
  var JUMP_LOCK = 700;      /* the smooth-scroll jump lock */

  /* offsetTop chain to the frame -- transform-independent, unlike a rect diff
     inside a scaled container, and the reason every band below is arithmetic in
     unscaled pixels. */
  function topIn(frame, el) {
    var y = 0, n = el;
    while (n && n !== frame) { y += n.offsetTop; n = n.offsetParent; }
    return y;
  }

  for (var ki = 0; ki < KEYS.length; ki++) {
    var k = KEYS[ki];
    var el = document.getElementById('frame-' + k);
    if (!el) continue;
    FRAMES.push({
      key: k,
      el: el,
      wrap: el.parentNode,
      rail: document.getElementById('rail-' + k),
      lens: document.getElementById('lens-' + k),
      sentinel: document.getElementById('sentinel-' + k),
      regions: [].slice.call(el.querySelectorAll('.region')),
      seen: {},
      current: null,
      lock: 0,
      lockTo: null,
      raf: 0,
      promote: {},
      hold: {}
    });
  }

  /* ---------- 1 - fit(): scale DOWN only, never up ---------------------- */
  function fit() {
    for (var i = 0; i < FRAMES.length; i++) {
      var F = FRAMES[i], n = NATIVE[F.key];
      var s = Math.min(1, (window.innerWidth - 48) / n[0]);
      F.el.style.transform = s < 1 ? 'scale(' + s + ')' : 'none';
      F.wrap.style.height = (n[1] * s) + 'px';
    }
  }
  window.addEventListener('resize', fit);

  /* ---------- 2 - lens(frame): the band, driven by a sentinel ------------
     Never a scroll handler reading scrollTop: the sentinel ABOVE the sticky
     band is the trigger, and the sentinel's own min-block-size RESERVES the
     open height, so the pin displaces nothing and the transition costs zero
     layout shift. Publishes data-lens-open and --lens-height. */
  function lens(F) {
    if (!F.sentinel || !F.lens) return;
    /* the OPEN reserved height is the whole header organ's occupancy of the
       frame at rest -- paper top to the first region head (SC1); the CLOSED one
       is the band alone once the letterhead has scrolled past. Both are
       published as --lens-height; neither drives a box. */
    var firstHead = F.el.querySelector('.region .rh-name');
    var openH = firstHead ? topIn(F.el, firstHead) : (F.sentinel.offsetHeight + F.lens.offsetHeight);
    var closedH = F.lens.offsetHeight;
    F.lensOpen = true;
    function publish(open) {
      F.lensOpen = open;
      F.lens.setAttribute('data-lens-open', open ? 'true' : 'false');
      F.lens.style.setProperty('--lens-height', (open ? openH : closedH) + 'px');
      /* every line that carries the attribute, not only the ones that yield:
         RF-02 keeps the household PRINTED while the letterhead is in frame and
         only turns its colour, so .rail-name reads the same signal without
         wearing the yielding class. */
      var heads = F.el.querySelectorAll('[data-letterhead-in-frame]');
      for (var i = 0; i < heads.length; i++) {
        heads[i].setAttribute('data-letterhead-in-frame', open ? 'true' : 'false');
      }
    }
    F.publishLens = publish;
    publish(true);
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) publish(entries[i].isIntersecting);
    }, { root: F.el, rootMargin: '0px', threshold: 0 });
    io.observe(F.sentinel);
  }

  /* ---------- 3 - focus(frame): the density engine ----------------------
     TWO IntersectionObserver bands, both rooted at THIS frame (a root:null
     observer inside a scaled overflow container reports viewport geometry that
     has nothing to do with what the reader sees). The narrow band PROMOTES a
     region to full; the wider HOLD band is what a region must leave before it
     can be demoted -- that asymmetry is the hysteresis, and it is why no
     boundary oscillates at --motion-scale 4.

     The observers are the event source; resolve() is the resolver, and it
     recomputes both bands arithmetically from scrollTop so settle() can force
     the settled state for the current offset synchronously, without waiting on
     a callback or a velocity gate. */
  function focus(F) {
    if (!F.regions.length) return;
    var PROMOTE = [0.08, 0.38];   /* the narrow band: 8% to 38% of the frame */
    var HOLD = [0.00, 0.88];      /* the wide band a region must leave to fall */

    function overlaps(F2, r, band) {
      var st = F2.el.scrollTop, H = F2.el.clientHeight;
      var a = st + band[0] * H, b = st + band[1] * H;
      var top = topIn(F2.el, r), bot = top + r.offsetHeight;
      return bot > a && top < b;
    }

    function nearest() {
      var st = F.el.scrollTop, H = F.el.clientHeight, aim = st + 0.20 * H;
      var best = F.regions[0], bestD = Infinity;
      for (var i = 0; i < F.regions.length; i++) {
        var r = F.regions[i], top = topIn(F.el, r), bot = top + r.offsetHeight;
        var d = (aim < top) ? (top - aim) : (aim > bot) ? (aim - bot) : 0;
        if (d < bestD) { bestD = d; best = r; }
      }
      return best;
    }

    /* L-4's gate, and the only place a region's height ever changes: a body is
       committed when its root's top comes within 240px of the frame's BOTTOM
       edge -- off screen, always -- and it never comes back off (L-5). 240px is
       more than three Pieces lines (a 48px crop plus py-2 plus a rule = 65px),
       so a three-line nudge cannot re-cross it. */
    var MOUNT_AHEAD = 240;
    function mountAhead() {
      /* ONE region per pass, re-measured after each commit -- a region that
         opens pushes the next one down, and a single-pass sweep over the closed
         geometry would open four at once for a threshold only the first meets. */
      for (var guard = 0; guard < 12; guard++) {
        var edge = F.el.scrollTop + F.el.clientHeight + MOUNT_AHEAD;
        var did = false;
        for (var i = 0; i < F.regions.length; i++) {
          var rid = F.regions[i].getAttribute('data-region');
          if (F.seen[rid]) continue;
          if (topIn(F.el, F.regions[i]) < edge) {
            F.seen[rid] = true;
            F.regions[i].setAttribute('data-density', 'reading');
            ink(F.regions[i]);
            did = true;
            break;
          }
        }
        if (!did) break;
      }
    }
    F.mountAhead = mountAhead;

    function resolve() {
      var next = null, i;
      for (i = 0; i < F.regions.length; i++) {
        if (overlaps(F, F.regions[i], PROMOTE)) { next = F.regions[i]; break; }
      }
      if (!next && F.current && overlaps(F, F.current, HOLD)) next = F.current;
      if (!next) next = nearest();
      return next;
    }

    function paint(next) {
      F.current = next;
      F.seen[next.getAttribute('data-region')] = true;
      for (var i = 0; i < F.regions.length; i++) {
        var r = F.regions[i], id = r.getAttribute('data-region');
        var d = (r === next) ? 'full' : (F.seen[id] ? 'reading' : 'condensed');
        var was = r.getAttribute('data-density');
        if (was !== d) {
          r.setAttribute('data-density', d);
          /* a stamp inks ONCE, on the state change that first brings it into
             view -- never again, and never on re-entry (R16/R31) */
          if (was === 'condensed') ink(r);
        }
      }
      publishState(F);
    }

    F.settle = function () {
      if (F.editing) { publishState(F); return; }
      if (F.lock && Date.now() < F.lock) {
        if (F.lockTo) { mountAhead(); paint(F.lockTo); }
        return;
      }
      mountAhead();
      paint(resolve());
    };

    function schedule() {
      if (F.raf) return;
      F.raf = requestAnimationFrame(function () { F.raf = 0; F.settle(); window_(F); });
    }
    F.schedule = schedule;

    var opts = function (band) {
      return {
        root: F.el,
        rootMargin: (-band[0] * 100) + '% 0px ' + (-(1 - band[1]) * 100) + '% 0px',
        threshold: 0
      };
    };
    var ioPromote = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        F.promote[entries[i].target.getAttribute('data-region')] = entries[i].isIntersecting;
      }
      schedule();
    }, opts(PROMOTE));
    var ioHold = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        F.hold[entries[i].target.getAttribute('data-region')] = entries[i].isIntersecting;
      }
      schedule();
    }, opts(HOLD));
    for (var i = 0; i < F.regions.length; i++) {
      ioPromote.observe(F.regions[i]);
      ioHold.observe(F.regions[i]);
    }
    F.el.addEventListener('scroll', schedule, { passive: true });
  }

  /* the state contract, published on every change and at rest (SPEC C.5) */
  function publishState(F) {
    var id = F.current ? F.current.getAttribute('data-region') : 'approvals';
    if (F.rail) F.rail.setAttribute('data-reading-index', id);
    F.el.setAttribute('data-reading-index', id);

    /* the frame's own lens state. CONDENSED is the band pinned with paper she
       has not reached still ahead of her; READING is the band pinned with the
       whole document committed. Both are derived from the density map, so the
       frame state and the region states can never disagree. */
    var st = F.el.scrollTop, H = F.el.clientHeight, i, r, anyCondensed = false;
    for (i = 0; i < F.regions.length; i++) {
      if (F.regions[i].getAttribute('data-density') === 'condensed') anyCondensed = true;
    }
    var state = F.editing ? 'editing'
      : (F.key === '390') ? 'mobile'
      : (st <= 0) ? 'rest'
      : anyCondensed ? 'condensed' : 'reading';
    F.el.setAttribute('data-lens-state', state);

    /* L-3 (override 1): a segment prints nothing while its own head is in frame.
       AT MOST ONE segment is ever silent, and it is the one the reading window
       brackets -- so the yield is gated on the reading index as well as on the
       head, and the rail never goes quiet in two places at once. */
    for (i = 0; i < F.regions.length; i++) {
      r = F.regions[i];
      var rid = r.getAttribute('data-region');
      var head = r.querySelector('.region-head');
      var hTop = topIn(F.el, head);
      var inFrame = (rid === id) && (hTop + head.offsetHeight > st && hTop < st + H);
      /* both layers of the segment -- the value that yields and the name that
         takes its place (RF-02) -- read the one attribute. */
      var segLayers = F.el.querySelectorAll('.seg[data-seg="' + rid + '"] [data-region-head-in-frame]');
      for (var sl = 0; sl < segLayers.length; sl++) {
        segLayers[sl].setAttribute('data-region-head-in-frame', inFrame ? 'true' : 'false');
      }
    }
    /* SP-08: the band's right-flush money slot drops while Money is the stop */
    var slot = F.el.querySelector('[data-money-slot]');
    if (slot) slot.setAttribute('data-yield', id === 'money' ? 'true' : 'false');
    /* the room rungs print only while the window brackets Pieces */
    var rungs = F.el.querySelectorAll('.lens-nav-room-rung');
    for (i = 0; i < rungs.length; i++) {
      rungs[i].setAttribute('data-room-visible', id === 'ffe' ? 'true' : 'false');
    }
    /* RF-03: the margin lifts, it does not filter and it does not move. Each
       group head names its own anchor for good; what changes is which head is
       CURRENT, and the only thing that answers is the count's colour. */
    var gheads = F.el.querySelectorAll('[data-beside-head]');
    for (i = 0; i < gheads.length; i++) {
      var anchor = gheads[i].getAttribute('data-beside-head');
      var cur = (anchor === 'ffe') ? (id === 'ffe') : (id !== 'ffe');
      gheads[i].setAttribute('data-beside-current', cur ? 'true' : 'false');
    }
    /* RF-04: the 390 bar's SECTIONS slot prints the stop she is standing in,
       off the same index the rail reads at a wider tier. */
    var mbar = F.el.querySelector('.mobile-bar');
    if (mbar) mbar.setAttribute('data-reading-index', id);
    var mbNames = F.el.querySelectorAll('[data-mb-name]');
    for (i = 0; i < mbNames.length; i++) {
      mbNames[i].setAttribute('data-on', mbNames[i].getAttribute('data-mb-name') === id ? 'true' : 'false');
    }
    /* the ladder's own segments */
    var segs = F.el.querySelectorAll('.lens-nav-segment');
    for (i = 0; i < segs.length; i++) {
      segs[i].setAttribute('data-reading-index',
        segs[i].getAttribute('data-seg') === id ? 'true' : 'false');
    }
  }

  /* ---------- 4 - spine(frame): the rail --------------------------------
     Subscribes to focus's published index; it constructs NO observer of its
     own, because two observers with two bands is exactly how a reading index
     and a density map come to disagree. Owns the 700ms jump lock. */
  function window_(F) {
    var win = F.el.querySelector('[data-window]');
    if (!win) return;
    var track = win.parentNode.offsetHeight;
    var ext = F.el.scrollHeight - F.el.clientHeight;
    if (ext <= 0) return;
    if (reducedNow()) {
      /* L-2's declared amendment: under reduce the bracket STEPS -- it is drawn
         around the segment holding the frame's stop, redrawn on settle only. */
      var seg = F.el.querySelector('.lens-nav-segment[data-reading-index="true"]');
      if (seg) {
        win.style.setProperty('--lens-reading-window-y', seg.offsetTop + 'px');
        win.style.setProperty('--lens-reading-window-h', seg.offsetHeight + 'px');
      }
      return;
    }
    /* R-07: the bracket is sized and placed against the paper's FULLY COMMITTED
       height, measured once at init, not against the height it happens to have
       now. The paper grows 725px under the reader as regions commit (below the
       fold, so CLS stays 0), and sizing off the live scrollHeight shrank the
       bracket from 75px to 66px over a single read of one document. */
    var full = Math.max(F.fullHeight || 0, F.el.scrollHeight);
    var fullExt = full - F.el.clientHeight;
    if (fullExt <= 0) return;
    var h = Math.max(24, Math.round(track * (F.el.clientHeight / full)));
    var y = Math.round((track - h) * (F.el.scrollTop / fullExt));
    win.style.setProperty('--lens-reading-window-y', y + 'px');
    win.style.setProperty('--lens-reading-window-h', h + 'px');
  }

  function jump(F, id) {
    var head = document.getElementById('head-' + id + '-' + F.key);
    var region = F.el.querySelector('.region[data-region="' + id + '"]');
    if (!head || !region) return;
    /* L-10: every region between here and the target is forced to full in ONE
       commit before the scroll begins, so the target's top cannot move under
       the scroll that is travelling to it. */
    for (var i = 0; i < F.regions.length; i++) {
      F.seen[F.regions[i].getAttribute('data-region')] = true;
      if (F.regions[i].getAttribute('data-density') === 'condensed') {
        F.regions[i].setAttribute('data-density', 'reading');
        ink(F.regions[i]);
      }
    }
    F.lockTo = region;
    F.lock = Date.now() + JUMP_LOCK;
    /* --doc-landing-clear resolves ONCE, correctly, at any fling speed: the head
       lands exactly 72px below the frame top, clear of the 56px pinned band. */
    var y = Math.max(0, topIn(F.el, head) - LANDING_CLEAR);
    F.el.scrollTo({ top: y, behavior: reducedNow() ? 'auto' : 'smooth' });
    if (F.settle) F.settle();
    window_(F);
    head.focus({ preventScroll: true });
    setTimeout(function () {
      F.lock = 0; F.lockTo = null;
      if (F.settle) F.settle();
      window_(F);
    }, JUMP_LOCK + 40);
  }

  /* ---------- 5 - motion() ---------------------------------------------- */
  var MQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedNow() {
    return STAGE.getAttribute('data-motion') === 'reduced' || (MQ ? MQ.matches : false);
  }
  function baseMotion() { return (MQ && MQ.matches) ? 'reduced' : 'normal'; }
  function setMotion(mode) {
    STAGE.setAttribute('data-motion', mode);
    if (mode === 'slow') STAGE.style.setProperty('--motion-scale', '4');
    else STAGE.style.removeProperty('--motion-scale');
    for (var i = 0; i < FRAMES.length; i++) window_(FRAMES[i]);
    syncBar();
  }
  function motion() {
    STAGE.setAttribute('data-motion', baseMotion());
    if (MQ && MQ.addEventListener) {
      MQ.addEventListener('change', function () {
        if (STAGE.getAttribute('data-motion') !== 'slow') setMotion(baseMotion());
      });
    }
  }

  /* ---------- 6 - devbar(): delegated, aria-pressed live ----------------- */
  var lastGo = 'rest';
  function byKey(k) {
    for (var i = 0; i < FRAMES.length; i++) if (FRAMES[i].key === k) return FRAMES[i];
    return null;
  }
  function syncBar() {
    var btns = document.querySelectorAll('.devbtn');
    var m = STAGE.getAttribute('data-motion');
    for (var i = 0; i < btns.length; i++) {
      var g = btns[i].getAttribute('data-go');
      var on = (g === 'reduced') ? (m === 'reduced')
        : (g === 'slow') ? (m === 'slow')
        : (g === lastGo);
      btns[i].setAttribute('aria-pressed', String(on));
    }
  }
  function goRest() {
    lastGo = 'rest';
    setMotion(baseMotion());
    for (var i = 0; i < FRAMES.length; i++) {
      var F = FRAMES[i];
      closeAllSheets();
      F.editing = false;
      F.lock = 0; F.lockTo = null;
      F.seen = {}; F.current = null;
      for (var j = 0; j < F.regions.length; j++) F.regions[j].setAttribute('data-density', 'condensed');
      F.el.scrollTo({ top: 0, behavior: 'auto' });
      if (F.publishLens) F.publishLens(true);
      if (F.settle) F.settle();
      window_(F);
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
    syncBar();
  }
  function devbar(go) {
    var F;
    if (go === 'rest') { goRest(); return; }
    /* R-06: only a FRAME-STATE press changes which frame state the bar reports.
       Reduced motion and Slow motion move no frame, so taking lastGo would have
       left every frame-state button aria-pressed="false" while the document was
       plainly still in one of them. */
    if (go === 'condensed' || go === 'ffe' || go === 'w1280' || go === 'w390') lastGo = go;
    if (go === 'condensed') {
      F = byKey('1440');
      if (F) { F.el.scrollTo({ top: 400, behavior: 'auto' }); F.settle(); window_(F); }
    } else if (go === 'ffe') {
      F = byKey('1440');
      if (F) jump(F, 'ffe');
    } else if (go === 'w1280' || go === 'w390') {
      F = byKey(go === 'w1280' ? '1280' : '390');
      if (F) F.wrap.scrollIntoView({ block: 'start', behavior: reducedNow() ? 'auto' : 'smooth' });
    } else if (go === 'reduced') {
      setMotion(STAGE.getAttribute('data-motion') === 'reduced' ? baseMotion() : 'reduced');
    } else if (go === 'slow') {
      setMotion(STAGE.getAttribute('data-motion') === 'slow' ? baseMotion() : 'slow');
    }
    syncBar();
  }

  /* ---------- 7 - ink(): once, and never again (R16/R31) ----------------- */
  function ink(root) {
    var all = (root || document).querySelectorAll('.stamp:not(.is-inked)');
    var list = [];
    for (var i = 0; i < all.length; i++) {
      var fold = all[i].closest ? all[i].closest('.lh-fold') : null;
      if (fold && fold.getAttribute('data-open') !== 'true') continue;
      var reg = all[i].closest ? all[i].closest('.region') : null;
      if (reg && reg.getAttribute('data-density') === 'condensed') continue;
      list.push(all[i]);
    }
    if (!list.length) return;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        for (var j = 0; j < list.length; j++) list[j].classList.add('is-inked');
      });
    });
  }

  /* ---------- 8 - pointAt(): --ink-x / --ink-y, one listener ------------- */
  function pointAt(el, e) {
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty('--ink-x', (e.clientX - r.left) + 'px');
    el.style.setProperty('--ink-y', (e.clientY - r.top) + 'px');
  }
  document.addEventListener('pointermove', function (e) {
    if (!e.target || !e.target.closest) return;
    pointAt(e.target.closest('.act'), e);
    pointAt(e.target.closest('.ffe-row'), e);
  });

  /* ---------- 9 - sheet(): focus trap, Escape, focus returned ------------ */
  var openSheetId = null, sheetOpener = null;
  function panelOf(id) {
    var w = document.getElementById(id);
    return w ? w.querySelector('.lens-sheet-panel') : null;
  }
  function focusables(panel) {
    return panel.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
  }
  function openSheet(id) {
    var wrap = document.getElementById(id), panel = panelOf(id);
    if (!wrap || !panel) return;
    closeAllSheets();
    sheetOpener = document.activeElement;
    openSheetId = id;
    /* park the overlay on the frame's CURRENT scroll window, so it opens over
       what she is looking at rather than over the top of the paper */
    var host = wrap.closest('.frame');
    if (host) {
      wrap.style.top = host.scrollTop + 'px';
      wrap.style.height = host.clientHeight + 'px';
    }
    wrap.setAttribute('data-open', 'true');
    wrap.setAttribute('aria-hidden', 'false');
    panel.setAttribute('data-open', 'true');
    ink(panel);
    /* the landing is the sheet's first ACT, not whatever is first in DOM order */
    var f = focusables(panel);
    var landing = panel.querySelector('[data-landing]') || panel.querySelector('.act.is-lead')
      || (f.length ? f[0] : null);
    if (landing && landing.focus) landing.focus();
  }
  function closeAllSheets() {
    var ws = document.querySelectorAll('.sheet-wrap[data-open="true"]');
    for (var i = 0; i < ws.length; i++) {
      ws[i].setAttribute('data-open', 'false');
      ws[i].setAttribute('aria-hidden', 'true');
      ws[i].style.removeProperty('top');
      ws[i].style.removeProperty('height');
      var p = ws[i].querySelector('.lens-sheet-panel');
      if (p) p.setAttribute('data-open', 'false');
    }
    if (openSheetId && sheetOpener && sheetOpener.focus) sheetOpener.focus();
    openSheetId = null; sheetOpener = null;
  }

  /* ---------- delegated listeners: one click, one keydown --------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target.closest(
      '[data-go],[data-seg],[data-room],[data-fold],[data-open-sheet],[data-close-sheet],[data-top],[data-chip],[data-put-down]'
    ) : null;
    if (!t) return;
    var F = null, host = t.closest('.frame');
    if (host) F = byKey(host.id.replace('frame-', ''));
    if (t.hasAttribute('data-go')) { devbar(t.getAttribute('data-go')); return; }
    if (t.hasAttribute('data-open-sheet')) { openSheet(t.getAttribute('data-open-sheet')); return; }
    if (t.hasAttribute('data-close-sheet')) { closeAllSheets(); return; }
    if (t.hasAttribute('data-fold')) {
      var fold = document.getElementById(t.getAttribute('data-fold'));
      if (!fold) return;
      var open = fold.getAttribute('data-open') !== 'true';
      fold.setAttribute('data-open', open ? 'true' : 'false');
      t.setAttribute('aria-expanded', String(open));
      if (open) ink(fold);
      return;
    }
    if (t.hasAttribute('data-top')) {
      if (F) { F.el.scrollTo({ top: 0, behavior: reducedNow() ? 'auto' : 'smooth' }); F.settle(); window_(F); }
      return;
    }
    if (t.hasAttribute('data-put-down')) { closeAllSheets(); goRest(); return; }
    if (t.hasAttribute('data-seg')) {
      if (!F) { var sheetHost = t.closest('.sheet-wrap'); if (sheetHost) F = byKey(sheetHost.id.split('-').pop()); }
      if (F) { closeAllSheets(); jump(F, t.getAttribute('data-seg')); }
      return;
    }
    if (t.hasAttribute('data-room')) {
      var pressed = t.getAttribute('aria-pressed') === 'true';
      var sibs = t.parentNode.querySelectorAll('.lens-nav-room-rung');
      for (var i = 0; i < sibs.length; i++) sibs[i].setAttribute('aria-pressed', 'false');
      t.setAttribute('aria-pressed', pressed ? 'false' : 'true');
      if (!pressed && F) {
        var room = document.getElementById('room-' + t.getAttribute('data-room') + '-' + F.key);
        if (room) F.el.scrollTo({ top: Math.max(0, topIn(F.el, room) - LANDING_CLEAR),
          behavior: reducedNow() ? 'auto' : 'smooth' });
      }
      return;
    }
    if (t.hasAttribute('data-chip')) {
      var chips = document.querySelectorAll('.margin-chip');
      for (var c = 0; c < chips.length; c++) chips[c].classList.remove('is-anchored');
      t.classList.add('is-anchored');
      var target = t.getAttribute('data-chip');
      if (F && target !== 'job') jump(F, target);
      return;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!openSheetId) return;
    var panel = panelOf(openSheetId);
    if (!panel) return;
    if (e.key === 'Escape') { e.preventDefault(); closeAllSheets(); return; }
    if (e.key !== 'Tab') return;
    var f = focusables(panel);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (!panel.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  /* the pen goes down (L-8): the lens freezes, the row takes its clay rule,
     and NO sibling changes. Nothing dims. */
  document.addEventListener('focusin', function (e) {
    var pen = e.target.closest ? e.target.closest('[data-pen]') : null;
    if (!pen) return;
    var host = pen.closest('.frame');
    var F = host ? byKey(host.id.replace('frame-', '')) : null;
    if (!F) return;
    F.editing = true;
    var row = pen.closest('.lens-row-editing');
    if (row) row.setAttribute('data-editing', 'true');
    publishState(F);
  });
  document.addEventListener('focusout', function (e) {
    var pen = e.target.closest ? e.target.closest('[data-pen]') : null;
    if (!pen) return;
    var host = pen.closest('.frame');
    var F = host ? byKey(host.id.replace('frame-', '')) : null;
    if (!F) return;
    F.editing = false;
    var row = pen.closest('.lens-row-editing');
    if (row) row.setAttribute('data-editing', 'false');
    if (F.settle) F.settle();
  });

  /* ---------- 10 - the deterministic hooks ------------------------------ */
  window.__lensSettled = function () {
    return new Promise(function (resolve) {
      for (var i = 0; i < FRAMES.length; i++) {
        if (FRAMES[i].settle) FRAMES[i].settle();
        window_(FRAMES[i]);
      }
      requestAnimationFrame(function () { requestAnimationFrame(function () { resolve(true); }); });
    });
  };

  motion();
  fit();
  for (var fi = 0; fi < FRAMES.length; fi++) {
    lens(FRAMES[fi]);
    focus(FRAMES[fi]);
    FRAMES[fi].settle();
  }
  /* R-07: the paper's committed height, measured once before anything is on
     screen -- every region's body released, read, and put straight back. It is
     an attribute flip and a synchronous layout read inside init, so no stamp
     inks early (ink() is only ever called explicitly) and nothing paints twice. */
  for (var mi = 0; mi < FRAMES.length; mi++) {
    var Fm = FRAMES[mi], was = [];
    for (var mr = 0; mr < Fm.regions.length; mr++) {
      was.push(Fm.regions[mr].getAttribute('data-density'));
      Fm.regions[mr].setAttribute('data-density', 'reading');
    }
    Fm.fullHeight = Fm.el.scrollHeight;
    for (mr = 0; mr < Fm.regions.length; mr++) Fm.regions[mr].setAttribute('data-density', was[mr]);
    Fm.settle();
    window_(Fm);
  }
  syncBar();
  ink(document);
  window.__mockReady = true;
} catch (e) {
  /* the rest state is painted by markup + CSS alone, so a failed init leaves a
     correct still document -- it only loses the lens. */
  window.__mockError = String(e && e.message ? e.message : e);
}
}
if (document.readyState !== 'loading') { __mockInit(); }
else { document.addEventListener('DOMContentLoaded', __mockInit); }
`;
