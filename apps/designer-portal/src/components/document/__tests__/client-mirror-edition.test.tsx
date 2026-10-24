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
let mockItemsReady = true;

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: string[] }) => queryKey[2] === 'mirror-maker-names'
    ? { data: mockItemsReady ? new Set(['herman miller', 'knoll', 'retired atelier', 'joined maker']) : undefined }
    : ({
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
  useProjectV2: () => ({ data: { name: 'Ridgeline' } }),
  useProjectPalettes: () => ({ data: [] }),
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

  it('waits for project maker names before projecting an OFF edition', () => {
    read([CURRENT_ROW], false);
    mockItemsReady = false;
    const { rerender } = renderMirror();
    expect(mirrorEdition()).toBeNull();
    mockItemsReady = true;
    rerender(<ClientMirror projectId="p-1" clientName="June" onClose={() => {}} />);
    expect(mirrorEdition()).toHaveAttribute('data-mirror-edition', '4');
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

  /*
   * F4 — the reader credits by its frozen attribution kind, which can differ
   * from the request kind the list's address came from (deduplicated bytes
   * first captioned as a maker picture, later also referenced by a scan).
   */
  it('masks by attributionKind, not the source kind (F4)', () => {
    const shared = { ...scanHero, attributionKind: 'maker', captionWhose: 'Herman Miller' };
    read([approvedOn(shared, 'Atelier Nord')], false);
    renderMirror();
    expect(caption()).toContain('Birchwood Studio');
    expect(caption()).not.toContain('Atelier Nord');
  });

  it('falls back to the source kind only when a list carries no attributionKind (F4)', () => {
    const legacy: Record<string, unknown> = { ...makerHero };
    delete legacy.attributionKind;
    read([approvedOn(legacy, 'Atelier Nord')], false);
    renderMirror();
    expect(caption()).toContain('Birchwood Studio');
    expect(caption()).not.toContain('Atelier Nord');
  });
});

/*
 * F3 — the cover's accessible name follows the caption shown, as 00846
 * rebuilds maker-bearing and item-picture alts only (seq 53); neutral
 * non-maker descriptions stay byte-for-byte. Makers ON keeps the stored alt.
 */
describe('the mirror cover’s alt follows the caption the reader shows (F3)', () => {
  afterEach(() => {
    mockEditions = undefined;
  });

  const hero = (over: Record<string, unknown>) =>
    imageRow('a-old', { plateRole: 'hero', rank: 0, chapterKey: 'cover', ...over });
  const approvedOn = (image: Record<string, unknown>, whose?: string) => ({
    ...CURRENT_ROW,
    composition: composition('a-old'),
    overrides: whose ? { captions: { 'a-old': { whose } } } : {},
    images: [image],
  });
  const waitingOn = (image: Record<string, unknown>, whose?: string) => ({
    ...PENDING_ROW,
    composition: composition('a-old'),
    overrides: whose ? { captions: { 'a-old': { whose } } } : {},
    images: [image],
  });
  const makerPhoto = hero({ sourceKind: 'maker', captionWhose: 'Herman Miller', alt: 'Chair · Herman Miller · product photograph' });
  const scanPhoto = hero({ sourceKind: 'scan', alt: 'What a-old · Birchwood Studio · room scan' });

  it.each([
    ['approved', approvedOn, 'Edition 4'],
    ['waiting', waitingOn, 'What June will see if approved'],
  ] as const)('%s: makers off, a maker photograph is named for the studio, never the maker', (_state, on, region) => {
    read(on === waitingOn ? [on(makerPhoto), CURRENT_ROW] : [on(makerPhoto)], false);
    renderMirror();
    const section = screen.getByRole('region', { name: region });
    expect(
      within(section).getByRole('img', { name: 'What a-old · Birchwood Studio · product photograph' }),
    ).toBeInTheDocument();
    expect(within(section).queryByRole('img', { name: /Herman Miller/ })).toBeNull();
  });

  it.each([
    ['approved', approvedOn, 'Edition 4'],
    ['waiting', waitingOn, 'What June will see if approved'],
  ] as const)('%s: makers off, a neutral non-maker alt survives a credit override', (_state, on, region) => {
    read(on === waitingOn ? [on(scanPhoto, 'Atelier Nord'), CURRENT_ROW] : [on(scanPhoto, 'Atelier Nord')], false);
    renderMirror();
    const section = screen.getByRole('region', { name: region });
    expect(within(section).getByRole('img', { name: 'What a-old · Birchwood Studio · room scan' })).toBeInTheDocument();
  });

  it.each([
    ['approved', approvedOn, 'Edition 4'],
    ['waiting', waitingOn, 'What June will see if approved'],
  ] as const)('%s: makers off, an override cannot put a maker in the alt', (_state, on, region) => {
    read(on === waitingOn ? [on(makerPhoto, 'Atelier Nord'), CURRENT_ROW] : [on(makerPhoto, 'Atelier Nord')], false);
    renderMirror();
    const section = screen.getByRole('region', { name: region });
    expect(
      within(section).getByRole('img', { name: 'What a-old · Birchwood Studio · product photograph' }),
    ).toBeInTheDocument();
    expect(within(section).queryByRole('img', { name: /Atelier Nord/ })).toBeNull();
  });

  it('makers showing, the cover keeps the edition’s own alt', () => {
    read([approvedOn(makerPhoto, 'Atelier Nord')], true);
    renderMirror();
    expect(screen.getByRole('img', { name: 'Chair · Herman Miller · product photograph' })).toBeInTheDocument();
  });
});


describe.each([
  ['approved', CURRENT_ROW, 'Edition 4'],
  ['waiting', PENDING_ROW, 'What June will see if approved'],
] as const)('SQ-1662 content policy: %s', (_state, row, region) => {
  const show = (fields: Record<string, unknown>, override = {}, makers = false) => {
    read([{
      ...row,
      composition: composition('a-old'),
      overrides: { captions: { 'a-old': override } },
      images: [imageRow('a-old', {
        plateRole: 'hero', rank: 0, chapterKey: 'cover', sourceKind: 'scan',
        captionWhat: 'Chair', captionWhose: 'Birchwood Studio', ...fields,
      })],
    }], makers);
    renderMirror();
    return screen.getByRole('region', { name: region });
  };

  it.each(['Retired Atelier', 'Joined Maker'])('masks the %s name from captions and alt while makers are off', (maker) => {
    const section = show(
      { captionWhat: `${maker} chair`, captionWhen: `${maker} in October`, alt: `${maker} chair` },
      { whose: maker },
    );
    expect(section.querySelector('figcaption')).toHaveTextContent('chair · Birchwood Studio');
    expect(section.querySelector('figcaption')?.textContent).not.toContain(maker);
    expect(within(section).getByRole('img')).toHaveAttribute('alt', 'chair · Birchwood Studio · room scan');
  });

  it.each(['Retired Atelier', 'Joined Maker'])('keeps the %s name unchanged while makers show', (maker) => {
    const section = show({ captionWhat: `${maker} chair`, alt: `${maker} chair` }, { whose: maker }, true);
    expect(section.querySelector('figcaption')).toHaveTextContent(`${maker} chair · ${maker} · October`);
    expect(within(section).getByRole('img')).toHaveAttribute('alt', `${maker} chair`);
  });

  it('strips maker-bearing what before rebuilding a product alt', () => {
    const section = show({ sourceKind: 'maker', captionWhat: 'Herman Miller chair', alt: 'Herman Miller chair' });
    expect(section.querySelector('figcaption')).toHaveTextContent('chair · Birchwood Studio · October');
    expect(within(section).getByRole('img')).toHaveAttribute('alt', 'chair · Birchwood Studio · product photograph');
    expect(section.textContent).not.toContain('Herman Miller');
  });

  it('masks a maker-naming whose override and alt on a scan', () => {
    const section = show({ alt: 'Chair · Herman Miller · room scan' }, { whose: 'Herman Miller' });
    expect(section.querySelector('figcaption')).toHaveTextContent('Chair · Birchwood Studio · October');
    expect(within(section).getByRole('img')).toHaveAttribute('alt', 'Chair · Birchwood Studio · room scan');
  });

  it.each(['caption', 'override'] as const)('masks a maker-bearing %s when to a renderable null', (source) => {
    const section = show(
      { captionWhen: source === 'caption' ? 'Knoll in October' : 'October', alt: 'A chair by the stair' },
      source === 'override' ? { when: 'Knoll in October' } : {},
    );
    expect(section.querySelector('figcaption')?.textContent).toBe('Chair · Birchwood Studio');
    expect(within(section).getByRole('img')).toHaveAttribute('alt', 'A chair by the stair');
  });

  it('preserves a neutral scan alt byte-for-byte', () => {
    const alt = '  Morning light along the restored oak stair  ';
    const section = show({ alt });
    expect(within(section).getByRole('img')).toHaveAttribute('alt', alt);
  });

  it('makers ON leaves all caption fields and alt unchanged', () => {
    const section = show({ captionWhat: 'Herman Miller chair', alt: 'Herman Miller at home' },
      { whose: 'Herman Miller', when: 'Knoll in October' }, true);
    expect(section.querySelector('figcaption')?.textContent).toBe('Herman Miller chair · Herman Miller · Knoll in October');
    expect(within(section).getByRole('img')).toHaveAttribute('alt', 'Herman Miller at home');
  });
});
