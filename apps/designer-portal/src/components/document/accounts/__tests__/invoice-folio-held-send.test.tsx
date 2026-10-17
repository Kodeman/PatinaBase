/**
 * US-36 R2 K10: when invoice-send would find no address, the folio's Send is
 * held BEFORE anything issues. The reason sits beside Send ("Add <client>'s
 * email to send this.") and its fix, "Add their email", sits inside the same
 * spotlight window. The fix opens the household sheet above the folio, on the
 * email field. Once the email lands, the hold clears live.
 */
import { useEffect, useReducer, type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Invoice } from '@patina/supabase';
import { InvoiceFolio } from '../invoice-folio';

const mockIssue = jest.fn();
const mockSend = jest.fn();
const mockUpdateContact = jest.fn();

const baseInvoice: Invoice = {
  id: 'invoice-1',
  project_id: 'project-1',
  designer_id: 'designer-1',
  client_id: 'client-1',
  invoice_number: null,
  title: null,
  status: 'draft',
  issue_date: null,
  due_date: null,
  payment_terms_days: 14,
  currency: 'USD',
  subtotal_cents: 25_000,
  tax_rate: 0,
  tax_cents: 0,
  total_cents: 25_000,
  amount_paid_cents: 0,
  memo: null,
  internal_notes: null,
  stripe_checkout_session_id: null,
  sent_at: null,
  paid_at: null,
  voided_at: null,
  void_reason: null,
  reminder_count: 0,
  last_reminder_at: null,
  ar_flagged_at: null,
  ar_last_chased_at: null,
  created_at: '2026-07-31T12:00:00.000Z',
  updated_at: '2026-07-31T12:00:00.000Z',
  project: { id: 'project-1', name: 'Lake House' },
  // The client's Patina account carries no email (a household not signed up).
  client: { id: 'client-1', full_name: 'Elena Reyes', email: '' },
  line_items: [],
  payments: [],
};
let mockInvoice: Invoice = baseInvoice;

type Household = {
  id: string;
  client_id: string;
  client: { id: string; full_name: string; email: string } | null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  status: string;
};
const emptyHousehold: Household = {
  id: 'dc-1',
  client_id: 'client-1',
  client: { id: 'client-1', full_name: 'Elena Reyes', email: '' },
  client_name: 'Elena Reyes',
  client_email: null,
  client_phone: null,
  notes: null,
  status: 'active',
};
let mockHousehold: Household = emptyHousehold;
const mockHouseholdListeners = new Set<() => void>();
let mockViewer = 'designer-1';
/** Studio RLS (00316): the invoice designer's book opens to a studio co-member. */
let mockViewerIsCoMember = false;
/** A forced relationship read (pending, failed, empty); null reads the books. */
let mockRelationshipRead: { data?: { id: string } | null; isLoading?: boolean; isError?: boolean } | null =
  null;
let mockHouseholdLoading = false;
const mockRelationshipLookup = jest.fn();

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  useSessionUserId: () => mockViewer,
  // The client's row lives in designer-1's book; it reads as designer-1 or a
  // co-member of her studio, and as null to anyone else.
  useDesignerClientForClientUser: (id: string | null | undefined, designerId?: string | null) => {
    mockRelationshipLookup(id, designerId);
    if (mockRelationshipRead) return { isLoading: false, ...mockRelationshipRead };
    const book = designerId ?? mockViewer;
    const readable = book === 'designer-1' && (mockViewer === 'designer-1' || mockViewerIsCoMember);
    return { data: id && readable ? { id: 'dc-1' } : null, isLoading: false };
  },
  // A read that re-renders when the household row changes, the way the
  // ['designer-client', id] invalidation does in the app.
  useClient: (id: string) => {
    const [, bump] = useReducer((n: number) => n + 1, 0);
    useEffect(() => {
      mockHouseholdListeners.add(bump);
      return () => {
        mockHouseholdListeners.delete(bump);
      };
    }, []);
    return id && mockHouseholdLoading
      ? { data: undefined, isLoading: true }
      : { data: id ? mockHousehold : undefined, isLoading: false };
  },
  useUpdateClientContact: () => ({ mutate: mockUpdateContact, isPending: false, error: null }),
  useClientInvitationStatus: () => ({ data: null, isLoading: false, isError: false }),
  useInviteAndLinkClient: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  useInvoice: () => ({
    data: mockInvoice,
    isLoading: false,
    isError: false,
    refetch: jest.fn().mockResolvedValue({ data: mockInvoice }),
  }),
  useIssueInvoice: () => ({ mutateAsync: mockIssue, isPending: false }),
  useSendInvoice: () => ({ mutateAsync: mockSend, isPending: false }),
  useRecordPayment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVoidInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInvoiceLink: () => ({ data: null }),
  invoiceLinkIsLive: () => false,
  useRegenerateInvoiceLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  RegenerateInvoiceLinkError: class RegenerateInvoiceLinkError extends Error {},
}));

jest.mock(
  '@/hooks/use-invoice-checkout-reconciliation',
  () => ({
    useReconcileInvoiceCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  }),
  { virtual: true },
);

// F3 (SQ-1249): the folio's Send reads the app's onlineManager before its fresh read.
jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('../../people/directory/client-letter-line', () => ({
  ClientLetterLine: () => null,
}));

jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => null,
}));

/** The folio lays inside PaperFolioSheet's panel: the spotlight's frame. */
const Frame = ({ children }: { children: ReactNode }) => (
  <div data-spotlight-frame="">{children}</div>
);
const renderFolio = () => render(<InvoiceFolio invoiceId="invoice-1" />, { wrapper: Frame });
const spotWindows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-hold-spotlight-window]')).map(
    (el) => el.dataset.holdSpotlightWindow,
  );
const sendAct = () => screen.getByRole('button', { name: 'Issue & send' });

beforeEach(() => {
  jest.clearAllMocks();
  mockInvoice = baseInvoice;
  mockHousehold = emptyHousehold;
  mockHouseholdListeners.clear();
  mockViewer = 'designer-1';
  mockViewerIsCoMember = false;
  mockRelationshipRead = null;
  mockHouseholdLoading = false;
  mockIssue.mockResolvedValue({ ...baseInvoice, status: 'sent' });
  mockSend.mockResolvedValue({ emailSent: true, recipient: 'elena@example.com' });
  // Saving the household's details writes its email; the read re-renders.
  mockUpdateContact.mockImplementation(
    (
      { updates }: { updates: { client_email?: string | null } },
      options?: { onSuccess?: () => void },
    ) => {
      mockHousehold = { ...mockHousehold, client_email: updates.client_email ?? null };
      mockHouseholdListeners.forEach((bump) => bump());
      options?.onSuccess?.();
    },
  );
});

it('K10: with no address, the press on Send lights one window and issues nothing', async () => {
  renderFolio();
  const send = sendAct();
  expect(send).toHaveAttribute('aria-disabled', 'true');
  // K3: the reason is visible beside Send before the press.
  expect(screen.getByText("Add Elena's email to send this.")).toBeInTheDocument();
  expect(document.getElementById(send.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
    "Add Elena's email to send this.",
  );

  fireEvent.click(send);

  await waitFor(() => expect(spotWindows()).toEqual(['add-email']));
  // R186: the fix is live inside the window, and the spotlight lands on it.
  const fix = screen.getByRole('button', { name: 'Add their email' });
  expect(fix.closest('[inert]')).toBeNull();
  await waitFor(() => expect(fix).toHaveFocus());
  expect(mockIssue).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

it('K10: Add their email opens the household sheet above the folio on the email field, and the hold clears live once the email lands', async () => {
  renderFolio();
  fireEvent.click(sendAct());
  await waitFor(() => expect(spotWindows()).toEqual(['add-email']));

  fireEvent.click(screen.getByRole('button', { name: 'Add their email' }));

  const sheet = await screen.findByRole('dialog', { name: 'The household' });
  const email = await screen.findByLabelText('Email on file');
  expect(sheet).toContainElement(email);
  await waitFor(() => expect(email).toHaveFocus());

  fireEvent.change(email, { target: { value: 'elena@example.com' } });
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  });

  expect(mockUpdateContact).toHaveBeenCalledWith(
    expect.objectContaining({
      clientId: 'dc-1',
      updates: expect.objectContaining({ client_email: 'elena@example.com' }),
    }),
    expect.anything(),
  );
  await waitFor(() =>
    expect(screen.queryByText("Add Elena's email to send this.")).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(spotWindows()).toEqual([]));
  expect(sendAct()).not.toHaveAttribute('aria-disabled');
  expect(mockIssue).not.toHaveBeenCalled();
  // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
  expect(mockSend).not.toHaveBeenCalled();
});

it('K10 control: with an email on file, Send issues and sends', async () => {
  mockInvoice = {
    ...baseInvoice,
    client: { id: 'client-1', full_name: 'Elena Reyes', email: 'elena@example.com' },
  };
  renderFolio();
  expect(screen.queryByText("Add Elena's email to send this.")).not.toBeInTheDocument();

  fireEvent.click(sendAct());
  const confirm = await screen.findAllByRole('button', { name: 'Issue & send' });
  fireEvent.click(confirm[confirm.length - 1]);

  // F2 (SQ-1249): one invoice-send request issues the draft and sends it.
  await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
  expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'invoice-1', issue: true }));
  expect(mockIssue).not.toHaveBeenCalled();
  expect(spotWindows()).toEqual([]);
});

/** Re-renders the folio after a read changes underneath it. */
const reread = () => act(() => mockHouseholdListeners.forEach((bump) => bump()));

/** Send held on its reason alone: no fix to offer, and the press issues nothing. */
async function expectHeldWithoutFix(reason: string) {
  const send = sendAct();
  expect(send).toHaveAttribute('aria-disabled', 'true');
  expect(document.getElementById(send.getAttribute('aria-describedby') ?? '')).toHaveTextContent(reason);
  expect(screen.queryByRole('button', { name: 'Add their email' })).not.toBeInTheDocument();
  fireEvent.click(send);
  await waitFor(() => expect(spotWindows()).toEqual(['send-recipient']));
  expect(mockIssue).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
}

describe('SQ-1203 F2: Send fails closed while its recipient is unknown', () => {
  it('holds Send with a loading reason while the relationship read is pending', async () => {
    mockRelationshipRead = { data: undefined, isLoading: true };
    renderFolio();
    await expectHeldWithoutFix("Checking Elena's email before this sends.");
  });

  it('holds Send with a loading reason while the household read is pending', async () => {
    mockHouseholdLoading = true;
    renderFolio();
    await expectHeldWithoutFix("Checking Elena's email before this sends.");
  });

  it('a confirmation opened while ready issues nothing once the reads go pending again', async () => {
    mockHousehold = { ...emptyHousehold, client_email: 'elena@example.com' };
    renderFolio();
    fireEvent.click(sendAct());
    const confirm = () => {
      const acts = screen.getAllByRole('button', { name: 'Issue & send' });
      return acts[acts.length - 1];
    };
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Issue & send' })).toHaveLength(2));
    expect(confirm()).not.toHaveAttribute('aria-disabled');

    mockRelationshipRead = { data: undefined, isLoading: true };
    reread();
    expect(confirm()).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(confirm());

    await waitFor(() => expect(spotWindows()).toEqual(['send-recipient']));
    expect(mockIssue).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('SQ-1203 F3: a teammate-drawn draft reads the invoice designer’s book', () => {
  beforeEach(() => {
    mockViewer = 'owner-2';
    mockInvoice = {
      ...baseInvoice,
      designer: { id: 'designer-1', full_name: 'Dana Wolfe', business_name: null },
    };
  });

  it('an owner of the same studio reads that row, and its Add their email is live in the window', async () => {
    mockViewerIsCoMember = true;
    renderFolio();
    expect(mockRelationshipLookup).toHaveBeenCalledWith('client-1', 'designer-1');
    const send = sendAct();
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText("Add Elena's email to send this.")).toBeInTheDocument();

    fireEvent.click(send);
    await waitFor(() => expect(spotWindows()).toEqual(['add-email']));
    expect(screen.getByRole('button', { name: 'Add their email' }).closest('[inert]')).toBeNull();
    expect(mockIssue).not.toHaveBeenCalled();
    // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('a viewer whose studio RLS hides that row is held, told who can send it, with no fix', async () => {
    renderFolio();
    expect(mockRelationshipLookup).toHaveBeenCalledWith('client-1', 'designer-1');
    await expectHeldWithoutFix("Only Dana Wolfe can see Elena's email. Ask them to send this invoice.");
  });
});

describe('SQ-1203 F5: Add their email is offered only with a relationship to edit', () => {
  it('with no relationship row, the hold keeps its reason and offers no fix', async () => {
    mockRelationshipRead = { data: null };
    renderFolio();
    await expectHeldWithoutFix("Add Elena's email to send this.");
  });

  it('with a failed relationship read, Send is held on why, with no fix', async () => {
    mockRelationshipRead = { data: undefined, isError: true };
    renderFolio();
    await expectHeldWithoutFix("Elena's email couldn't be checked. Reload the folio to send this.");
  });
});

it('SQ-1203 F6: once the saved email takes Add their email away, putting the sheet back lands on Send', async () => {
  renderFolio();
  fireEvent.click(screen.getByRole('button', { name: 'Add their email' }));
  const email = await screen.findByLabelText('Email on file');
  fireEvent.change(email, { target: { value: 'elena@example.com' } });
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Add their email' })).not.toBeInTheDocument(),
  );

  fireEvent.keyDown(document, { key: 'Escape' });

  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'The household' })).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(sendAct()).toHaveFocus());
  expect(mockIssue).not.toHaveBeenCalled();
  // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
  expect(mockSend).not.toHaveBeenCalled();
});

// SQ-1223 R1 reverses the old fail-open on purpose: unknown is held. An
// unreadable profile with no household address to fall back on is no recipient.
it('SQ-1223 R1: a folio that cannot see the client account, with no address on file, holds Send', async () => {
  mockInvoice = { ...baseInvoice, client: undefined };
  renderFolio();
  const send = sendAct();
  expect(send).toHaveAttribute('aria-disabled', 'true');
  expect(document.getElementById(send.getAttribute('aria-describedby') ?? '')).toHaveTextContent(
    "Add Elena's email to send this.",
  );

  fireEvent.click(send);

  await waitFor(() => expect(spotWindows()).toEqual(['add-email']));
  expect(screen.getByRole('button', { name: 'Add their email' }).closest('[inert]')).toBeNull();
  expect(mockIssue).not.toHaveBeenCalled();
  expect(mockSend).not.toHaveBeenCalled();
});

it('SQ-1223 R1 control: an unreadable account with a household address on file sends', () => {
  mockInvoice = { ...baseInvoice, client: undefined };
  mockHousehold = { ...emptyHousehold, client_email: 'elena@example.com' };
  renderFolio();
  expect(sendAct()).not.toHaveAttribute('aria-disabled');
  expect(screen.queryByText("Add Elena's email to send this.")).not.toBeInTheDocument();
});
