(function () {
  'use strict';

  var STORAGE_KEY = 'patina-room-proof-round4-review-notes-v1';
  var SIZES = { desktop: { w: 1440, h: 1000, label: 'Desktop' }, phone: { w: 390, h: 844, label: 'Phone' } };
  var SCENE_ORDER = ["reading", "review", "client", "notes", "purchase", "order", "spec", "price"];

  var SCENES = {
  "reading": {
    "title": "Reading the job",
    "summary": "The approved continuous job, with the same room imagery and dense sheet.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Unfold the living-room sheet, then return to the room.",
    "caps": [
      "Six chapters on one paper",
      "36 living-room lines · 80 across the job",
      "The approved FF&E tools remain available"
    ]
  },
  "review": {
    "title": "The studio’s review ledger",
    "summary": "Six selections can carry six different client answers. Earlier editions remain in the file.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Open a selection or its correspondence. Prepare a fresh review of a few items.",
    "caps": [
      "Approve, request changes, or pause",
      "Frozen specifications and client prices",
      "Changes require a fresh review"
    ]
  },
  "client": {
    "title": "The client’s item review",
    "summary": "Nora sees her selections, client prices and conversations about those items.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Approve LR-03 and request a change on LR-04. Try sending a reply without making a decision.",
    "caps": [
      "Decisions recorded line by line",
      "Comments do not imply approval",
      "Trade cost and private notes excluded"
    ]
  },
  "notes": {
    "title": "The conversation stays on the job",
    "summary": "Private studio notes, client conversations and unsent maker drafts share a subject, while keeping their audiences explicit.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Filter to the living room, then open LR-36. Save a private note or a client draft.",
    "caps": [
      "Job, room, line and order subjects",
      "Local drafts, never sent",
      "Notes unfold within the item or order"
    ]
  },
  "purchase": {
    "title": "A purchase begins with readiness",
    "summary": "Approval, authority, funding and terms are separate facts. The sheet shows exactly what a line is waiting for.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Select a ready line and prepare an order. Open Waiting on something to see the holds.",
    "caps": [
      "Ready and waiting lines",
      "PO drafts grouped by maker",
      "Already-paid purchases recorded separately"
    ]
  },
  "order": {
    "title": "From acknowledgment to receiving",
    "summary": "The order unfolds inside the purchasing sheet. Maker correspondence and delivery records belong to this order.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Open Receiving on PO-01. Or use PO-02 to record an acknowledgment difference and draft a reply.",
    "caps": [
      "Issued order values retained",
      "Acknowledgment differences are visible",
      "Partial or damaged deliveries stay on record"
    ]
  },
  "spec": {
    "title": "The same detail, with connections",
    "summary": "The existing dense specification editor now connects a line to its client decision and correspondence.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Open LR-02’s notes below its specification. Return to the room afterward.",
    "caps": [
      "Maker, finish, dimensions, COM and labor",
      "Line IDs stay consistent",
      "No new permanent side panel"
    ]
  },
  "price": {
    "title": "The working figures stay close",
    "summary": "The round-three price sheet remains: quantity, cost, client price, markup and margin.",
    "status": "Interactive design proposal · fictional, local records",
    "task": "Edit LR-01’s client price, then inspect its review. The earlier approved edition remains unchanged.",
    "caps": [
      "Two-way price and markup",
      "Released values protected",
      "Changed approval becomes visible"
    ]
  }
};

  var NOTE_FIELDS = [
    { id: 'q-job', fallback: 'Does this fit how you run a job?' },
    { id: 'q-density', fallback: 'Density: too much, too little, or right?' },
    { id: 'q-missing', fallback: 'What is missing?' },
    { id: 'q-return', fallback: 'Would you come back to it?' },
    { id: 'q-other', fallback: 'Anything else?' }
  ];

  function $(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- Direct message sheet toggle ---------- */
  function initSheet() {
    var toggle = $('dm-toggle');
    var sheet = $('dm-sheet');
    if (!toggle || !sheet) { return; }
    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true'); toggle.textContent = open ? 'Unfold the working sheet' : 'Fold the sheet back into the room';
      if (open) { sheet.setAttribute('hidden', ''); } else { sheet.removeAttribute('hidden'); }
    });
  }

  /* ---------- Scene explorer ---------- */
  var currentScene = null;
  var currentMode = 'auto';
  var hintTimer = null;

  var els = {};

  function sceneUrl(scene, embedded) {
    return 'job.html?scene=' + encodeURIComponent(scene) + (embedded ? '&embedded=1' : '');
  }

  function renderDescription(scene) {
    var data = SCENES[scene];
    if (!data) { return; }
    if (els.title) { els.title.textContent = data.title; }
    if (els.summary) { els.summary.textContent = data.summary; }
    if (els.status) { els.status.textContent = data.status; }
    if (els.task) { els.task.textContent = data.task; }
    if (els.caps) {
      els.caps.textContent = '';
      data.caps.forEach(function (cap) {
        var li = document.createElement('li');
        li.textContent = cap;
        els.caps.appendChild(li);
      });
    }
    if (els.open) { els.open.setAttribute('href', sceneUrl(scene, false)); els.open.setAttribute('target', '_blank'); els.open.setAttribute('rel', 'noopener'); }
  }

  function updatePressed(scene) {
    all('[data-scene]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-scene') === scene ? 'true' : 'false');
    });
  }

  function startLoading() {
    if (els.box) { els.box.setAttribute('data-loading', 'true'); }
    if (els.hint) { els.hint.hidden = true; }
    if (hintTimer) { clearTimeout(hintTimer); }
    hintTimer = setTimeout(function () {
      if (els.box && els.box.getAttribute('data-loading') === 'true' && els.hint) {
        els.hint.hidden = false;
      }
    }, 10000);
  }

  function setScene(scene) {
    if (!SCENES[scene]) { return; }
    var changed = scene !== currentScene;
    currentScene = scene;
    updatePressed(scene);
    if (els.frame) { els.frame.title = 'Room Proof job study: ' + SCENES[scene].title; }
    renderDescription(scene);
    if (changed && els.frame) {
      startLoading();
      els.frame.setAttribute('src', sceneUrl(scene, true));
    }
  }

  function effectiveMode() {
    if (currentMode === 'desktop' || currentMode === 'phone') { return currentMode; }
    return window.innerWidth < 720 ? 'phone' : 'desktop';
  }

  function fit() {
    if (!els.stage || !els.fit || !els.box || !els.frame) { return; }
    var mode = effectiveMode();
    var size = SIZES[mode];
    var cs = window.getComputedStyle(els.stage);
    var padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var avail = Math.floor(els.stage.clientWidth - padX);
    if (!(avail > 0)) { avail = size.w; }
    var scale = Math.min(1, avail / size.w);
    var scaledW = Math.floor(size.w * scale);
    var scaledH = Math.ceil(size.h * scale);
    if (scaledW > avail) { scaledW = avail; }

    els.box.style.position = 'absolute';
    els.box.style.left = '0';
    els.box.style.top = '0';
    els.box.style.width = size.w + 'px';
    els.box.style.height = size.h + 'px';
    els.box.style.transformOrigin = '0 0';
    els.box.style.transform = 'scale(' + scale + ')';
    els.frame.style.width = size.w + 'px';
    els.frame.style.height = size.h + 'px';
    els.frame.style.border = '0';
    els.fit.style.position = 'relative';
    els.fit.style.width = scaledW + 'px';
    els.fit.style.height = scaledH + 'px';
    els.box.setAttribute('data-mode', mode);

    if (els.readout) {
      els.readout.textContent = size.label + ' ' + size.w + ' × ' + size.h + ' shown at ' +
        Math.round(scale * 100) + '%' + (currentMode === 'auto' ? ' (auto)' : '');
    }
  }

  function setMode(mode) {
    if (mode !== 'auto' && mode !== 'desktop' && mode !== 'phone') { return; }
    currentMode = mode;
    all('[data-mode]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-mode') === mode ? 'true' : 'false');
    });
    fit();
  }

  function jumpToExplorer() {
    var target = $('scene-explorer') || $('explorer');
    if (!target && els.title) { target = els.title.closest('section') || els.title; }
    if (target && target.scrollIntoView) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (els.title) {
      if (!els.title.hasAttribute('tabindex')) { els.title.setAttribute('tabindex', '-1'); }
      try { els.title.focus({ preventScroll: true }); } catch (e) { els.title.focus(); }
    }
  }

  function initExplorer() {
    els.frame = $('scene-frame');
    els.box = $('frame-box');
    els.fit = $('frame-fit');
    els.stage = $('frame-stage');
    els.readout = $('frame-readout');
    els.hint = $('frame-hint');
    els.open = $('scene-open');
    els.title = $('scene-title');
    els.summary = $('scene-summary');
    els.status = $('scene-status');
    els.task = $('scene-task');
    els.caps = $('scene-caps');

    all('[data-scene]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setScene(btn.getAttribute('data-scene'));
      });
    });
    all('[data-jump]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setScene(btn.getAttribute('data-jump'));
        jumpToExplorer();
      });
    });
    all('[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMode(btn.getAttribute('data-mode'));
      });
    });

    if (els.frame) {
      els.frame.addEventListener('load', function () {
        if (els.box) { els.box.setAttribute('data-loading', 'false'); }
        if (els.hint) { els.hint.hidden = true; }
        if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
      });
    }

    var resizeQueued = false;
    window.addEventListener('resize', function () {
      if (resizeQueued) { return; }
      resizeQueued = true;
      window.requestAnimationFrame(function () {
        resizeQueued = false;
        fit();
      });
    });

    setMode('auto');
    setScene('reading');
  }

  /* ---------- Review notes ---------- */
  var notesTimer = null;

  function setNotesStatus(text, isError) {
    var status = $('notes-status');
    if (!status) { return; }
    status.textContent = text;
    if (isError) { status.setAttribute('data-state', 'error'); } else { status.removeAttribute('data-state'); }
  }

  function storageAvailable() {
    try {
      var s = window.localStorage;
      return !!s;
    } catch (e) {
      return false;
    }
  }

  function collectNotes() {
    var form = $('review-form');
    var data = { version: 1, fields: {}, verdict: '' };
    if (!form) { return data; }
    NOTE_FIELDS.forEach(function (f) {
      var el = $(f.id);
      if (el) { data.fields[f.id] = String(el.value || ''); }
    });
    var checked = form.querySelector('input[type="radio"][name="verdict"]:checked');
    if (checked) { data.verdict = checked.value; }
    return data;
  }

  function saveNotes() {
    if (!storageAvailable()) {
      setNotesStatus('Saving is unavailable in this browser. Use Download notes to keep them.', true);
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(collectNotes()));
      setNotesStatus('Saved on this device.', false);
    } catch (e) {
      setNotesStatus('Could not save notes in this browser. Use Download notes to keep them.', true);
    }
  }

  function restoreNotes() {
    var form = $('review-form');
    if (!form) { return; }
    if (!storageAvailable()) {
      setNotesStatus('Saving is unavailable in this browser. Use Download notes to keep them.', true);
      return;
    }
    var raw = null;
    try { raw = window.localStorage.getItem(STORAGE_KEY); } catch (e) {
      setNotesStatus('Saving is unavailable in this browser. Use Download notes to keep them.', true);
      return;
    }
    if (!raw) { return; }
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { return; }
    var fields = parsed.fields && typeof parsed.fields === 'object' ? parsed.fields : {};
    NOTE_FIELDS.forEach(function (f) {
      var el = $(f.id);
      if (el && Object.prototype.hasOwnProperty.call(fields, f.id) && typeof fields[f.id] === 'string') {
        el.value = fields[f.id];
      }
    });
    if (typeof parsed.verdict === 'string' && parsed.verdict) {
      all('input[type="radio"][name="verdict"]', form).forEach(function (r) {
        r.checked = r.value === parsed.verdict;
      });
    }
    setNotesStatus('Restored saved notes.', false);
  }

  function labelFor(field) {
    var el = $(field.id);
    if (el) {
      var lab = document.querySelector('label[for="' + field.id + '"]');
      if (lab && lab.textContent.trim()) { return lab.textContent.replace(/\s+/g, ' ').trim(); }
    }
    return field.fallback;
  }

  function verdictLabel(form) {
    var checked = form.querySelector('input[type="radio"][name="verdict"]:checked');
    if (!checked) { return ''; }
    var lab = checked.id ? document.querySelector('label[for="' + checked.id + '"]') : null;
    if (!lab) { lab = checked.closest('label'); }
    return lab && lab.textContent.trim() ? lab.textContent.replace(/\s+/g, ' ').trim() : checked.value;
  }

  function buildMarkdown() {
    var form = $('review-form');
    var date = new Date().toISOString().slice(0, 10);
    var lines = ['# Room proof round 3 review notes', '', 'Date: ' + date, ''];
    var verdict = form ? verdictLabel(form) : '';
    if (verdict) { lines.push('Overall: ' + verdict, ''); }
    NOTE_FIELDS.forEach(function (f) {
      var el = $(f.id);
      var value = el ? String(el.value || '').trim() : '';
      lines.push('## ' + labelFor(f), '', value || '_No notes._', '');
    });
    return { text: lines.join('\n'), date: date };
  }

  function downloadNotes() {
    var built = buildMarkdown();
    var blob = new Blob([built.text], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'room-proof-round4-review-notes-' + built.date + '.md';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function initNotes() {
    var form = $('review-form');
    if (!form) { return; }
    var download = $('notes-download');
    var clear = $('notes-clear');
    var clearLabel = clear ? clear.textContent : 'Clear notes';
    var clearArmed = false;
    var clearTimer = null;

    restoreNotes();

    form.addEventListener('submit', function (event) { event.preventDefault(); });

    function onChange() { saveNotes(); }
    form.addEventListener('input', onChange);
    form.addEventListener('change', onChange);

    if (download) { download.addEventListener('click', downloadNotes); }

    function disarm() {
      clearArmed = false;
      if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
      if (clear) { clear.textContent = clearLabel; }
    }

    if (clear) {
      clear.addEventListener('click', function () {
        if (!clearArmed) {
          clearArmed = true;
          clear.textContent = 'Clear saved notes?';
          clearTimer = setTimeout(disarm, 10000);
          return;
        }
        disarm();
        try { window.localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
        form.reset();
        if (storageAvailable()) { setNotesStatus('Saved notes cleared.', false); }
        else { setNotesStatus('Saving is unavailable in this browser. Use Download notes to keep them.', true); }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && clearArmed) { disarm(); }
      });
    }
  }

  function init() {
    initSheet();
    initExplorer();
    initNotes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
