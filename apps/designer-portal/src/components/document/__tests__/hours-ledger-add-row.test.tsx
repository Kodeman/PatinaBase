/**
 * The Hours add row — the date it writes, and the mark on an hour remembered
 * late (W3 · HT-11 · HT-13 · HT-41).
 *
 * The defect this suite exists for is silent and unrecoverable: the add row
 * sent no `started_at` at all, so paging the ledger back a week and typing an
 * hour landed it on TODAY, under a heading that said last week, with no
 * warning — and once written, only `activity` and `duration_minutes` could be
 * edited. Nothing in the tree went red for it.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HoursLedger } from '../hours-ledger';
import { hoursMemberScopePending } from '@/lib/document/open-hours-scope';

const mockCreate = jest.fn();
let myRateRoles: string[] = ['lead_designer'];
/** The viewer's own week, overridable per case (the backdated mark reads the
 *  two timestamps the row already carries). */
let weekRows: Array<Record<string, unknown>> = [];

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

function entry(over: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    project_id: 'project-1',
    user_id: 'me',
    started_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    duration_minutes: 60,
    activity: 'design',
    source: 'manual_entry',
    billable: true,
    billing_state: 'authorized',
    hourly_rate_cents: 15_000,
    rate_source: 'studio_member',
    rate_role: 'lead_designer',
    rated_amount_cents: 15_000,
    invoice_id: null,
    project: { name: 'Okonkwo', studio_id: 'studio-1' },
    ...over,
  };
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
    from: (table: string) => {
      const rowsFor = () => {
        if (table === 'project_time_entries') return weekRows;
        if (table === 'projects')
          return [{ id: 'project-1', name: 'Okonkwo', status: 'active' }];
        return [];
      };
      const builder: Record<string, unknown> = {
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rowsFor(), error: null }).then(resolve),
      };
      for (const m of [
        'select', 'eq', 'gte', 'lte', 'lt', 'not', 'is', 'order', 'limit', 'in',
      ]) {
        builder[m] = () => builder;
      }
      return builder;
    },
  };
}

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => makeClient(),
  isInvoiceEligibleTimeEntry: () => false,
  filterProjectUnbilledEntries: () => [],
  useCreateTimeEntry: () => ({ mutateAsync: mockCreate, isPending: false }),
  useUpdateTimeEntry: () => ({ mutate: jest.fn() }),
  useDeleteTimeEntry: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useStampProjectPricingStudio: () => ({ mutate: jest.fn(), isPending: false }),
  useProjectPricingStudio: () => ({ data: 'studio-1' }),
  useTimeEntryNote: () => ({ data: null, isLoading: false, isError: false }),
  useMyRateRoles: () => ({ data: myRateRoles }),
  useOrganizations: () => ({
    isError: false,
    data: [
      {
        id: 'studio-1',
        name: 'Leah Mbeki Studio',
        type: 'design_studio',
        membership: { role: 'owner', status: 'active' },
      },
    ],
  }),
  useStudioHoursRollup: () => ({ data: [], isPending: false, isError: false }),
  useTimeEntryLedger: () => ({ data: [], isPending: false, isError: false }),
  useProjectHoursTotal: () => ({ data: undefined, isPending: false, isError: false }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => ({ data: null, isLoading: false }),
}));

jest.mock('../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('../accounts/invoice-overlays', () => ({ openInvoiceComposer: jest.fn() }));
jest.mock('../commercial/project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => null,
}));

const renderLedger = () =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HoursLedger />
    </QueryClientProvider>,
  );

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({
    id: 'written',
    project_id: 'project-1',
    duration_minutes: 30,
    billable: false,
    activity: 'design',
    rate_source: 'none',
    rate_role: null,
  });
  myRateRoles = ['lead_designer'];
  weekRows = [];
  hoursMemberScopePending.userId = null;
  hoursMemberScopePending.name = null;
});

describe('the Hours add row', () => {
  it('starts on today while the current week is shown', () => {
    renderLedger();
    expect(screen.getByLabelText('Date')).toHaveValue(ymd(new Date()));
  });

  it('follows the PAGED week rather than the clock (HT-13)', async () => {
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: '‹ earlier' }));

    // Last week's Monday — not today, which is the whole defect.
    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - 7);

    await waitFor(() =>
      expect(screen.getByLabelText('Date')).toHaveValue(ymd(monday)),
    );
    expect(screen.getByLabelText('Date')).not.toHaveValue(ymd(new Date()));
  });

  it('sends the date it shows as started_at, with a stated billable (HT-11/HT-13)', async () => {
    renderLedger();

    // The document list is a read; wait for it before picking from it.
    await waitFor(() =>
      expect(
        screen.getByLabelText('Project').querySelectorAll('option'),
      ).toHaveLength(2),
    );
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-1' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2026-08-04' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const sent = mockCreate.mock.calls[0][0];
    expect(String(sent.startedAt).slice(0, 10)).toBe('2026-08-04');
    expect(sent).toEqual(
      expect.objectContaining({ projectId: 'project-1', billable: false }),
    );
  });

  it('leaves the activity unset unless it is chosen (HT-24)', async () => {
    renderLedger();

    // The row used to open on 'design', so every hour typed here was filed as
    // design work the member never claimed.
    expect(screen.getByLabelText('Activity')).toHaveValue('');
    expect(
      screen.getByRole('option', { name: 'activity not set' }),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByLabelText('Project').querySelectorAll('option'),
      ).toHaveLength(2),
    );
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-1' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0].activity).toBeNull();
  });

  it('marks the add row backdated past 30 days and not at 29 (HT-13)', () => {
    renderLedger();

    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: ymd(new Date(Date.now() - 31 * 86_400_000)) },
    });
    expect(screen.getByText('backdated')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: ymd(new Date(Date.now() - 29 * 86_400_000)) },
    });
    expect(screen.queryByText('backdated')).not.toBeInTheDocument();
  });

  it('marks an entry written 31 days after the day it names, and not one written 29 (HT-13)', async () => {
    weekRows = [
      entry({
        id: 'old-hour',
        started_at: daysAgo(31),
        created_at: new Date().toISOString(),
      }),
    ];
    const late = renderLedger();
    await waitFor(() =>
      expect(late.container.textContent).toContain('backdated'),
    );
    late.unmount();

    weekRows = [
      entry({
        id: 'recent-hour',
        started_at: daysAgo(29),
        created_at: new Date().toISOString(),
      }),
    ];
    const prompt = renderLedger();
    await waitFor(() =>
      expect(prompt.getByLabelText('Duration (minutes)')).toBeInTheDocument(),
    );
    expect(prompt.container.textContent).not.toContain('backdated');
  });

  it('carries the billable pill on the add row, and the role chip only for a multi-role member (HT-11/HT-41)', async () => {
    const single = renderLedger();
    expect(
      single.getAllByRole('button', { name: /billable/i }).length,
    ).toBeGreaterThan(0);
    expect(
      single.queryByRole('combobox', { name: 'Which role priced this hour' }),
    ).not.toBeInTheDocument();
    single.unmount();

    myRateRoles = ['lead_designer', 'bookkeeper'];
    renderLedger();
    expect(
      screen.getByRole('combobox', { name: 'Which role priced this hour' }),
    ).toBeInTheDocument();
  });
});
