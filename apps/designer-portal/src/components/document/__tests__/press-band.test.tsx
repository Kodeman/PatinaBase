/**
 * US-49 Phase 2 — the Press band: three states, Approve with the studio's
 * gathered edits, Hold, Undo behind a confirm in words, the focal drag, the
 * one-line delta, and never a word about how the edition was made.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ClientEdition, ClientEditions } from '@patina/supabase';
import { PressBand, publishedLine } from '../press-band';
import { editionDelta } from '../press-band-preview';

// jsdom has no PointerEvent, so fireEvent.pointer* would drop clientX/clientY;
// a MouseEvent subclass carries them as a browser's PointerEvent does.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}

const mockApprove = jest.fn();
const mockHold = jest.fn();
const mockUndo = jest.fn();
const mockSetFocal = jest.fn();
const mockShowMakers = jest.fn();
let mockData: ClientEditions | undefined;

const act = (mutate: jest.Mock) => ({ mutate, reset: jest.fn(), isPending: false, isSuccess: false, error: null });

jest.mock('@patina/supabase', () => ({
  useClientEditions: () => ({ data: mockData }),
  useClientEditionSourceUrls: () => ({
    data: {
      'a-hero': 'https://example.com/hero.jpg',
      'a-room': 'https://example.com/room.jpg',
      'a-old': 'https://example.com/old.jpg',
    },
  }),
  useApproveClientEdition: () => act(mockApprove),
  useHoldClientEdition: () => act(mockHold),
  useUndoClientEdition: () => act(mockUndo),
  useSetPlateFocal: () => act(mockSetFocal),
  useSetProjectShowMakers: () => act(mockShowMakers),
}));

const CHAPTERS = [
  { key: 'living', headline: 'The living room', standing: 'The sofa leaves the workshop on Friday.' },
];

function image(assetId: string, over: Partial<ClientEdition['images'][number]> = {}) {
  return {
    assetId,
    plateRole: 'room',
    cropKey: 'wide',
    rank: 1,
    chapterKey: 'living',
    alt: `Picture ${assetId}`,
    captionWhat: `What ${assetId}`,
    captionWhose: 'Birchwood Studio',
    captionWhen: 'October',
    sourceKind: 'upload' as const,
    sourceUrl: `${assetId}.jpg`,
    width: 2000,
    height: 1250,
    focal: null,
    subjectBox: null,
    focalOrigin: null,
    ...over,
  };
}

function edition(over: Partial<ClientEdition>): ClientEdition {
  return {
    id: 'e',
    seq: 1,
    status: 'approved',
    kind: 'full',
    autoPublished: false,
    held: false,
    approvedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    createdAt: '2026-10-21T12:00:00Z',
    supersededAt: null,
    frozenAt: null,
    composition: {
      chapters: CHAPTERS,
      doorstep: { standing: 'Nothing waits on you this week.' },
      notice: 'Maren has a new issue for you.',
    },
    overrides: {},
    images: [],
    ...over,
  };
}

const PENDING = edition({
  id: 'e-5',
  seq: 5,
  status: 'awaiting_review',
  composition: {
    hero: { assetId: 'a-hero' },
    chapters: CHAPTERS,
    doorstep: { standing: 'Nothing waits on you this week.' },
    notice: 'Maren has a new issue for you.',
    candidates: ['a-hero', 'a-room', 'a-concept'],
  },
  images: [
    image('a-hero', { plateRole: 'hero', focal: [0.5, 0.45] }),
    image('a-room', { sourceKind: 'scan' }),
    image('a-concept', { sourceKind: 'concept' }),
  ],
});

const CURRENT = edition({
  id: 'e-4',
  seq: 4,
  status: 'approved',
  approvedAt: '2026-10-21T12:00:00Z',
  reviewedBy: { id: 'u-maren', name: 'Maren Holt' },
  composition: { ...PENDING.composition, hero: { assetId: 'a-old' }, candidates: null },
  images: [image('a-old', { plateRole: 'hero' }), image('a-room', { sourceKind: 'scan' })],
});

const EARLIER = edition({
  id: 'e-3',
  seq: 3,
  status: 'superseded',
  kind: 'plates_only',
  autoPublished: true,
  approvedAt: '2026-10-20T12:00:00Z',
});

function renderBand(editions: ClientEdition[], clientFirstName: string | null = 'June') {
  mockData = { showMakers: false, editions };
  return render(<PressBand projectId="p-1" clientFirstName={clientFirstName} />);
}

const FORBIDDEN = /\bAI\b|generated/i;

function allWords(root: HTMLElement): string {
  const labels = [...root.querySelectorAll('[aria-label], [alt]')].map(
    (el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('alt') ?? ''}`,
  );
  return `${root.textContent} ${labels.join(' ')}`;
}

beforeEach(() => {
  mockData = undefined;
});

describe('PressBand — the three states', () => {
  it('says a new edition is ready, with its preview, when one waits for review', () => {
    renderBand([PENDING, CURRENT, EARLIER]);
    expect(screen.getByRole('heading', { name: 'A new edition is ready' })).toBeInTheDocument();
    expect(screen.getByText(/Approve puts it on June’s page\. Hold keeps edition 4 there\./)).toBeInTheDocument();
    const chapters = screen.getByRole('list', { name: 'Chapters' });
    expect(within(chapters).getByText('The living room')).toBeInTheDocument();
    expect(within(chapters).getByText('The sofa leaves the workshop on Friday.')).toBeInTheDocument();
    expect(screen.getByText('Nothing waits on you this week.')).toBeInTheDocument();
    expect(screen.getByText('Maren has a new issue for you.')).toBeInTheDocument();
    // The cover is the hero's SOURCE picture, never the client page's plate route.
    const cover = screen.getByRole('img', { name: 'Picture a-hero' });
    expect(cover).toHaveAttribute('src', expect.stringContaining('https://example.com/hero.jpg'));
    expect(cover.getAttribute('src')).not.toMatch(/\/plates\//);
  });

  it('names the edition the client sees when nothing waits', () => {
    renderBand([CURRENT, EARLIER]);
    expect(screen.getByRole('heading', { name: 'Edition 4 is what June sees' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('falls back to "the client" when no first name is known', () => {
    renderBand([CURRENT], null);
    expect(screen.getByRole('heading', { name: 'Edition 4 is what the client sees' })).toBeInTheDocument();
  });

  it('says the cover is a drawing, with one link to the item pictures, when nothing exists', () => {
    renderBand([]);
    expect(
      screen.getByRole('heading', { name: 'The cover is a drawing until a photograph arrives' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a photograph for the cover' })).toHaveAttribute(
      'href',
      '#doc-section-project',
    );
    expect(screen.queryByRole('list', { name: 'Published editions' })).toBeNull();
  });

  it('renders nothing until the editions are read', () => {
    mockData = undefined;
    const { container } = render(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PressBand — acts', () => {
  it('Approve sends the edits gathered in Edit as overrides', () => {
    renderBand([PENDING, CURRENT]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    // The concept render is never offered for the cover (R142).
    expect(screen.queryByRole('button', { name: 'What a-concept' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'What a-room' }));
    expect(screen.getByRole('button', { name: 'What a-room' })).toHaveAttribute('aria-pressed', 'true');

    const headline = screen.getByLabelText('Headline');
    expect(headline).toHaveAttribute('maxLength', '60');
    fireEvent.change(headline, { target: { value: 'The long room' } });
    expect(screen.getByText('13/60')).toBeInTheDocument();
    expect(screen.getByLabelText('Standing sentence')).toHaveAttribute('maxLength', '160');

    fireEvent.change(screen.getAllByLabelText('Whose')[0], { target: { value: 'Her piece' } });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockApprove.mock.calls[0][0]).toEqual({
      projectId: 'p-1',
      editionId: 'e-5',
      overrides: {
        heroAssetId: 'a-room',
        chapters: { living: { headline: 'The long room' } },
        captions: { 'a-hero': { whose: 'Her piece' } },
      },
    });
  });

  it('Approve with no edits sends empty overrides', () => {
    renderBand([PENDING]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove.mock.calls[0][0]).toEqual({ projectId: 'p-1', editionId: 'e-5', overrides: {} });
  });

  it('Hold holds the waiting edition', () => {
    renderBand([PENDING, CURRENT]);
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    expect(mockHold).toHaveBeenCalledWith({ projectId: 'p-1', editionId: 'e-5' });
  });

  it('a held edition says so and offers no second Hold', () => {
    renderBand([{ ...PENDING, held: true }, CURRENT]);
    expect(screen.getByText('Held. Edition 4 stays on June’s page.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold' })).toBeNull();
  });

  it('the show-makers switch saves on its own', () => {
    renderBand([PENDING]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Name the makers on June’s page' }));
    expect(mockShowMakers).toHaveBeenCalledWith({ projectId: 'p-1', show: true });
  });
});

describe('PressBand — published editions and Undo', () => {
  it('lists every published edition newest first, studio-approved and plates-only', () => {
    renderBand([PENDING, CURRENT, EARLIER]);
    const rows = within(screen.getByRole('list', { name: 'Published editions' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Edition 4 · approved by Maren · 21 OctoberUndo',
      'Edition 3 · plates only · published 20 October',
    ]);
    expect(publishedLine(EARLIER)).toBe('Edition 3 · plates only · published 20 October');
  });

  it('Undo asks in words, then takes the edition back', () => {
    renderBand([CURRENT, EARLIER]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('June will see edition 3 again.')).toBeInTheDocument();
    expect(mockUndo).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(mockUndo).toHaveBeenCalledWith({ projectId: 'p-1', editionId: 'e-4' });
  });

  it('Keep closes the confirm without taking anything back', () => {
    renderBand([CURRENT, EARLIER]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep edition 4' }));
    expect(mockUndo).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a closed (frozen) edition shows Closed and no Undo', () => {
    renderBand([{ ...CURRENT, frozenAt: '2026-10-22T12:00:00Z' }, EARLIER]);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('PressBand — focal drag', () => {
  it('a drag release then "Use this crop" saves a focal point inside 0–1', () => {
    renderBand([PENDING]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const frame = document.querySelector('[data-focal-frame="wide"]') as HTMLElement;
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 250, right: 400, bottom: 250, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

    const useCrop = screen.getByRole('button', { name: 'Use this crop' });
    expect(useCrop).toBeDisabled();
    fireEvent.pointerDown(frame, { clientX: 300, clientY: 50, pointerId: 1 });
    // Dragged past the frame's edge: the point stops at the edge of the picture.
    fireEvent.pointerMove(frame, { clientX: 900, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(frame, { clientX: 900, clientY: 50, pointerId: 1 });

    // Both frames' handles name the same point.
    expect(screen.getAllByRole('button', { name: /^Focal point at 100 across, 20 down/ })).toHaveLength(2);

    fireEvent.click(useCrop);
    expect(mockSetFocal).toHaveBeenCalledTimes(1);
    const { projectId, assetId, subjectBox, focal } = mockSetFocal.mock.calls[0][0];
    expect({ projectId, assetId }).toEqual({ projectId: 'p-1', assetId: 'a-hero' });
    expect(subjectBox).toEqual([0, 0, 1, 1]);
    expect(focal).toHaveLength(2);
    for (const n of [...focal, ...subjectBox]) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
    expect(focal[0]).toBeCloseTo(1);
    expect(focal[1]).toBeCloseTo(0.2);
  });

  it('keeps the point inside the subject box', () => {
    const boxed = {
      ...PENDING,
      images: [image('a-hero', { plateRole: 'hero', subjectBox: [0.2, 0.2, 0.5, 0.5], focal: [0.4, 0.4] })],
    };
    renderBand([boxed]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const frame = document.querySelector('[data-focal-frame="wide"]') as HTMLElement;
    frame.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 250, right: 400, bottom: 250, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    fireEvent.pointerDown(frame, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Use this crop' }));
    const { subjectBox, focal } = mockSetFocal.mock.calls[0][0];
    expect(subjectBox).toEqual([0.2, 0.2, 0.5, 0.5]);
    expect(focal).toEqual([0.2, 0.2]);
  });
});

describe('PressBand — the delta line', () => {
  it('says what moved against the edition the client sees, in one line', () => {
    renderBand([PENDING, CURRENT]);
    expect(screen.getByText('Hero changed · 2 captions changed · words unchanged')).toBeInTheDocument();
  });

  it('counts edits laid over the edition', () => {
    expect(editionDelta(CURRENT, CURRENT)).toBe('Hero unchanged · captions unchanged · words unchanged');
    expect(
      editionDelta(CURRENT, CURRENT, {
        chapters: { living: { headline: 'The long room' } },
        captions: { 'a-room': { when: 'November' } },
      }),
    ).toBe('Hero unchanged · 1 caption changed · words changed');
    expect(editionDelta(PENDING, null)).toBe('The first edition');
  });
});

describe('PressBand — voice', () => {
  it('never says how an edition was made', () => {
    for (const editions of [[PENDING, CURRENT, EARLIER], [CURRENT, EARLIER], []]) {
      const { container, unmount } = renderBand(editions);
      const edit = screen.queryByRole('button', { name: 'Edit' });
      if (edit) fireEvent.click(edit);
      expect(allWords(container)).not.toMatch(FORBIDDEN);
      unmount();
    }
    renderBand([CURRENT, EARLIER]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(allWords(screen.getByRole('alertdialog'))).not.toMatch(FORBIDDEN);
  });
});
