/**
 * US-14 arrival — the host (host.ts): the §3 busy() list (and what is NOT busy), faces from the
 * body's CSS variables, the view minus the MobileBar, and the D4 telemetry shape.
 */
jest.mock('posthog-js', () => ({ __esModule: true, default: { capture: jest.fn() } }));
jest.mock('@/lib/analytics/posthog', () => ({ isAnalyticsEnabled: () => true }));
jest.mock('../mark-arrival', () => ({ markArrival: jest.fn() }));

import posthog from 'posthog-js';
import { createHost } from '../host';
import { markArrival } from '../mark-arrival';

const capture = (posthog as unknown as { capture: jest.Mock }).capture;

const deps = { walkthroughOnScreen: jest.fn(() => false), logOfferPending: jest.fn(() => false) };

function host() {
  return createHost('desk', null, deps);
}

afterEach(() => {
  document.body.innerHTML = '';
  document.body.removeAttribute('style');
  window.getSelection()?.removeAllRanges();
  deps.walkthroughOnScreen.mockReturnValue(false);
  deps.logOfferPending.mockReturnValue(false);
});

describe('root() / ready()', () => {
  it('finds the route root for its surface and reads its ready mark', () => {
    document.body.innerHTML = '<main data-arrival="document"></main><main data-arrival="desk"></main>';
    const h = host();
    expect(h.root()?.getAttribute('data-arrival')).toBe('desk');
    expect(h.ready()).toBe(false);
    h.root()!.setAttribute('data-arrival-ready', '');
    expect(h.ready()).toBe(true);
  });
});

describe('busy()', () => {
  it('is quiet on a plain page', () => {
    document.body.innerHTML = '<main data-arrival="desk"><p>Nothing is overdue.</p></main>';
    expect(host().busy()).toBe(false);
  });

  it('is busy under a rendered dialog, and not under a hidden one', () => {
    document.body.innerHTML = '<div role="dialog" hidden></div>';
    expect(host().busy()).toBe(false);
    document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    expect(host().busy()).toBe(true);
  });

  it('is busy while an editable target holds focus', () => {
    document.body.innerHTML = '<input type="text" /><input type="checkbox" />';
    (document.querySelector('input[type="checkbox"]') as HTMLElement).focus();
    expect(host().busy()).toBe(false);
    (document.querySelector('input[type="text"]') as HTMLElement).focus();
    expect(host().busy()).toBe(true);
  });

  it('is busy with a shelf open', () => {
    document.body.innerHTML = '<main data-document-paper data-shelf-open="true"></main>';
    expect(host().busy()).toBe(true);
  });

  it('is busy with a dismissible margin note on screen (arbiter line, teaching note, offer)', () => {
    document.body.innerHTML =
      '<aside role="note"><p>Hand this over.</p><button aria-label="Dismiss note">×</button></aside>';
    expect(host().busy()).toBe(true);
  });

  it('is NOT busy for the setup whisper or the since line (no Dismiss)', () => {
    document.body.innerHTML =
      '<aside role="note"><p>Your studio is almost set up.</p><a href="/settings">Finish</a></aside>' +
      '<aside role="note" class="ph-no-capture"><span>Since Tuesday</span></aside>';
    expect(host().busy()).toBe(false);
  });

  it('is NOT busy for the margin panel’s notes (file-change:*, doc-first-touch); an arbiter line is', () => {
    // MarginNote's shape (margin-note.tsx): a direct-child Dismiss button.
    const note = (body: string) =>
      `<aside role="note"><p>${body}</p><button aria-label="Dismiss note">×</button></aside>`;
    document.body.innerHTML =
      '<aside data-margin-panel data-margin-mode="rail">' +
      '<div class="px-4">' +
      note('One client, one paper.') +
      note('Ana changed plan.pdf.') +
      '</div></aside>';
    expect(host().busy()).toBe(false);
    // desk-walkthrough-offer (desk/page.tsx) stands outside the margin panel.
    document.body.insertAdjacentHTML('afterbegin', `<main data-arrival="desk">${note('Want the walk?')}</main>`);
    expect(host().busy()).toBe(true);
  });

  it('is busy while the Accept · begin Undo offer stands, not while its region is empty', () => {
    document.body.innerHTML = '<div role="status" aria-live="polite" class="sr-only"></div>';
    expect(host().busy()).toBe(false);
    document.body.innerHTML =
      '<div role="status" aria-live="polite"><div data-testid="return-to-lead-undo">' +
      '<span>Moved to discovery.</span><button>Undo</button></div></div>';
    expect(host().busy()).toBe(true);
  });

  it('is NOT busy for a dismissible note that is not rendered', () => {
    document.body.innerHTML =
      '<div hidden><aside role="note"><button aria-label="Dismiss note">×</button></aside></div>';
    expect(host().busy()).toBe(false);
  });

  it('is busy while the walkthrough is on screen or a log-time offer is pending', () => {
    deps.walkthroughOnScreen.mockReturnValue(true);
    expect(host().busy()).toBe(true);
    deps.walkthroughOnScreen.mockReturnValue(false);
    deps.logOfferPending.mockReturnValue(true);
    expect(host().busy()).toBe(true);
  });

  it('is busy with a live text selection', () => {
    document.body.innerHTML = '<p id="p">Whitfield House</p>';
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('p')!);
    window.getSelection()!.addRange(range);
    expect(host().busy()).toBe(true);
  });
});

describe('faces()', () => {
  it('reads the first family of each body font variable', () => {
    document.body.style.setProperty('--font-heading', "'__Playfair_a1', '__Playfair_Fallback_a1'");
    document.body.style.setProperty('--font-inter', "'__Inter_b2', '__Inter_Fallback_b2'");
    document.body.style.setProperty('--font-mono', "'__DM_Mono_c3'");
    expect(host().faces()).toEqual(["'__Playfair_a1'", "'__Inter_b2'", "'__DM_Mono_c3'"]);
  });

  it('falls back to the literal families', () => {
    expect(host().faces()).toEqual(['"Playfair Display"', 'Inter', '"DM Mono"']);
  });
});

describe('view()', () => {
  it('never touches <body>’s children — the running engine ends on any foreign one', () => {
    document.body.innerHTML = '<main data-arrival="desk"></main>';
    const records: MutationRecord[] = [];
    const ours = (n: Node) => n.nodeType === 1 && (n as Element).hasAttribute('data-arr');
    // The engine's guard (CONTRACT §3): body childList, ignoring [data-arr].
    const guard = new MutationObserver((recs) => records.push(...recs));
    guard.observe(document.body, { childList: true });
    const h = host();
    h.view();
    h.view();
    records.push(...guard.takeRecords());
    guard.disconnect();
    const foreign = records.filter((r) =>
      [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].some((n) => !ours(n)),
    );
    expect(foreign).toHaveLength(0);
  });

  it('is the viewport minus the MobileBar', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 390 });
    document.body.innerHTML = '<nav data-testid="mobile-bar"></nav>';
    const bar = document.querySelector<HTMLElement>('[data-testid="mobile-bar"]')!;
    bar.getBoundingClientRect = () =>
      ({ top: 780, bottom: 844, left: 0, right: 390, width: 390, height: 64 }) as DOMRect;
    expect(host().view()).toEqual({ top: 0, height: 780, width: 390, bottom: 780 });
    bar.hidden = true;
    expect(host().view()).toEqual({ top: 0, height: 844, width: 390, bottom: 844 });
  });
});

describe('telemetry() and markArrival()', () => {
  it('sends arrival_ended with exactly { surface, how, cause? } — cause only on a decline', () => {
    const h = host();
    h.telemetry({ surface: 'desk', how: 'settled' });
    h.telemetry({ surface: 'document', how: 'declined', cause: 'busy' });
    h.telemetry({ surface: 'document', how: 'escape', cause: 'busy' });
    expect(capture.mock.calls).toEqual([
      ['arrival_ended', { surface: 'desk', how: 'settled' }],
      ['arrival_ended', { surface: 'document', how: 'declined', cause: 'busy' }],
      ['arrival_ended', { surface: 'document', how: 'escape' }],
    ]);
  });

  it('marks through the fire-and-forget rpc', () => {
    createHost('document', 'e1', deps).markArrival('document', 'e1');
    expect(markArrival).toHaveBeenCalledWith('document', 'e1');
  });
});
