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

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
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

describe('DeskContents — Begin column', () => {
  it('does not render Capture a lead, but keeps every other verb', () => {
    render(<DeskContents />);

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

  it('F08 — the Desk\'s own invoice door names its scope', () => {
    render(<DeskContents />);

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

    render(<DeskContents />);

    const row = screen.getByRole('button', {
      name: /Open the Drafting Room/,
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
    render(<DeskContents />);

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
    render(<DeskContents />);

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
    render(<DeskContents />);

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
