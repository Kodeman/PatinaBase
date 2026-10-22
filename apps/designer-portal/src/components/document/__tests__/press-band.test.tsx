/**
 * US-49 Phase 2 — the Press band: its states, Approve with the studio's
 * gathered edits, Hold, Undo behind a confirm in words, the job's own
 * controls outside any draft, the focal drag, the one-line delta, a closed
 * job, and never a word about how the edition was made. Editions are the
 * SQL's own rows (__fixtures__/client-editions) through the hook's normaliser.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ClientEdition, ClientEditions, ClientEditorialAsset } from '@patina/supabase';
import { PressBand, publishedLine } from '../press-band';
import { editionDelta, heroCoverCrop } from '../press-band-preview';
import {
  CURRENT_ROW,
  EARLIER_ROW,
  PENDING_ROW,
  editionRow,
  imageRow,
  listEnvelope,
} from '../__fixtures__/client-editions';
import { objectPositionOf, plateCropWindow } from '@/lib/document/plate-crop';

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
let mockData: ClientEditions | undefined;
let mockEditorial: ClientEditorialAsset[] | undefined;

const act = (mutate: jest.Mock) => ({ mutate, reset: jest.fn(), isPending: false, isSuccess: false, error: null });

jest.mock('@patina/supabase', () => ({
  useClientEditions: (...args: unknown[]) => {
    mockUseClientEditions(...args);
    return { data: mockData };
  },
  useClientEditorialAssets: (_projectId: string, enabled: boolean) => ({
    data: enabled ? mockEditorial : undefined,
  }),
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

const coverImage = () => document.querySelector('[data-press-cover]') as HTMLImageElement;
const coverWindow = () => document.querySelector('[data-press-cover-window]') as HTMLElement;

const frameRect = (frame: HTMLElement) => {
  frame.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 400, height: 250, right: 400, bottom: 250, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
};

beforeEach(() => {
  mockData = undefined;
  mockEditorial = undefined;
  jest.clearAllMocks();
});

describe('PressBand — the states', () => {
  it('says a new edition is ready, with its preview, when one waits for review', () => {
    renderBand([PENDING_ROW, CURRENT_ROW, EARLIER_ROW]);
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

  it('closed with only an edition awaiting review: no Approve, Hold, Edit or job control, nothing published', () => {
    renderClosedBand([PENDING_ROW]);
    for (const name of ['Approve', 'Hold', 'Edit', 'Undo']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: /^Set the focal point/ })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'A new edition is ready' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Published editions' })).toBeNull();
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
    expect(within(tray).getAllByRole('button', { name: /^Focal point at 100 across, 20 down/ })).toHaveLength(2);

    fireEvent.click(useCrop);
    expect(mockSetFocal).toHaveBeenCalledTimes(1);
    const { projectId, assetId, subjectBox, focal } = mockSetFocal.mock.calls[0][0];
    expect({ projectId, assetId }).toEqual({ projectId: 'p-1', assetId: 'a-hero' });
    expect(subjectBox).toBeNull();
    expect(focal[0]).toBeCloseTo(1);
    expect(focal[1]).toBeCloseTo(0.2);
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

  it('the frames and the band cover show the crop the worker cuts, subject box first (R8)', () => {
    // Review reproduction 2: 2000² source, box [.1,.1,.8,.5], focal [.5,.6] → wide [0,200,2000,1250].
    const square = imageRow('a-hero', {
      plateRole: 'hero',
      chapterKey: 'cover',
      width: 2000,
      height: 2000,
      subjectBox: [0.1, 0.1, 0.8, 0.5],
      focal: [0.5, 0.6],
    });
    renderBand([{ ...PENDING_ROW, images: [square] }]);
    const wide = objectPositionOf({ left: 0, top: 200 / 2000, vx: 1, vy: 1250 / 2000 });
    expect(coverWindow()).toHaveAttribute('data-press-cover-window', '0 200 2000 1250');

    const tray = openHeroFocal();
    const frameImage = (key: string) =>
      tray.querySelector(`[data-focal-frame="${key}"] img`) as HTMLImageElement;
    expect(frameImage('wide').style.objectPosition).toBe(wide);
    const source = { width: 2000, height: 2000, focal: [0.5, 0.6], subjectBox: [0.1, 0.1, 0.8, 0.5] };
    expect(frameImage('cover_phone').style.objectPosition).toBe(
      objectPositionOf(plateCropWindow(source, 'cover_phone')!),
    );
  });

  it('a frame the worker cuts no crop for is shown unavailable, with what those screens draw (N1)', () => {
    // planCrops on 2000×1250, box [0,0,1,1], focal [1,.2] → wide and piece only.
    const whole = imageRow('a-hero', {
      plateRole: 'hero',
      chapterKey: 'cover',
      width: 2000,
      height: 1250,
      subjectBox: [0, 0, 1, 1],
      focal: [1, 0.2],
    });
    renderBand([{ ...PENDING_ROW, images: [whole] }]);
    const tray = openHeroFocal();
    const phone = tray.querySelector('[data-focal-frame="cover_phone"]') as HTMLElement;
    expect(phone).toHaveAttribute('data-focal-unavailable');
    expect(phone.querySelector('img')).toBeNull();
    expect(within(tray).getByText('Phones show the wide cover for this photograph.')).toBeInTheDocument();
    expect(within(tray).queryByText('The phone cover.')).toBeNull();
    // The desktop frame is cut, and still shows the picture.
    const wide = tray.querySelector('[data-focal-frame="wide"]') as HTMLElement;
    expect(wide).not.toHaveAttribute('data-focal-unavailable');
    expect(wide.querySelector('img')).not.toBeNull();
  });

  it('a white-ground picture has no cover frames: the worker cuts it only as a pair and a piece (F1)', () => {
    // planCrops on 2000×1250, ground white, maker → {pair, piece} only.
    const clipping = imageRow('a-hero', {
      plateRole: 'hero',
      chapterKey: 'cover',
      sourceKind: 'maker',
      ground: 'white',
      width: 2000,
      height: 1250,
    });
    renderBand([{ ...PENDING_ROW, images: [clipping] }]);
    const tray = openHeroFocal();
    for (const key of ['wide', 'cover_phone']) {
      const frame = tray.querySelector(`[data-focal-frame="${key}"]`) as HTMLElement;
      expect(frame).toHaveAttribute('data-focal-unavailable');
      expect(frame.querySelector('img')).toBeNull();
    }
    expect(within(tray).getAllByText('No cover is cut from this photograph.')).toHaveLength(2);
    // The same scene-ground picture keeps both frames.
    expect(heroCoverCrop(one({ ...PENDING_ROW, images: [{ ...clipping, ground: 'scene' }] }).images[0])).not.toBeNull();
  });

  it('designer photography stays within 120px tall (R10)', () => {
    renderBand([PENDING_ROW]);
    const frame = coverWindow();
    expect(frame.className).toMatch(/\bmax-h-\[120px\]/);
    // 2000×1250 draws the 16:10 wide crop: 192px wide at the 120px cap.
    expect(frame.style.width).toBe('192px');
    expect(frame.className).not.toMatch(/(^|\s)w-full(\s|$)/);
  });
});

/*
 * F2 — the band cover clips the source to the crop's own window: a frame of
 * the crop's aspect, the picture scaled by 1/vx × 1/vy and moved so the
 * window's corner meets the frame's. Values are native planCrops rects.
 */
describe('PressBand — the cover thumbnail is the crop window (F2)', () => {
  const coverOn = (over: Record<string, unknown>) =>
    renderBand([{ ...PENDING_ROW, images: [imageRow('a-hero', { plateRole: 'hero', chapterKey: 'cover', ...over })] }]);
  const pct = (value: string) => parseFloat(value);

  it('1400×900 draws the 3:2 wide32 window [25, 0, 1350, 900]', () => {
    // planCrops 1400×900 → wide32 [25, 0, 1350, 900] (no wide: under its floor).
    coverOn({ width: 1400, height: 900 });
    const frame = coverWindow();
    expect(frame).toHaveAttribute('data-press-cover-window', '25 0 1350 900');
    expect(frame.style.aspectRatio).toBe('1350 / 900');
    expect(frame.style.width).toBe('180px');
    const img = coverImage();
    expect(pct(img.style.width)).toBeCloseTo((1400 / 1350) * 100, 6);
    expect(pct(img.style.height)).toBeCloseTo(100, 6);
    expect(pct(img.style.left)).toBeCloseTo((-25 / 1350) * 100, 6);
    expect(pct(img.style.top)).toBeCloseTo(0, 6);
    expect(img.style.objectPosition).toBe('');
  });

  it('a 1100×2000 portrait draws the tall window [90, 0, 920, 2000]', () => {
    // planCrops 1100×2000 → {tall: [90, 0, 920, 2000], piece}; the page's portrait layout draws tall.
    coverOn({ width: 1100, height: 2000 });
    const frame = coverWindow();
    expect(frame).toHaveAttribute('data-press-cover-window', '90 0 920 2000');
    expect(frame.style.aspectRatio).toBe('920 / 2000');
    // 120px tall at 0.46 → 55.2px wide.
    expect(pct(frame.style.width)).toBeCloseTo(55.2, 6);
    const img = coverImage();
    expect(pct(img.style.width)).toBeCloseTo((1100 / 920) * 100, 6);
    expect(pct(img.style.height)).toBeCloseTo(100, 6);
    expect(pct(img.style.left)).toBeCloseTo((-90 / 920) * 100, 6);
  });

  it('a source of unknown size keeps the plain 120px box', () => {
    coverOn({ width: null, height: null });
    expect(document.querySelector('[data-press-cover-window]')).toBeNull();
    expect(coverImage().className).toMatch(/\bh-\[120px\]/);
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

  it('frames an unboxed cover on the worker’s thirds crop', () => {
    expect(heroCoverCrop(CURRENT.images[0])?.window).toEqual(
      plateCropWindow({ width: 2000, height: 1250 }, 'wide'),
    );
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
