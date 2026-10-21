(() => {
  'use strict';

  const storageKey = 'patina-room-proof-v1';
  const pieces = {
    chair: { number: '01', name: 'The lounge chair', material: 'White oak / natural linen', dimensions: '29 × 32 × 31 in', maker: 'Northline Workshop', status: 'Finish needs Nora’s choice', handoff: 'Nora’s finish choice, then studio release.', note: '“Let’s look at the grain beside the linen. The workshop sample will give us the final reference.”' },
    table: { number: '02', name: 'The walnut table', material: 'Solid walnut / clear oil', dimensions: '48 × 26 × 15 in', maker: 'Northline Workshop', status: 'Direction agreed / drawing to confirm', handoff: 'Confirm the edge profile with the workshop.', note: '“The rounded edge gives the room a softer centre, without losing the weight of the walnut.”' },
    sofa: { number: '03', name: 'The linen sofa', material: 'Natural linen / feather blend', dimensions: '84 × 36 × 30 in', maker: 'Fieldwork Upholstery', status: 'Fabric sample to review', handoff: 'Review the linen sample with Nora.', note: '“The fabric should hold the light without looking precious. We’ll look at the sample together.”' },
    lamp: { number: '04', name: 'The floor lamp', material: 'Bronze / linen shade', dimensions: '18 × 18 × 61 in', maker: 'Common Metalworks', status: 'Direction agreed / availability to confirm', handoff: 'Confirm availability and the shade size.', note: '“A little bronze beside the linen. The light should be low enough for reading.”' }
  };
  const finishes = { light: 'Light oak', smoked: 'Smoked oak' };
  const validViews = ['room', 'proof', 'folio'];
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch (_) { stored = {}; }
  const isFinish = value => Object.prototype.hasOwnProperty.call(finishes, value);
  const state = {
    view: 'room',
    piece: Object.prototype.hasOwnProperty.call(pieces, stored.piece) ? stored.piece : 'chair',
    role: stored.role === 'client' ? 'client' : 'studio',
    studioPreference: isFinish(stored.studioPreference) ? stored.studioPreference : null,
    clientChoice: isFinish(stored.clientChoice) ? stored.clientChoice : null,
    choiceDate: typeof stored.choiceDate === 'string' ? stored.choiceDate : null,
    review: Array.isArray(stored.review) ? stored.review.filter(value => ['finish', 'drawing', 'delivery'].includes(value)) : []
  };
  const drafts = { studio: state.studioPreference, client: state.clientChoice };
  let reviewDraft = [...state.review];
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const setText = (selector, value) => $$(selector).forEach(element => { element.textContent = value; });

  function persist() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { /* The sample remains usable when browser storage is unavailable. */ }
  }

  function currentUrl(view = state.view, piece = state.piece) {
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
    url.searchParams.set('piece', piece);
    url.searchParams.set('role', state.role);
    url.hash = '';
    return url;
  }

  function readUrl(initial = false) {
    const params = new URL(window.location.href).searchParams;
    const view = params.get('view');
    const piece = params.get('piece');
    const role = params.get('role');
    state.view = validViews.includes(view) ? view : 'room';
    if (Object.prototype.hasOwnProperty.call(pieces, piece)) state.piece = piece;
    if (initial && (role === 'studio' || role === 'client')) state.role = role;
  }

  function announce(message) {
    $('[data-announcement]').textContent = message;
  }

  function render() {
    const piece = { ...pieces[state.piece] };
    const isChair = state.piece === 'chair';
    const isStudio = state.role === 'studio';
    const hasChoice = Boolean(state.clientChoice);
    const finishName = hasChoice ? finishes[state.clientChoice] : 'Not recorded';
    if (isChair && hasChoice) {
      piece.status = `${finishName} chosen / studio release pending`;
      piece.handoff = 'The studio reviews the drawing and workshop timing.';
    }
    document.body.dataset.view = state.view;
    document.body.dataset.role = state.role;
    document.title = `${state.view === 'room' ? 'The room' : state.view === 'proof' ? 'Piece proof' : 'Maker folio'} — Patina Room Proof`;
    $$('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== state.view; });
    $$('[data-view-link]').forEach(link => {
      link.href = currentUrl(link.dataset.viewLink).href;
      if (link.closest('.document-views')) {
        if (link.dataset.viewLink === state.view) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
      }
    });
    $$('[data-piece]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.piece === state.piece)));
    $$('[data-role-button]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.roleButton === state.role)));
    $('.client-banner').hidden = isStudio;
    for (const [key, value] of Object.entries(piece)) setText(`[data-selected="${key}"]`, value);
    $('[data-open-proof]').href = currentUrl('proof').href;
    setText('[data-chair-index-status]', hasChoice ? `${finishName} chosen` : 'Finish to decide');
    setText('[data-room-history]', `Direction agreed on 12 October. The four pieces were brought together on 16 October. ${hasChoice ? `Nora’s ${finishName.toLowerCase()} choice is recorded; the studio reviews the workshop instruction next.` : 'The chair’s finish is the next decision.'}`);
    $('[data-chair-art]').hidden = !isChair;
    $('[data-other-piece-art]').hidden = isChair;
    $('[data-other-piece-art]').dataset.artPiece = state.piece;
    $('[data-other-piece-art] img').alt = `${piece.name} in the illustrated room direction`;
    $$('[data-chair-only]').forEach(element => { element.hidden = !isChair; });
    $$('[data-other-only]').forEach(element => { element.hidden = isChair; });
    if (isChair) $('[data-proof-title]').innerHTML = 'The finishing<br>touch.';
    else $('[data-proof-title]').textContent = piece.name + '.';
    setText('[data-proof-deck]', isChair ? 'Two finishes. One chair by the window. See the material, then keep the choice on the record.' : 'A piece, its context and the instruction that follows. The sample specification stays with the room.');
    setText('[data-finish-legend]', isStudio ? 'Studio preference' : 'Nora’s finish choice');
    setText('[data-role-explanation]', isStudio ? 'Your working preference stays separate from Nora’s recorded choice.' : 'Choose the finish you would like Leah to carry into the workshop brief.');
    $('[data-save-finish]').innerHTML = `${isStudio ? 'Save studio preference' : 'Record my choice'} <span aria-hidden="true">↗</span>`;
    $$('#finish-form input[name="finish"]').forEach(input => { input.checked = drafts[state.role] === input.value; });
    setText('[data-studio-preference]', isStudio && state.view !== 'folio' ? (state.studioPreference ? finishes[state.studioPreference] : 'Not recorded') : '');
    $('[data-private-preference]').hidden = !isStudio;
    $('[data-private-note]').hidden = !isStudio;
    $('[data-private-note-copy]').textContent = isStudio && state.view !== 'folio' ? 'Ask the workshop for the physical oil sample before the order is released. Keep supplier discussions here until the shared instruction is ready.' : '';
    if (!isStudio) $('[data-private-note]').open = false;
    setText('[data-client-choice]', finishName);
    setText('[data-client-choice-note]', hasChoice ? 'This is the finish carried into the maker folio. The studio still needs to review and release the instruction.' : 'No finish is on the maker brief until Nora’s choice is recorded.');
    setText('[data-history-current]', hasChoice ? `Nora chose ${finishName.toLowerCase()}. The maker folio remains a draft.` : 'The chair’s finish is open for review.');
    setText('[data-folio-finish]', hasChoice ? `Client finish: ${finishName}` : 'Finish awaiting client choice');
    setText('[data-folio-chair-status]', hasChoice ? 'Studio review pending' : 'Held for finish');
    setText('[data-choice-date]', hasChoice ? state.choiceDate || 'Recorded locally' : 'Awaiting Nora');
    setText('[data-choice-sentence]', hasChoice ? `Nora chose ${finishName.toLowerCase()} for the lounge chair. This decision is carried into the draft instruction above.` : 'The lounge chair’s finish has not yet been chosen.');
    setText('[data-release-summary]', hasChoice ? `${finishName} is on the record. The studio must still check the drawing, workshop timing and delivery details before release.` : 'First, Nora’s finish choice. Then the studio checks the drawing, workshop timing and delivery details.');
    $('[data-studio-review]').hidden = !isStudio;
    $('[data-client-release]').hidden = isStudio;
    $$('#review-form input').forEach(input => {
      input.checked = reviewDraft.includes(input.value);
      input.disabled = input.value === 'finish' && !hasChoice;
    });
    const recordUrl = currentUrl('folio');
    recordUrl.hash = 'agreed-record';
    $('[data-record-link]').href = recordUrl.href;
    $('.dock-person').innerHTML = isStudio ? 'Leah <span>Middle West Studio</span>' : 'Nora <span>Client preview</span>';
  }

  function navigate(view, piece = state.piece, options = {}) {
    const changed = view !== state.view || piece !== state.piece;
    state.view = view;
    state.piece = piece;
    if (changed) history.pushState({}, '', currentUrl());
    else history.replaceState({}, '', currentUrl());
    persist();
    render();
    if (changed) {
      const panel = $(`[data-view-panel="${view}"]`);
      panel.classList.remove('is-entering');
      void panel.offsetWidth;
      panel.classList.add('is-entering');
      window.scrollTo({ top: 0, behavior: 'instant' });
      panel.querySelector('h1').focus({ preventScroll: true });
    }
    if (options.record) {
      history.replaceState({}, '', `${currentUrl()}#agreed-record`);
      $('#agreed-record').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    }
  }

  $$('[data-view-link]').forEach(link => link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.dataset.viewLink);
  }));
  $$('[data-piece]').forEach(button => button.addEventListener('click', () => {
    state.piece = button.dataset.piece;
    history.replaceState({}, '', currentUrl());
    persist();
    render();
    announce(`${pieces[state.piece].name} selected. ${$('[data-selected="status"]').textContent}. Open the piece proof for more detail.`);
  }));
  $('[data-open-proof]').addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate('proof');
  });
  $('[data-open-chair]').addEventListener('click', () => navigate('proof', 'chair'));
  $$('[data-role-button]').forEach(button => button.addEventListener('click', () => {
    state.role = button.dataset.roleButton;
    history.replaceState({}, '', currentUrl());
    $('[data-finish-feedback]').textContent = '';
    persist();
    render();
    announce(state.role === 'client' ? 'Client preview. Private studio notes and preferences are hidden.' : 'Studio view. Your preference is separate from the client’s choice.');
  }));
  $$('#finish-form input[name="finish"]').forEach(input => input.addEventListener('change', () => {
    drafts[state.role] = input.value;
    $('[data-finish-feedback]').textContent = '';
  }));
  $('#finish-form').addEventListener('submit', event => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('finish');
    if (!isFinish(value)) return;
    if (state.role === 'studio') {
      state.studioPreference = value;
    } else {
      if (state.clientChoice !== value) {
        state.review = state.review.filter(item => item !== 'finish');
        reviewDraft = reviewDraft.filter(item => item !== 'finish');
        $('[data-review-feedback]').textContent = '';
      }
      state.clientChoice = value;
      state.choiceDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' }).format(new Date());
    }
    drafts[state.role] = value;
    persist();
    render();
    $('[data-finish-feedback]').textContent = state.role === 'studio' ? `${finishes[value]} saved as the studio preference. Nora’s choice is unchanged.` : `${finishes[value]} recorded as Nora’s choice in this sample. The maker folio is still a draft.`;
  });
  $$('#review-form input').forEach(input => input.addEventListener('change', () => {
    reviewDraft = $$('#review-form input:checked').map(checked => checked.value);
    $('[data-review-feedback]').textContent = '';
  }));
  $('#review-form').addEventListener('submit', event => {
    event.preventDefault();
    state.review = new FormData(event.currentTarget).getAll('review').filter(value => value !== 'finish' || state.clientChoice);
    reviewDraft = [...state.review];
    persist();
    $('[data-review-feedback]').textContent = `${state.review.length} of 3 review items saved in this sample. The folio remains a draft; nothing has been released.`;
  });
  $('[data-print-folio]').addEventListener('click', () => window.print());
  $('[data-record-link]').addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate('folio', state.piece, { record: true });
  });
  $('[data-reset]').addEventListener('click', () => {
    state.studioPreference = null;
    state.clientChoice = null;
    state.choiceDate = null;
    state.review = [];
    reviewDraft = [];
    drafts.studio = null;
    drafts.client = null;
    $('[data-finish-feedback]').textContent = '';
    $('[data-review-feedback]').textContent = '';
    persist();
    render();
    announce('The sample decisions and review checklist have been reset.');
  });
  window.addEventListener('popstate', () => {
    const previousView = state.view;
    const previousPiece = state.piece;
    const hash = window.location.hash;
    readUrl();
    history.replaceState({}, '', currentUrl() + hash);
    render();
    persist();
    if (state.view !== previousView) $(`[data-view-panel="${state.view}"] h1`).focus({ preventScroll: true });
    if (state.view !== previousView || state.piece !== previousPiece) announce(`${state.view === 'room' ? 'Room' : state.view === 'proof' ? 'Piece proof' : 'Maker folio'} view.`);
  });
  const initialHash = window.location.hash;
  readUrl(true);
  history.replaceState({}, '', currentUrl() + (state.view === 'folio' && initialHash === '#agreed-record' ? initialHash : ''));
  render();
  if (state.view === 'folio' && initialHash === '#agreed-record') $('#agreed-record').scrollIntoView({ block: 'center' });
})();
