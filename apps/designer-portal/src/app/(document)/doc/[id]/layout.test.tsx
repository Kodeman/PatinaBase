/**
 * US-21 D14 (T-6): the time hold lives on the /doc/[id] layout. Walking into a
 * child route (spec book, boards, plans, pieces) and back keeps ONE hold with
 * no release; a different [id] releases and re-holds once.
 *
 * The real DocumentTimeProvider and the real useHoldDocument run here. Only
 * their data edges are mocked, as in hooks/document-time-provider.test.tsx. A
 * hold is observed as the timer start it causes, a release as the stop of the
 * held project's running timer: a release-then-hold of the same document would
 * read `startTimer, stopTimer, startTimer`.
 */
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import DocumentHoldLayout from './layout';
import { DocumentTimeProvider, useDocumentTime } from '@/hooks/document-time-provider';

const events: string[] = [];

let runningTimerRow: {
  id: string;
  project_id: string;
  started_at: string;
  billable: boolean;
} | null = null;

function chainBuilder() {
  const builder: Record<string, jest.Mock> & { then?: (resolve: (v: unknown) => void) => void } =
    {};
  ['select', 'is', 'eq', 'gte', 'not', 'order'].forEach((method) => {
    builder[method] = jest.fn(() => builder);
  });
  (builder as { maybeSingle: () => Promise<unknown> }).maybeSingle = jest.fn(async () => ({
    data: runningTimerRow,
    error: null,
  }));
  builder.then = ((resolve: (v: unknown) => void) => resolve({ data: [], error: null })) as any;
  return builder;
}

const mockStopTimer = jest.fn(async (input: Record<string, unknown>) => {
  events.push(`stopTimer:${runningTimerRow?.project_id}`);
  const stopped = runningTimerRow;
  runningTimerRow = null;
  return {
    id: input.entryId as string,
    project_id: stopped?.project_id,
    duration_minutes: 12,
    billable: false,
    hourly_rate_cents: null,
    rate_source: 'none',
    rate_role: null,
    rated_amount_cents: null,
  };
});

const mockStartTimer = jest.fn(async (input: { projectId: string }) => {
  events.push(`startTimer:${input.projectId}`);
  runningTimerRow = {
    id: `entry-${input.projectId}`,
    project_id: input.projectId,
    started_at: new Date().toISOString(),
    billable: false,
  };
  return { started: runningTimerRow, stopped: null };
});

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn(() => chainBuilder()),
  }),
  useRunningTimer: () => ({ data: null }),
  useStartTimer: () => ({ mutateAsync: mockStartTimer }),
  useStopTimer: () => ({ mutateAsync: mockStopTimer }),
  useDiscardTimer: () => ({ mutateAsync: jest.fn() }),
  useCreateTimeEntry: () => ({ mutateAsync: jest.fn() }),
  useUpdateTimeEntry: () => ({ mutateAsync: jest.fn() }),
  useDeleteTimeEntry: () => ({ mutateAsync: jest.fn() }),
  timeAutostartKeys: { preference: ['time-autostart-preference'] },
  fetchTimeAutostartPreference: async () => ({
    optedOut: false,
    disclosedAt: '2026-01-01T00:00:00.000Z',
  }),
  useTimeAutostartPreference: () => ({
    preference: { optedOut: false, disclosedAt: '2026-01-01T00:00:00.000Z' },
    optedOut: false,
    disclosedAt: '2026-01-01T00:00:00.000Z',
    isSettled: true,
    disclosureRead: true,
  }),
  useMarkTimeAutostartDisclosed: () => ({ mutate: jest.fn() }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: { authority: (id: string) => ['project-authority', id] },
  fetchProjectBillingAuthority: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/lib/document/authority-hours', () => ({
  automaticTimeBillingIntent: () => ({ billable: false, reason: 'no_authority' }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    time: { timerStarted: jest.fn(), timerStopped: jest.fn(), autostartDisclosed: jest.fn() },
  },
}));

/** document_state rows by route id. `doc-a` and `doc-b` are project documents;
 *  `old-proposal` is an activated proposal's id, which only redirects. */
const mockResolutions: Record<string, unknown> = {
  'doc-a': {
    kind: 'engagement',
    row: { engagement_id: 'doc-a', project_id: 'project-a', title: 'Alder House', current_phase: 'design_development' },
  },
  'doc-b': {
    kind: 'engagement',
    row: { engagement_id: 'doc-b', project_id: 'project-b', title: 'Birch Flat', current_phase: null },
  },
  'old-proposal': { kind: 'redirect', projectId: 'project-a' },
};
const mockUseDocumentEngagement = jest.fn((id: string) => ({ data: mockResolutions[id] }));
jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: (id: string) => mockUseDocumentEngagement(id),
}));

/** Next hands a client layout a params thenable React can read synchronously;
 *  a fresh one per navigation, as the router may. */
function paramsFor(id: string) {
  return { status: 'fulfilled', value: { id }, then: () => undefined } as unknown as Promise<{
    id: string;
  }>;
}

/** Every held project id the drawer's side of the provider has seen. */
const heldSeen: Array<string | null> = [];
function HeldProbe() {
  heldSeen.push(useDocumentTime().heldProjectId);
  return null;
}

function DocPaper() {
  return (
    <main data-arrival-held="document" data-testid="paper">
      <HeldProbe />
    </main>
  );
}
function SpecBook() {
  return (
    <section data-testid="spec-book">
      <HeldProbe />
    </section>
  );
}

/** Let every queued hold/release run to its end. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

describe('/doc/[id] layout — the time hold (US-21 D14)', () => {
  let qc: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => ReactNode;

  beforeEach(() => {
    events.length = 0;
    heldSeen.length = 0;
    runningTimerRow = null;
    mockStartTimer.mockClear();
    mockStopTimer.mockClear();
    mockUseDocumentEngagement.mockClear();
    qc = new QueryClient();
    wrapper = ({ children }) => (
      <QueryClientProvider client={qc}>
        <DocumentTimeProvider>{children}</DocumentTimeProvider>
      </QueryClientProvider>
    );
  });

  it('holds once, and never releases, across /doc/A → /doc/A/spec-book → /doc/A', async () => {
    const view = render(
      <DocumentHoldLayout params={paramsFor('doc-a')}>
        <DocPaper />
      </DocumentHoldLayout>,
      { wrapper },
    );
    await waitFor(() => expect(mockStartTimer).toHaveBeenCalledTimes(1));
    expect(mockStartTimer).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-a', phaseKey: 'design_development' }),
    );

    view.rerender(
      <DocumentHoldLayout params={paramsFor('doc-a')}>
        <SpecBook />
      </DocumentHoldLayout>,
    );
    await settle();
    expect(view.getByTestId('spec-book')).toBeInTheDocument();

    view.rerender(
      <DocumentHoldLayout params={paramsFor('doc-a')}>
        <DocPaper />
      </DocumentHoldLayout>,
    );
    await settle();

    expect(events).toEqual(['startTimer:project-a']);
    expect(mockStopTimer).not.toHaveBeenCalled();
    // Once held, the drawer never saw the document put down.
    const firstHeld = heldSeen.indexOf('project-a');
    expect(firstHeld).toBeGreaterThanOrEqual(0);
    expect(heldSeen.slice(firstHeld).every((held) => held === 'project-a')).toBe(true);
    // The same hook and key the page reads: the route id, nothing else.
    expect(new Set(mockUseDocumentEngagement.mock.calls.map(([id]) => id))).toEqual(
      new Set(['doc-a']),
    );
  });

  it('a move to /doc/B releases A and holds B once', async () => {
    const view = render(
      <DocumentHoldLayout params={paramsFor('doc-a')}>
        <DocPaper />
      </DocumentHoldLayout>,
      { wrapper },
    );
    await waitFor(() => expect(mockStartTimer).toHaveBeenCalledTimes(1));

    view.rerender(
      <DocumentHoldLayout params={paramsFor('doc-b')}>
        <DocPaper />
      </DocumentHoldLayout>,
    );
    await waitFor(() => expect(mockStartTimer).toHaveBeenCalledTimes(2));
    await settle();

    expect(events).toEqual(['startTimer:project-a', 'stopTimer:project-a', 'startTimer:project-b']);
    expect(heldSeen[heldSeen.length - 1]).toBe('project-b');
  });

  it('holds nothing for a document that only redirects', async () => {
    render(
      <DocumentHoldLayout params={paramsFor('old-proposal')}>
        <DocPaper />
      </DocumentHoldLayout>,
      { wrapper },
    );
    await settle();

    expect(events).toEqual([]);
    expect(heldSeen.every((held) => held === null)).toBe(true);
  });

  it('adds no element: the arrival-held paper is the layout’s first child', async () => {
    const { container } = render(
      <DocumentHoldLayout params={paramsFor('doc-a')}>
        <DocPaper />
      </DocumentHoldLayout>,
      { wrapper },
    );
    await settle();

    expect(container.childElementCount).toBe(1);
    expect(container.firstElementChild).toHaveAttribute('data-arrival-held', 'document');
    expect(container.firstElementChild).toHaveAttribute('data-testid', 'paper');
  });
});
