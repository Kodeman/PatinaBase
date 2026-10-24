/**
 * US-49 Phase 2 — the Press band: its states, Approve with the studio's
 * gathered edits, Hold, Undo behind a confirm in words, the job's own
 * controls outside any draft, the focal drag, the one-line delta, a closed
 * job, and never a word about how the edition was made. Editions are the
 * SQL's own rows (__fixtures__/client-editions) through the hook's normaliser.
 */
import { act as reactAct, fireEvent, render, screen, within } from '@testing-library/react';
import type { ClientEdition, ClientEditions, ClientEditorialAsset } from '@patina/supabase';
import { PressBand, publishedLine } from '../press-band';
import { editionDelta, PressBandPreview } from '../press-band-preview';
import {
  CURRENT_ROW,
  EARLIER_ROW,
  PENDING_ROW,
  editionRow,
  imageRow,
  listEnvelope,
} from '../__fixtures__/client-editions';
import { FOCUS_FFE_LINE_EVENT, focusFfeLinePending } from '@/lib/document/registry';

const { normalizeClientEditions } = jest.requireActual<typeof import('@patina/supabase')>('@patina/supabase');

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
const mockUseClientEditions = jest.fn();
const mockSourceUrls = jest.fn();
const mockRefetchEditions = jest.fn();
let mockData: ClientEditions | undefined;
let mockEditorial: ClientEditorialAsset[] | undefined;
let mockDeadPictures: { itemId: string; name: string }[] = [];

const act = (mutate: jest.Mock) => ({ mutate, reset: jest.fn(), isPending: false, isSuccess: false, error: null });

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({ data: { name: 'Ridgeline' } }),
  useProjectPalettes: () => ({ data: [] }),
  useProjectDeadPictureLinks: () => ({ data: mockDeadPictures }),
  useClientEditions: (...args: unknown[]) => {
    mockUseClientEditions(...args);
    return { data: mockData, refetch: mockRefetchEditions, isFetching: false };
  },
  useClientEditorialAssets: (_projectId: string, enabled: boolean) => ({
    data: enabled ? mockEditorial : undefined,
  }),
  useClientEditionSourceUrls: (images: unknown) => {
    mockSourceUrls(images);
    return ({
    data: {
      'a-hero': 'https://example.com/hero.jpg',
      'a-room': 'https://example.com/room.jpg',
      'a-old': 'https://example.com/old.jpg',
    },
  });
  },
  useApproveClientEdition: () => act(mockApprove),
  useHoldClientEdition: () => act(mockHold),
  useUndoClientEdition: () => act(mockUndo),
  useSetPlateFocal: () => {
    const React = require('react');
    const [state, setState] = React.useState({ isPending: false, isSuccess: false, error: null });
    return {
      ...state,
      reset: () => setState({ isPending: false, isSuccess: false, error: null }),
      mutate: (input: unknown, options?: { onSuccess?: () => void; onError?: () => void; onSettled?: () => void }) => {
        setState({ isPending: true, isSuccess: false, error: null });
        mockSetFocal(input, {
          onSuccess: () => {
            setState({ isPending: false, isSuccess: true, error: null });
            options?.onSuccess?.();
            options?.onSettled?.();
          },
          onError: () => {
            setState({ isPending: false, isSuccess: false, error: new Error('Crop could not be saved') });
            options?.onError?.();
            options?.onSettled?.();
          },
        });
      },
    };
  },
  useSetProjectShowMakers: () => act(mockShowMakers),
}));

const editions = (rows: Record<string, unknown>[], showMakers = false) =>
  normalizeClientEditions(listEnvelope(rows, showMakers) as never);
const one = (row: Record<string, unknown>): ClientEdition => editions([row]).editions[0];

const PENDING = one(PENDING_ROW);
const CURRENT = one(CURRENT_ROW);

function renderBand(rows: Record<string, unknown>[], clientFirstName: string | null = 'June') {
  mockData = editions(rows);
  return render(<PressBand projectId="p-1" clientFirstName={clientFirstName} />);
}

const FROZEN_CURRENT = { ...CURRENT_ROW, frozenAt: '2026-10-22T12:00:00+00:00' };

const FORBIDDEN = /\bAI\b|generated/i;

function allWords(root: HTMLElement): string {
  const labels = [...root.querySelectorAll('[aria-label], [alt]')].map(
    (el) => `${el.getAttribute('aria-label') ?? ''} ${el.getAttribute('alt') ?? ''}`,
  );
  return `${root.textContent} ${labels.join(' ')}`;
}


const frameRect = (frame: HTMLElement) => {
  frame.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 250, right: 400, bottom: 250, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

beforeEach(() => {
  mockData = undefined;
  mockEditorial = undefined;
  mockDeadPictures = [];
  focusFfeLinePending.request = null;
  jest.clearAllMocks();
  mockRefetchEditions.mockReset();
  mockRefetchEditions.mockResolvedValue({ isSuccess: true });
});

describe('PressBand — the states', () => {
  it('says a new edition is ready, with its preview, when one waits for review', () => {
    renderBand([PENDING_ROW, CURRENT_ROW, EARLIER_ROW]);
    expect(screen.getByRole('heading', { name: 'A new edition is ready' })).toBeInTheDocument();
    expect(screen.getByText(/Approve puts it on June’s page\. Hold keeps edition 4 there\./)).toBeInTheDocument();
    const chapters = screen.getByRole('list', { name: 'Chapters' });
    expect(within(chapters).getByText('The living room')).toBeInTheDocument();
    expect(screen.getByText('The sofa leaves the workshop on Friday.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing waits on you this week.')).toBeNull();
    expect(screen.queryByText('Maren has a new issue for you.')).toBeNull();
    // The cover is the hero's SOURCE picture, never the client page's plate route.
    const cover = screen.getByRole('img', { name: 'Picture a-hero' });
    expect(cover).toHaveAttribute('src', expect.stringContaining('https://example.com/hero.jpg'));
    expect(cover.getAttribute('src')).not.toMatch(/\/plates\//);
  });

  it('withholds stale Undo and preview until Refresh editions supplies the authoritative projection', () => {
    mockData = { ...editions([]), refreshRequired: true };
    const { rerender } = render(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(screen.getByRole('status')).toHaveTextContent('Refresh to see the latest edition.');
    for (const name of ['Approve', 'Hold', 'Edit', 'Undo']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Published editions' })).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByText(/until an edition is approved/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh editions' }));
    expect(mockRefetchEditions).toHaveBeenCalledTimes(1);
    mockData = editions([CURRENT_ROW, EARLIER_ROW]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(screen.queryByRole('button', { name: 'Refresh editions' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Edition 4 is what June sees' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('reads the open job live: every minute and on focus (R2)', () => {
    renderBand([CURRENT_ROW]);
    expect(mockUseClientEditions).toHaveBeenCalledWith('p-1', { live: true });
  });

  it('names the edition the client sees when nothing waits', () => {
    renderBand([CURRENT_ROW, EARLIER_ROW]);
    expect(screen.getByRole('heading', { name: 'Edition 4 is what June sees' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  });

  it('falls back to "the client" when no first name is known', () => {
    renderBand([CURRENT_ROW], null);
    expect(screen.getByRole('heading', { name: 'Edition 4 is what the client sees' })).toBeInTheDocument();
  });

  it('before any edition, says the page shows the editorial cover — no claim about drawings (R11)', () => {
    mockEditorial = [
      { id: 'x-1', sourceKind: 'upload', ground: 'scene', width: 2000, height: 1250, subjectBox: null },
    ];
    renderBand([]);
    expect(
      screen.getByRole('heading', { name: 'June’s page shows the editorial cover until an edition is approved' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/drawing/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add a photograph for the cover' })).toBeNull();
  });

  it('says the cover is a drawing only when the editorial read has no eligible photograph (R11)', () => {
    mockEditorial = [
      // A concept render, a small upload and a white-ground clipping: none may open the page.
      { id: 'x-1', sourceKind: 'concept', ground: 'scene', width: 3000, height: 2000, subjectBox: null },
      { id: 'x-2', sourceKind: 'upload', ground: 'scene', width: 900, height: 600, subjectBox: null },
      { id: 'x-3', sourceKind: 'maker', ground: 'white', width: 3000, height: 2000, subjectBox: null },
    ];
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

  it('a draft that never reached review is still "no edition yet" (R11)', () => {
    mockEditorial = undefined; // the editorial read is still out
    renderBand([editionRow({ id: 'e-1', seq: 1, status: 'drafting' })]);
    expect(
      screen.getByRole('heading', { name: 'June’s page shows the editorial cover until an edition is approved' }),
    ).toBeInTheDocument();
  });

  it('renders nothing until the editions are read', () => {
    mockData = undefined;
    const { container } = render(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('PressBand — acts on the waiting edition', () => {
  it('Approve sends the edits gathered in Edit as overrides', () => {
    renderBand([PENDING_ROW, CURRENT_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const tray = document.querySelector('[data-press-edit]') as HTMLElement;

    // The concept render is never offered for the cover (R142).
    expect(within(tray).queryByRole('button', { name: 'What a-concept' })).toBeNull();
    fireEvent.click(within(tray).getByRole('button', { name: 'What a-room' }));
    expect(within(tray).getByRole('button', { name: 'What a-room' })).toHaveAttribute('aria-pressed', 'true');

    const headline = within(tray).getByLabelText('Headline');
    expect(headline).toHaveAttribute('maxLength', '60');
    fireEvent.change(headline, { target: { value: 'The long room' } });
    expect(within(tray).getByText('13/60')).toBeInTheDocument();
    expect(within(tray).getByLabelText('Standing sentence')).toHaveAttribute('maxLength', '160');

    fireEvent.change(within(tray).getAllByLabelText('Whose')[0], { target: { value: 'Her piece' } });

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove).toHaveBeenCalledTimes(1);
    expect(mockApprove.mock.calls[0][0]).toEqual({
      projectId: 'p-1',
      editionId: 'e-5',
      overrides: {
        heroAssetId: 'a-room',
        chapters: { 'room-living': { headline: 'The long room' } },
        captions: { 'a-hero': { whose: 'Her piece' } },
      },
    });
  });

  it('Approve with no edits sends empty overrides', () => {
    renderBand([PENDING_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove.mock.calls[0][0]).toEqual({ projectId: 'p-1', editionId: 'e-5', overrides: {} });
  });

  it('Hold holds the waiting edition', () => {
    renderBand([PENDING_ROW, CURRENT_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    expect(mockHold).toHaveBeenCalledWith({ projectId: 'p-1', editionId: 'e-5' });
  });

  it('a held edition says so and offers no second Hold', () => {
    renderBand([{ ...PENDING_ROW, held: true }, CURRENT_ROW]);
    expect(screen.getByText('Held. Edition 4 stays on June’s page.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold' })).toBeNull();
  });
});

describe('PressBand — the job’s own controls, outside any draft (R4)', () => {
  it('the show-makers switch is there before any edition, and saves on its own', () => {
    mockEditorial = [];
    renderBand([], 'June');
    fireEvent.click(screen.getByRole('switch', { name: 'Name the makers on June’s page' }));
    expect(mockShowMakers).toHaveBeenCalledWith({ projectId: 'p-1', show: true });
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('with only an approved edition: the switch and the focal point of each of its photographs, no Approve', () => {
    renderBand([CURRENT_ROW]);
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Name the makers on June’s page' })).toBeInTheDocument();
    const job = document.querySelector('[data-press-job]') as HTMLElement;
    expect(within(job).getByRole('button', { name: 'Set the focal point of What a-old' })).toBeInTheDocument();
    expect(within(job).getByRole('button', { name: 'Set the focal point of What a-room' })).toBeInTheDocument();
  });

  it('an auto-published plates-only edition can have its crop corrected too', () => {
    renderBand([{ ...CURRENT_ROW, kind: 'plates_only', autoPublished: true, reviewedBy: null }]);
    const job = document.querySelector('[data-press-job]') as HTMLElement;
    fireEvent.click(within(job).getByRole('button', { name: 'Set the focal point of What a-old' }));
    expect(job.querySelector('[data-focal-frame="wide"]')).not.toBeNull();
  });
});

describe('PressBand — a closed job (R12)', () => {
  it('pending beside a frozen current edition: no Approve, Hold, Edit or asset write', () => {
    renderBand([PENDING_ROW, FROZEN_CURRENT]);
    for (const name of ['Approve', 'Hold', 'Edit', 'Undo']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /^Set the focal point/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'A new edition is ready' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Edition 4 is what June sees' })).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  // 00848 projectClosed: a closed job with no frozen edition takes no act either.
  const renderClosedBand = (rows: Record<string, unknown>[]) => {
    mockData = normalizeClientEditions({ ...listEnvelope(rows), projectClosed: true } as never);
    return render(<PressBand projectId="p-1" clientFirstName="June" />);
  };

  it('closed without a closing draft stays frozen with no actions', () => {
    renderClosedBand([]);
    expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(mockSourceUrls).toHaveBeenLastCalledWith([]);
  });

  it('closed pending closing draft permits only Approve and Hold through existing hooks', () => {
    renderClosedBand([{ ...PENDING_ROW, closing: true }, FROZEN_CURRENT]);
    expect(mockData?.editions[0].closing).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove).toHaveBeenCalledWith(
      { projectId: 'p-1', editionId: PENDING.id, overrides: {} }, expect.any(Object),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hold' }));
    expect(mockHold).toHaveBeenCalledWith({ projectId: 'p-1', editionId: PENDING.id });
    for (const name of ['Edit', 'Undo']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Set the focal point/ })).toBeNull();
    expect(mockSourceUrls).toHaveBeenLastCalledWith(PENDING.images);
  });

  it('closed after closing approval is frozen again', () => {
    renderClosedBand([{ ...FROZEN_CURRENT, closing: true }]);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    for (const name of ['Approve', 'Hold', 'Edit', 'Undo']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(mockSourceUrls).toHaveBeenLastCalledWith([]);
  });

  it('closed with only an edition awaiting review: no Approve, Hold, Edit or job control, nothing published', () => {
    renderClosedBand([PENDING_ROW]);
    for (const name of ['Approve', 'Hold', 'Edit', 'Undo']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /^Set the focal point/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'A new edition is ready' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Published editions' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.queryByText(/until an edition is approved/)).toBeNull();
  });

  it('archived with an approved edition that was never frozen: Closed, no Undo, no job control', () => {
    renderClosedBand([CURRENT_ROW, EARLIER_ROW]);
    expect(screen.getByRole('heading', { name: 'Edition 4 is what June sees' })).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Set the focal point/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });
});

describe('PressBand — published editions and Undo', () => {
  it('lists every published edition newest first, studio-approved and plates-only', () => {
    renderBand([PENDING_ROW, CURRENT_ROW, EARLIER_ROW]);
    const rows = within(screen.getByRole('list', { name: 'Published editions' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Edition 4 · approved by Maren · 21 OctoberUndo',
      'Edition 3 · plates only · published 20 October',
    ]);
    expect(publishedLine(one(EARLIER_ROW))).toBe('Edition 3 · plates only · published 20 October');
  });

  it('a superseded draft that was never approved is not published, and Undo promises the last APPROVED edition (R5)', () => {
    const five = editionRow({
      id: 'e-5',
      seq: 5,
      status: 'approved',
      approvedAt: '2026-10-22T09:00:00+00:00',
      reviewedBy: { id: 'u-maren', name: 'Maren Holt' },
    });
    // Begin superseded #4 while it waited; it never reached the client.
    const four = editionRow({ id: 'e-4', seq: 4, status: 'superseded', supersededBy: 'e-5' });
    const three = editionRow({
      id: 'e-3',
      seq: 3,
      status: 'superseded',
      approvedAt: '2026-10-20T09:00:00+00:00',
      reviewedBy: { id: 'u-maren', name: 'Maren Holt' },
      supersededBy: 'e-5',
    });
    renderBand([five, four, three]);
    const rows = within(screen.getByRole('list', { name: 'Published editions' })).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-published-edition'))).toEqual(['5', '3']);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(within(screen.getByRole('alertdialog')).getByText('June will see edition 3 again.')).toBeInTheDocument();
  });

  it('Undo asks in words, then takes the edition back', () => {
    renderBand([CURRENT_ROW, EARLIER_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('June will see edition 3 again.')).toBeInTheDocument();
    expect(mockUndo).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo' }));
    expect(mockUndo).toHaveBeenCalledWith({ projectId: 'p-1', editionId: 'e-4' });
  });

  it('with nothing it superseded, Undo says the page goes back to before the edition', () => {
    renderBand([CURRENT_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      within(screen.getByRole('alertdialog')).getByText('June will see the page as it was before edition 4.'),
    ).toBeInTheDocument();
  });

  it('Keep closes the confirm without taking anything back', () => {
    renderBand([CURRENT_ROW, EARLIER_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep edition 4' }));
    expect(mockUndo).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('a closed (frozen) edition shows Closed and no Undo', () => {
    renderBand([FROZEN_CURRENT, EARLIER_ROW]);
    expect(screen.getByText('Closed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});

describe('PressBand — focal point', () => {
  const openHeroFocal = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const tray = document.querySelector('[data-press-edit]') as HTMLElement;
    fireEvent.click(within(tray).getByRole('button', { name: 'Set the focal point of What a-hero' }));
    return tray;
  };

  it('frames appear only while the focal editor is open (R10)', () => {
    renderBand([PENDING_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(document.querySelector('[data-focal-frame]')).toBeNull();
    const open = screen.getByRole('button', { name: 'Set the focal point of What a-hero' });
    expect(open).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(open);
    expect(open).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelectorAll('[data-focal-frame]')).toHaveLength(2);
    fireEvent.click(open);
    expect(document.querySelector('[data-focal-frame]')).toBeNull();
  });

  it('an unboxed photograph saves its focal point with NO subject box (R1)', () => {
    renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    const frame = tray.querySelector('[data-focal-frame="wide"]') as HTMLElement;
    frameRect(frame);

    const useCrop = within(tray).getByRole('button', { name: 'Use this crop' });
    expect(useCrop).toBeDisabled();
    fireEvent.pointerDown(frame, { clientX: 300, clientY: 50, pointerId: 1 });
    // Dragged past the frame's edge: the point stops at the edge of the picture.
    fireEvent.pointerMove(frame, { clientX: 900, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(frame, { clientX: 900, clientY: 50, pointerId: 1 });

    // Both frames' handles name the same point.
    expect(within(tray).getAllByRole('button', { name: /^Focal point at 100 across, 19 down/ })).toHaveLength(2);

    fireEvent.click(useCrop);
    expect(mockSetFocal).toHaveBeenCalledTimes(1);
    const { projectId, assetId, subjectBox, focal } = mockSetFocal.mock.calls[0][0];
    expect({ projectId, assetId }).toEqual({ projectId: 'p-1', assetId: 'a-hero' });
    expect(subjectBox).toBeNull();
    expect(focal[0]).toBeCloseTo(1);
    expect(focal[1]).toBeCloseTo(0.2 * (2000 / 1250) / (1440 / 852));
  });

  it('keeps the point inside the subject box, and saves that box', () => {
    const boxed = {
      ...PENDING_ROW,
      images: [
        imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', subjectBox: [0.2, 0.2, 0.5, 0.5], focal: [0.4, 0.4] }),
      ],
    };
    renderBand([boxed]);
    const tray = openHeroFocal();
    const frame = tray.querySelector('[data-focal-frame="wide"]') as HTMLElement;
    frameRect(frame);
    fireEvent.pointerDown(frame, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    const { subjectBox, focal } = mockSetFocal.mock.calls[0][0];
    expect(subjectBox).toEqual([0.2, 0.2, 0.5, 0.5]);
    expect(focal).toEqual([0.2, 0.2]);
  });

  it('moving the focal control updates both arrival crops before saving', () => {
    renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    const handles = within(tray).getAllByRole('button', { name: /^Focal point at/ });
    fireEvent.keyDown(handles[0], { key: 'ArrowRight' });
    expect((document.querySelector('[data-gallery-frame="cover_phone"] [data-press-cover]') as HTMLElement).style.objectPosition).toBe('52.9% 50%');
    expect((document.querySelector('[data-gallery-frame="wide"] [data-press-cover]') as HTMLElement).style.objectPosition).toBe('50% 0%');
    expect(mockSetFocal).not.toHaveBeenCalled();
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    expect(mockSetFocal).toHaveBeenCalledWith(expect.objectContaining({ focal: [0.52, 0.45] }), expect.any(Object));
  });

  const previewPosition = () => (document.querySelector('[data-gallery-frame="cover_phone"] [data-press-cover]') as HTMLElement).style.objectPosition;
  const dragHero = (tray: HTMLElement) => {
    const frame = tray.querySelector('[data-focal-frame="wide"]') as HTMLElement;
    frameRect(frame);
    fireEvent.pointerDown(frame, { clientX: 300, clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
  };

  it.each(['Edit', 'Set the focal point of What a-hero'])('drag then close %s restores the saved preview and reopening stays saved', (close) => {
    renderBand([PENDING_ROW]);
    const saved = previewPosition();
    const tray = openHeroFocal();
    dragHero(tray);
    expect(previewPosition()).not.toBe(saved);
    fireEvent.click(screen.getByRole('button', { name: close }));
    expect(previewPosition()).toBe(saved);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: close }));
    expect(previewPosition()).toBe(saved);
    expect(mockSetFocal).not.toHaveBeenCalled();
  });

  it('drag disables Approve with a reason and does not auto-save', () => {
    renderBand([PENDING_ROW]);
    dragHero(openHeroFocal());
    const approve = screen.getByRole('button', { name: 'Approve' });
    expect(approve).toBeDisabled();
    expect(approve).toHaveAccessibleDescription('Use this crop or cancel first');
    fireEvent.click(approve);
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockSetFocal).not.toHaveBeenCalled();
  });

  it('clicking the selected default hero keeps its unsaved crop guarded (R2)', () => {
    renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    dragHero(tray);
    const dirty = previewPosition();
    fireEvent.click(within(tray).getByRole('button', { name: 'What a-hero', exact: true }));
    expect(previewPosition()).toBe(dirty);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(within(tray).getByRole('button', { name: 'Use this crop' })).toBeEnabled();
    expect(mockSetFocal).not.toHaveBeenCalled();
  });

  it('a refetch during a pending crop save waits for a post-save authoritative crop read', async () => {
    const baseline = {
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: null })],
    };
    const { rerender } = renderBand([baseline]);
    const tray = openHeroFocal();
    dragHero(tray);
    const savedPosition = previewPosition();
    let finishRead!: (result: { isSuccess: boolean }) => void;
    mockRefetchEditions.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    const savedPoint = mockSetFocal.mock.calls[0][0].focal;
    const refreshed = (point: number[] | null) => ({
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: point, captionWhen: 'November' })],
    });
    mockData = editions([refreshed(null)]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(previewPosition()).toBe(savedPosition);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    reactAct(() => mockSetFocal.mock.calls[0][1].onSuccess());
    expect(previewPosition()).not.toBe(savedPosition);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(within(tray).getByRole('button', { name: 'Use this crop' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(previewPosition()).not.toBe(savedPosition);
    mockData = editions([refreshed(savedPoint)]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    await reactAct(async () => finishRead({ isSuccess: true }));
    expect(previewPosition()).toBe(savedPosition);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it.each([false, true])('a delayed crop success cannot overlay an ABA authoritative read, shared=%s (SQ-1943 R6)', async (shared) => {
    const row = {
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: [0.5, 0.5] })],
    };
    const { rerender } = renderBand([row]);
    const original = previewPosition();
    const tray = openHeroFocal();
    dragHero(tray);
    expect(previewPosition()).not.toBe(original);
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    let finishRead!: (result: { isSuccess: boolean }) => void;
    mockRefetchEditions.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    // A committed, then editor B restored O before A's response arrived.
    // An identical read can retain the entire React Query data object.
    if (!shared) mockData = editions([row]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    reactAct(() => mockSetFocal.mock.calls[0][1].onSuccess());
    expect(previewPosition()).toBe(original);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove).not.toHaveBeenCalled();
    await reactAct(async () => finishRead({ isSuccess: true }));
    expect(previewPosition()).toBe(original);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(within(tray).getAllByRole('button', { name: /^Focal point at 50 across, 50 down/ })).toHaveLength(2);
  });

  it('a delayed crop success cannot overlay a newer framing, even with structurally shared reads (SQ-1940 R3)', async () => {
    const row = (focal: number[]) => ({
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal })],
    });
    const { rerender } = renderBand([row([0.5, 0.5])]);
    const tray = openHeroFocal();
    dragHero(tray);
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    let finishRead!: (result: { isSuccess: boolean }) => void;
    mockRefetchEditions.mockImplementationOnce(() => new Promise((resolve) => { finishRead = resolve; }));
    mockData = editions([row([0.8, 0.7])]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    reactAct(() => mockSetFocal.mock.calls[0][1].onSuccess());
    const authoritative = document.createElement('div');
    const expected = render(<PressBandPreview edition={mockData.editions[0]} current={null} sourceUrls={{ 'a-hero': 'https://example.com/hero.jpg' }} />, { container: authoritative });
    const position = authoritative.querySelector<HTMLElement>('[data-gallery-frame="cover_phone"] [data-press-cover]')!.style.objectPosition;
    expected.unmount();
    expect(previewPosition()).toBe(position);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(mockRefetchEditions).toHaveBeenCalledTimes(1);
    // React Query can return the exact same data object after a successful read.
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(previewPosition()).toBe(position);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await reactAct(async () => finishRead({ isSuccess: true }));
    expect(previewPosition()).toBe(position);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it.each(['failure', 'rejection'])('a conflicting crop stays guarded after refresh %s until a successful retry', async (outcome) => {
    const { rerender } = renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    dragHero(tray);
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    mockData = editions([{
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: [0.8, 0.7] })],
    }]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    mockRefetchEditions.mockImplementationOnce(() => outcome === 'failure'
      ? Promise.resolve({ isSuccess: false })
      : Promise.reject(new Error('Offline')));
    await reactAct(async () => mockSetFocal.mock.calls[0][1].onSuccess());
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAccessibleDescription('Refresh the stored crop before approval');
    // Closing the editor must not clear an unresolved authoritative-read guard.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    mockRefetchEditions.mockResolvedValueOnce({ isSuccess: true });
    await reactAct(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh crop' })));
    expect(mockRefetchEditions).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('a read already carrying the saved crop still confirms authority after success', async () => {
    const { rerender } = renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    dragHero(tray);
    const position = previewPosition();
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    const point = mockSetFocal.mock.calls[0][0].focal;
    mockData = editions([{
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: point })],
    }]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    await reactAct(async () => mockSetFocal.mock.calls[0][1].onSuccess());
    expect(previewPosition()).toBe(position);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(mockRefetchEditions).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('null framing matches the Gallery default when opening or rebaselining, refresh=%s', (refresh) => {
    const row = (focal: number[] | null) => ({
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal, subjectBox: null })],
    });
    const { rerender } = renderBand([row(refresh ? [0.3, 0.4] : null)]);
    const tray = openHeroFocal();
    if (refresh) {
      mockData = editions([row(null)]);
      rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    }
    for (const frame of ['cover_phone', 'wide']) {
      const preview = document.querySelector(`[data-gallery-frame="${frame}"] [data-press-cover]`) as HTMLElement;
      const editor = tray.querySelector(`[data-focal-frame="${frame}"] img`) as HTMLElement;
      expect(editor.style.objectPosition).toBe(preview.style.objectPosition);
    }
    expect(within(tray).getAllByRole('button', { name: /^Focal point at 50 across, 50 down/ })).toHaveLength(2);
    expect(within(tray).getByRole('button', { name: 'Use this crop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('a second editor refetch replaces the confirmed saved crop (R3)', async () => {
    const current = { ...CURRENT_ROW, images: PENDING_ROW.images };
    const { rerender } = renderBand([PENDING_ROW, current]);
    const tray = openHeroFocal();
    dragHero(tray);
    const cropA = previewPosition();
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    reactAct(() => mockSetFocal.mock.calls[0][1].onSuccess());
    const pointA = mockSetFocal.mock.calls[0][0].focal;
    const withFocal = (row: Record<string, unknown>, point: number[]) => ({
      ...row,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: point })],
    });
    mockData = editions([withFocal(PENDING_ROW, pointA), withFocal(current, pointA)]);
    await reactAct(async () => rerender(<PressBand projectId="p-1" clientFirstName="June" />));
    expect(previewPosition()).toBe(cropA);

    const job = document.querySelector('[data-press-job]') as HTMLElement;
    fireEvent.click(within(job).getByRole('button', { name: 'Set the focal point of What a-hero' }));
    const handle = within(job).getAllByRole('button', { name: /^Focal point at/ })[0];
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.click(within(job).getByRole('button', { name: 'Use this crop' }));
    const pointB = mockSetFocal.mock.calls[1][0].focal;
    await reactAct(async () => mockSetFocal.mock.calls[1][1].onSuccess());
    mockData = editions([withFocal(PENDING_ROW, pointB), withFocal(current, pointB)]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(previewPosition()).not.toBe(cropA);
    expect(within(tray).getAllByRole('button', { name: new RegExp(`^Focal point at ${Math.round(pointB[0] * 100)} across, ${Math.round(pointB[1] * 100)} down`) })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it.each([false, true])('refreshed framing replaces an open editor baseline, dirty=%s (R4)', (dirty) => {
    const { rerender } = renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    if (dirty) dragHero(tray);
    mockData = editions([{
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: [0.52, 0.45] })],
    }]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(within(tray).getAllByRole('button', { name: /^Focal point at 52 across, 45 down/ })).toHaveLength(2);
    expect(within(tray).getByRole('button', { name: 'Use this crop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    fireEvent.keyDown(within(tray).getAllByRole('button', { name: /^Focal point at/ })[0], { key: 'ArrowLeft' });
    expect(within(tray).getAllByRole('button', { name: /^Focal point at 50 across, 45 down/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockSetFocal).not.toHaveBeenCalled();
  });

  it('save blocks Approve until a post-save read confirms framing and approves supported overrides', async () => {
    const { rerender } = renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    fireEvent.change(within(tray).getAllByLabelText('Headline')[0], { target: { value: 'New chapter' } });
    dragHero(tray);
    const saved = previewPosition();
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    expect(mockSetFocal.mock.calls[0][0]).toEqual(expect.objectContaining({ assetId: 'a-hero', focal: expect.any(Array) }));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled();
    expect(within(tray).getByRole('button', { name: 'Set the focal point of What a-hero' })).toBeDisabled();
    reactAct(() => mockSetFocal.mock.calls[0][1].onSuccess());
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    const point = mockSetFocal.mock.calls[0][0].focal;
    mockData = editions([{
      ...PENDING_ROW,
      images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', focal: point })],
    }]);
    await reactAct(async () => rerender(<PressBand projectId="p-1" clientFirstName="June" />));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(previewPosition()).toBe(saved);
    const reopened = openHeroFocal();
    expect(within(reopened).getAllByRole('button', { name: new RegExp(`^Focal point at ${Math.round(point[0] * 100)} across, ${Math.round(point[1] * 100)} down`) })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(mockApprove.mock.calls[0][0]).toEqual({ projectId: 'p-1', editionId: 'e-5', overrides: { chapters: { 'room-living': { headline: 'New chapter' } } } });
  });

  it('an older post-save read cannot unlock a later crop save', async () => {
    renderBand([PENDING_ROW]);
    const tray = openHeroFocal();
    const reads: ((result: { isSuccess: boolean }) => void)[] = [];
    mockRefetchEditions.mockImplementation(() => new Promise((resolve) => { reads.push(resolve); }));
    for (let index = 0; index < 2; index++) {
      dragHero(tray);
      fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
      reactAct(() => mockSetFocal.mock.calls[index][1].onSuccess());
    }
    expect(reads).toHaveLength(2);
    await reactAct(async () => reads[0]({ isSuccess: true }));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    await reactAct(async () => reads[1]({ isSuccess: true }));
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });

  it('unmounting during a crop save leaves the next band on its authoritative read', async () => {
    const band = renderBand([PENDING_ROW]);
    const original = previewPosition();
    const tray = openHeroFocal();
    dragHero(tray);
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    band.unmount();
    await reactAct(async () => mockSetFocal.mock.calls[0][1].onSuccess());
    renderBand([PENDING_ROW]);
    expect(previewPosition()).toBe(original);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(mockApprove).not.toHaveBeenCalled();
  });

  it('failed save resets the preview and editor while retaining the save error', () => {
    renderBand([PENDING_ROW]);
    const saved = previewPosition();
    const tray = openHeroFocal();
    dragHero(tray);
    fireEvent.click(within(tray).getByRole('button', { name: 'Use this crop' }));
    reactAct(() => mockSetFocal.mock.calls[0][1].onError());
    expect(previewPosition()).toBe(saved);
    expect(within(tray).getAllByRole('button', { name: /^Focal point at 50 across, 45 down/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Use this crop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(screen.getByText(/Crop could not be saved/)).toBeInTheDocument();
  });
});

describe('PressBand — the delta line', () => {
  it('says what moved against the edition the client sees, in one line', () => {
    renderBand([PENDING_ROW, CURRENT_ROW]);
    // a-hero and a-concept are new, a-old is gone; a-room is unchanged.
    expect(screen.getByText('Hero changed · 3 captions changed · words unchanged')).toBeInTheDocument();
  });

  it('counts a caption the next edition drops (R13)', () => {
    const dropped = { ...CURRENT, id: 'e-6', images: CURRENT.images.filter((image) => image.assetId !== 'a-room') };
    expect(editionDelta(dropped, CURRENT)).toBe('Hero unchanged · 1 caption changed · words unchanged');
  });

  it('counts edits laid over the edition', () => {
    expect(editionDelta(CURRENT, CURRENT)).toBe('Hero unchanged · captions unchanged · words unchanged');
    expect(
      editionDelta(CURRENT, CURRENT, {
        chapters: { 'room-living': { headline: 'The long room' } },
        captions: { 'a-room': { when: 'November' } },
      }),
    ).toBe('Hero unchanged · 1 caption changed · words changed');
    expect(editionDelta(PENDING, null)).toBe('The first edition');
  });

});

describe('PressBand — voice', () => {
  it('never says how an edition was made', () => {
    mockEditorial = [];
    for (const rows of [[PENDING_ROW, CURRENT_ROW, EARLIER_ROW], [CURRENT_ROW, EARLIER_ROW], []]) {
      const { container, unmount } = renderBand(rows);
      const edit = screen.queryByRole('button', { name: 'Edit' });
      if (edit) fireEvent.click(edit);
      expect(allWords(container)).not.toMatch(FORBIDDEN);
      unmount();
    }
    renderBand([CURRENT_ROW, EARLIER_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(allWords(screen.getByRole('alertdialog'))).not.toMatch(FORBIDDEN);
  });
});

describe('PressBand — closure refresh', () => {
  it('a closed job with no editions or photo says Closed without an add-cover act', () => {
    mockEditorial = [];
    mockData = normalizeClientEditions({ ...listEnvelope([]), projectClosed: true } as never);
    render(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(screen.getByRole('heading', { name: 'Closed' })).toBeInTheDocument();
    expect(screen.queryByText(/until an edition is approved/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Add a photograph for the cover' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('a closed band requests no source signing even with current and pending pictures', () => {
    mockData = normalizeClientEditions({ ...listEnvelope([PENDING_ROW, CURRENT_ROW]), projectClosed: true } as never);
    render(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(mockSourceUrls).toHaveBeenCalledWith([]);
    expect(mockSourceUrls.mock.calls.every(([images]) => images.length === 0)).toBe(true);
  });

  it.each(['closed', 'superseded', 'frozen'] as const)('an open Undo closes when %s, and a fresh live confirmation takes the edition back', (reason) => {
    const { rerender } = renderBand([CURRENT_ROW, EARLIER_ROW]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    mockData = normalizeClientEditions({
      ...listEnvelope([{ ...CURRENT_ROW, ...(reason === 'superseded' ? { status: 'superseded' } : reason === 'frozen' ? { frozenAt: '2026-10-22' } : {}) }, EARLIER_ROW]),
      projectClosed: reason === 'closed',
    } as never);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(mockUndo).not.toHaveBeenCalled();
    mockData = editions([CURRENT_ROW, EARLIER_ROW]);
    rerender(<PressBand projectId="p-1" clientFirstName="June" />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Undo' }));
    expect(mockUndo).toHaveBeenCalledTimes(1);
    expect(mockUndo).toHaveBeenCalledWith({ projectId: 'p-1', editionId: 'e-4' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});


describe('PressBand — unavailable maker pictures', () => {
  it('names the unavailable picture and links to the existing item picture manager', () => {
    mockDeadPictures = [{ itemId: 'line-sofa', name: 'Linen sofa' }];
    renderBand([]);
    const list = screen.getByRole('list', { name: 'Pictures to replace' });
    expect(list).toHaveTextContent("Linen sofa · The maker's photograph no longer loads");
    const link = within(list).getByRole('link', { name: 'Replace picture' });
    expect(link).toHaveAttribute('href', '#pictures-head-line-sofa');
    const heard = jest.fn();
    window.addEventListener(FOCUS_FFE_LINE_EVENT, heard);
    try {
      fireEvent.click(link);
      expect(heard).toHaveBeenCalledTimes(1);
      expect(focusFfeLinePending.request).toEqual({ itemId: 'line-sofa', cell: 'pictures' });
    } finally {
      window.removeEventListener(FOCUS_FFE_LINE_EVENT, heard);
    }
  });

  it('offers no replacement status when no maker pictures are marked dead', () => {
    renderBand([]);
    expect(screen.queryByRole('list', { name: 'Pictures to replace' })).toBeNull();
  });
});
