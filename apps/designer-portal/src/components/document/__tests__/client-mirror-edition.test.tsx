/**
 * US-49 Phase 2 (R3) — the client mirror carries the House Issue at its top:
 * the edition waiting on Approve, named as what the client will see if
 * approved, else the approved edition; nothing before the first. Approve and
 * Undo change it because the mirror reads the band's own edition read.
 */
import { render, screen, within } from '@testing-library/react';
import { ClientMirror } from '../client-mirror';
import {
  CURRENT_ROW,
  PENDING_ROW,
  composition,
  imageRow,
  listEnvelope,
} from '../__fixtures__/client-editions';

const { normalizeClientEditions } = jest.requireActual<typeof import('@patina/supabase')>('@patina/supabase');

let mockEditions: unknown;

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      project: { name: 'Ridgeline', status: 'active', client_id: 'client-1' },
      decisions: [],
      files: [],
      milestones: [],
      messages: [],
      studioMessages: [],
      clientMessages: [],
    },
  }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({}),
  useClientEditions: () => ({ data: mockEditions }),
  useClientEditionSourceUrls: () => ({
    data: { 'a-hero': 'https://example.com/hero.jpg', 'a-old': 'https://example.com/old.jpg' },
  }),
  // resolve_studio_identity for the job: the studio the homeowner reader names.
  useStudioIdentity: () => ({ data: { name: 'Birchwood Studio' } }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false }) }));

const PENDING_WORDS = composition('a-hero', {
  chapters: [{ key: 'room-living', headline: 'The finished room', standing: 'Everything is in.' }],
});

const read = (rows: Record<string, unknown>[], showMakers = false) => {
  mockEditions = normalizeClientEditions(listEnvelope(rows, showMakers) as never);
};

const renderMirror = () =>
  render(<ClientMirror projectId="p-1" clientName="June" onClose={() => {}} />);

const mirrorEdition = () => document.querySelector('[data-mirror-edition]') as HTMLElement | null;

describe('the client mirror shows the House Issue (R3)', () => {
  afterEach(() => {
    mockEditions = undefined;
  });

  it('shows nothing about editions before the first', () => {
    read([]);
    renderMirror();
    expect(mirrorEdition()).toBeNull();
  });

  it('a waiting edition is shown as what the client will see if approved', () => {
    read([{ ...PENDING_ROW, composition: PENDING_WORDS }, CURRENT_ROW]);
    renderMirror();
    const section = screen.getByRole('region', { name: 'What June will see if approved' });
    expect(within(section).getByText('The finished room')).toBeInTheDocument();
    expect(within(section).queryByText('The living room')).toBeNull();
    // The client's view: no studio delta line.
    expect(section.querySelector('[data-press-delta]')).toBeNull();
    // It stands at the top of the mirror, before the project's own copy.
    const heading = screen.getByRole('heading', { name: 'Ridgeline' });
    expect(section.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('after Approve it is the approved edition; after Undo the one before again', () => {
    read([{ ...PENDING_ROW, composition: PENDING_WORDS }, CURRENT_ROW]);
    const { rerender } = renderMirror();
    expect(mirrorEdition()).toHaveAttribute('data-mirror-edition', '5');

    // Approve: #5 approved, #4 superseded by it.
    read([
      { ...PENDING_ROW, composition: PENDING_WORDS, status: 'approved', approvedAt: '2026-10-22T09:00:00+00:00' },
      { ...CURRENT_ROW, status: 'superseded', supersededBy: 'e-5' },
    ]);
    rerender(<ClientMirror projectId="p-1" clientName="June" onClose={() => {}} />);
    const approved = screen.getByRole('region', { name: 'Edition 5' });
    expect(within(approved).getByText('The finished room')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What June will see if approved' })).toBeNull();

    // Undo: #5 taken back, #4 restored.
    read([
      { ...PENDING_ROW, composition: PENDING_WORDS, status: 'superseded', approvedAt: '2026-10-22T09:00:00+00:00' },
      CURRENT_ROW,
    ]);
    rerender(<ClientMirror projectId="p-1" clientName="June" onClose={() => {}} />);
    const restored = screen.getByRole('region', { name: 'Edition 4' });
    expect(within(restored).getByText('The living room')).toBeInTheDocument();
    expect(within(restored).queryByText('The finished room')).toBeNull();
  });

  it('a closed job shows its frozen edition, never the waiting one', () => {
    read([{ ...PENDING_ROW, composition: PENDING_WORDS }, { ...CURRENT_ROW, frozenAt: '2026-10-22T12:00:00+00:00' }]);
    renderMirror();
    expect(mirrorEdition()).toHaveAttribute('data-mirror-edition', '4');
  });
});

describe('the mirror credits captions as the homeowner reader does (N2, story seq 48)', () => {
  afterEach(() => {
    mockEditions = undefined;
  });

  /** The approved edition opening on `hero`, with the studio's caption override when given. */
  const approvedOn = (hero: Record<string, unknown>, whose?: string) => ({
    ...CURRENT_ROW,
    composition: composition('a-old'),
    overrides: whose ? { captions: { 'a-old': { whose } } } : {},
    images: [hero],
  });
  const makerHero = imageRow('a-old', {
    plateRole: 'hero',
    rank: 0,
    chapterKey: 'cover',
    sourceKind: 'maker',
    captionWhose: 'Herman Miller',
  });
  const scanHero = imageRow('a-old', {
    plateRole: 'hero',
    rank: 0,
    chapterKey: 'cover',
    sourceKind: 'scan',
    captionWhose: 'Birchwood Studio',
  });
  const caption = () => mirrorEdition()?.querySelector('figcaption')?.textContent ?? '';

  it('a maker picture names the studio while makers are off, the maker while they show', () => {
    read([approvedOn(makerHero)], false);
    const { unmount } = renderMirror();
    expect(caption()).toContain('Birchwood Studio');
    expect(caption()).not.toContain('Herman Miller');
    unmount();

    read([approvedOn(makerHero)], true);
    renderMirror();
    expect(caption()).toContain('Herman Miller');
  });

  it('the waiting edition is credited the same way', () => {
    read([{ ...PENDING_ROW, composition: composition('a-old'), images: [makerHero] }, CURRENT_ROW], false);
    renderMirror();
    const section = screen.getByRole('region', { name: 'What June will see if approved' });
    expect(section.querySelector('figcaption')?.textContent).toContain('Birchwood Studio');
    expect(section.querySelector('figcaption')?.textContent).not.toContain('Herman Miller');
  });

  it('an override cannot bring a maker credit back while makers are off; it wins while they show', () => {
    read([approvedOn(makerHero, 'Atelier Nord')], false);
    const { unmount } = renderMirror();
    expect(caption()).toContain('Birchwood Studio');
    expect(caption()).not.toContain('Atelier Nord');
    unmount();

    read([approvedOn(makerHero, 'Atelier Nord')], true);
    renderMirror();
    expect(caption()).toContain('Atelier Nord');
    expect(caption()).not.toContain('Herman Miller');
  });

  it('a non-maker picture keeps its override whether makers show or not', () => {
    read([approvedOn(scanHero, 'Atelier Nord')], false);
    const { unmount } = renderMirror();
    expect(caption()).toContain('Atelier Nord');
    unmount();

    read([approvedOn(scanHero, 'Atelier Nord')], true);
    renderMirror();
    expect(caption()).toContain('Atelier Nord');
  });
});
