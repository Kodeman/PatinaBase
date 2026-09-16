/**
 * A9: the Studio Contents "Begin" column no longer duplicates the Desk
 * header's "Capture a lead" CTA — it's filtered out of the STUDIO_VERBS render
 * while every other verb (and ⌘K's own read of the untouched registry) stays
 * reachable. See docs/design/doc-polish/deck.html item A9.
 *
 * F38 — every row now carries a static sub-label; F17 — `The Rooms` reads
 * `The Scans` here too; F51 — `Open the Drafting Room` joins Begin and calls
 * the shared opener, not a doorway string (C-AF-01); F08 — the Desk's own
 * invoice door names its scope (`Draw an invoice · new`).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { DeskContents } from '../desk-contents';
import { STUDIO_VERBS } from '@/lib/document/registry';

/** The unbilled read's state — the Desk's one act-bearing line reads it. */
type UnbilledState = 'empty' | 'rows' | 'pending' | 'error';
let unbilledState: UnbilledState = 'empty';
/** The viewer's standing over a studio: billing is an owner/admin act. */
let viewerRole: 'owner' | 'admin' | 'member' = 'owner';

// HT-29 — the Hours line is act-bearing now (unbilled hours to bill, or a timer
// still running from yesterday), so the index reads three facts. All three are
// `@patina/supabase` hooks, and by default they answer empty: the index under
// test is the labels-and-doorways one, and the act's own states are pinned in
// their own describe below.
jest.mock('@patina/supabase', () => ({
  useRunningTimer: () => ({ data: null }),
  useStudioUnbilledTime: () => ({
    data:
      unbilledState === 'rows'
        ? [{ id: 'entry-1', project_id: 'project-1', billing_state: 'authorized' }]
        : unbilledState === 'empty'
          ? []
          : undefined,
    isPending: unbilledState === 'pending',
    isError: unbilledState === 'error',
  }),
  useOrganizations: () => ({
    isError: false,
    data: [
      {
        id: 'studio-1',
        name: 'Leah Mbeki Studio',
        type: 'design_studio',
        membership: { role: viewerRole, status: 'active' },
      },
    ],
  }),
}));

beforeEach(() => {
  unbilledState = 'empty';
  viewerRole = 'owner';
});

const renderContents = (props: { prominent?: boolean } = {}) =>
  render(<DeskContents {...props} />);

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    wayfinding: { contentsActed: jest.fn() },
  },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
  openCaptureLead: jest.fn(),
  openOpenProject: jest.fn(),
}));

jest.mock('@/components/document/overlays/post-sheet', () => ({
  openPost: jest.fn(),
}));

jest.mock('@/components/document/accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));

jest.mock('@/components/document/rooms/drafting/draft-proposal-opener', () => ({
  openDraftProposalPicker: jest.fn(),
}));

jest.mock('@/components/document/log-time-sheet', () => ({
  openLogTime: jest.fn(),
}));

describe('DeskContents — Begin column', () => {
  it('does not render Capture a lead, but keeps every other verb', () => {
    renderContents();

    expect(
      screen.queryByRole('button', { name: /^Capture a lead/ }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: /Open a project/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Draft a design agreement/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Add a maker/ }),
    ).toBeInTheDocument();
  });

  /**
   * The Begin column renders STUDIO_VERBS wholesale and dispatches through
   * `verbHandlers`, so a verb added to the registry for ⌘K stands on the Desk
   * with or without a handler. `log-time` shipped without one: the row
   * rendered, the click fired a wayfinding event, and nothing opened. Naming
   * each verb one at a time would not have caught it — the next verb added
   * would repeat it. This case reads the registry itself.
   */
  it('every verb the registry renders here actually dispatches', () => {
    const openers = [
      mockPush,
      (jest.requireMock('@/components/document/command-bar') as {
        openCaptureLead: jest.Mock;
        openOpenProject: jest.Mock;
      }).openCaptureLead,
      (jest.requireMock('@/components/document/command-bar') as {
        openOpenProject: jest.Mock;
      }).openOpenProject,
      (jest.requireMock(
        '@/components/document/rooms/drafting/draft-proposal-opener',
      ) as { openDraftProposalPicker: jest.Mock }).openDraftProposalPicker,
      (jest.requireMock('@/components/document/accounts/invoice-overlays') as {
        openInvoiceComposer: jest.Mock;
      }).openInvoiceComposer,
      (jest.requireMock('@/components/document/log-time-sheet') as {
        openLogTime: jest.Mock;
      }).openLogTime,
    ];

    renderContents();

    const rendered = STUDIO_VERBS.filter((v) => v.key !== 'capture-lead');
    expect(rendered.length).toBeGreaterThan(0);

    for (const verb of rendered) {
      for (const fn of openers) fn.mockClear();
      const row = screen.getByRole('button', {
        name: new RegExp(verb.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      });
      fireEvent.click(row);
      const fired = openers.reduce((n, fn) => n + fn.mock.calls.length, 0);
      expect([verb.key, fired]).toEqual([verb.key, 1]);
    }
  });

  it('F08 — the Desk\'s own invoice door names its scope', () => {
    renderContents();

    expect(
      screen.getByRole('button', { name: /Draw an invoice · new/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Draw an invoice$/ }),
    ).not.toBeInTheDocument();
  });

  it('F51 — Open the Drafting Room joins Begin and calls the shared opener', () => {
    const { openDraftProposalPicker } = jest.requireMock(
      '@/components/document/rooms/drafting/draft-proposal-opener',
    ) as { openDraftProposalPicker: jest.Mock };

    renderContents();

    const row = screen.getByRole('button', {
      name: /Open the Contract Room/,
    });
    expect(row).toBeInTheDocument();

    fireEvent.click(row);
    // Bare call (no id, no router) — the shared opener falls to the
    // household picker doorway (C-AF-01).
    expect(openDraftProposalPicker).toHaveBeenCalledTimes(1);
  });
});

describe('DeskContents — F38 static sub-labels', () => {
  it('every Rooms row carries a sub-label, and reads The Scans', () => {
    renderContents();

    expect(
      screen.getByRole('button', { name: /Library.*pieces and makers/s }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /People.*clients, makers, trades/s }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /The Scans.*measured rooms/s }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^The Rooms/ }),
    ).not.toBeInTheDocument();
  });

  it('every Ledgers row carries a sub-label', () => {
    renderContents();

    expect(
      screen.getByRole('button', { name: /Orders.*POs, receiving, claims/s }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Accounts.*invoices, receivables, earnings/s,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Hours.*time in hand/s }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /The Post.*mail and messages/s }),
    ).toBeInTheDocument();
  });

  it('the Begin verbs carry their registry sub-labels', () => {
    renderContents();

    expect(
      screen.getByRole('button', { name: /Open a project.*no proposal needed/is }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Draft a design agreement.*for an existing household/is,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: /Add a maker.*a vendor on your roster/is,
      }),
    ).toBeInTheDocument();
  });
});

describe('DeskContents — the Hours line’s one act (HT-29)', () => {
  it('offers the composer to an owner with unbilled hours', () => {
    unbilledState = 'rows';
    renderContents();

    expect(
      screen.getByRole('button', { name: /hours to bill →/ }),
    ).toBeInTheDocument();
  });

  it('offers no billing act to a plain member', () => {
    // After 00606 she reads her OWN unbilled rows, so the Desk's one
    // act-bearing line was offering her the invoice composer. Drawing an
    // invoice is the studio's act (HT-3); the Hours row above still opens the
    // sheet for her.
    unbilledState = 'rows';
    viewerRole = 'member';
    renderContents();

    expect(
      screen.queryByRole('button', { name: /hours to bill →/ }),
    ).not.toBeInTheDocument();
  });

  it('says nothing while the read is still out', () => {
    unbilledState = 'pending';
    renderContents();

    expect(
      screen.queryByRole('button', { name: /hours to bill →|^hours →$/ }),
    ).not.toBeInTheDocument();
  });

  it('does not read a failed money read as nothing to bill', () => {
    // Undefined data and "no unbilled hours" were the same absence, so a denied
    // or failed `project_unbilled_time` read silently removed the act. A
    // terracotta sentence is wrong on an index of labels and doorways (R95), so
    // the failure reads as the neutral door.
    unbilledState = 'error';
    renderContents();

    const door = screen.getByRole('button', { name: /^hours →$/ });
    expect(door).toBeInTheDocument();

    const { openLedger } = jest.requireMock(
      '@/components/document/command-bar',
    ) as { openLedger: jest.Mock };
    fireEvent.click(door);
    expect(openLedger).toHaveBeenCalledWith('hours');
  });
});
