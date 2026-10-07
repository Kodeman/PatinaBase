/**
 * US-19 D6 — Ask the maker for a date: a held draft, never a send.
 *
 * The real DocSheet and DocumentAction render here, so "no Send control"
 * covers everything the sheet prints, its head included.
 */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

const mockUseInstallWindow = jest.fn();
jest.mock('@patina/supabase', () => ({
  useInstallWindow: (projectId: string) => mockUseInstallWindow(projectId),
}));

let mockFlag = { value: true, isLoading: false };
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'ask-the-paper' ? mockFlag : { value: false, isLoading: false },
}));

import {
  AskMakerSheet,
  InstallReadingLine,
  type AskMakerPiece,
  type HeldMakerDraft,
} from '../ask-maker-sheet';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const CHAIR: AskMakerPiece = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Reading chair, oiled oak and shearling',
  status: 'production',
  vendor_name: 'Nordic Atelier',
  purchase_order: null,
};
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
const HELD: HeldMakerDraft = {
  taskId: 'task-1',
  ffeItemId: CHAIR.id,
  askedAt: '2026-10-07T15:00:00Z',
  makerName: 'Nordic Atelier',
  subject: 'Arrival date: Reading chair',
  body: 'Hello Nordic Atelier,\n\nCould you give us an arrival date for this piece?',
};

const fetchMock = jest.fn();
let heldDrafts: HeldMakerDraft[] = [];

// jsdom has no global Response; the hooks read only ok, status and json().
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
  heldDrafts = [];
  mockUseInstallWindow.mockReturnValue({ isSuccess: true, data: null });
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      return json({ taskId: 'task-1', askedAt: '2026-10-07T15:00:00Z' });
    }
    if (url.startsWith('/api/document/ask-maker-date?projectId=')) {
      return json({ drafts: heldDrafts });
    }
    return json({ error: 'unexpected' }, 500);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('AskMakerSheet', () => {
  it('opens with the note drafted to the maker and focus on the body', async () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    expect(screen.getByText('Nordic Atelier')).toBeInTheDocument();
    expect(screen.getByLabelText('Subject')).toHaveValue('Arrival date: Reading chair');
    const body = screen.getByLabelText('Note');
    expect((body as HTMLTextAreaElement).value).toContain(
      'Could you give us an arrival date for this piece?',
    );
    expect((body as HTMLTextAreaElement).value).toContain(
      'We have no arrival date recorded for it.',
    );
    await waitFor(() => expect(body).toHaveFocus());
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

  it('Hold for review POSTs the drafted note to the server route, then closes', async () => {
    const onClose = jest.fn();
    renderWithQuery(
      <AskMakerSheet open onClose={onClose} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hold for review' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
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

  it('Discard closes and writes nothing', () => {
    const onClose = jest.fn();
    renderWithQuery(
      <AskMakerSheet open onClose={onClose} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a held note read-only, with no act and still no Send', () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={HELD} />,
    );
    expect(screen.getByLabelText('Note')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.getByText(/Held for review 7 October\./)).toBeInTheDocument();
    for (const name of namedControls()) expect(name).not.toMatch(/send/i);
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads Cedar Lane's install head and asks the maker (1-4)", async () => {
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(
      screen.getByText(
        "Reading chair isn't here, and no arrival date is recorded. 1 more isn't here.",
      ),
    ).toBeInTheDocument();
    const act = screen.getByRole('button', { name: 'Ask the maker for a date' });
    fireEvent.click(act);
    expect(await screen.findByRole('button', { name: 'Hold for review' })).toBeInTheDocument();
  });

  it('after a reload, a held note reads Asked {date} · draft held for review (1-5)', async () => {
    heldDrafts = [HELD];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={CEDAR_LANE} />);
    expect(
      await screen.findByText('Asked 7 October · draft held for review'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open the held draft' }));
    expect(await screen.findByLabelText('Note')).toHaveAttribute('readonly');
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
  });
});
