/* Notes & correspondence: anchored, browser-local, fictional. Nothing here is ever sent. */
(function () {
  'use strict';
  const MAX = 2000;
  const AUTHOR = 'Leah';
  const AUD = { studio: 'Private studio', client: 'Client conversation', maker: 'Maker conversation' };
  const MODES = {
    private: { aud: 'studio', kind: 'note', btn: 'Save private note', hint: 'Private to the studio. Never shown to the client or maker.', done: 'Private note saved.' },
    client: { aud: 'client', kind: 'draft', btn: 'Save message draft', hint: 'Kept here as an unsent draft to the client. Nothing is sent from this page.', done: 'Draft saved. It has not been sent.' },
    maker: { aud: 'maker', kind: 'draft', btn: 'Save message draft', hint: 'Kept here as an unsent draft to the maker. Nothing is sent from this page.', done: 'Draft saved. It has not been sent.' }
  };
  const openLines = new Set();
  const held = {}, heldOpen = {};
  const ui = { scope: 'all', aud: 'all' };
  let ctr = 0;
  let flash = null;

  const J = () => window.Job;
  const S = () => J().state;
  const e = (s) => {
    s = s == null ? '' : String(s);
    return J() && J().esc ? J().esc(s) : s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };
  const iso = () => new Date().toISOString();
  const fmt = (v) => {
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  function seed() {
    return [
      { id: 'N-seed-1', scope: 'line:LR-36', audience: 'client', kind: 'received', author: 'Nora', body: 'Could we keep this console under 16 inches deep?', created: '2026-10-19T15:20:00Z' },
      { id: 'N-seed-2', scope: 'line:LR-36', audience: 'studio', kind: 'note', author: 'Leah', body: 'Check outlet clearance before choosing the replacement.', created: '2026-10-20T10:05:00Z' },
      { id: 'N-seed-3', scope: 'line:LR-02', audience: 'maker', kind: 'received', author: 'Northline', body: 'Please confirm the COM cutting before production.', created: '2026-10-20T16:40:00Z' },
      { id: 'N-seed-4', scope: 'room:living', audience: 'studio', kind: 'note', author: 'Leah', body: 'Review the room in afternoon light.', created: '2026-10-21T09:30:00Z' }
    ];
  }
  function init() {
    if (!Array.isArray(S().notes)) {
      S().notes = seed();
      if (J().save) J().save();
    }
  }
  const list = () => { if (!Array.isArray(S().notes)) init(); return S().notes; };
  const allLines = () => { const l = S().lines; return Array.isArray(l) ? l : Object.values(l || {}); };
  const allRooms = () => { const r = S().rooms; return Array.isArray(r) ? r : Object.values(r || {}); };
  const lineRoom = (id) => { const l = J().get(id); return l && l.room; };
  const roomLabel = (id) => (J().roomName ? J().roomName(id) : (allRooms().find((r) => r.id === id) || {}).name) || id;

  function scopeLabel(s) {
    s = s || 'job';
    if (s === 'job') return 'Whole job';
    const i = s.indexOf(':'), k = s.slice(0, i), id = s.slice(i + 1);
    if (k === 'room') return 'Room: ' + roomLabel(id);
    if (k === 'line') { const l = J().get(id); return 'Line ' + id + (l && l.name ? ' · ' + l.name : ''); }
    if (k === 'order') return 'Order ' + id;
    return s;
  }
  function scopeOptions(sel, withAll) {
    const o = (v, t) => `<option value="${e(v)}"${v === sel ? ' selected' : ''}>${e(t)}</option>`;
    return (withAll ? o('all', 'All subjects') : '') + o('job', 'Whole job') +
      '<optgroup label="Rooms">' + allRooms().map((r) => o('room:' + r.id, r.name)).join('') + '</optgroup>' +
      '<optgroup label="Lines">' + allLines().map((l) => o('line:' + l.id, l.id + ' · ' + (l.name || ''))).join('') + '</optgroup>' + '<optgroup label="Orders">' + (S().orders || []).map((r) => o('order:' + r.id, r.id + ' · ' + r.maker)).join('') + '</optgroup>';
  }
  function scopeMatch(n, f) {
    if (f === 'all' || n.scope === f) return true;
    return f.indexOf('room:') === 0 && (n.scope || '').indexOf('line:') === 0 && lineRoom(n.scope.slice(5)) === f.slice(5);
  }
  const byDate = (a, b) => new Date(a.created) - new Date(b.created);

  function entry(n, ctx) {
    const d = n.kind === 'draft';
    const tag = d ? 'Unsent draft' : AUD[n.audience] || AUD.studio;
    const who = n.audience === 'maker' ? 'maker' : 'client';
    const status = d ? 'To ' + who + ' · not sent' : n.kind === 'received' ? 'Received' : 'Saved note';
    const sc = n.scope || 'job';
    let subj = '';
    if (ctx !== 'line') {
      subj = sc.indexOf('line:') === 0
        ? `<button type="button" class="nt-jump" data-nt-jump="${e(sc.slice(5))}">${e(scopeLabel(sc))}</button>`
        : sc.indexOf('order:') === 0 ? `<button type="button" class="nt-jump" data-nt-order="${e(sc.slice(6))}">${e(scopeLabel(sc))}</button>` : `<span class="nt-subj">${e(scopeLabel(sc))}</span>`;
    }
    const draft = d ? `<details class="nt-draft" data-nt-d="draft-${e(n.id)}"><summary>Open draft</summary>
      <form class="nt-edit" data-nt-edit="${e(n.id)}" data-nt-key="edit-${e(n.id)}" novalidate>
        <label>Edit draft<textarea name="body" rows="3" maxlength="${MAX}" data-nt-keep="edit-${e(n.id)}:body">${e(n.body)}</textarea></label>
        <button type="submit" class="nt-save">Save draft changes</button>
        <p class="nt-msg" role="status" aria-live="polite"></p>
      </form>
      <details class="nt-prev" data-nt-d="prev-${e(n.id)}"><summary>Local preview</summary>
        <div class="nt-letter"><p class="nt-to">To: ${who === 'maker' ? 'Maker' : 'Client'} · ${e(scopeLabel(sc))}</p><p>${e(n.body)}</p><p class="nt-sig">${e(n.author)} · preview only, not sent</p></div>
      </details></details>` : '';
    return `<li data-note-id="${e(n.id)}" class="nt-entry" data-aud="${e(n.audience)}" data-kind="${e(n.kind)}">
      <div class="nt-meta"><span class="nt-tag">${e(tag)}</span><span>${e(status)}</span><span>${e(n.author)}</span><time>${e(fmt(n.created))}</time></div>
      <p class="nt-text">${e(n.body)}</p>${subj ? `<p class="nt-about">${subj}</p>` : ''}${draft}</li>`;
  }
  const entries = (arr, ctx) => arr.length ? `<ol class="nt-list">${arr.slice().sort(byDate).map((n) => entry(n, ctx)).join('')}</ol>` : '<p class="nt-empty">No entries yet.</p>';

  function composer(key, fixed) {
    const sel = ui.scope !== 'all' ? ui.scope : 'job';
    const mo = (v, t) => `<option value="${v}">${t}</option>`;
    return `<form class="nt-form" data-nt-key="${e(key)}" novalidate>
      <label>Type<select name="mode" data-nt-mode data-nt-keep="${e(key)}:mode">${mo('private', 'Private studio note')}${mo('client', 'Draft to client')}${mo('maker', 'Draft to maker')}</select></label>
      ${fixed ? `<input type="hidden" name="scope" value="${e(fixed)}"><p class="nt-about">About: ${e(scopeLabel(fixed))}</p>`
        : `<label>Subject<select name="scope" data-nt-keep="${e(key)}:scope">${scopeOptions(sel, false)}</select></label>`}
      <label>Message<textarea name="body" rows="3" maxlength="${MAX}" data-nt-keep="${e(key)}:body"></textarea></label>
      <p class="nt-hint">${MODES.private.hint}</p>
      <button type="submit" class="nt-save">${MODES.private.btn}</button>
      <p class="nt-msg" role="status" aria-live="polite"></p>
    </form>`;
  }

  function homeInner() {
    const all = list();
    const c = (f) => all.filter(f).length;
    const vis = all.filter((n) => scopeMatch(n, ui.scope) && (ui.aud === 'all' || n.audience === ui.aud));
    const ao = (v, t) => `<option value="${v}"${ui.aud === v ? ' selected' : ''}>${t}</option>`;
    return `<section class="nt nt-home">
      <header class="nt-head"><h3>Notes &amp; correspondence</h3>
        <p class="nt-sum"><span>${all.length} entries</span><span>${c((n) => n.audience === 'studio')} private studio</span><span>${c((n) => n.audience === 'client' && n.kind === 'received')} client conversation</span><span>${c((n) => n.audience === 'maker' && n.kind === 'received')} maker conversation</span><span>${c((n) => n.kind === 'draft')} unsent drafts</span></p></header>
      <div class="nt-filters">
        <label>Subject<select data-nt-filter="scope">${scopeOptions(ui.scope, true)}</select></label>
        <label>Audience<select data-nt-filter="aud">${ao('all', 'All (internal studio view)')}${ao('studio', 'Studio')}${ao('client', 'Client')}${ao('maker', 'Maker')}</select></label>
      </div>
      ${vis.length ? entries(vis, 'home') : '<p class="nt-empty">No entries match these filters.</p>'}
      <details class="nt-compose" data-nt-d="home-compose"><summary>Write a note or draft</summary>${composer('home')}</details>
    </section>`;
  }
  function lineInner(id, kind = 'line') {
    const arr = list().filter((n) => n.scope === kind + ':' + id);
    return `<summary>Notes &amp; correspondence <span class="nt-count">${arr.length}</span></summary>
      <div class="nt-body">${entries(arr, 'line')}${composer(kind + '-' + id, kind + ':' + id)}</div>`;
  }

  function sync(f) {
    const m = f && f.elements && f.elements.mode && MODES[f.elements.mode.value];
    if (!m) return;
    f.querySelector('.nt-save').textContent = m.btn;
    f.querySelector('.nt-hint').textContent = m.hint;
  }
  function msg(f, text, err) {
    const p = f.querySelector('.nt-msg');
    if (!p) return;
    p.textContent = text;
    p.classList.toggle('nt-err', !!err);
    p.setAttribute('role', err ? 'alert' : 'status');
  }
  const eachKeep = (fn) => document.querySelectorAll('.nt [data-nt-keep]').forEach(fn);

  function capture() {eachKeep(x => {held[x.dataset.ntKeep] = x.value;});document.querySelectorAll('.nt details[data-nt-d]').forEach(x => {heldOpen[x.dataset.ntD]=x.open;});}
  function restore() {eachKeep(x => {if(x.dataset.ntKeep in held)x.value=held[x.dataset.ntKeep];});document.querySelectorAll('.nt details[data-nt-d]').forEach(x=>{if(x.dataset.ntD in heldOpen)x.open=heldOpen[x.dataset.ntD];});document.querySelectorAll('.nt-form').forEach(sync);}
  function clearHeld() {for(const k of Object.keys(held))delete held[k];for(const k of Object.keys(heldOpen))delete heldOpen[k];openLines.clear();ui.scope="all";ui.aud="all";document.querySelectorAll(".nt form").forEach(f=>f.reset());}
  function refresh(reset) {
    const vals = {}, opens = {};
    eachKeep((x) => { vals[x.dataset.ntKeep] = x.value; });
    document.querySelectorAll('.nt details[data-nt-d]').forEach((x) => { opens[x.dataset.ntD] = x.open; });
    const a = document.activeElement;
    const fk = a && a.dataset && (a.dataset.ntKeep || a.dataset.ntFilter);
    const h = document.getElementById('job-correspondence');
    if (h) h.innerHTML = homeInner();
    document.querySelectorAll('[data-notes-line]').forEach((x) => { x.innerHTML = lineInner(x.dataset.notesLine); });
    document.querySelectorAll('[data-notes-order]').forEach((x) => { x.innerHTML = lineInner(x.dataset.notesOrder, 'order'); });
    eachKeep((x) => {
      const k = x.dataset.ntKeep;
      if (k in vals && !(reset && k === reset + ':body')) x.value = vals[k];
    });
    document.querySelectorAll('.nt details[data-nt-d]').forEach((x) => { if (x.dataset.ntD in opens) x.open = opens[x.dataset.ntD]; });
    document.querySelectorAll('.nt-form').forEach(sync);
    if (fk) {
      const t = [].find.call(document.querySelectorAll('.nt [data-nt-keep],.nt [data-nt-filter]'), (x) => (x.dataset.ntKeep || x.dataset.ntFilter) === fk);
      if (t) t.focus();
    }
    if (flash) {
      const f = [].find.call(document.querySelectorAll('.nt form[data-nt-key]'), (x) => x.dataset.ntKey === flash.key);
      if (f) { msg(f, flash.text); if (f.classList.contains('nt-form')) f.elements.body.focus(); }
      flash = null;
    }
  }

  const inNt = (t) => t && t.closest && t.closest('.nt');
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-nt-jump],[data-nt-order]');
    if (!b || !inNt(b)) return;
    if (b.dataset.ntOrder) return window.Commerce.openPurchasing(b.dataset.ntOrder,b);
    window.Commerce.openLine(b.dataset.ntJump, true,b);
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (!inNt(t)) return;
    if (t.matches('[data-nt-filter]')) { ui[t.dataset.ntFilter] = t.value; refresh(); }
    else if (t.matches('[data-nt-mode]')) sync(t.form);
  });
  document.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.matches || !d.matches('details[data-notes-line],details[data-notes-order]')) return;
    const key=d.dataset.notesLine||'order:'+d.dataset.notesOrder;if (d.open) openLines.add(key); else openLines.delete(key);
  }, true);
  document.addEventListener('submit', (ev) => {
    const f = ev.target;
    if (!inNt(f) || !f.matches('form.nt-form,form.nt-edit')) return;
    ev.preventDefault();
    const body = f.elements.body.value.trim().slice(0, MAX);
    if (!body) { msg(f, 'Nothing saved: write a message first.', true); f.elements.body.focus(); return; }
    const key = f.dataset.ntKey;
    let text, title, scope;
    if (f.matches('.nt-edit')) {
      const n = list().find((x) => x.id === f.dataset.ntEdit);
      if (!n || n.kind !== 'draft') { msg(f, 'This draft is no longer available.', true); return; }
      n.body = body; n.edited = iso();
      text = 'Draft updated. It is still unsent.'; title = 'Draft edited'; scope = n.scope;
    } else {
      const m = MODES[f.elements.mode.value];
      if (!m) return;
      scope = f.elements.scope.value || 'job';
      list().push({ id: 'N-' + Date.now() + '-' + (++ctr), scope, audience: m.aud, kind: m.kind, author: AUTHOR, body, created: iso() });
      text = m.done; title = m.kind === 'draft' ? 'Message draft saved' : 'Private note saved';
    }
    if (J().log) J().log(title, scopeLabel(scope));
    if (J().save) J().save();
    flash = { key, text };
    refresh(key);capture();
  });

  function clientComments(id) {
    return list().filter((n) => n.scope === 'line:' + id && n.audience === 'client' && n.kind === 'received').sort(byDate)
      .map((n) => `<p class="nt-cc"><strong>${e(n.author)}:</strong> ${e(n.body)}</p>`).join('');
  }
  function addClientResponse(id, body) {
    body = String(body == null ? '' : body).trim().slice(0, MAX);
    if (!body) return null;
    const n = { id: 'N-' + Date.now() + '-' + (++ctr), scope: 'line:' + id, audience: 'client', kind: 'received', author: 'Nora', body, created: iso() };
    list().push(n);
    if (J().save) J().save();
    refresh();
    return n;
  }
  function home() {
    const html = homeInner(), h = document.getElementById('job-correspondence');
    if (h) h.innerHTML = html;
    return html;
  }
  function line(id) {
    id = String(id);
    return `<details class="nt nt-line" data-notes-line="${e(id)}"${openLines.has(id) ? ' open' : ''}>${lineInner(id)}</details>`;
  }

  function order(id) { return `<details class="nt nt-line" data-notes-order="${e(id)}"${openLines.has('order:'+id)?' open':''}>${lineInner(id, 'order')}</details>`; }
  window.Notes = { init, home, line, order, capture, restore, clearHeld, refresh, clientComments, addClientResponse };
})();
