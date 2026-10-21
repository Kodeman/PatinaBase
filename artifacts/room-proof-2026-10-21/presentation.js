(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const previews = {
    room: { kicker: 'Begin with the room', title: 'The image becomes navigation.', description: 'Four numbered references connect the room to its furnishings. Select the chair or use the text index; the working margin responds to the same object.', action: 'Explore Room', try: 'Try selecting a different furnishing, then open the chair’s proof.', alt: 'Room view with an annotated room illustration and object-linked working margin' },
    proof: { kicker: 'Bring the piece forward', title: 'A material decision has a setting.', description: 'The furnishing and its finishes take the larger stage. A room reference stays in the document, with the studio preference and client choice kept distinct.', action: 'Explore Piece proof', try: 'Compare the chair finishes. Switch to Client preview to record a sample choice.', alt: 'Piece proof view with the oak lounge chair, finish choices, and a small room context image' },
    folio: { kicker: 'Carry the agreement forward', title: 'The same piece becomes an instruction.', description: 'A numbered specification connects each object to its materials and decision record. The chair’s client choice appears here while the maker release remains a studio-reviewed draft.', action: 'Explore Maker folio', try: 'Read the chair’s finish in the folio after recording a sample choice in the proof.', alt: 'Maker folio view: an indexed specification with object details and an unreleased workshop brief' }
  };
  function preview(view) {
    const p = previews[view];
    if (!p) return;
    document.querySelectorAll('[data-preview]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preview === view)));
    $('#view-image').src = `assets/${view}-preview.jpg`;
    $('#view-image').alt = p.alt;
    $('#view-link').href = `prototype.html?view=${view}&piece=chair&role=studio`;
    $('#view-link').setAttribute('aria-label', p.action);
    $('#view-open').href = `prototype.html?view=${view}&piece=chair&role=studio`;
    $('#view-open').replaceChildren(document.createTextNode(p.action + ' '));
    const arrow = document.createElement('span'); arrow.setAttribute('aria-hidden', 'true'); arrow.textContent = '↗'; $('#view-open').append(arrow);
    $('#view-kicker').textContent = p.kicker;
    $('#view-title').textContent = p.title;
    $('#view-description').textContent = p.description;
    $('#view-try').textContent = p.try;
  }
  document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => preview(button.dataset.preview)));
  const form = $('#review-form'), status = $('#save-message'), key = 'patina-room-proof-founder-review-v1';
  const values = () => { const data = new FormData(form); return { direction: String(data.get('direction') || ''), notes: String(data.get('notes') || '') }; };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && typeof saved === 'object') {
      for (const radio of form.elements.direction) radio.checked = radio.value === saved.direction;
      if (typeof saved.notes === 'string') form.elements.notes.value = saved.notes;
      if (saved.direction || saved.notes) status.textContent = 'Your review has been restored from this browser.';
    }
  } catch { status.textContent = 'Browser storage is unavailable. Download your notes before closing.'; }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', () => {
    try { localStorage.setItem(key, JSON.stringify(values())); status.textContent = 'Saved in this browser. Download your notes to share.'; }
    catch { status.textContent = 'Notes are on this page only. Download before closing.'; }
  });
  $('#download-review').addEventListener('click', () => {
    const v = values();
    const text = ['PATINA — THE ROOM PROOF', 'Founder design review / October 2026', '', `Direction: ${v.direction || 'Not selected'}`, '', 'WHAT SHOULD STAY, AND WHAT NEEDS ANOTHER PASS?', v.notes || 'No notes recorded.', '', 'DISCUSSION', 'Does choosing through the room feel natural?', 'Does the original document’s personality survive?', 'Where would you want a denser view for daily work?'].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'patina-room-proof-review.txt'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Review downloaded. Nothing has been sent.';
  });
  const credits = document.querySelector('.colophon details');
  let creditsWereOpen = false;
  window.addEventListener('beforeprint', () => { creditsWereOpen = credits.open; credits.open = true; });
  window.addEventListener('afterprint', () => { credits.open = creditsWereOpen; });
  $('#print-deck').addEventListener('click', () => window.print());
})();
