/**
 * SQ-1223 R4: unknown is held. The milestone's Generate counts the project's
 * client and studio only from a settled projects read: a re-read in flight
 * after an invalidation, or a failed one, holds even with the earlier answer
 * still cached. Generate then runs one fresh, awaited projects read and drafts
 * only if the client and studio are still there.
 *
 * Runs the real useProjects against a real QueryClient and an in-memory
 * projects table, so the cached data is genuinely retained.
 */
import { type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
let readMode: 'answer' | 'hang' | 'fail' = 'answer';
let reads = 0;

function projects() {
  const builder = {
    select: () => builder,
    order: () => {
      reads += 1;
      if (readMode === 'hang') return new Promise<never>(() => {});
      if (readMode === 'fail') {
        return Promise.resolve({ data: null, error: { message: 'projects read failed' } });
      }
      return Promise.resolve({ data: table.map((p) => ({ ...p })), error: null });
    },
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
const cachedProject = () => qc.getQueryData<Project[]>(['projects'])?.find((p) => p.id === 'project-1');

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
  browser.__supabaseBrowserClient = { from: () => projects() };
});
afterEach(() => {
  qc.clear();
  delete browser.__supabaseBrowserClient;
});

describe('SQ-1223 R4: a projects re-read establishes nothing, even with its answer cached', () => {
  it('holds Generate while the projects re-read after an invalidation, the cached project still in hand', async () => {
    renderBand();
    await readyToGenerate();

    readMode = 'hang';
    act(() => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
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
      void qc.invalidateQueries({ queryKey: ['projects'] });
    });

    await waitFor(() =>
      expect(reasonOf(generateAct())).toHaveTextContent(
        "This project couldn't be read. Reload the page to draft its invoice.",
      ),
    );
    expect(generateAct()).toHaveAttribute('aria-disabled', 'true');
    expect(qc.getQueryState(['projects'])?.status).toBe('error');
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
