/**
 * US-35 F1/F2 — the household sheet opened from the invoice composer's Link a
 * client act lays ABOVE the composer folio (PaperFolioSheet, z-[60]): it is the
 * top modal, it holds Tab, its Esc closes only itself and hands focus back to
 * Link a client, and the composer's draft underneath is untouched. Off the
 * project's document the act walks to `?sheet=household`; the page opens the
 * same sheet with the same flag while the layout-mounted folio stays open, so
 * this is the stack in both cases.
 */
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HouseholdSheet } from '../household-sheet';
import { PaperFolioSheet } from '../paper-folio-sheet';
import { topActiveModalDialog } from '../active-dialog';

let mockAttach: { mutate: jest.Mock; isPending: boolean; isError: boolean; error: unknown } = {
  mutate: jest.fn(),
  isPending: false,
  isError: false,
  error: null,
};

jest.mock('@patina/supabase', () => ({
  useClient: () => ({ data: undefined }),
  useDesignerClientForClientUser: () => ({ data: undefined }),
  useUpdateClientContact: () => ({ mutate: jest.fn(), isPending: false }),
  useClientInvitationStatus: () => ({ data: null, isLoading: false, isError: false }),
  useInviteAndLinkClient: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

jest.mock('@/hooks/use-feature-flag', () => ({
  ...jest.requireActual('@/hooks/use-feature-flag'),
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('../../people/directory/client-letter-line', () => ({
  ClientLetterLine: () => null,
}));

jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => mockAttach,
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: ({ placeholder, popoverClassName }: { placeholder?: string; popoverClassName?: string }) => (
    <button type="button" data-testid="client-picker-trigger" data-popover-class={popoverClassName ?? ''}>
      {placeholder}
    </button>
  ),
}));

beforeEach(() => {
  mockAttach = { mutate: jest.fn(), isPending: false, isError: false, error: null };
});

const sheetProps = {
  engagementKind: 'project',
  projectId: 'project-1',
  proposalId: null,
  clientProfileId: null,
  designerClientId: null,
  clientName: '',
} as const;

function ComposerStack({ onFolioClose }: { onFolioClose: () => void }) {
  const [householdOpen, setHouseholdOpen] = useState(false);
  return (
    <>
      <PaperFolioSheet open onClose={onFolioClose} title="Draw an invoice" wide>
        <textarea aria-label="memo · shown to the client" defaultValue="" />
        <button type="button" onClick={() => setHouseholdOpen(true)}>
          Link a client
        </button>
      </PaperFolioSheet>
      {householdOpen && (
        <HouseholdSheet open onClose={() => setHouseholdOpen(false)} {...sheetProps} aboveFolio />
      )}
    </>
  );
}

const householdPanel = () =>
  document.querySelector<HTMLElement>('[data-doc-sheet-layer] [role="dialog"]');

describe('HouseholdSheet above the composer folio (US-35 F1/F2)', () => {
  it('lays above the folio, holds focus, and puts back only itself on Esc', async () => {
    const onFolioClose = jest.fn();
    render(<ComposerStack onFolioClose={onFolioClose} />);
    fireEvent.change(screen.getByLabelText('memo · shown to the client'), {
      target: { value: 'Thank you' },
    });
    const link = screen.getByRole('button', { name: 'Link a client' });
    link.focus();
    fireEvent.click(link);

    // Stacked above the folio's z-[60], not under its backdrop at z-50.
    const layer = document.querySelector<HTMLElement>('[data-doc-sheet-layer]');
    expect(layer).toHaveClass('z-[65]');
    expect(layer).not.toHaveClass('z-50');
    expect(screen.getByTestId('client-picker-trigger')).toHaveAttribute('data-popover-class', 'z-[70]');

    // The sheet is the top modal, and the trap is its.
    const panel = householdPanel();
    expect(panel).not.toBeNull();
    expect(topActiveModalDialog()).toBe(panel);
    await waitFor(() => expect(panel).toHaveFocus());
    for (let i = 0; i < 4; i += 1) {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' });
      expect(panel!.contains(document.activeElement)).toBe(true);
    }
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab', shiftKey: true });
    expect(panel!.contains(document.activeElement)).toBe(true);

    // Esc puts back the sheet alone; focus returns to the act that opened it.
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(householdPanel()).toBeNull();
    expect(onFolioClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Draw an invoice' })).toBeInTheDocument();
    await waitFor(() => expect(link).toHaveFocus());
    expect(screen.getByLabelText('memo · shown to the client')).toHaveValue('Thank you');

    // With the sheet gone, Esc is the folio's again.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onFolioClose).toHaveBeenCalledTimes(1);
  });

  it('keeps every other caller on the z-50 layer', () => {
    render(<HouseholdSheet open onClose={jest.fn()} {...sheetProps} />);
    const layer = document.querySelector<HTMLElement>('[data-doc-sheet-layer]');
    expect(layer).toHaveClass('z-50');
    expect(layer).not.toHaveClass('z-[65]');
    expect(screen.getByTestId('client-picker-trigger')).toHaveAttribute('data-popover-class', '');
  });

  it("says who may link a client when set_document_client refuses a non-lead (F9)", () => {
    mockAttach = {
      mutate: jest.fn(),
      isPending: false,
      isError: true,
      error: { message: 'no project owned by you with id 0b6f1c2e-0000-4000-8000-000000000001' },
    };
    render(<HouseholdSheet open onClose={jest.fn()} {...sheetProps} aboveFolio />);
    expect(screen.getByText('Only the lead designer can link a client to this project.')).toBeInTheDocument();
    expect(screen.queryByText(/owned by you|0b6f1c2e/)).not.toBeInTheDocument();
  });

  it('keeps the paper folio scrim fixed to the viewport and uses the veil token', () => {
    render(
      <PaperFolioSheet open onClose={jest.fn()} title="Invoice">
        <div style={{ height: 1200 }}>Long folio</div>
      </PaperFolioSheet>,
    );
    const backdrop = screen.getByRole('button', { name: 'Close sheet' });
    expect(backdrop).toHaveClass('fixed', 'inset-0', 'bg-[var(--veil)]');
    expect(backdrop).not.toHaveClass('absolute', 'h-full');
  });

  it('keeps any other attach failure as it was', () => {
    mockAttach = {
      mutate: jest.fn(),
      isPending: false,
      isError: true,
      error: new Error('client 42 is not one of your clients'),
    };
    render(<HouseholdSheet open onClose={jest.fn()} {...sheetProps} />);
    expect(screen.getByText('client 42 is not one of your clients')).toBeInTheDocument();
  });
});
