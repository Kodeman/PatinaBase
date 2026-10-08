/**
 * US-19 FR3 F3-2 (P-2, `one-voice`) — `Nudge {first}` lands on the Message
 * composer: it opens with focus in its note and names the overdue decisions
 * above it. Esc in the composer is taken (F3-1). With the flag off, or with
 * no client to write to, the press is never taken here.
 *
 * The mocking shape is letterhead-instruments.test.tsx's.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_LANDING_EVENTS } from '@/lib/document/act-names';
import { LetterheadInstruments } from '../letterhead-instruments';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }),
        }),
      }),
    }),
    storage: { from: () => ({ createSignedUrls: () => Promise.resolve({ data: [], error: null }) }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
  }),
  useProjectV2: () => ({ data: {} }),
  useProjectRoster: () => ({ data: [] }),
  resolveCoverPhoto: () => null,
  publicUrlToPath: () => null,
}));
jest.mock('@/hooks/use-margin-items', () => ({ invalidateMarginSurfaces: jest.fn() }));
jest.mock('@/hooks/use-project-lifecycle', () => ({
  useSaveProjectVitals: () => ({ mutate: jest.fn(), isPending: false }),
}));
let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({
    value: key === 'one-voice' ? mockOneVoice : true,
    isLoading: false,
  }),
}));
jest.mock('../mobile/mobile-shell', () => ({
  useMobilePrimaryAction: jest.fn(),
  useMobileSecondaryAction: jest.fn(),
}));
jest.mock('../overlays/keys-sheet', () => ({ openKeys: jest.fn() }));
jest.mock('../letterhead-vitals', () => ({ openVitalsEditor: jest.fn() }));
jest.mock('../lens-band', () => ({ OPEN_STANDING_SHEET_EVENT: 'document:open-standing-sheet' }));
jest.mock('../client-mirror', () => ({ ClientMirror: () => null }));
jest.mock('../proposal-preview', () => ({ ProposalPreview: () => null }));
jest.mock('../overlays/household-sheet', () => ({ HouseholdSheet: () => null }));

function renderFor(clientProfileId: string | null = 'client-1', clientName = 'Nora Chen') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <LetterheadInstruments projectId="proj-1" clientProfileId={clientProfileId} clientName={clientName} />
    </QueryClientProvider>,
  );
}

/** What page.tsx's band press does under one-voice; true when taken. */
function nudge(named: string[]): boolean {
  let taken = false;
  act(() => {
    taken = !window.dispatchEvent(
      new CustomEvent(ACT_LANDING_EVENTS.composeMessage, { detail: { named }, cancelable: true }),
    );
  });
  return taken;
}

const note = () => screen.getByPlaceholderText('A quick note to Nora…');

beforeEach(() => {
  mockOneVoice = true;
});

describe('Nudge {first} lands on the Message composer (F3-2)', () => {
  it('opens the composer with focus in its note, the overdue decisions named', async () => {
    renderFor();
    expect(screen.queryByPlaceholderText('A quick note to Nora…')).toBeNull();

    expect(nudge(['Living room rug', 'Dining chairs'])).toBe(true);
    await waitFor(() => expect(note()).toHaveFocus());
    expect(screen.getByText('Waiting on Nora: Living room rug · Dining chairs')).toBeInTheDocument();
    // The note itself is hers to write; nothing is drafted for her.
    expect(note()).toHaveValue('');
  });

  it('Esc in the composer closes it and is taken, so the paper stays put', async () => {
    renderFor();
    nudge(['Living room rug']);
    await waitFor(() => expect(note()).toHaveFocus());
    const send = screen.getByRole('button', { name: /^Send/ });
    expect(fireEvent.keyDown(send, { key: 'Escape' })).toBe(false);
    expect(screen.queryByPlaceholderText('A quick note to Nora…')).toBeNull();
    expect(screen.queryByText(/^Waiting on Nora/)).toBeNull();
  });

  it('leaves the press untaken with no client to write to', () => {
    renderFor(null);
    expect(nudge(['Living room rug'])).toBe(false);
  });

  it('leaves the press untaken with one-voice off', () => {
    mockOneVoice = false;
    renderFor();
    expect(nudge(['Living room rug'])).toBe(false);
    expect(screen.queryByPlaceholderText(/^A quick note to/)).toBeNull();
  });
});

/** The pressed act, outside the letterhead: the band's act at 1440 or the
 *  dock centre at 390, each a real button that holds focus when pressed. */
const pressed: HTMLElement[] = [];
function pressedAct(attrs: Record<string, string>): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = 'Nudge Nora';
  for (const [k, v] of Object.entries(attrs)) button.setAttribute(k, v);
  document.body.appendChild(button);
  pressed.push(button);
  return button;
}

describe('FR4 Fix 2 — Esc is Cancel: focus returns to the pressed act', () => {
  afterEach(() => {
    pressed.splice(0).forEach((el) => el.remove());
  });

  it('the band act at 1440: Esc closes the composer, is taken, and focus is back on the act', async () => {
    renderFor();
    const band = pressedAct({ 'data-part': 'act' });
    band.focus();
    nudge(['Living room rug']);
    await waitFor(() => expect(note()).toHaveFocus());

    expect(fireEvent.keyDown(note(), { key: 'Escape' })).toBe(false);
    expect(screen.queryByPlaceholderText('A quick note to Nora…')).toBeNull();
    expect(band).toHaveFocus();
  });

  it('the dock centre at 390: focus goes back to the centre', async () => {
    renderFor();
    const centre = pressedAct({
      'data-action-region': 'lens-band',
      'data-action-key': 'next:own:document-act-proposal-nudge',
    });
    centre.focus();
    nudge([]);
    await waitFor(() => expect(note()).toHaveFocus());

    fireEvent.keyDown(note(), { key: 'Escape' });
    expect(centre).toHaveFocus();
  });

  it('a press that left focus on <body> (Safari): focus goes to the rendered band act', async () => {
    renderFor();
    const line = document.createElement('div');
    line.setAttribute('data-lens-line', '2');
    document.body.appendChild(line);
    pressed.push(line);
    const band = document.createElement('button');
    band.setAttribute('data-part', 'act');
    band.getClientRects = () => [{}] as unknown as DOMRectList;
    line.appendChild(band);
    (document.activeElement as HTMLElement | null)?.blur();
    nudge([]);
    await waitFor(() => expect(note()).toHaveFocus());
    fireEvent.keyDown(note(), { key: 'Escape' });
    expect(band).toHaveFocus();
  });

  it('Cancel returns focus the same way', async () => {
    renderFor();
    const band = pressedAct({ 'data-part': 'act' });
    band.focus();
    nudge([]);
    await waitFor(() => expect(note()).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(band).toHaveFocus();
  });

  it('the letterhead’s own Message: Esc returns focus to it', async () => {
    renderFor();
    const message = screen.getByRole('button', { name: 'Message Nora' });
    message.focus();
    fireEvent.click(message);
    await waitFor(() => expect(note()).toBeInTheDocument());
    note().focus();
    fireEvent.keyDown(note(), { key: 'Escape' });
    expect(message).toHaveFocus();
  });
});

describe('FR4 Fix 2 — the name guard on the composer', () => {
  it('a real first name: `A quick note to Nora…` and `It lands in Nora’s portal messages.`', async () => {
    renderFor();
    nudge([]);
    await waitFor(() => expect(note()).toBeInTheDocument());
    expect(screen.getByText(/It lands in Nora’s portal messages\.$/)).toBeInTheDocument();
  });

  it('the seed’s `Client User`: `the client` everywhere, never the record', async () => {
    renderFor('client-1', 'Client User');
    nudge(['Living room rug']);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('A quick note to the client…')).toBeInTheDocument(),
    );
    expect(screen.getByText(/It lands in the client’s portal messages\.$/)).toBeInTheDocument();
    expect(screen.getByText('Waiting on the client: Living room rug')).toBeInTheDocument();
    expect(screen.queryByText(/Client User/)).toBeNull();
  });

  it('an article-led household: `the Ashfords’` possessive', async () => {
    renderFor('client-1', 'The Ashfords');
    nudge([]);
    await waitFor(() =>
      expect(screen.getByPlaceholderText('A quick note to the Ashfords…')).toBeInTheDocument(),
    );
    expect(screen.getByText(/It lands in the Ashfords’ portal messages\.$/)).toBeInTheDocument();
  });

  it('flag off: the composer prints the household record as today', () => {
    mockOneVoice = false;
    renderFor('client-1', 'Client User');
    fireEvent.click(screen.getByRole('button', { name: 'Message the client' }));
    expect(screen.getByPlaceholderText('A quick note to Client User…')).toBeInTheDocument();
  });
});
