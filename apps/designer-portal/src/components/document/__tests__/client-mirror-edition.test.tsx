/**
 * US-49 Phase 2 (R3) — the client mirror carries the House Issue at its top:
 * the edition waiting on Approve, named as what the client will see if
 * approved, else the approved edition; nothing before the first. Approve and
 * Undo change it because the mirror reads the band's own edition read.
 */
import { render, screen, within } from '@testing-library/react';
import { ClientMirror } from '../client-mirror';
import { CURRENT_ROW, PENDING_ROW, composition, listEnvelope } from '../__fixtures__/client-editions';

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
}));

jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: false }) }));

const PENDING_WORDS = composition('a-hero', {
  chapters: [{ key: 'room-living', headline: 'The finished room', standing: 'Everything is in.' }],
});

const read = (rows: Record<string, unknown>[]) => {
  mockEditions = normalizeClientEditions(listEnvelope(rows) as never);
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
