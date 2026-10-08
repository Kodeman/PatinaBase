/**
 * Walk D11 / D18 (SQ-545) — the Amendment in its real DocSheet: it opens on
 * its first field (P-2), is named by its visible title, and Esc puts it back
 * to its opener — or, when the opener is gone (a ⌘K row), to the band's Next
 * act rather than <body>.
 */

import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@patina/supabase', () => ({
  useProjectV2: () => ({
    data: { id: 'p-1', name: 'Halloran House', client_id: 'client-1', proposal: null },
  }),
  useScopeChangeRequests: () => ({ data: [] }),
  useAcceptClientScopeChangeRequest: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-amendments', () => ({
  useComposeAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useSendAmendment: () => ({ mutate: jest.fn(), isPending: false }),
  useApplyAmendment: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('../household-sheet', () => ({
  HouseholdSheet: () => null,
}));

import { AmendmentSheet } from '../amendment-sheet';

/** A host whose opener can leave the page while the sheet is open, the way a
 *  ⌘K row does when the palette closes. */
function Host({ withBand }: { withBand: boolean }) {
  const [open, setOpen] = useState(false);
  const [openerShown, setOpenerShown] = useState(true);
  return (
    <>
      {withBand && (
        <div data-lens-line="2">
          <button type="button" data-part="act">
            Send the purchase order
          </button>
        </div>
      )}
      {openerShown && (
        <button type="button" onClick={() => setOpen(true)}>
          Add a change
        </button>
      )}
      <button type="button" onClick={() => setOpenerShown(false)} hidden>
        drop opener
      </button>
      <AmendmentSheet
        projectId="p-1"
        clientName="Halloran"
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

const bandAct = () => screen.getByRole('button', { name: 'Send the purchase order' });

beforeEach(() => {
  // The band's act counts as rendered only with a client rect (jsdom has none).
  jest
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockImplementation(() => [{}] as unknown as DOMRectList);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('Amendment — focus and Esc (walk D11, D18)', () => {
  it('opens on its first field and is named by its visible title', async () => {
    render(<Host withBand={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a change' }));

    const dialog = screen.getByRole('dialog');
    const ids = (dialog.getAttribute('aria-labelledby') ?? '').split(/\s+/).filter(Boolean);
    expect(ids).toHaveLength(1);
    const title = document.getElementById(ids[0]);
    expect(title).toHaveTextContent('Amend the scope');
    expect(title).toBeVisible();
    expect(title).not.toHaveClass('sr-only');
    expect(dialog).toHaveAccessibleName('Amend the scope');

    await waitFor(() => expect(screen.getByLabelText(/What.s changing/)).toHaveFocus());
  });

  it('one Esc puts it back and returns focus to the control that opened it', async () => {
    render(<Host withBand />);
    const opener = screen.getByRole('button', { name: 'Add a change' });
    opener.focus();
    fireEvent.click(opener);
    const field = screen.getByLabelText(/What.s changing/);
    await waitFor(() => expect(field).toHaveFocus());

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('with its opener gone, Esc returns focus to the band’s Next act, not <body>', async () => {
    render(<Host withBand />);
    const opener = screen.getByRole('button', { name: 'Add a change' });
    opener.focus();
    fireEvent.click(opener);
    const field = screen.getByLabelText(/What.s changing/);
    await waitFor(() => expect(field).toHaveFocus());

    // The ⌘K row the sheet was opened from leaves with the palette.
    act(() => {
      (screen.getByText('drop opener', { selector: 'button' }) as HTMLElement).click();
    });
    expect(screen.queryByRole('button', { name: 'Add a change' })).not.toBeInTheDocument();

    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(bandAct()).toHaveFocus());
    expect(document.activeElement).not.toBe(document.body);
  });
});
