import type { ReactNode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TeachingNote, TeachingNoteState } from '@/lib/teaching/types';
import { resetTeachingNoteSession } from '@/hooks/use-teaching-note';
import {
  StudioSetupWhisper,
  useStudioSetupWhisperEligible,
} from '@/components/document/account/studio-setup-whisper';
import {
  pickDeskLine,
  resetDeskVisit,
  useDeskLine,
  type DeskLineCandidates,
  type DeskLineKey,
  type DeskLineState,
} from './desk-arbiter';

let mockSuppress = false;
const mockSeen = new Set<string>();
let mockTeaching: { body: string } | null = null;
let mockSinceLine: { items: { id: string; headline: string }[]; changesHref: string } | null = null;
/** Teaching's reads had arrived at first paint (else it yields the load). */
let mockReadsIn = true;
/** The stored visit's unsolicited line, already shown. */
let mockUnsolicitedShown: string | null = null;
const mockReturnNote = jest.fn();
/** Run the real `useReturnNote` over the mocked data hooks below. */
let mockRealTeaching = false;

// The real hook's data: teaching reads, flags, at rest, and the whisper's studio.
let mockNotes: TeachingNote[] | undefined;
let mockReleases: unknown[] | undefined;
let mockState: TeachingNoteState | undefined;
let mockSignals: unknown;
let mockRole = 'owner';
let client: QueryClient;
const STATE_KEY = ['teaching-note-state'];

function setIn(target: unknown, path: string[], value: unknown): unknown {
  const [head, ...rest] = path;
  const base = (target && typeof target === 'object' ? target : {}) as Record<string, unknown>;
  return { ...base, [head]: rest.length ? setIn(base[head], rest, value) : value };
}

const mockPatch = jest.fn(async (path: string[], value: unknown) => {
  const next = setIn(client.getQueryData(STATE_KEY), path, value);
  client.setQueryData(STATE_KEY, next);
  return next;
});

jest.mock('@/hooks/use-teaching-data', () => ({
  TEACHING_NOTE_STATE_KEY: ['teaching-note-state'],
  useTeachingNotes: () => ({ data: mockNotes }),
  useTeachingReleases: () => ({ data: mockReleases }),
  useTeachingNoteState: () => ({ state: mockState, patch: mockPatch, isLoading: !mockState }),
  useTeachingSignals: () => ({ data: mockSignals }),
}));
jest.mock('@/hooks/use-feature-flags', () => ({
  useFeatureFlags: () => ({ 'teaching-notes': { value: true, isLoading: false } }),
}));
jest.mock('@/hooks/use-teaching-at-rest', () => ({ useTeachingAtRest: () => true }));
jest.mock('@/lib/analytics/teaching-events', () => ({ captureTeachingEvent: jest.fn() }));
// studio-workspaces: the whisper's flag, on.
jest.mock('@/hooks/use-feature-flag', () => ({ useFeatureFlag: () => ({ value: true, isLoading: false }) }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/components/document/account/account-sheet', () => ({ openAccountPage: jest.fn() }));
// A studio with four open setup steps (no crew, contacts or projects yet).
jest.mock('@patina/supabase', () => ({
  useProjects: () => ({ data: [], isLoading: false }),
  useOrganizations: () => ({
    data: [
      {
        id: 'org-1',
        type: 'design_studio',
        created_at: '2026-01-01T00:00:00Z',
        rolodex_seed_skipped_at: null,
        membership: { role: mockRole },
      },
    ],
    isLoading: false,
  }),
  useOrganizationMembers: () => ({ data: [{ user_id: 'me', job_title: 'Principal', status: 'active' }], isLoading: false }),
  useStudioContacts: () => ({ data: [], isLoading: false }),
}));

jest.mock('@/components/document/help/desk-walkthrough', () => ({
  useSuppressDeskFirstTouch: () => mockSuppress,
}));
jest.mock('@/components/document/margin-note', () => ({
  hasMarginNoteBeenSeen: (key: string) => mockSeen.has(key),
  MarginNote: ({ noteKey, label, children }: { noteKey: string; label?: string; children: ReactNode }) => (
    <aside data-testid={`note-${noteKey}`}>
      {label}
      {children}
    </aside>
  ),
}));
jest.mock('@/hooks/use-teaching-note', () => {
  const actual = jest.requireActual('@/hooks/use-teaching-note');
  return {
    ...actual,
    useReturnNote: (opts: { pinnedProjectIds: string[]; ready: boolean; taken: boolean }) => {
      mockReturnNote(opts);
      if (mockRealTeaching) return actual.useReturnNote(opts);
      // As the hook does: decided at first paint, where a read still pending
      // yields the load (R-RT7); a since-line means no teaching note is chosen.
      const decided = opts.ready;
      const live = decided && mockReadsIn;
      const note = live && !opts.taken && !mockSinceLine ? mockTeaching : null;
      return {
        note: note && { noteKey: 'galley-parts@1', body: note.body },
        bind: note && {
          noteKey: 'galley-parts@1',
          seen: false,
          actionEvents: [],
          label: 'WORKSHOP NOTE · 10 SEP',
          placement: 'default',
          captureEvents: false,
          onSeen: () => {},
        },
        sinceLine: live ? mockSinceLine : null,
        decided,
        yielded: decided && !mockReadsIn,
        unsolicitedShown: live ? mockUnsolicitedShown : null,
      };
    },
  };
});

type Legacy = Exclude<DeskLineKey, 'teaching-note'>;

function candidates(when: Partial<Record<Legacy, DeskLineState>>): DeskLineCandidates {
  const line = (key: Legacy) => ({
    when: when[key] ?? false,
    node: <p data-testid={`line-${key}`}>{key}</p>,
  });
  return {
    'hire-handoff': line('hire-handoff'),
    'desk-first-touch': line('desk-first-touch'),
    'desk-walkthrough-offer': line('desk-walkthrough-offer'),
    'setup-whisper': line('setup-whisper'),
  };
}

function Desk({ ready = true, lines }: { ready?: boolean; lines: DeskLineCandidates }) {
  return <div data-testid="slot">{useDeskLine({ ready, pinnedProjectIds: ['p1'], lines })}</div>;
}

const shown = () => screen.getByTestId('slot').querySelectorAll('[data-testid^="line-"], [data-testid^="note-"]');

beforeEach(() => {
  resetDeskVisit();
  mockSuppress = false;
  mockSeen.clear();
  mockTeaching = null;
  mockSinceLine = null;
  mockReadsIn = true;
  mockUnsolicitedShown = null;
  mockReturnNote.mockClear();
  mockRealTeaching = false;
});

const lastOnScreen = () => mockReturnNote.mock.calls.at(-1)?.[0].onScreen;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('pickDeskLine — the priority table', () => {
  const all = (over: Partial<Record<DeskLineKey, DeskLineState>>): Record<DeskLineKey, DeskLineState> => ({
    'hire-handoff': false,
    'desk-first-touch': false,
    'desk-walkthrough-offer': false,
    'teaching-note': false,
    'setup-whisper': false,
    ...over,
  });

  it.each<[string, Partial<Record<DeskLineKey, DeskLineState>>, DeskLineKey | null | undefined]>([
    ['nothing eligible', {}, null],
    [
      'a person’s words beat everything',
      {
        'hire-handoff': true,
        'desk-first-touch': true,
        'desk-walkthrough-offer': true,
        'teaching-note': true,
        'setup-whisper': true,
      },
      'hire-handoff',
    ],
    [
      'first touch beats the offer, teaching and whisper',
      { 'desk-first-touch': true, 'desk-walkthrough-offer': true, 'teaching-note': true, 'setup-whisper': true },
      'desk-first-touch',
    ],
    [
      'the walkthrough offer beats teaching and whisper',
      { 'desk-walkthrough-offer': true, 'teaching-note': true, 'setup-whisper': true },
      'desk-walkthrough-offer',
    ],
    ['the teaching note beats the whisper', { 'teaching-note': true, 'setup-whisper': true }, 'teaching-note'],
    ['the whisper comes last', { 'setup-whisper': true }, 'setup-whisper'],
    ['a pending line ahead holds the pick', { 'hire-handoff': 'pending', 'setup-whisper': true }, undefined],
    ['an undecided teaching note holds the whisper', { 'teaching-note': 'pending', 'setup-whisper': true }, undefined],
    ['a pending line behind the winner does not', { 'desk-first-touch': true, 'setup-whisper': 'pending' }, 'desk-first-touch'],
  ])('%s', (_name, over, expected) => {
    expect(pickDeskLine(all(over))).toBe(expected);
  });
});

describe('useDeskLine', () => {
  it('renders at most one line, the highest eligible', () => {
    mockTeaching = { body: 'A signed part now draws its PO.' };
    render(
      <Desk
        lines={candidates({
          'hire-handoff': true,
          'desk-first-touch': true,
          'desk-walkthrough-offer': true,
          'setup-whisper': true,
        })}
      />
    );
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('line-hire-handoff')).toBeInTheDocument();
    expect(mockReturnNote).toHaveBeenLastCalledWith(expect.objectContaining({ taken: true }));
  });

  it('skips a once-only line already seen', () => {
    mockSeen.add('hire-handoff');
    render(<Desk lines={candidates({ 'hire-handoff': true, 'desk-first-touch': true })} />);
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('line-desk-first-touch')).toBeInTheDocument();
  });

  it('gives the slot to the teaching note when nothing ahead of it is eligible', () => {
    mockTeaching = { body: 'A signed part now draws its PO.' };
    render(<Desk lines={candidates({ 'setup-whisper': true })} />);
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('note-galley-parts@1')).toHaveTextContent(
      'WORKSHOP NOTE · 10 SEPA signed part now draws its PO.'
    );
    expect(mockReturnNote).toHaveBeenCalledWith({
      pinnedProjectIds: ['p1'],
      ready: true,
      taken: false,
      onScreen: 'teaching-note',
    });
  });

  it('falls to the whisper when there is nothing to teach', () => {
    render(<Desk lines={candidates({ 'setup-whisper': true })} />);
    expect(shown()).toHaveLength(1);
    expect(screen.getByTestId('line-setup-whisper')).toBeInTheDocument();
  });

  it('renders nothing, and no placeholder, when no line is eligible', () => {
    render(<Desk lines={candidates({})} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
  });

  it('renders nothing before the Desk is ready, or while a line ahead is pending', () => {
    const { rerender } = render(<Desk ready={false} lines={candidates({ 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();

    rerender(<Desk lines={candidates({ 'hire-handoff': 'pending', 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();

    rerender(<Desk lines={candidates({ 'hire-handoff': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('line-hire-handoff')).toBeInTheDocument();
  });

  it('tells teaching the slot is taken while a line ahead is still pending at first paint', () => {
    mockTeaching = { body: 'A signed part now draws its PO.' };
    render(<Desk lines={candidates({ 'hire-handoff': 'pending', 'setup-whisper': true })} />);
    expect(mockReturnNote).toHaveBeenCalledWith(expect.objectContaining({ ready: true, taken: true }));
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
  });

  it('renders nothing while the walkthrough is on screen (R-RT2), and gives teaching no slot', () => {
    mockSuppress = true;
    mockTeaching = { body: 'A signed part now draws its PO.' };
    const { rerender } = render(<Desk lines={candidates({ 'desk-first-touch': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
    expect(mockReturnNote).toHaveBeenCalledWith(expect.objectContaining({ taken: true }));

    mockSuppress = false;
    rerender(<Desk lines={candidates({ 'desk-first-touch': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('line-desk-first-touch')).toBeInTheDocument();
  });

  describe('the since-line', () => {
    const SINCE = {
      items: [{ id: '2026-09-10-galley-parts', headline: 'Parts draw POs' }],
      changesHref: '/help/changes',
    };

    it('takes the teaching slot, alone: no teaching note and no whisper beside it', () => {
      mockSinceLine = SINCE;
      mockTeaching = { body: 'A signed part now draws its PO.' };
      render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByRole('button', { name: 'Since you were last here' })).toBeInTheDocument();
      expect(screen.getByText('Parts draw POs')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'What changed', hidden: true })).toHaveAttribute(
        'href',
        '/help/changes'
      );
      expect(shown()).toHaveLength(0);
    });

    it('yields to a line ahead of teaching', () => {
      mockSinceLine = SINCE;
      render(<Desk lines={candidates({ 'desk-walkthrough-offer': true })} />);
      expect(screen.getByTestId('line-desk-walkthrough-offer')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Since you were last here' })).not.toBeInTheDocument();
    });

    it('holds while the walkthrough is on screen (R-RT2)', () => {
      mockSuppress = true;
      mockSinceLine = SINCE;
      const { rerender } = render(<Desk lines={candidates({})} />);
      expect(screen.getByTestId('slot')).toBeEmptyDOMElement();

      mockSuppress = false;
      rerender(<Desk lines={candidates({})} />);
      expect(screen.getByRole('button', { name: 'Since you were last here' })).toBeInTheDocument();
    });
  });

  it('one line per visit: a later Desk load in the visit keeps the visit’s line', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const first = render(<Desk lines={candidates({ 'desk-walkthrough-offer': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('line-desk-walkthrough-offer')).toBeInTheDocument();
    first.unmount();

    // Ten minutes later: the offer was dismissed, a teaching note is ready.
    now.mockReturnValue(1_000_000 + 10 * 60 * 1000);
    mockSeen.add('desk-walkthrough-offer');
    mockTeaching = { body: 'A signed part now draws its PO.' };
    const second = render(<Desk lines={candidates({ 'desk-walkthrough-offer': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
    expect(mockReturnNote).toHaveBeenLastCalledWith(expect.objectContaining({ taken: true }));
    second.unmount();

    // Forty minutes after that, a new visit.
    now.mockReturnValue(1_000_000 + 50 * 60 * 1000);
    render(<Desk lines={candidates({ 'desk-walkthrough-offer': true, 'setup-whisper': true })} />);
    expect(screen.getByTestId('note-galley-parts@1')).toBeInTheDocument();
  });

  describe('the visit’s one unsolicited line, in the stored visit', () => {
    const SINCE = {
      items: [{ id: '2026-09-10-galley-parts', headline: 'Parts draw POs' }],
      changesHref: '/help/changes',
    };

    it('tells teaching when its own slot is on screen: never the whisper, never a line ahead', () => {
      mockSinceLine = SINCE;
      const since = render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByRole('button', { name: 'Since you were last here' })).toBeInTheDocument();
      expect(lastOnScreen()).toBe('teaching-note');
      since.unmount();

      // The whisper is a Desk line, not teaching: it takes no teaching slot.
      resetDeskVisit();
      mockSinceLine = null;
      const whisper = render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByTestId('line-setup-whisper')).toBeInTheDocument();
      expect(lastOnScreen()).toBeNull();
      whisper.unmount();

      resetDeskVisit();
      render(<Desk lines={candidates({ 'hire-handoff': true, 'setup-whisper': true })} />);
      expect(screen.getByTestId('line-hire-handoff')).toBeInTheDocument();
      expect(lastOnScreen()).toBeNull();
    });

    it('nothing is on screen while the walkthrough is', () => {
      mockSuppress = true;
      render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(lastOnScreen()).toBeNull();
    });

    it('a reload mid-visit after a teaching note: the whisper yields, no second line', () => {
      // A reload drops the module memory; the stored visit says a note showed.
      mockUnsolicitedShown = 'galley-parts@1';
      render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
      expect(lastOnScreen()).toBeNull();
    });

    it('a reload after the whisper: it held no slot, so the order decides again and a teaching note beats it', () => {
      const first = render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByTestId('line-setup-whisper')).toBeInTheDocument();
      first.unmount();

      // A reload drops the module memory; the stored visit holds no line.
      resetDeskVisit();
      mockTeaching = { body: 'A signed part now draws its PO.' };
      render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(shown()).toHaveLength(1);
      expect(screen.getByTestId('note-galley-parts@1')).toBeInTheDocument();
    });

    it('R-RT7: teaching still pending at first paint yields — the whisper is not held, and the next Desk load picks again', () => {
      mockReadsIn = false;
      mockSinceLine = SINCE;
      const first = render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByTestId('line-setup-whisper')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Since you were last here' })).not.toBeInTheDocument();
      first.unmount();

      // Same visit, warm cache: the yielded load's pick was not the visit's line.
      mockReadsIn = true;
      render(<Desk lines={candidates({ 'setup-whisper': true })} />);
      expect(screen.getByRole('button', { name: 'Since you were last here' })).toBeInTheDocument();
      expect(shown()).toHaveLength(0);
    });

    it('R-RT7: a line ahead of teaching, picked while teaching yielded, is still the visit’s line', () => {
      mockReadsIn = false;
      const first = render(<Desk lines={candidates({ 'desk-walkthrough-offer': true })} />);
      expect(screen.getByTestId('line-desk-walkthrough-offer')).toBeInTheDocument();
      first.unmount();

      mockReadsIn = true;
      mockTeaching = { body: 'A signed part now draws its PO.' };
      mockSeen.add('desk-walkthrough-offer');
      render(<Desk lines={candidates({ 'desk-walkthrough-offer': true })} />);
      expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
    });
  });
});

describe('useDeskLine with the real useReturnNote and the real whisper predicate (R3 N1)', () => {
  const NOW = Date.parse('2026-09-25T15:00:00Z');
  const MIN = 60 * 1000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const WHISPER = 'The studio isn’t fully set up.';
  const RELEASE_NOTE: TeachingNote = {
    noteKey: 'galley-parts@1',
    kind: 'release',
    audience: 'all',
    trigger: 'return',
    surfaceKey: 'designer-portal/document/desk',
    releaseId: '2026-09-10-galley-parts',
    body: 'A signed part now draws its PO.',
    priority: 5,
    recedeOn: [],
    maxDisplays: 3,
    provenance: 'agent',
  };
  const RELEASES = [
    {
      id: '2026-09-10-galley-parts',
      shippedOn: '2026-09-10',
      sizeClass: 'workflow_changing',
      featureKeys: ['galley'],
      headline: 'Parts draw POs',
    },
  ];
  const SIGNALS = { role: 'owner', used: {}, lastAt: {}, createdAt: '2026-08-01T00:00:00Z' };

  const patched = (path: string[]) => mockPatch.mock.calls.filter(([p]) => p.join('.') === path.join('.'));

  function RealDesk() {
    const whisper = useStudioSetupWhisperEligible();
    const lines = candidates({});
    lines['setup-whisper'] = { when: whisper, node: <StudioSetupWhisper /> };
    return <div data-testid="slot">{useDeskLine({ ready: true, pinnedProjectIds: [], lines })}</div>;
  }
  const renderReal = () =>
    render(<RealDesk />, {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    resetTeachingNoteSession();
    mockRealTeaching = true;
    mockPatch.mockClear();
    mockRole = 'owner';
    mockNotes = [RELEASE_NOTE];
    mockReleases = RELEASES;
    mockSignals = SIGNALS;
    // A returning designer, two hours away: a new visit, synced just now.
    mockState = {
      v: 1,
      cursor: { lastSeenReleaseId: null },
      visit: { startedAt: iso(NOW - 3 * 60 * MIN), lastActiveAt: iso(NOW - 2 * 60 * MIN) },
    };
    client = new QueryClient();
    client.setQueryData(STATE_KEY, mockState);
  });

  afterEach(async () => {
    // Unmount now and let each mount's close land inside its own test.
    cleanup();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  });

  it('whisper predicate false (a member): the whisper is not eligible and claims nothing; the teaching note renders', async () => {
    mockRole = 'member';
    renderReal();
    expect(screen.getByTestId('note-galley-parts@1')).toHaveTextContent('A signed part now draws its PO.');
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(patched(['visit', 'unsolicitedShown'])).toEqual([[['visit', 'unsolicitedShown'], 'galley-parts@1']])
    );
  });

  it('whisper predicate false and nothing to teach: nothing renders and the visit stays unclaimed for an anchor note', async () => {
    mockRole = 'member';
    mockNotes = [];
    renderReal();
    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
    await waitFor(() => expect(patched(['visit', 'startedAt'])).toHaveLength(1));
    await act(async () => {});
    expect(patched(['visit', 'unsolicitedShown'])).toHaveLength(0);
    expect(client.getQueryData<TeachingNoteState>(STATE_KEY)?.visit?.unsolicitedShown).toBeUndefined();
  });

  it('whisper predicate true, nothing to teach: the whisper renders and claims nothing; teaching records only the Desk load', async () => {
    mockNotes = [];
    renderReal();
    expect(screen.getByText(WHISPER)).toBeInTheDocument();
    await waitFor(() => expect(patched(['visit', 'startedAt'])).toHaveLength(1));
    await act(async () => {});
    expect(patched(['visit', 'unsolicitedShown'])).toHaveLength(0);
    expect(patched(['recentUnsolicited'])).toHaveLength(0);
  });

  it('whisper predicate true, a teaching read pending at first paint: the whisper renders, teaching yields, nothing is written', async () => {
    mockSignals = undefined;
    const first = renderReal();
    expect(screen.getByText(WHISPER)).toBeInTheDocument();
    expect(screen.queryByTestId('note-galley-parts@1')).not.toBeInTheDocument();

    // The read arrives after first paint: this load does not re-decide.
    mockSignals = SIGNALS;
    first.rerender(<RealDesk />);
    expect(screen.getByText(WHISPER)).toBeInTheDocument();
    expect(screen.queryByTestId('note-galley-parts@1')).not.toBeInTheDocument();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
    expect(mockPatch).not.toHaveBeenCalled();
    first.unmount();

    // The next Desk mount, warm cache, same visit: the order decides again.
    renderReal();
    expect(screen.getByTestId('note-galley-parts@1')).toBeInTheDocument();
    expect(screen.queryByText(WHISPER)).not.toBeInTheDocument();
  });
});
