/**
 * The Hours sheet's scope lens (HT-8/HT-9/HT-10-a/HT-30/HT-36) — the first spec
 * this sheet has ever had.
 *
 * What it pins: the lens is the admin's instrument and absent for a plain
 * member; the project scope asks about the DOCUMENT, not about the holder (the
 * `.eq('user_id')` AND is gone); a total is the front matter of the rows that
 * produced it; internal time stands in its own group; and free-text notes come
 * only from an explicit act, never from the aggregate.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HoursLedger } from '../hours-ledger';
import { hoursMemberScopePending } from '@/lib/document/open-hours-scope';

type Role = 'owner' | 'admin' | 'member';
let viewerRole: Role = 'owner';

const ledgerCalls: Array<Record<string, unknown>> = [];
const rollupCalls: Array<Record<string, unknown>> = [];
const projectTotalCalls: Array<string | null> = [];

const WEEK_ENTRY = {
  id: 'entry-mine',
  project_id: 'project-1',
  user_id: 'me',
  started_at: new Date().toISOString(),
  duration_minutes: 90,
  activity: 'design',
  source: 'manual_entry',
  billable: true,
  billing_state: 'authorized',
  hourly_rate_cents: 15_000,
  rate_source: 'studio_member',
  rate_role: 'lead_designer',
  rated_amount_cents: 22_500,
  invoice_id: null,
  project: { name: 'Okonkwo', studio_id: 'studio-1' },
};

const LEDGER_ROW = {
  id: 'entry-teammate',
  project_id: 'project-1',
  project_name: 'Okonkwo',
  studio_id: 'studio-1',
  user_id: 'maria',
  member_name: 'Maria Obi',
  phase_key: null,
  task_id: null,
  started_at: '2026-09-09T15:00:00.000Z',
  day: '2026-09-09',
  iso_week: '2026-W37',
  month: '2026-09',
  duration_minutes: 120,
  is_running: false,
  billable: true,
  activity: 'design',
  source: 'timer_auto',
  billing_state: 'authorized',
  rate_source: 'studio_member',
  rate_role: 'support_designer',
  resolved_rate_cents: 15_000,
  amount_cents: 30_000,
  invoice_id: null,
  billing_authority_id: null,
  authority_rate_id: null,
  created_at: '2026-09-09T15:00:00.000Z',
  updated_at: '2026-09-09T15:00:00.000Z',
};

/** A chainable PostgREST stub — the sheet's own week read and its note read. */
function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
    from: (table: string) => {
      const rowsFor = () => {
        if (table === 'project_time_entries') return [WEEK_ENTRY];
        if (table === 'projects')
          return [{ id: 'project-1', name: 'Okonkwo', status: 'active' }];
        return [];
      };
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rowsFor(), error: null }).then(resolve),
        maybeSingle: async () => ({
          data: { notes: 'sketching the stair' },
          error: null,
        }),
      };
      for (const method of [
        'select',
        'eq',
        'gte',
        'lte',
        'lt',
        'not',
        'is',
        'order',
        'limit',
        'in',
      ]) {
        builder[method] = () => builder;
      }
      return builder;
    },
  };
}

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => makeClient(),
  isInvoiceEligibleTimeEntry: () => true,
  filterProjectUnbilledEntries: () => [],
  useCreateTimeEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useUpdateTimeEntry: () => ({ mutate: jest.fn() }),
  useDeleteTimeEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStampProjectPricingStudio: () => ({ mutate: jest.fn(), isPending: false }),
  useOrganizations: () => ({
    data: [
      {
        id: 'studio-1',
        name: 'Leah Mbeki Studio',
        type: 'design_studio',
        membership: { role: viewerRole, status: 'active' },
      },
    ],
  }),
  useStudioHoursRollup: (params: Record<string, unknown>) => {
    rollupCalls.push(params);
    return {
      data: [
        {
          bucket_key: 'maria',
          bucket_label: 'Maria Obi',
          member_id: 'maria',
          member_name: 'Maria Obi',
          entry_count: 2,
          total_minutes: 180,
          billable_minutes: 120,
          billable_cents: 30_000,
          internal_minutes: 60,
        },
      ],
      isError: false,
      error: null,
    };
  },
  useTimeEntryLedger: (params: Record<string, unknown>) => {
    ledgerCalls.push(params);
    return { data: [LEDGER_ROW], isError: false, error: null };
  },
  useProjectHoursTotal: (projectId: string | null) => {
    projectTotalCalls.push(projectId);
    return {
      data: { minutes: 180, billable_minutes: 120, amount_cents: 30_000 },
      isError: false,
      error: null,
    };
  },
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => ({ data: null }),
}));

jest.mock('../command-bar', () => ({ openLedger: jest.fn() }));

jest.mock('../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));

jest.mock('../commercial/project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => null,
}));

const renderLedger = (projectId?: string) =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <HoursLedger initialContext={projectId ? { projectId } : null} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  viewerRole = 'owner';
  ledgerCalls.length = 0;
  rollupCalls.length = 0;
  projectTotalCalls.length = 0;
  hoursMemberScopePending.userId = null;
  hoursMemberScopePending.name = null;
});

describe('the Hours scope lens', () => {
  it('is absent for a plain member and present for an owner', () => {
    viewerRole = 'member';
    const plain = renderLedger('project-1');
    expect(
      plain.queryByRole('group', { name: 'Hours scope' }),
    ).not.toBeInTheDocument();
    plain.unmount();

    viewerRole = 'owner';
    renderLedger('project-1');
    const lens = screen.getByRole('group', { name: 'Hours scope' });
    expect(lens).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'the studio' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'this document' }),
    ).toBeInTheDocument();
  });

  it('asks the project scope about the document, not about the holder (HT-9)', () => {
    renderLedger('project-1');

    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));

    const projectRead = ledgerCalls.at(-1);
    expect(projectRead).toMatchObject({ projectId: 'project-1', userId: null });
    // The sheet's own week read is still the holder's hours ('mine'); the
    // project scope's read is the fact view, and it names no user.
    expect(Object.keys(projectRead ?? {})).toContain('userId');
  });

  it('puts the total above the rows that produced it (HT-30)', () => {
    const { container } = renderLedger('project-1');

    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));

    const text = container.textContent ?? '';
    expect(text).toContain('this document');
    // The grand total is the front matter; the buckets and then the entries
    // follow it.
    expect(text.indexOf('3h 00m')).toBeGreaterThan(-1);
    expect(text.indexOf('3h 00m')).toBeLessThan(text.indexOf('Maria Obi'));
  });

  it('stands internal time in its own group in the studio scope', () => {
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: 'the studio' }));

    expect(screen.getByText('— internal —')).toBeInTheDocument();
    expect(rollupCalls.at(-1)).toMatchObject({
      studioId: 'studio-1',
      groupBy: 'member',
      projectId: null,
      userId: null,
    });
  });

  it('opens the member scope from the person, aggregate first, notes behind an act (HT-36)', async () => {
    hoursMemberScopePending.userId = 'maria';
    hoursMemberScopePending.name = 'Maria Obi';
    renderLedger();

    // The lens carries the person it was opened onto, and the aggregate is what
    // renders — no free text anywhere on the sheet.
    expect(screen.getByRole('button', { name: 'Maria Obi' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(rollupCalls.at(-1)).toMatchObject({ userId: 'maria' });
    expect(screen.queryByText(/sketching the stair/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));
    expect(screen.queryByText(/sketching the stair/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Note' }));
    });

    await waitFor(() =>
      expect(screen.getByText(/sketching the stair/)).toBeInTheDocument(),
    );
  });

  it('gives a plain member the project total rather than the studio rollup (HT-10-a)', () => {
    viewerRole = 'member';
    renderLedger('project-1');

    expect(projectTotalCalls).toContain('project-1');
    expect(rollupCalls).toHaveLength(0);
  });
});
