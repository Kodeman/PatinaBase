/**
 * US-19 D6, as amended by R37/R42 (FR1 F2, F7) — Ask the maker for a date
 * holds a procurement draft; only a person's Send press in its DraftReview
 * sends it.
 *
 * The real DocSheet, DocumentAction and DraftReview render here. The held read
 * is a real query under the drafts key, so the hold's invalidation re-reads it
 * as it does in the app.
 */
import type { ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const mockUseInstallWindow = jest.fn();
const mockUseProcurementDrafts = jest.fn();
/** What the held read returns: rows, a pending read, or a failed one. */
let mockDraftsRead: () => Promise<Record<string, unknown>[]> = async () => [];
const mockSend = jest.fn();
const mockDiscard = jest.fn();

jest.mock('@patina/supabase', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query');
  const pending = { mutateAsync: jest.fn(), isPending: false };
  return {
    OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
    buyingPhase2Keys: { all: ['buying-phase2'] },
    useInstallWindow: (projectId: string) => mockUseInstallWindow(projectId),
    useProcurementDrafts: (projectId: string, statuses: readonly string[]) => {
      mockUseProcurementDrafts(projectId, statuses);
      return useQuery({
        queryKey: ['buying-phase2', 'drafts', projectId, statuses.join(',')],
        queryFn: () => mockDraftsRead(),
      });
    },
    useUpdateProcurementDraft: () => pending,
    useSendProcurementDraft: () => ({ mutateAsync: mockSend, isPending: false }),
    useDiscardProcurementDraft: () => ({ mutateAsync: mockDiscard, isPending: false }),
    useResendStalledProcurementDraft: () => pending,
  };
});

let mockFlag = { value: true, isLoading: false };
let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'ask-the-paper'
      ? mockFlag
      : { value: name === 'one-voice' && mockOneVoice, isLoading: false },
}));

import {
  AskMakerSheet,
  InstallReadingLine,
  askMakerDraft,
  followUpDraft,
  type AskMakerPiece,
} from '../ask-maker-sheet';
import { dayMonth } from '@/lib/document/dates';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const CHAIR: AskMakerPiece = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Reading chair, oiled oak and shearling',
  status: 'production',
  vendor_name: 'Nordic Atelier',
  purchase_order: null,
};
/** No vendor_name, no PO vendor, no product brand: R42's selector is empty. */
const CHAIR_NO_MAKER: AskMakerPiece = { ...CHAIR, vendor_name: null, product: null };
const SHELVING: AskMakerPiece = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Walnut shelving',
  status: 'delivered',
  purchase_order: null,
};
const LIGHT: AskMakerPiece = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Brass picture light, 24 in',
  status: 'ordered',
  purchase_order: null,
};
const HELD = {
  id: 'draft-1',
  kind: 'maker_eta_request',
  status: 'awaiting_review',
  ffe_item_id: CHAIR.id,
  purchase_order_id: null,
  project_id: PROJECT,
  to_email: 'orders@nordic.test',
  subject: 'Arrival date: Reading chair',
  body: 'Nordic Atelier,\n\nCould you give us an arrival date for this piece?',
  created_at: '2026-10-07T15:00:00Z',
} as never;

const fetchMock = jest.fn();

// jsdom has no global Response; the hook reads only ok, status and json().
const json = (body: unknown, status = 200) =>
  Promise.resolve({ ok: status < 400, status, json: async () => body });

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** Every control a person could press or that names itself. */
function namedControls(): string[] {
  const controls = [
    ...screen.queryAllByRole('button'),
    ...screen.queryAllByRole('link'),
    ...screen.queryAllByRole('menuitem'),
  ].map((element) => element.textContent ?? '');
  const labelled = Array.from(document.querySelectorAll('[aria-label], [title]')).map(
    (element) => `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`,
  );
  return [...controls, ...labelled];
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlag = { value: true, isLoading: false };
  mockDraftsRead = async () => [];
  mockSend.mockResolvedValue({ draftId: 'draft-1', messageId: 'msg-1' });
  mockDiscard.mockResolvedValue({});
  mockUseInstallWindow.mockReturnValue({ isSuccess: true, data: null });
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === 'POST' ? json({ draft: HELD }) : json({ error: 'unexpected' }, 500),
  );
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('AskMakerSheet', () => {
  it('opens with the note drafted to the maker and focus on the body', async () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    expect(screen.getByText('Nordic Atelier')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toHaveValue('Arrival date: Reading chair');
    const body = screen.getByLabelText('Note') as HTMLTextAreaElement;
    expect(body.value).toContain('Could you give us an arrival date for this piece?');
    expect(body.value).toContain('We have no arrival date recorded for it.');
    await waitFor(() => expect(body).toHaveFocus());
  });

  it("F7: the note opens with the maker's name, never Hello there", () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    const body = (screen.getByLabelText('Note') as HTMLTextAreaElement).value;
    expect(body.startsWith('Nordic Atelier,\n\nCould you give us')).toBe(true);
    expect(body).not.toMatch(/hello/i);
  });

  it("R42: To and the greeting are the row's maker — here the PO's vendor", () => {
    const piece: AskMakerPiece = {
      ...CHAIR,
      vendor_name: null,
      purchase_order: { vendor: { name: 'Apparatus' } },
      product: { brand: 'Fixture Pottery' },
    };
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={piece} held={null} />,
    );
    expect(screen.getByText('Apparatus')).toBeInTheDocument();
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toMatch(/^Apparatus,\n\n/);
  });

  it('with no maker recorded the note carries no greeting line', () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR_NO_MAKER} held={null} />,
    );
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toMatch(
      /^Could you give us an arrival date for this piece\?/,
    );
  });

  it('has no element with a send role or label, and exactly two acts', () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    expect(screen.queryByRole('button', { name: /send/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /send/i })).toBeNull();
    expect(screen.queryByLabelText(/send/i)).toBeNull();
    for (const name of namedControls()) expect(name).not.toMatch(/send/i);

    const acts = screen.getByRole('group', { name: 'Ask the maker for a date' });
    const labels = Array.from(acts.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['Hold for review', 'Discard']);
  });

  it('Hold for review POSTs only the line and the note; the maker is read server-side', async () => {
    const onHeld = jest.fn();
    renderWithQuery(
      <AskMakerSheet
        open
        onClose={jest.fn()}
        onHeld={onHeld}
        projectId={PROJECT}
        piece={CHAIR}
        held={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hold for review' }));

    await waitFor(() => expect(onHeld).toHaveBeenCalledTimes(1));
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(1);
    const [url, init] = posts[0];
    expect(url).toBe('/api/document/ask-maker-date');
    expect(JSON.parse(init.body)).toEqual({
      projectId: PROJECT,
      ffeItemId: CHAIR.id,
      subject: 'Arrival date: Reading chair',
      body: expect.stringContaining('Reading chair, oiled oak and shearling'),
    });
  });

  it('506-3: a refused hold says why in the sheet and keeps the edited note', async () => {
    fetchMock.mockImplementation(() =>
      json({ error: 'A date request for this line is already drafted.', draft: HELD }, 409),
    );
    const onHeld = jest.fn();
    const onClose = jest.fn();
    renderWithQuery(
      <AskMakerSheet
        open
        onClose={onClose}
        onHeld={onHeld}
        projectId={PROJECT}
        piece={CHAIR}
        held={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Edited by Leah.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold for review' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A date request for this line is already drafted.',
    );
    expect(screen.getByLabelText('Note')).toHaveValue('Edited by Leah.');
    expect(onHeld).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("506-3/511-R4: the refusal's Open the held draft opens the 409's draft, with focus in it", async () => {
    fetchMock.mockImplementation(() =>
      json({ error: 'A date request for this line is already drafted.', draft: HELD }, 409),
    );
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hold for review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open the held draft' }));

    const review = await screen.findByRole('region', {
      name: 'Arrival date request to the maker, drafted',
    });
    expect(screen.getByLabelText('Subject')).toHaveValue('Arrival date: Reading chair');
    await waitFor(() => expect(review).toContainElement(document.activeElement as HTMLElement));
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('506-2: a held note with no address holds its Send, names the maker, and Add an address lands', () => {
    const heard = jest.fn();
    window.addEventListener('document:focus-ffe-line', heard);
    const onClose = jest.fn();
    renderWithQuery(
      <AskMakerSheet
        open
        onClose={onClose}
        projectId={PROJECT}
        piece={CHAIR}
        held={{ ...(HELD as object), to_email: null } as never}
      />,
    );
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription('No address on file for Nordic Atelier.');
    fireEvent.click(send);
    expect(mockSend).not.toHaveBeenCalled();

    // A maker named by hand has no record yet: the repair lands on the line's
    // maker selector, and the sheet steps aside for it.
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({ itemId: CHAIR.id, cell: 'maker' });
    window.removeEventListener('document:focus-ffe-line', heard);
  });

  it('Discard closes and writes nothing', () => {
    const onClose = jest.fn();
    renderWithQuery(
      <AskMakerSheet open onClose={onClose} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("R37: a held note opens its DraftReview; nothing is sent without a person's press", async () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={HELD} />,
    );
    expect(
      screen.getByRole('region', { name: 'Arrival date request to the maker, drafted' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('draft-recipient')).toHaveTextContent('To orders@nordic.test');
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalledWith('draft-1'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('InstallReadingLine', () => {
  const CEDAR_LANE = [CHAIR, SHELVING, LIGHT];

  it('renders nothing, and reads nothing, with ask-the-paper off', () => {
    mockFlag = { value: false, isLoading: false };
    const { container } = renderWithQuery(
      <InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(mockUseInstallWindow).not.toHaveBeenCalled();
    expect(mockUseProcurementDrafts).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads Cedar Lane's install head and asks the maker (1-4)", async () => {
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(
      screen.getByText(
        "Reading chair isn't here, and no arrival date is recorded. 1 more isn't here.",
      ),
    ).toBeInTheDocument();
    const act = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    fireEvent.click(act);
    expect(await screen.findByRole('button', { name: 'Hold for review' })).toBeInTheDocument();
  });

  // US-19 F2-12 (P-1) — a named act is scored, never filled weight.
  it('F2-12 one-voice: the install row prints Ask the maker for a date scored', async () => {
    mockOneVoice = true;
    try {
      renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
      const act = await screen.findByRole('button', { name: 'Ask the maker for a date' });
      expect(act).toHaveClass('da-primary');
      expect(act).not.toHaveClass('da-inked');
    } finally {
      mockOneVoice = false;
    }
  });

  it('F4: reads held notes from procurement_drafts, never the route', async () => {
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    await screen.findByRole('button', { name: 'Ask the maker for a date' });
    // 506-3: a sent note stands for its studio day, so the read carries sent.
    expect(mockUseProcurementDrafts).toHaveBeenCalledWith(PROJECT, [
      'awaiting_review',
      'sending',
      'sent',
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('F2: while the held read is in flight, neither act is offered', () => {
    mockDraftsRead = () => new Promise(() => {});
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(screen.getByText(/Reading chair isn't here/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask the maker for a date' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open the held draft' })).toBeNull();
  });

  it('F2: a failed held read holds the act with its reason, and opens nothing', async () => {
    mockDraftsRead = async () => {
      throw new Error('permission denied');
    };
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    const act = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    await waitFor(() => expect(act).toHaveAttribute('aria-disabled', 'true'));
    expect(act).toHaveAccessibleDescription('Could not read the held notes just now.');
    fireEvent.click(act);
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
    expect(screen.queryByTestId('draft-review')).toBeNull();
  });

  it('R37: no maker recorded — the act is held with its reason, and Add the maker lands on the maker field', async () => {
    const heard = jest.fn();
    window.addEventListener('document:focus-ffe-line', heard);
    renderWithQuery(
      <InstallReadingLine projectId={PROJECT} items={[CHAIR_NO_MAKER, SHELVING, LIGHT]} />,
    );
    const act = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(act).not.toBeDisabled(); // still in the tab order
    expect(act).toHaveAccessibleDescription('No maker is recorded on this line.');
    fireEvent.click(act);
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Add the maker' }));
    expect(heard).toHaveBeenCalledTimes(1);
    expect((heard.mock.calls[0][0] as CustomEvent).detail).toEqual({
      itemId: CHAIR.id,
      cell: 'maker',
    });
    window.removeEventListener('document:focus-ffe-line', heard);
  });

  it('F7: after Hold, the act reads Open the held draft and holds focus', async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method !== 'POST') return json({ error: 'unexpected' }, 500);
      mockDraftsRead = async () => [HELD];
      return json({ draft: HELD });
    });
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask the maker for a date' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hold for review' }));

    const opened = await screen.findByRole('button', { name: 'Open the held draft' });
    await waitFor(() => expect(opened).toHaveFocus());
    expect(screen.getByText('Asked 7 October · draft held for review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
  });

  it('after a reload, a held note reads Asked {date} and opens its DraftReview (1-5)', async () => {
    mockDraftsRead = async () => [HELD];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(
      await screen.findByText('Asked 7 October · draft held for review'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the held draft' }));
    expect(await screen.findByTestId('draft-review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();

    // A Discard inside settles the review there; the sheet does not flip back
    // to a fresh compose when the held read empties.
    mockDraftsRead = async () => [];
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(mockDiscard).toHaveBeenCalledWith('draft-1'));
    expect(await screen.findByText('Discarded.')).toBeInTheDocument();
    await act(async () => {});
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('511-R5: a sending note reads plain Sending…, not the held form', async () => {
    mockDraftsRead = async () => [{ ...(HELD as object), status: 'sending' }];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    expect(screen.queryByText(/draft held for review/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Open the held draft' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('506-3: after a same-day send the row reads Asked {day} · sent and holds the ask with its reason', async () => {
    const sentAt = new Date().toISOString();
    mockDraftsRead = async () => [
      { ...(HELD as object), status: 'sent', created_at: sentAt, sent_at: sentAt },
    ];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(await screen.findByText(`Asked ${dayMonth(sentAt)} · sent`)).toBeInTheDocument();
    const ask = screen.getByRole('button', { name: 'Ask the maker for a date' });
    expect(ask).toHaveAttribute('aria-disabled', 'true');
    expect(ask).toHaveAccessibleDescription('A date request already went to Nordic Atelier today.');
    fireEvent.click(ask);
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
  });

  // US-19 FR7 F7-6 (538 Q3) — the reason names the note that went.
  it('F7-6: after a same-day follow-up the held ask’s reason names the follow-up', async () => {
    const sentAt = new Date().toISOString();
    mockDraftsRead = async () => [
      {
        ...(HELD as object),
        kind: 'maker_follow_up',
        status: 'sent',
        created_at: sentAt,
        sent_at: sentAt,
      },
    ];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    const ask = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    await waitFor(() => expect(ask).toHaveAttribute('aria-disabled', 'true'));
    expect(ask).toHaveAccessibleDescription('A follow-up already went to Nordic Atelier today.');
  });

  it('506-3: a send on an earlier studio day, or a discarded note, does not stand', async () => {
    const earlier = new Date(Date.now() - 3 * 86_400_000).toISOString();
    let read = false;
    mockDraftsRead = async () => {
      read = true;
      return [
        { ...(HELD as object), id: 'sent-before', status: 'sent', created_at: earlier, sent_at: earlier },
        { ...(HELD as object), id: 'discarded', status: 'discarded' },
      ];
    };
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    const ask = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    expect(read).toBe(true);
    expect(ask).not.toHaveAttribute('aria-disabled');
    expect(screen.queryByText(/· sent/)).toBeNull();
    fireEvent.click(ask);
    expect(await screen.findByRole('button', { name: 'Hold for review' })).toBeInTheDocument();
  });

  // FR4 517-4 (b) — the ask is a fact about the line until the maker answers.
  it('517-4 one-voice: a send on an earlier studio day still reads Asked {day} · sent, and the ask stays open', async () => {
    mockOneVoice = true;
    try {
      const earlier = new Date(Date.now() - 3 * 86_400_000).toISOString();
      mockDraftsRead = async () => [
        { ...(HELD as object), id: 'sent-before', status: 'sent', created_at: earlier, sent_at: earlier },
      ];
      renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
      expect(await screen.findByText(`Asked ${dayMonth(earlier)} · sent`)).toBeInTheDocument();
      // Only a send this studio day holds the act (511-R3).
      const ask = screen.getByRole('button', { name: 'Ask the maker for a date' });
      expect(ask).not.toHaveAttribute('aria-disabled');
    } finally {
      mockOneVoice = false;
    }
  });

  it('517-4 one-voice: once a date ahead is recorded the sent ask is no longer printed', async () => {
    mockOneVoice = true;
    try {
      const earlier = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const ahead = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
      let read = false;
      mockDraftsRead = async () => {
        read = true;
        return [
          { ...(HELD as object), id: 'sent-before', status: 'sent', created_at: earlier, sent_at: earlier },
        ];
      };
      renderWithQuery(
        <InstallReadingLine
          projectId={PROJECT}
          items={[{ ...CHAIR, purchase_order: { confirmed_eta: ahead, delivered_date: null } }]}
        />,
      );
      expect(await screen.findByRole('button', { name: 'Hold a window' })).toBeInTheDocument();
      await waitFor(() => expect(read).toBe(true));
      await act(async () => {});
      expect(screen.queryByText(/· sent/)).toBeNull();
    } finally {
      mockOneVoice = false;
    }
  });

  it('a held note for another piece does not stand for this one', async () => {
    mockDraftsRead = async () => [{ ...(HELD as object), ffe_item_id: LIGHT.id }];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(
      await screen.findByRole('button', { name: 'Ask the maker for a date' }),
    ).toBeInTheDocument();
  });

  it('FR5 530-3: a held follow-up stands on the row as Followed up {day} · draft held for review', async () => {
    mockDraftsRead = async () => [{ ...(HELD as object), kind: 'maker_follow_up' }];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(
      await screen.findByText('Followed up 7 October · draft held for review'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the held draft' })).toBeInTheDocument();
  });
});

// US-19 FR5 F5-2 / F5-3 — the follow-up holds as its own kind; both maker
// notes name the one PO number the maker knows.
describe('FR5: the maker follow-up and the one PO number', () => {
  const BOTH_NUMBERS: AskMakerPiece = {
    ...CHAIR,
    purchase_order: { vendor_po_number: 'NA-2026-077', po_number: 'PO-2026-0031', confirmed_eta: null },
  };

  it('530-4: a piece with both PO numbers — both subjects name vendor_po_number', () => {
    expect(askMakerDraft(BOTH_NUMBERS, new Date(2026, 9, 7)).subject).toBe(
      'Arrival date: Reading chair · PO NA-2026-077',
    );
    expect(followUpDraft(BOTH_NUMBERS).subject).toBe('NA-2026-077 — following up');
  });

  it("530-3: the follow-up's Hold for review POSTs kind maker_follow_up", async () => {
    const onHeld = jest.fn();
    renderWithQuery(
      <AskMakerSheet
        open
        followUp
        onClose={jest.fn()}
        onHeld={onHeld}
        projectId={PROJECT}
        piece={BOTH_NUMBERS}
        held={null}
      />,
    );
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Any word on the order?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold for review' }));
    await waitFor(() => expect(onHeld).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')!;
    expect(JSON.parse(init.body)).toEqual({
      projectId: PROJECT,
      ffeItemId: CHAIR.id,
      subject: 'NA-2026-077 — following up',
      body: 'Any word on the order?',
      kind: 'maker_follow_up',
    });
  });

  it("530-3: a held follow-up's refusal names a note to the maker and offers Open the held draft", async () => {
    const standing = { ...(HELD as object), kind: 'maker_follow_up' };
    fetchMock.mockImplementation(() =>
      json({ error: 'A note to the maker for this line is already drafted.', draft: standing }, 409),
    );
    renderWithQuery(
      <AskMakerSheet open followUp onClose={jest.fn()} projectId={PROJECT} piece={BOTH_NUMBERS} held={null} />,
    );
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Any word?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Hold for review' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A note to the maker for this line is already drafted.',
    );
    expect(screen.getByRole('button', { name: 'Open the held draft' })).toBeInTheDocument();
  });
});
