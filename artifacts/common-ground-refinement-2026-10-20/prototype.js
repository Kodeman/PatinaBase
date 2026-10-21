(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const names = { natural: 'Natural white oak', smoked: 'Smoked oak' };
  const key = 'patina-common-ground-refinement-v1';
  const blank = { studioPreference: '', clientChoice: '', studioNote: '' };
  let state = { ...blank };
  let storageAvailable = true;
  try { const saved = JSON.parse(localStorage.getItem(key)); if (saved && typeof saved === 'object') state = { studioPreference: names[saved.studioPreference] ? saved.studioPreference : '', clientChoice: names[saved.clientChoice] ? saved.clientChoice : '', studioNote: typeof saved.studioNote === 'string' ? saved.studioNote : '' }; } catch { storageAvailable = false; }
  let view = 'studio';
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(state)); storageAvailable = true; return true; } catch { storageAvailable = false; return false; } };
  function setVariant(variant, updateUrl = true) {
    const next = variant === 'bound' ? 'bound' : 'paper';
    document.body.dataset.variant = next;
    $$('[data-variant-button]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.variantButton === next)));
    $('#back-link').href = `index.html#${next}`;
    document.title = `Lake Mendota House — ${next === 'paper' ? 'Paper' : 'Bound'} / Patina`;
    if (updateUrl) { const url = new URL(location.href); url.searchParams.set('variant', next); history.replaceState({}, '', url); }
  }
  function render() {
    const chosen = Boolean(state.clientChoice);
    const client = view === 'client';
    $('#decision-status').textContent = chosen ? client ? 'Your choice recorded' : 'Client choice recorded' : client ? 'Awaiting your choice' : 'Awaiting Nora’s choice';
    $('#next-label').textContent = chosen ? 'A choice, made' : 'Here, now';
    $('#choice-summary').hidden = !chosen;
    $('#choice-summary').textContent = chosen ? `${names[state.clientChoice]}, chosen by ${client ? 'you' : 'Nora'}.` : '';
    $('#open-finish').innerHTML = `${chosen ? 'Review the finish sheet' : 'Open the finish sheet'} <span aria-hidden="true">↗</span>`;
    $('#decision-footnote').textContent = chosen ? client ? 'Leah will review the workshop brief next.' : 'The workshop brief is still awaiting studio review.' : client ? 'Your choice is needed before the workshop brief.' : 'Nora’s choice is needed before the workshop brief.';
    $('#maker-status').textContent = chosen ? client ? 'Your finish is recorded. Awaiting Leah’s review.' : 'Finish recorded. Awaiting studio release.' : client ? 'Awaiting your finish choice and Leah’s review.' : 'Awaiting the finish choice and studio release.';
    $('#maker-finish').textContent = chosen ? names[state.clientChoice] : 'Not yet recorded';
    $('#maker-release-note').textContent = chosen ? 'Nora’s choice is recorded. The studio must still review and release this brief.' : 'The finish must be chosen before this brief is ready for studio review.';
    $('#client-record').textContent = chosen ? `Nora’s choice: ${names[state.clientChoice]}.` : 'Nora’s choice: Not yet recorded.';
    $('#note-indicator').textContent = state.studioNote ? '✓' : '+';
    $('#open-studio-note').setAttribute('aria-label', state.studioNote ? 'Open studio note, saved' : 'Add a private studio note');
    $('#role-avatar').textContent = client ? 'NE' : 'LH';
    $('#view-summary').textContent = chosen ? client ? 'Your finish is chosen. Leah will review the next steps with the workshop.' : 'The finish is chosen. Leah will review the next steps with the workshop.' : 'The direction is set. One small decision brings the chair closer to home.';
    $$('.shared-audience').forEach(label => { label.textContent = client ? 'Shared with you' : 'Shared with Nora'; });
    $('#choice-history').hidden = !chosen;
    $('#choice-history-heading').textContent = client ? 'You recorded your finish choice.' : 'Nora recorded her finish choice.';
    $('#choice-history-summary').textContent = chosen ? `${names[state.clientChoice]} selected. The workshop brief is still awaiting ${client ? 'Leah’s' : 'studio'} review.` : '';
    $('.history-count').textContent = `${chosen ? 3 : 2} shared milestones`;
    $('.prototype-disclaimer').textContent = `${storageAvailable ? 'Saved only in this browser.' : 'Kept on this page only; browser storage is unavailable.'} Nothing is sent to ${client ? 'Leah' : 'Nora'} or the workshop.`;
    $('#prototype-storage-note').textContent = storageAvailable ? 'Sample changes stay in this browser.' : 'Sample changes last for this page only; browser storage is unavailable.';
  }
  function syncFinishSheet() {
    const studio = view === 'studio';
    const selected = studio ? state.studioPreference : state.clientChoice;
    $$('input[name="finish"]').forEach(input => { input.checked = input.value === selected; });
    $('#studio-note').value = studio ? state.studioNote : '';
    $('#finish-legend').textContent = studio ? 'Studio working preference' : 'Choose the finish for your chair';
    $('#save-finish').textContent = studio ? 'Save studio preference' : state.clientChoice ? 'Update my choice' : 'Record my choice';
    $('#form-explanation').textContent = studio ? 'Your working preference does not record Nora’s choice.' : 'Choose a finish to record your decision. Leah will review the workshop brief next.';
    $('#finish-form-status').textContent = '';
  }
  function setView(next) {
    view = next === 'client' ? 'client' : 'studio';
    $$('dialog[open]').forEach(dialog => dialog.close());
    document.body.dataset.view = view;
    $$('[data-view-button]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.viewButton === view)));
    syncFinishSheet(); render();
  }
  function openFinish(note = false) {
    syncFinishSheet(); $('#finish-dialog').showModal();
    if (note && view === 'studio') $('#studio-note').focus();
  }
  $$('[data-variant-button]').forEach(button => button.addEventListener('click', () => setVariant(button.dataset.variantButton)));
  $$('[data-view-button]').forEach(button => button.addEventListener('click', () => setView(button.dataset.viewButton)));
  $('#open-finish').addEventListener('click', () => openFinish());
  $('#open-studio-note').addEventListener('click', () => openFinish(true));
  $('#open-maker').addEventListener('click', () => { if (view !== 'studio') return; render(); $('#maker-dialog').showModal(); });
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('#finish-form').addEventListener('submit', event => {
    event.preventDefault();
    const selected = $('input[name="finish"]:checked');
    if (!selected) { $('#finish-form-status').textContent = 'Choose a finish first.'; $('input[name="finish"]').focus(); return; }
    const studio = view === 'studio';
    if (studio) { state.studioPreference = selected.value; state.studioNote = $('#studio-note').value.trim(); }
    else { state.clientChoice = selected.value; $('#save-finish').textContent = 'Update my choice'; }
    const saved = persist();
    $('#finish-form-status').textContent = studio ? saved ? 'Studio preference saved. Nora’s choice is unchanged.' : 'Studio preference kept on this page only; browser storage is unavailable. Nora’s choice is unchanged.' : saved ? `${names[selected.value]} recorded. The brief remains with Leah for review.` : `${names[selected.value]} recorded on this page only; browser storage is unavailable. The brief remains with Leah for review.`;
    render();
  });
  $('#save-note-only').addEventListener('click', () => { if (view !== 'studio') return; state.studioNote = $('#studio-note').value.trim(); const saved = persist(); render(); $('#finish-form-status').textContent = saved ? 'Private studio note saved. Nothing has been shared.' : 'Private studio note kept on this page only; browser storage is unavailable. Nothing has been shared.'; });
  $('#reset-sample').addEventListener('click', () => { state = { ...blank }; const saved = persist(); syncFinishSheet(); render(); $('#reset-status').textContent = saved ? 'Sample reset in this browser.' : 'Sample reset on this page. Browser storage is unavailable.'; });
  $('.history-toggle').addEventListener('click', event => { const button = event.currentTarget; const expanded = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(expanded)); $('#history-panel').hidden = !expanded; button.querySelector('span').textContent = expanded ? '−' : '+'; });
  $('.mobile-context-toggle').addEventListener('click', event => { const button = event.currentTarget; const expanded = button.getAttribute('aria-expanded') !== 'true'; button.setAttribute('aria-expanded', String(expanded)); $('.left-page').classList.toggle('is-expanded', expanded); button.querySelector('span').textContent = expanded ? '−' : '+'; });
  setVariant(new URLSearchParams(location.search).get('variant'), false);
  syncFinishSheet(); render();
})();
