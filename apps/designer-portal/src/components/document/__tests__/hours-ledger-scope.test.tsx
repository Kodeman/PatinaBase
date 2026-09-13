/**
 * The Hours sheet's scope lens (HT-8/HT-9/HT-10-a/HT-30/HT-36) — the first spec
 * this sheet has ever had.
 *
 * What it pins: the lens is the admin's instrument and absent for a plain
 * member; the project scope asks about the DOCUMENT, not about the holder (the
 * `.eq('user_id')` AND is gone); a total is the front matter of the rows that
 * produced it; internal time stands in its own group; and free-text notes come
 * only from an explicit act, never from the aggregate.
 *
 * Round-1 fixes pinned here too: the pricing studio is read off the DOCUMENT
 * (not off the holder's own week, which is `.eq('user_id')`-filtered, so the
 * lookup found nothing and the sheet printed "no studio yet" over a document
 * that names one); the rollup is keyed on the studio that PRICES the document
 * rather than on the viewer's own; dropping the document drops the scope that
 * was about it; and a viewer with no lens keeps her own rows, her inline edit
 * and her delete rather than landing in a scope she cannot leave.
 *
 * Round-2 fixes pinned here too: no money readout prints a figure before its
 * read answers (an unanswered rollup printed "0 min" as a studio's week, and a
 * REFUSED one printed it above the refusal), and a resolved stamp actually
 * flips the "priced by" line — which it only can if the repair invalidates the
 * key the document's pricing studio is read on.
 *
 * Round-3 fixes pinned here too: the member scope's rows are the rows that
 * produced its total (both studio-filtered — the total was and the rows were
 * not), and the studio this sheet answers for is one ordered, named answer
 * rather than the first row of an unordered membership read.
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { HoursLedger } from '../hours-ledger';
import {
  hoursMemberScopePending,
  openHoursForMember,
} from '@/lib/document/open-hours-scope';

type Role = 'owner' | 'admin' | 'member';
let viewerRole: Role = 'owner';
/** A second studio, to pin which one the sheet answers for (and says it does). */
let secondStudio: { id: string; name: string; role: Role } | null = null;
/** The rollup's buckets, overridable per case. `null` = the default one. */
let rollupRows: Array<Record<string, unknown>> | null = null;
const MIXED_BUCKET = {
  bucket_key: 'maria',
  bucket_label: 'Maria Obi',
  member_id: 'maria',
  member_name: 'Maria Obi',
  entry_count: 2,
  total_minutes: 180,
  billable_minutes: 120,
  billable_cents: 30_000,
  internal_minutes: 60,
};
/** `projects.studio_id` for project-1 — the studio that PRICES the document. */
let projectStudioId: string | null = 'studio-1';
/** The membership read's own settle state — the sheet's landing waits on it. */
let orgsState: ReadState = 'ready';
/** The fact view's rows, overridable per case. `null` = the default one. */
let ledgerRows: Array<Record<string, unknown>> | null = null;

/** Each money read's settle state — a figure must never precede an answer. */
type ReadState = 'ready' | 'pending' | 'error';
let rollupState: ReadState = 'ready';
let ledgerState: ReadState = 'ready';
let projectTotalState: ReadState = 'ready';
/** What a resolved `stamp_project_pricing_studio` does to the world. */
let onStamp: (() => void) | null = null;

/** Every telemetry call the sheet makes, in order. */
const mockScopeViewedCalls: Array<Record<string, unknown>> = [];
const mockRateUnresolvedCalls: Array<Record<string, unknown>> = [];

// Only the two instruments under test are replaced; everything else on the
// module (DocumentAction's own `actionShown`, for one) stays real.
jest.mock('@/lib/analytics/document-events', () => {
  const actual = jest.requireActual('@/lib/analytics/document-events');
  return {
    ...actual,
    documentEvents: {
      ...actual.documentEvents,
      time: {
        ...actual.documentEvents.time,
        scopeViewed: (props: Record<string, unknown>) =>
          mockScopeViewedCalls.push(props),
        rateUnresolved: (props: Record<string, unknown>) =>
          mockRateUnresolvedCalls.push(props),
      },
    },
  };
});

const ledgerCalls: Array<Record<string, unknown>> = [];
/** Which document each pricing-studio read asked about, and which entry each
 *  note act asked about — the reads are hooks now (round-4 M4-02). */
const pricingStudioCalls: Array<string | null> = [];
const entryNoteCalls: string[] = [];
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
  useStampProjectPricingStudio: () => ({
    mutate: () => onStamp?.(),
    isPending: false,
  }),
  // The document's pricing studio and an entry's note are hooks now, not
  // inline PostgREST (round-4 M4-02). The stubs keep a REAL useQuery on the
  // REAL key: the stamp test below proves its repair by invalidating
  // ['document-hours-project-studio', id], and a hand-rolled object stub would
  // answer that invalidation with nothing and quietly pass.
  useProjectPricingStudio: (projectId: string | null) => {
    pricingStudioCalls.push(projectId);
    return useQuery({
      queryKey: ['document-hours-project-studio', projectId],
      enabled: projectId != null,
      queryFn: async () => projectStudioId,
    });
  },
  useTimeEntryNote: (entryId: string) => {
    entryNoteCalls.push(entryId);
    return useQuery({
      queryKey: ['document-hours-entry-note', entryId],
      queryFn: async () => 'sketching the stair',
    });
  },
  useOrganizations: () => ({
    isError: orgsState === 'error',
    data:
      orgsState !== 'ready'
        ? undefined
        : [
      {
        id: 'studio-1',
        name: 'Leah Mbeki Studio',
        type: 'design_studio',
        membership: { role: viewerRole, status: 'active' },
      },
      ...(secondStudio
        ? [
            {
              id: secondStudio.id,
              name: secondStudio.name,
              type: 'design_studio',
              membership: { role: secondStudio.role, status: 'active' },
            },
          ]
        : []),
          ],
  }),
  useStudioHoursRollup: (params: Record<string, unknown>) => {
    rollupCalls.push(params);
    return {
      data:
        rollupState === 'ready' ? (rollupRows ?? [MIXED_BUCKET]) : undefined,
      isPending: rollupState === 'pending',
      isError: rollupState === 'error',
      error: rollupState === 'error' ? new Error('permission denied') : null,
    };
  },
  useTimeEntryLedger: (params: Record<string, unknown>) => {
    ledgerCalls.push(params);
    return {
      data:
        ledgerState === 'ready' ? (ledgerRows ?? [LEDGER_ROW]) : undefined,
      isPending: ledgerState === 'pending',
      isError: ledgerState === 'error',
      error: ledgerState === 'error' ? new Error('permission denied') : null,
    };
  },
  useProjectHoursTotal: (projectId: string | null) => {
    projectTotalCalls.push(projectId);
    return {
      data:
        projectTotalState === 'ready'
          ? { minutes: 180, billable_minutes: 120, amount_cents: 30_000 }
          : undefined,
      isPending: projectTotalState === 'pending',
      isError: projectTotalState === 'error',
      error: projectTotalState === 'error' ? new Error('not on the project') : null,
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

const makeQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderLedger = (projectId?: string, client: QueryClient = makeQueryClient()) =>
  render(
    <QueryClientProvider client={client}>
      <HoursLedger initialContext={projectId ? { projectId } : null} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  viewerRole = 'owner';
  secondStudio = null;
  rollupRows = null;
  orgsState = 'ready';
  ledgerRows = null;
  mockScopeViewedCalls.length = 0;
  mockRateUnresolvedCalls.length = 0;
  projectStudioId = 'studio-1';
  ledgerCalls.length = 0;
  rollupCalls.length = 0;
  pricingStudioCalls.length = 0;
  entryNoteCalls.length = 0;
  projectTotalCalls.length = 0;
  rollupState = 'ready';
  ledgerState = 'ready';
  projectTotalState = 'ready';
  onStamp = null;
  hoursMemberScopePending.userId = null;
  hoursMemberScopePending.name = null;
});

describe('the Hours scope lens', () => {
  it('is absent for a plain member and present for an owner or an admin', () => {
    viewerRole = 'member';
    const plain = renderLedger('project-1');
    expect(
      plain.queryByRole('group', { name: 'Hours scope' }),
    ).not.toBeInTheDocument();
    plain.unmount();

    // Plan §3's assertion is "absent for a plain member, present for
    // owner/admin" — the admin arm was code-correct and unpinned.
    viewerRole = 'admin';
    const asAdmin = renderLedger('project-1');
    expect(
      asAdmin.getByRole('group', { name: 'Hours scope' }),
    ).toBeInTheDocument();
    asAdmin.unmount();

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

  it('puts the total above the rows that produced it (HT-30)', async () => {
    const { container } = renderLedger('project-1');

    // The project scope's rollup waits for the document's pricing studio — it is
    // keyed on that studio, not on the viewer's — so the total arrives a tick
    // after first paint rather than on a studio that may not price this house.
    await waitFor(() =>
      expect(rollupCalls.at(-1)).toMatchObject({ studioId: 'studio-1' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));

    const text = container.textContent ?? '';
    expect(text).toContain('this document');
    // The grand total is the front matter; the buckets and then the entries
    // follow it.
    expect(text.indexOf('3h 00m')).toBeGreaterThan(-1);
    expect(text.indexOf('3h 00m')).toBeLessThan(text.indexOf('Maria Obi'));
  });

  it('reads the pricing studio off the document, not off the holder’s own week', async () => {
    // The week read is `.eq('user_id', me)`; an owner reading a house she has
    // logged nothing on finds no entry of her own there. The fact must come from
    // `projects.studio_id`, or the sheet prints "no studio yet" over a document
    // that names one — under a stamp door 00606 then refuses.
    renderLedger('project-1');

    await waitFor(() =>
      expect(screen.getByText('Leah Mbeki Studio')).toBeInTheDocument(),
    );
    expect(
      screen.queryByText(/no studio yet/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Name your studio/ }),
    ).not.toBeInTheDocument();
  });

  it('keys the project rollup on the studio that prices the document', async () => {
    // 00607 filters on the entry's pricing studio. Keyed on the viewer's studio
    // instead, a document another studio prices returned zero rows ABOVE entries
    // the fact view does read — a total and its rows contradicting each other.
    projectStudioId = 'studio-2';
    renderLedger('project-1');

    await waitFor(() =>
      expect(rollupCalls.at(-1)).toMatchObject({
        studioId: 'studio-2',
        projectId: 'project-1',
      }),
    );
  });

  it('says why a document with no pricing studio has no studio total', async () => {
    projectStudioId = null;
    renderLedger('project-1');

    await waitFor(() =>
      expect(
        screen.getByText(/No studio prices this document yet/),
      ).toBeInTheDocument(),
    );
    // No zero dressed as a total, and no rollup call on the viewer's studio.
    expect(screen.queryByText('Nothing logged in this window.')).not.toBeInTheDocument();
    expect(rollupCalls).toHaveLength(0);
  });

  it('drops the project scope when the document is dropped', async () => {
    renderLedger('project-1');
    await waitFor(() =>
      expect(rollupCalls.at(-1)).toMatchObject({ projectId: 'project-1' }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'all documents ×' }));

    // The scope that was ABOUT the document cannot outlive it: the caption and
    // the lens word both go, and the rollup is never asked for the whole studio
    // under the caption "this document".
    expect(
      screen.queryByRole('button', { name: 'this document' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'mine' }),
    ).toHaveAttribute('aria-current', 'true');
    for (const call of rollupCalls) {
      expect(call).not.toMatchObject({ projectId: null, studioId: 'studio-1' });
    }
  });

  it('stands internal time in its own group, and counts no bucket twice', () => {
    // 00607:151-155 — `billable_minutes` and `internal_minutes` can count the
    // SAME row, so a bucket printed in the main list AND under "— internal —"
    // was read twice by anyone adding the page up. A WHOLLY internal bucket
    // belongs under the rule and nowhere else; a mixed one keeps its internal
    // share as a clause on its own row.
    rollupRows = [
      MIXED_BUCKET,
      {
        bucket_key: 'studio-admin',
        bucket_label: 'Studio admin',
        member_id: 'admin-1',
        member_name: 'Studio admin',
        entry_count: 1,
        total_minutes: 45,
        billable_minutes: 0,
        billable_cents: 0,
        internal_minutes: 45,
      },
    ];
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: 'the studio' }));

    expect(screen.getByText('— internal —')).toBeInTheDocument();
    // Each bucket appears exactly once on the page.
    expect(screen.getAllByText('Studio admin')).toHaveLength(1);
    expect(screen.getAllByText('Maria Obi')).toHaveLength(1);
    // And the mixed bucket says what of it was internal, in its own row.
    expect(screen.getByText(/1h 00m internal/)).toBeInTheDocument();
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

  it('leaves a viewer with no lens on her own hours, edit and delete (R77)', async () => {
    // With a document in hand the sheet used to open on the project scope, which
    // renders no per-day rows — so a member with no lens lost R77's inline
    // adjust and its delete-with-confirm and could not get back to them.
    viewerRole = 'member';
    renderLedger('project-1');

    expect(
      screen.queryByRole('group', { name: 'Hours scope' }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Duration (minutes)')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Delete entry' }),
    ).toBeInTheDocument();
    // Still scoped to the document she arrived with, and still HT-10-a's total.
    expect(
      screen.getByRole('button', { name: 'all documents ×' }),
    ).toBeInTheDocument();
    expect(projectTotalCalls).toContain('project-1');
  });

  it('prints no roster-role chip on a single-role member’s rows (HT-41)', async () => {
    // HT-41 shows the role ONLY where the member holds more than one live roster
    // role on that project, and the count is W3's to fetch. Until then the
    // segment is absent rather than stamped on every row as permanent noise.
    renderLedger('project-1');

    // Her own rows (WEEK_ENTRY carries rate_role 'lead_designer').
    fireEvent.click(screen.getByRole('button', { name: 'mine' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Duration (minutes)')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/lead designer/)).not.toBeInTheDocument();

    // And the scope entries behind an aggregate (LEDGER_ROW: 'support_designer').
    fireEvent.click(screen.getByRole('button', { name: 'this document' }));
    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));
    await waitFor(() =>
      expect(screen.getAllByText('Maria Obi').length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/support designer/)).not.toBeInTheDocument();
  });

  it('lists the member scope’s rows from the studio that produced its total', async () => {
    // 00607 filters the rollup on `ledger.studio_id`; the entries carried no
    // studio at all, so the rows beneath a member's week included every row RLS
    // let the caller read for her — legacy "rate pending" hours the total
    // excludes, and any second studio's hours.
    hoursMemberScopePending.userId = 'maria';
    hoursMemberScopePending.name = 'Maria Obi';
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));

    await waitFor(() =>
      expect(ledgerCalls.at(-1)).toMatchObject({
        studioId: 'studio-1',
        userId: 'maria',
        projectId: null,
      }),
    );
  });

  it('answers for the studio it names, not the first membership row', async () => {
    // `useOrganizations` has no ORDER BY, so "the first design_studio" was not
    // stable between loads — and a viewer who is a plain MEMBER of that first
    // studio but an OWNER of a second lost the lens entirely.
    viewerRole = 'member';
    secondStudio = { id: 'studio-2', name: 'Adeyemi & Co', role: 'owner' };
    renderLedger();

    expect(
      screen.getByRole('group', { name: 'Hours scope' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'the studio' }));

    // And the caption says WHOSE week this is — "the studio · this week" named
    // neither of her two studios.
    await waitFor(() =>
      expect(
        screen.getByText(/the studio · Adeyemi & Co · this week/),
      ).toBeInTheDocument(),
    );
    expect(rollupCalls.at(-1)).toMatchObject({ studioId: 'studio-2' });
  });

  it('lands once, and tells the instrument once', () => {
    // `scope` used to initialise to 'project' whenever a document was in hand
    // and be corrected by an effect afterwards — so every plain member's open
    // reported a project-scope read she never saw, and HT-27's instrument
    // counted two scope views for one open.
    viewerRole = 'member';
    renderLedger('project-1');

    expect(mockScopeViewedCalls).toEqual([{ scope: 'mine', group_by: null }]);
    expect(
      screen.queryByRole('group', { name: 'Hours scope' }),
    ).not.toBeInTheDocument();
  });

  it('leaves no one stranded when the membership read fails', () => {
    // The old belt was `if (!orgs) return`, and a FAILED read never produces
    // `orgs` — so a viewer whose membership read errored was left in the
    // project scope with no lens, no rollup, no front matter and no rows, with
    // "The entries" as the only thing on the sheet.
    orgsState = 'error';
    renderLedger('project-1');

    expect(mockScopeViewedCalls).toEqual([{ scope: 'mine', group_by: null }]);
    expect(
      screen.queryByRole('button', { name: 'The entries' }),
    ).not.toBeInTheDocument();
    // Her own week is what she certainly keeps: R5's front matter.
    expect(screen.getByText('utilization')).toBeInTheDocument();
  });

  it('says it is reading rather than landing before the standing is known', () => {
    orgsState = 'pending';
    renderLedger('project-1');

    expect(mockScopeViewedCalls).toEqual([]);
    expect(
      screen.queryByRole('button', { name: 'The entries' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Reading…')).toBeInTheDocument();
  });

  it('takes a person handed to a sheet that is already open, and forgets her after', () => {
    // The Studio Drawer keys the sheet on its ledger key, so `open-ledger` for
    // the sheet already in front of you remounts nothing: the click did nothing
    // visible AND the module value survived to mis-scope the next open.
    renderLedger();
    expect(screen.queryByRole('button', { name: 'Maria Obi' })).toBeNull();

    act(() => {
      openHoursForMember('maria', 'Maria Obi');
    });

    expect(screen.getByRole('button', { name: 'Maria Obi' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(rollupCalls.at(-1)).toMatchObject({ userId: 'maria' });
    // Nothing is left behind to scope a later open.
    expect(hoursMemberScopePending.userId).toBeNull();
  });

  it('sounds the rate alarm from the scoped rows, where an admin reads them', async () => {
    // The alarm fired only from the viewer's OWN week, so an admin looking at
    // the studio's unpriced hours — the one place unpriced hours are noticed —
    // set off nothing at all.
    ledgerRows = [
      {
        ...LEDGER_ROW,
        id: 'entry-unpriced',
        rate_source: 'none',
        rate_role: null,
        resolved_rate_cents: 0,
        amount_cents: 0,
      },
    ];
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: 'the studio' }));
    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));

    await waitFor(() =>
      expect(mockRateUnresolvedCalls).toContainEqual({
        entry_id: 'entry-unpriced',
        project_id: 'project-1',
        project_kind: null,
        rate_source: 'none',
      }),
    );
  });

  // ── Round-2 fixes: a figure never precedes an answer ─────────────────────

  it('says it is reading rather than printing a studio total of zero', () => {
    // fmtMinutes(0) = "0 min", and the rollup's grand total used to be summed
    // from `rollup.data ?? []` unconditionally — so an unanswered read printed
    // a studio's week as zero, then called it "Nothing logged in this window."
    rollupState = 'pending';
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: 'the studio' }));

    expect(screen.getByText('Reading…')).toBeInTheDocument();
    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Nothing logged in this window.'),
    ).not.toBeInTheDocument();
  });

  it('shows no total at all when the studio rollup is refused', () => {
    // §0.24's hazard by hand: a denied rollup reading as a zero total for the
    // studio's money. The refusal says so, and stands alone.
    rollupState = 'error';
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: 'the studio' }));

    expect(
      screen.getByText(/These hours could not be read/),
    ).toBeInTheDocument();
    expect(screen.queryByText('0 min')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Nothing logged in this window.'),
    ).not.toBeInTheDocument();
  });

  it('waits for an answer before saying there are no entries', () => {
    ledgerState = 'pending';
    renderLedger();

    fireEvent.click(screen.getByRole('button', { name: 'the studio' }));
    fireEvent.click(screen.getByRole('button', { name: 'The entries' }));

    expect(screen.getByText('Reading…')).toBeInTheDocument();
    expect(
      screen.queryByText('No entries in this window.'),
    ).not.toBeInTheDocument();
  });

  it('prints no zero for a document total the function has not given (HT-10-a)', async () => {
    // project_hours_total raises for a caller who is not on the project rather
    // than answering zero — so a zero under "this document · all time" is a
    // reading the server never gave.
    viewerRole = 'member';
    projectTotalState = 'pending';
    renderLedger('project-1');

    await waitFor(() =>
      expect(
        screen.getByText('this document · all time, for its whole team'),
      ).toBeInTheDocument(),
    );
    // Scoped to that readout: the sheet's own front matter legitimately reads a
    // zero for a week with nothing in it — this section has no answer at all.
    const total = screen
      .getByText('this document · all time, for its whole team')
      .closest('section') as HTMLElement;
    expect(total.textContent).toContain('Reading…');
    expect(total.textContent).not.toContain('0 min');
  });

  it('flips the priced-by line when the stamp resolves', async () => {
    // The sheet reads the pricing studio off the DOCUMENT, on its own key. The
    // repair must therefore invalidate THAT key —
    // `['document-hours-project-studio', projectId]`, which
    // useStampProjectPricingStudio's onSuccess now does (pinned in
    // packages/supabase/src/hooks/__tests__/use-time-tracking.test.ts). Without
    // it a SUCCESSFUL stamp kept printing "no studio yet" under a door 00606
    // then refused as already-named.
    projectStudioId = null;
    const client = makeQueryClient();
    onStamp = () => {
      projectStudioId = 'studio-1';
      client.invalidateQueries({
        queryKey: ['document-hours-project-studio', 'project-1'],
      });
    };
    renderLedger('project-1', client);

    const door = await screen.findByRole('button', {
      name: /Name your studio/,
    });
    await act(async () => {
      fireEvent.click(door);
    });

    await waitFor(() =>
      expect(screen.getByText('Leah Mbeki Studio')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/no studio yet/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Name your studio/ }),
    ).not.toBeInTheDocument();
  });
});
