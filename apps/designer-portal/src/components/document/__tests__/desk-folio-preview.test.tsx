import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeskFolder } from '@/lib/document/desk-derivation';
import {
  DESK_FOLIO_PREVIEW_LIMIT,
  FolderCard,
  NeedsYourHandFolios,
} from '../folder-card';
import { openLedger } from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('@/components/document/triage-bar', () => ({
  TriageBar: () => null,
}));

function folio(index: number, urgent = false): DeskFolder {
  return {
    row: {
      engagement_id: `folio-${index}`,
      title: `Folio ${index}`,
      client_name: `Client ${index}`,
      active_section: 'project',
      current_phase: 'in_progress',
    },
    need: {
      kind: 'task_due',
      text: `Review folio ${index}`,
      actionLabel: 'Open the task',
      stamp: {
        label: 'Due',
        color: 'var(--color-terracotta)',
      },
      urgent,
    },
  } as unknown as DeskFolder;
}

/** R36: the one NeedKind whose act is a Drawer ledger, not the document
 *  (A1's overdue_invoice case). */
function invoiceFolio(index: number): DeskFolder {
  return {
    row: {
      engagement_id: `invoice-folio-${index}`,
      title: `Invoice Folio ${index}`,
      client_name: `Client ${index}`,
      active_section: 'project',
      current_phase: 'in_progress',
    },
    need: {
      kind: 'overdue_invoice',
      text: `Invoice ${index} overdue — send a reminder`,
      actionLabel: 'Send reminder',
      stamp: { label: 'PAST DUE', color: 'var(--color-terracotta)' },
      urgent: false,
      ledger: {
        name: 'accounts',
        context: { page: 'receivables', invoiceId: `inv-${index}` },
      },
    },
  } as unknown as DeskFolder;
}

/** R61/R65: the lead-triage NeedKinds — actionLabel is null, the card's
 *  TriageBar carries the choices instead (mocked to null above). */
function leadFolio(index: number): DeskFolder {
  return {
    row: {
      engagement_id: `lead-folio-${index}`,
      title: `Lead Folio ${index}`,
      client_name: `Client ${index}`,
      active_section: 'brief',
      current_phase: null,
      lead_id: `lead-id-${index}`,
      client_profile_id: null,
    },
    need: {
      kind: 'new_lead',
      text: `New lead ${index}`,
      actionLabel: null,
      stamp: { label: 'NEW', color: 'var(--color-clay)' },
      urgent: false,
    },
  } as unknown as DeskFolder;
}

/** R106 §3: the parked-ceremony card renders an extra held-draft preview
 *  line (`need.sub`) that no other NeedKind carries. */
function ceremonyFolio(index: number): DeskFolder {
  return {
    row: {
      engagement_id: `ceremony-folio-${index}`,
      title: `Ceremony Folio ${index}`,
      client_name: `Client ${index}`,
      active_section: 'brief',
      current_phase: null,
    },
    need: {
      kind: 'ceremony_pending',
      text: `Introduction parked ${index}`,
      actionLabel: 'Continue the introduction',
      stamp: { label: 'PARKED', color: 'var(--color-clay)' },
      urgent: false,
      sub: `Draft introduction text ${index}…`,
    },
  } as unknown as DeskFolder;
}

describe('NeedsYourHandFolios', () => {
  it('keeps exactly four folios in reach, then reveals and refolds the remainder', () => {
    const folders = Array.from({ length: 6 }, (_, index) =>
      folio(index + 1, index === 4),
    );
    render(<NeedsYourHandFolios folders={folders} />);

    expect(DESK_FOLIO_PREVIEW_LIMIT).toBe(4);
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(
      screen.getByText('4 in reach · 2 folded below · 1 time-sensitive'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Folio 5/ }),
    ).not.toBeInTheDocument();

    const reveal = screen.getByRole('button', {
      name: 'Reveal 2 more folios',
    });
    expect(reveal).toHaveAttribute('aria-expanded', 'false');
    expect(reveal).toHaveAttribute('aria-controls', 'needs-your-hand-folios');

    fireEvent.click(reveal);

    expect(screen.getAllByRole('link')).toHaveLength(6);
    expect(screen.getByText('All 6 folios in reach')).toBeInTheDocument();
    const fold = screen.getByRole('button', { name: 'Fold to four' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(fold);

    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(
      screen.queryByRole('link', { name: /Folio 6/ }),
    ).not.toBeInTheDocument();
  });

  // #10: the prod audit reported "Reveal 3 more folios" as inert. The folded
  // set behind that click is rarely homogeneous — a lead's TriageBar, a
  // parked ceremony's held-draft preview, and (post-A1) the ledger folio's
  // own inner control all mount for the FIRST time on reveal, simultaneously.
  // This fixture reproduces that heterogeneous first-mount and pins that it
  // does not throw and does not go inert: partitionDesk never truncates
  // `folders` (only `chips` is capped), and this is the state-transition
  // logic under the real condition the audit's click exercised.
  it('reveals a heterogeneous folded set (lead, ceremony, ledger folios) without going inert', () => {
    const folders = [
      folio(1),
      folio(2),
      folio(3),
      folio(4),
      leadFolio(5),
      ceremonyFolio(6),
      invoiceFolio(7),
    ];
    render(<NeedsYourHandFolios folders={folders} />);

    expect(screen.getAllByRole('link')).toHaveLength(4);

    const reveal = screen.getByRole('button', {
      name: 'Reveal 3 more folios',
    });
    fireEvent.click(reveal);

    // All 7 folio cards are now in reach — the reveal is not inert.
    expect(screen.getAllByRole('link')).toHaveLength(7);
    expect(screen.getByText('All 7 folios in reach')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Lead Folio 5/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Draft introduction text 6…'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Send reminder — Invoice Folio 7',
      }),
    ).toBeInTheDocument();
  });
});

// A1: the card surface always routes to the doc; the R36 ledger act (the one
// NeedKind whose act isn't "open the document") is now an explicit inner
// control, not the whole card. The two are SIBLINGS in the DOM (never a
// <button> nested inside the card's <a>), so both are independently
// reachable by mouse and keyboard.
describe('FolderCard — overdue_invoice (R36 ledger act)', () => {
  it('has no interactive-in-interactive nesting: the card is not an <a> wrapping the button', () => {
    const folder = invoiceFolio(1);
    const { container } = render(<FolderCard folder={folder} />);

    const card = screen.getByRole('link', {
      name: 'Invoice Folio 1 — Invoice 1 overdue — send a reminder',
    });
    const sendReminder = screen.getByRole('button', {
      name: 'Send reminder — Invoice Folio 1',
    });
    expect(card.contains(sendReminder)).toBe(false);
    expect(container.querySelectorAll('a button')).toHaveLength(0);
  });

  it('routes the card to the doc and fires a navigate-named event, not the ledger act key', () => {
    const folder = invoiceFolio(1);
    render(<FolderCard folder={folder} />);

    const card = screen.getByRole('link', {
      name: 'Invoice Folio 1 — Invoice 1 overdue — send a reminder',
    });
    expect(card).toHaveAttribute('href', '/doc/invoice-folio-1');

    fireEvent.click(card);

    // The card body IS "open the document", not the dunning act — so it
    // fires a distinct 'open_document' key, never 'overdue_invoice'.
    expect(documentEvents.actionSelected).toHaveBeenCalledTimes(1);
    expect(documentEvents.actionSelected).toHaveBeenCalledWith(
      expect.objectContaining({ action_key: 'open_document' }),
    );
  });

  it('exposes Send reminder as a separate, non-navigating control that fires the real act key', () => {
    const folder = invoiceFolio(1);
    render(<FolderCard folder={folder} />);

    const sendReminder = screen.getByRole('button', {
      name: 'Send reminder — Invoice Folio 1',
    });
    expect(sendReminder).toBeInTheDocument();

    fireEvent.click(sendReminder);

    expect(openLedger).toHaveBeenCalledWith('accounts', {
      page: 'receivables',
      invoiceId: 'inv-1',
    });
    // The act is tracked under the need's own key, on the control that
    // actually performs it — the event name matches the act performed.
    expect(documentEvents.actionSelected).toHaveBeenCalledTimes(1);
    expect(documentEvents.actionSelected).toHaveBeenCalledWith(
      expect.objectContaining({ action_key: 'overdue_invoice' }),
    );
  });

  it('reaches the card then the inner control by Tab, and activates each with keyboard alone', async () => {
    const user = userEvent.setup();
    const folder = invoiceFolio(1);
    render(<FolderCard folder={folder} />);

    const card = screen.getByRole('link', {
      name: 'Invoice Folio 1 — Invoice 1 overdue — send a reminder',
    });
    const sendReminder = screen.getByRole('button', {
      name: 'Send reminder — Invoice Folio 1',
    });

    // The pick-up Link renders first (first in DOM/tab order).
    await user.tab();
    expect(card).toHaveFocus();

    await user.tab();
    expect(sendReminder).toHaveFocus();

    // Enter on the focused button activates it — and does not navigate.
    await user.keyboard('{Enter}');
    expect(openLedger).toHaveBeenCalledTimes(1);

    // Space also activates the button (native button semantics).
    await user.keyboard(' ');
    expect(openLedger).toHaveBeenCalledTimes(2);
  });
});
