/**
 * SQ-1223 R4: unknown is held. The milestone's Generate counts the project's
 * client and studio only from a settled projects read: a re-read in flight
 * after an invalidation, or a failed one, holds even with the earlier answer
 * still cached. Generate then runs one fresh, awaited projects read and drafts
 * only if the client and studio are still there.
 *
 * Runs the real useProject against a real QueryClient and an in-memory
 * projects table, so the cached data is genuinely retained. F5 (SQ-1249): the
 * hold and its fresh read are the project's own entity read, ['project', id],
 * not a search of the useProjects() collection.
 *
 * SQ-1249 F3/F4: under the app's own QueryClient defaults an offline read
 * pauses and resumes on reconnect, so Generate refuses offline before its read,
 * expires if the connection drops while the read is out, and a row unmounted
 * mid-read drafts nothing.
 */
import { type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { nextSubjectQueryClient } from '@/lib/react-query';
import { AccountBand } from '../../account-band';

const mockGenerate = jest.fn();

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useSessionUserId: () => 'lead-1',
  useDocumentClientLinkHold: (projectId: string | null) => ({
    data: projectId ? null : undefined,
  }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/doc/project-1',
}));

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => ({
    data: {
      budgetCents: 50_000,
      totalAmountCents: 50_000,
      designFeeCents: 5_000,
      committedCents: 0,
      committed: { currency: 'USD', cents: 0 },
      margin: { currency: 'USD', cents: 0 },
      clientValueCents: 0,
      tradeCostCents: 0,
      tradeCoverage: { withTrade: 0, total: 0 },
      marginPct: null,
      estCommissionCents: 0,
      rooms: [],
      milestones: [
        {
          id: 'milestone-1',
          label: 'Project deposit',
          percentage: 50,
          amount_cents: 25_000,
          status: 'pending',
          due_date: null,
          paid_at: null,
          trigger_kind: 'on_signing',
          trigger_section_key: null,
          invoice_id: null,
          sort_order: 0,
        },
      ],
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useUpdateMilestoneTrigger: () => ({ mutate: jest.fn(), pending: [] }),
  useGenerateMilestoneInvoice: () => ({ mutate: mockGenerate, isPending: false }),
  exportAccountsQbo: jest.fn(),
}));

jest.mock('../invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
  openInvoiceFolio: jest.fn(),
}));

jest.mock('../../overlays/amendment-sheet', () => ({
  AmendmentSheet: () => null,
}));

jest.mock('../../command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('@/hooks/use-can-see-margin', () => ({
  useCanSeeMargin: () => true,
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false }),
}));

type Project = {
  id: string;
  name: string;
  client_id: string | null;
  studio_id: string | null;
  designer_id: string;
  designer: { full_name: string; display_name: string | null };
};
/** The server's projects table, as it stands now. */
let table: Project[] = [];
/** How the next projects read answers: as the table stands, never, or with an error. */
let readMode: 'answer' | 'hang' | 'fail' | 'deferred' = 'answer';
let reads = 0;
/** Reads held by readMode 'deferred', answered as the table stands when released. */
let deferred: Array<() => void> = [];
const releaseReads = () => {
  const held = deferred;
  deferred = [];
  held.forEach((answer) => answer());
};
/** F5 — the collection's window leaves this project out (the 1000-row cap, say). */
let outsideCollection = false;

function projects() {
  let id: unknown = null;
  const builder = {
    select: () => builder,
    eq: (_column: string, value: unknown) => {
      id = value;
      return builder;
    },
    // useProject(id): the entity read.
    single: () => {
      reads += 1;
      if (readMode === 'hang') return new Promise<never>(() => {});
      if (readMode === 'fail') {
        return Promise.resolve({ data: null, error: { message: 'project read failed' } });
      }
      const answer = () => {
        const row = table.find((p) => p.id === id);
        return row
          ? { data: { ...row }, error: null }
          : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
      };
      if (readMode === 'deferred') {
        return new Promise((resolve) => deferred.push(() => resolve(answer())));
      }
      return Promise.resolve(answer());
    },
    // useProjects(): the collection, which the band no longer searches.
    order: () =>
      Promise.resolve({
        data: table.filter(() => !outsideCollection).map((p) => ({ ...p })),
        error: null,
      }),
  };
  return builder;
}

// createClient() hands back this browser singleton when it is set.
const browser = globalThis as { __supabaseBrowserClient?: unknown };

let qc: QueryClient;
const Paper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>
    {/* The band lies on the document's paper column: the spotlight's frame. */}
    <main data-spotlight-frame="" data-document-paper="">
      {children}
    </main>
  </QueryClientProvider>
);
const renderBand = () => {
  render(<AccountBand projectId="project-1" />, { wrapper: Paper });
  fireEvent.click(screen.getByRole('button', { name: /Project accounts/ }));
};
const generateAct = () => screen.getByRole('button', { name: 'Generate invoice' });
const reasonOf = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby') ?? '');
const spotWindows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-hold-spotlight-window]')).map(
    (el) => el.dataset.holdSpotlightWindow,
  );
const projectKey = ['project', 'project-1'];
const cachedProject = () => qc.getQueryData<Project>(projectKey);

/** The band has read the project and Generate stands ready. */
async function readyToGenerate() {
  await waitFor(() => expect(generateAct()).not.toHaveAttribute('aria-disabled'));
}

beforeEach(() => {
  jest.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  table = [
    {
      id: 'project-1',
      name: 'Wren Street Library',
      client_id: 'client-1',
      studio_id: 'studio-1',
      designer_id: 'lead-1',
      designer: { full_name: 'Leah Park', display_name: null },
    },
  ];
  readMode = 'answer';
  reads = 0;
  deferred = [];
  outsideCollection = false;
  browser.__supabaseBrowserClient = { from: () => projects() };
});
afterEach(() => {
  act(() => onlineManager.setOnline(true));
  qc.clear();
  delete browser.__supabaseBrowserClient;
});

describe('SQ-1223 R4: a projects re-read establishes nothing, even with its answer cached', () => {
  it('holds Generate while the projects re-read after an invalidation, the cached project still in hand', async () => {
    renderBand();
    await readyToGenerate();

    readMode = 'hang';
    act(() => {
      void qc.invalidateQueries({ queryKey: projectKey });
    });

    await waitFor(() => expect(generateAct()).toHaveAttribute('aria-disabled', 'true'));
    expect(reasonOf(generateAct())).toHaveTextContent('Checking this project before drafting its invoice.');
    // The retained answer is still the cached one: this is a refetch, not a first read.
    expect(cachedProject()?.client_id).toBe('client-1');

    fireEvent.click(generateAct());
    await waitFor(() => expect(spotWindows()).toEqual(['project-read']));
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('holds Generate on why after the projects re-read fails, the cached project still in hand', async () => {
    renderBand();
    await readyToGenerate();

    readMode = 'fail';
    act(() => {
      void qc.invalidateQueries({ queryKey: projectKey });
    });

    await waitFor(() =>
      expect(reasonOf(generateAct())).toHaveTextContent(
        "This project couldn't be read. Reload the page to draft its invoice.",
      ),
    );
    expect(generateAct()).toHaveAttribute('aria-disabled', 'true');
    expect(qc.getQueryState(projectKey)?.status).toBe('error');
    expect(cachedProject()?.studio_id).toBe('studio-1');

    fireEvent.click(generateAct());
    await waitFor(() => expect(spotWindows()).toEqual(['project-read']));
    expect(mockGenerate).not.toHaveBeenCalled();
  });
});

describe('SQ-1223 R4: Generate reads the project fresh before it drafts', () => {
  it('refuses to draft when the fresh read finds the client gone', async () => {
    renderBand();
    await readyToGenerate();
    // The client is unlinked elsewhere; this band's cache still has her.
    table[0]!.client_id = null;
    const before = reads;

    fireEvent.click(generateAct());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not draft the invoice — Wren Street Library has no client yet.',
    );
    expect(reads - before).toBe(1);
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('refuses to draft when the fresh read finds the studio gone', async () => {
    renderBand();
    await readyToGenerate();
    table[0]!.studio_id = null;

    fireEvent.click(generateAct());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Could not draft the invoice — Wren Street Library isn't tied to your studio yet.",
    );
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('refuses to draft when the fresh read fails, whatever the cache holds', async () => {
    renderBand();
    await readyToGenerate();
    readMode = 'fail';

    fireEvent.click(generateAct());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Could not draft the invoice — This project couldn't be read. Reload the page to draft its invoice.",
    );
    expect(cachedProject()?.client_id).toBe('client-1');
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('control: with the client and studio still there, the fresh read answers and Generate drafts once', async () => {
    renderBand();
    await readyToGenerate();
    const before = reads;

    fireEvent.click(generateAct());

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('milestone-1', expect.anything()));
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(reads - before).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('SQ-1249 F5: the hold stands on the project itself, not on the collection', () => {
  it('drafts a project the projects collection leaves out: readiness and the fresh read are its own', async () => {
    outsideCollection = true;
    renderBand();
    await readyToGenerate();
    const before = reads;

    fireEvent.click(generateAct());

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('milestone-1', expect.anything()));
    expect(reads - before).toBe(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe("SQ-1249 F3/F4: Generate's fresh read under the app's own network defaults", () => {
  const offline = "Could not draft the invoice — You’re offline. Nothing was sent.";
  /** Let a reconnect's paused reads resume and anything they would continue into run. */
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  beforeEach(() => {
    qc = nextSubjectQueryClient();
  });

  it('F3: offline at the press refuses before the read, and reconnecting drafts nothing', async () => {
    renderBand();
    await readyToGenerate();
    const before = reads;

    act(() => onlineManager.setOnline(false));
    fireEvent.click(generateAct());

    expect(await screen.findByRole('alert')).toHaveTextContent(offline);
    expect(reads - before).toBe(0);

    act(() => onlineManager.setOnline(true));
    await settle();
    await settle();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('F3: the connection dropping while the read is out expires the act; it never resumes into a draft', async () => {
    renderBand();
    await readyToGenerate();
    readMode = 'deferred';

    fireEvent.click(generateAct());
    await waitFor(() => expect(deferred).toHaveLength(1));
    act(() => onlineManager.setOnline(false));

    expect(await screen.findByRole('alert')).toHaveTextContent(offline);

    act(() => onlineManager.setOnline(true));
    readMode = 'answer';
    act(() => releaseReads());
    await settle();
    await settle();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('F4: the pressed Generate shows its pending read, and a row unmounted mid-read drafts nothing', async () => {
    const { unmount } = render(<AccountBand projectId="project-1" />, { wrapper: Paper });
    fireEvent.click(screen.getByRole('button', { name: /Project accounts/ }));
    await readyToGenerate();
    readMode = 'deferred';

    fireEvent.click(generateAct());
    await waitFor(() => expect(deferred).toHaveLength(1));
    expect(screen.getByRole('button', { name: /Generating/ })).toHaveAttribute('aria-busy', 'true');

    unmount();
    act(() => releaseReads());
    await settle();
    await settle();
    expect(mockGenerate).not.toHaveBeenCalled();
  });

  it('control: online, with the read answered, Generate drafts once', async () => {
    renderBand();
    await readyToGenerate();
    readMode = 'deferred';

    fireEvent.click(generateAct());
    await waitFor(() => expect(deferred).toHaveLength(1));
    act(() => releaseReads());

    await waitFor(() => expect(mockGenerate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
