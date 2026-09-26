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

// Return teaching's in-place and act notes: jest cannot load @patina/help-system
// behind the real hook, and nothing here is taught.
jest.mock('@/hooks/use-teaching-note', () => ({
  useTeachingNoteFor: () => ({ note: null, bind: null }),
}));

jest.mock('@patina/supabase', () => ({
  createBrowserClient: () => makeClient(),
  isInvoiceEligibleTimeEntry: () => false,
  filterProjectUnbilledEntries: () => [],
  // MS-11 — the sheet's own unbilled read splits rate-pending hours out of
  // the balance with this predicate; the real one is `rate_source === 'none'`.
  isRatePendingTimeEntry: (row: { rate_source?: string | null }) =>
    row?.rate_source === 'none',
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
  // W5 (HT-20) — the studio-scope CSV export's Client column.
  useClients: () => ({ data: [] }),
}));

/** The authority read, as an answer the test can leave in flight. */
let mockAuthority: {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
} = { data: null, isLoading: false, isError: false };
jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => mockAuthority,
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

/**
 * The clock is PINNED for this suite. `startedAtFromDateValue`
 * (`time-capture.tsx`) keeps the current time-of-day and moves only the date,
 * and `next/jest` loads the app's `.env`, which pins `TZ=America/Chicago`. On a
 * real clock after 19:00 CDT the constructed instant crosses UTC midnight and
 * `toISOString()` reports the NEXT day, so the date assertions below failed for
 * five hours a night and passed the rest — the same UTC-midnight trap
 * `supabase/tests/KNOWN_FAILURES.md` records for `direct_order_attribution_test.sql`.
 * 12:00 UTC is the safest pin: every zone from UTC-11 to UTC+11 reads it as the
 * same calendar day, so the fixture dates below hold wherever this runs.
 * Only `Date` is faked; every timer stays real so React Query and
 * `waitFor` behave exactly as they do under the real clock.
 */
const PINNED_NOW = new Date('2026-09-13T12:00:00.000Z');
const FAKE_DATE_ONLY = {
  now: PINNED_NOW,
  doNotFake: [
    'cancelAnimationFrame',
    'cancelIdleCallback',
    'clearImmediate',
    'clearInterval',
    'clearTimeout',
    'hrtime',
    'nextTick',
    'performance',
    'queueMicrotask',
    'requestAnimationFrame',
    'requestIdleCallback',
    'setImmediate',
    'setInterval',
    'setTimeout',
  ],
} as const;

beforeEach(() => {
  jest.useFakeTimers(FAKE_DATE_ONLY);
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
  mockAuthority = { data: null, isLoading: false, isError: false };
});

afterEach(() => {
  jest.useRealTimers();
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
        // "Document…" · "Studio time — no document" (HT-15) · the one project.
      ).toHaveLength(3),
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
        // "Document…" · "Studio time — no document" (HT-15) · the one project.
      ).toHaveLength(3),
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

  it('will not add an hour while the date field is empty (HT-13)', async () => {
    // A cleared `<input type="date">` reads '' and the writer's fallback is
    // NOW, so before this the Add act stayed live and the hour was filed under
    // today with the field on screen blank. The act simply waits instead.
    renderLedger();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Project').querySelectorAll('option'),
        // "Document…" · "Studio time — no document" (HT-15) · the one project.
      ).toHaveLength(3),
    );
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-1' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '30' },
    });
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });

    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(screen.getByLabelText('Date')).toHaveValue(''));
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('waits for the authority read, and keeps the answer she states meanwhile (HT-11)', async () => {
    // Before the fix the Add act was live the instant a document was picked,
    // and an hour added in that window went in `billable = false` whatever the
    // agreement said; a tap on the pill in the same window was overwritten
    // when the read landed.
    mockAuthority = { data: null, isLoading: true, isError: false };
    renderLedger();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Project').querySelectorAll('option'),
        // "Document…" · "Studio time — no document" (HT-15) · the one project.
      ).toHaveLength(3),
    );
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '30' },
    });
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-1' },
    });

    expect(
      screen.queryByText('non-billable \u00b7 no agreement'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    fireEvent.click(
      screen.getByRole('button', {
        name: /Non-billable \u2014 press to make billable/,
      }),
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();

    mockAuthority = { data: null, isLoading: false, isError: false };
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '31' },
    });
    await waitFor(() =>
      expect(
        screen.getByText('non-billable \u00b7 no agreement'),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', {
        name: /^Billable \u2014 press to make non-billable/,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockCreate.mock.calls[0][0]).toMatchObject({ billable: true });
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

  it('answers the rate question with HT-12\u2019s reason, and never with a figure it cannot know (HT-26)', async () => {
    // plan-v2 \u00a74 asks for a "rate readout" on the add row. The resolved rate
    // is not knowable before the row is written: `resolve_time_rate_cents` is
    // the only thing that knows it and 00599 REVOKEs EXECUTE from
    // `authenticated` (W1-R7-04), with a postcondition in the migration that
    // keeps it revoked. So the pre-write row states the reason it does have and
    // prints no money \u2014 a re-derived figure here would be a false fact on the
    // one surface built to stop them. This case is the pin on that decision.
    renderLedger();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Project').querySelectorAll('option'),
        // "Document…" · "Studio time — no document" (HT-15) · the one project.
      ).toHaveLength(3),
    );
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: 'project-1' },
    });

    const strip = screen
      .getByRole('button', { name: /Non-billable \u2014 press to make billable/ })
      .closest('div') as HTMLElement;
    expect(strip.textContent).toContain('non-billable \u00b7 no agreement');
    expect(strip.textContent).not.toMatch(/\$/);
    expect(strip.textContent).not.toMatch(/rate not recorded|rate pending/);
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

  // ── W4 · HT-15 — the hour that belongs to no document ────────────────────
  it('offers the studio door and writes it with no project, no rate and no billable (HT-15)', async () => {
    renderLedger();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Project').querySelectorAll('option'),
      ).toHaveLength(3),
    );

    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: '__internal__' },
    });
    fireEvent.change(screen.getByLabelText('Minutes'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    expect(mockCreate.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        projectId: null,
        studioId: 'studio-1',
        billable: false,
        rateRole: null,
        source: 'internal',
      }),
    );
  });

  it('says the answer rather than asking it \u2014 the billable pill is held for a studio hour (HT-15)', async () => {
    renderLedger();
    await waitFor(() =>
      expect(
        screen.getByLabelText('Project').querySelectorAll('option'),
      ).toHaveLength(3),
    );
    fireEvent.change(screen.getByLabelText('Project'), {
      target: { value: '__internal__' },
    });

    const pill = screen.getByRole('button', {
      name: /Non-billable \u2014 press to make billable/,
    });
    expect(pill).toBeDisabled();
    expect((pill.closest('div') as HTMLElement).textContent).toContain(
      'studio time belongs to no client',
    );
  });

  it('renders a logged studio hour in its own group, with no document and no rate (HT-15/REP-5)', async () => {
    weekRows = [
      {
        id: 'entry-internal',
        project_id: null,
        project: null,
        user_id: 'me',
        started_at: new Date().toISOString(),
        duration_minutes: 45,
        billable: false,
        billing_state: 'nonbillable',
        hourly_rate_cents: null,
        rated_amount_cents: null,
        rate_source: 'none',
        rate_role: null,
        activity: 'admin',
        source: 'internal',
        invoice_id: null,
        created_at: new Date().toISOString(),
      },
    ];
    renderLedger();

    await waitFor(() =>
      expect(screen.getByText('\u2014 internal \u2014')).toBeInTheDocument(),
    );
    expect(screen.getByText('Studio time')).toBeInTheDocument();
    expect(
      screen.getByText(/no document \u00b7 non-billable/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/rate pending/)).not.toBeInTheDocument();
  });

  /**
   * W7-R4-12 — the ledger printed only three of 00595's nine source values and
   * fell back to the RAW ENUM for the rest, so an internal hour read
   * `internal`, a ⌘K hour `command_bar` and a Field hour `field_manual`: three
   * database words in the designer's own ledger, one of them on a row this
   * program introduced.
   */
  it.each([
    ['internal', 'typed', true],
    ['command_bar', 'typed', false],
    ['field_manual', 'from the field', false],
    ['field_visit', 'from a visit', false],
    ['timer_auto', 'in hand', false],
  ])(
    'says how a %s hour was captured in words, never the enum',
    async (source, label, internal) => {
      weekRows = [
        {
          id: `entry-${source}`,
          project_id: internal ? null : 'project-1',
          project: internal ? null : { id: 'project-1', name: 'Ellsworth' },
          user_id: 'me',
          started_at: new Date().toISOString(),
          duration_minutes: 45,
          billable: false,
          billing_state: 'nonbillable',
          hourly_rate_cents: null,
          rated_amount_cents: null,
          rate_source: 'none',
          rate_role: null,
          activity: 'admin',
          source,
          invoice_id: null,
          created_at: new Date().toISOString(),
        },
      ];
      renderLedger();

      await waitFor(() =>
        expect(screen.getByText(new RegExp(label))).toBeInTheDocument(),
      );
      // Read the ROW, not the page: the internal group's own `— internal —`
      // rule legitimately carries the word, and it is a heading, not a source.
      const row = screen
        .getByText(internal ? 'Studio time' : 'Ellsworth')
        .closest('li') as HTMLElement;
      expect(row.textContent).toMatch(new RegExp(label));
      expect(row.textContent).not.toMatch(new RegExp(`\\b${source}\\b`));
    },
  );
});
