/**
 * A9: the Studio Contents "Begin" column no longer duplicates the Desk
 * header's "Capture a lead" CTA — it's filtered out of the STUDIO_VERBS render
 * while every other verb (and ⌘K's own read of the untouched registry) stays
 * reachable. See docs/design/doc-polish/deck.html item A9.
 */
import { render, screen } from '@testing-library/react';
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
      screen.queryByRole('button', { name: 'Capture a lead' }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole('button', { name: 'Open a project' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Draft a design agreement' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Draw an invoice' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Add a maker' }),
    ).toBeInTheDocument();
  });
});
