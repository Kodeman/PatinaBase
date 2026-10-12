/**
 * SQ-781 R1–R3 — the invoice reminder and the PO chase draft through their
 * real hooks (`useSendInvoice`, `useChaseInvoice`, `useComposeProcurementDraft`,
 * `useUpdateProcurementDraft`, `useSetNeedState`) under the portal's real
 * QueryClient, whose mutation defaults retry a network-shaped failure once.
 * The Supabase client is mocked and its calls are recorded in order.
 *
 *   R1  an ambiguous invoice send is never sent again on its own.
 *   R2  a suppressed receipt is not "sent": no chase stamp, no acted state.
 *   R3  only a refusal the database gave before writing says nothing saved.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { DeskNeed } from '@/lib/document/desk-need-list';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
// The invoice send is a teaching boundary; teaching stays off here.
jest.mock('@/hooks/use-feature-flags', () => ({ isTeachingNotesEnabled: () => false }));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({ isSuccess: true, data: { kind: 'engagement', row: { designer_id: null } } }),
}));

const mockShowErrorToast = jest.fn();
jest.mock('@/lib/error-handler', () => ({
  ...jest.requireActual('@/lib/error-handler'),
  showErrorToast: (...args: unknown[]) => mockShowErrorToast(...args),
}));

type Result = { data?: unknown; error: unknown };
const mockCalls: string[] = [];
let mockLeadUserId = 'me';
let mockInvoke: () => Promise<Result>;
let mockComposeRpc: () => Promise<Result>;
const mockClient = {
  rpc: (fn: string) => {
    mockCalls.push(fn);
    if (fn === 'compose_ack_chase_draft') return mockComposeRpc();
    if (fn === 'update_procurement_draft') return Promise.resolve({ data: { id: 'draft-1' }, error: null });
    return Promise.resolve({ data: null, error: null });
  },
  functions: {
    invoke: (fn: string) => {
      mockCalls.push(`invoke:${fn}`);
      return mockInvoke();
    },
  },
};
// The package's own hooks reach the client through '../client'.
jest.mock('@patina/supabase/client', () => ({
  ...jest.requireActual('@patina/supabase/client'),
  createBrowserClient: () => mockClient,
}));

const mockLeadRead = () => ({
  studioId: 'org-1',
  lead: { leadUserId: mockLeadUserId, leadName: 'Leah Moreau', assignedAt: '2026-10-01T00:00:00Z' },
});
jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  createBrowserClient: () => mockClient,
  useOrganizationMembers: (orgId: string) => ({
    isSuccess: Boolean(orgId),
    data: orgId ? [{ user_id: 'me', role: 'member', handoff_note: null, invited_by: null }] : undefined,
  }),
  useProjectLead: () => ({
    isSuccess: true,
    data: mockLeadRead(),
    refetch: async () => {
      mockCalls.push('recheck');
      return { isError: false, data: mockLeadRead() };
    },
  }),
  useInvoice: () => ({
    isSuccess: true,
    data: {
      id: 'inv-1',
      invoice_number: '0031',
      project_id: 'proj-1',
      due_date: '2026-09-20',
      total_cents: 920000,
      amount_paid_cents: 0,
      client: { id: 'client-1', full_name: 'Mara Olsen', email: 'mara@example.com' },
    },
  }),
  usePurchaseOrders: () => ({
    isSuccess: true,
    data: [{ id: 'po-1', po_number: '1042', sent_at: '2026-09-28T15:00:00Z', vendor: { name: 'Fenmoor Joinery' } }],
  }),
}));

import { queryClient } from '@/lib/react-query';
import { NeedActSheetProvider, useNeedActSheet } from '../need-act-sheet';
import { SAVE_FAILED, SEND_FAILED, SEND_UNCONFIRMED, SENT_UNRECORDED } from '../act-draft';

const NOT_SENT = 'Not sent — email to this client is paused right now. Nothing went out.';
const SAVE_UNCONFIRMED = 'We couldn’t confirm the draft saved. Check the drafts before trying again.';

function deskNeed(kind: string, recordId: string, owner: 'client' | 'maker'): DeskNeed {
  const key = `${kind}:${recordId}`;
  return {
    key,
    projectId: 'proj-1',
    projectName: 'Pell Court',
    need: {
      key,
      recordId,
      kind,
      text: 'The need',
      actionLabel: 'Act',
      stamp: { label: 'X', color: 'x' },
      urgent: false,
      owner,
    } as DeskNeed['need'],
  };
}

const INVOICE_NEED = deskNeed('overdue_invoice', 'inv-1', 'client');
const PO_NEED = deskNeed('po_unacknowledged', 'po-1', 'maker');
const REMIND = { name: 'Send the reminder to Mara Olsen' };
const SAVE = { name: 'Save the draft for Leah' };

function Opener({ need }: { need: DeskNeed }) {
  const sheet = useNeedActSheet();
  return (
    <button type="button" onClick={() => sheet.open(need)}>
      open the act
    </button>
  );
}

function openSheet(need: DeskNeed) {
  render(
    <QueryClientProvider client={queryClient}>
      <NeedActSheetProvider>
        <Opener need={need} />
      </NeedActSheetProvider>
    </QueryClientProvider>,
  );
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'open the act' }));
  });
}

/** invoice-send's non-2xx answer as supabase-js hands it over: the Response
 *  rides on the error's `context`. */
const httpError = (body: object): Result => ({
  data: null,
  error: Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: { json: async () => body },
  }),
});
const receipt = (emailSent: boolean): Result => ({
  data: { ok: true, invoiceId: 'inv-1', recipient: 'mara@example.com', emailSent, suppressed: !emailSent },
  error: null,
});
const count = (call: string) => mockCalls.filter((c) => c === call).length;
let quiet: jest.SpyInstance;

beforeEach(() => {
  queryClient.clear();
  mockShowErrorToast.mockClear();
  mockCalls.length = 0;
  mockLeadUserId = 'me';
  mockInvoke = async () => receipt(true);
  mockComposeRpc = async () => ({ data: { id: 'draft-1' }, error: null });
  quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => quiet.mockRestore());

describe('Remind this invoice — the send never goes again on its own (SQ-781 R1)', () => {
  it('a send that failed for the transport is invoked once, and cannot be confirmed', async () => {
    // The review's input: the first answer is a lost provider response, the
    // second would succeed. The portal's default would retry it once.
    let attempts = 0;
    mockInvoke = async () =>
      ++attempts === 1 ? httpError({ error: 'send_failed', detail: 'fetch failed' }) : receipt(true);
    openSheet(INVOICE_NEED);
    fireEvent.click(screen.getByRole('button', REMIND));
    expect(await screen.findByText(SEND_UNCONFIRMED)).toHaveAttribute('role', 'alert');
    expect(count('invoke:invoice-send')).toBe(1);
    expect(count('recheck')).toBe(1);
    expect(mockCalls).not.toContain('chase_invoice');
    expect(mockCalls).not.toContain('set_need_state');
    expect(screen.queryByText(/fetch failed/)).toBeNull();
    expect(screen.queryByRole('button', REMIND)).toBeNull();
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });
});

describe('Remind this invoice — the receipt says whether it went (SQ-781 R2)', () => {
  it('a delivered reminder stamps the chase, then marks the need acted', async () => {
    openSheet(INVOICE_NEED);
    fireEvent.click(screen.getByRole('button', REMIND));
    await waitFor(() => expect(mockCalls).toContain('set_need_state'));
    expect(mockCalls).toEqual(['recheck', 'invoke:invoice-send', 'chase_invoice', 'set_need_state']);
    expect(screen.queryByText(NOT_SENT)).toBeNull();
  });

  it('a suppressed reminder says nothing went out, stamps no chase and marks nothing', async () => {
    mockInvoke = async () => receipt(false);
    openSheet(INVOICE_NEED);
    fireEvent.click(screen.getByRole('button', REMIND));
    expect(await screen.findByText(NOT_SENT)).toHaveAttribute('role', 'alert');
    expect(mockCalls).toEqual(['recheck', 'invoke:invoice-send']);
    expect(screen.queryByText(SENT_UNRECORDED)).toBeNull();
    expect(screen.queryByText(SEND_UNCONFIRMED)).toBeNull();
    expect(screen.queryByText(SEND_FAILED)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark it again' })).toBeNull();
    // Nothing went, so the send is offered again.
    expect(screen.getByRole('button', REMIND)).toBeInTheDocument();
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });
});

describe('Chase this PO — a draft saved for the lead (SQ-781 R3)', () => {
  beforeEach(() => {
    mockLeadUserId = 'lead-1';
  });

  it.each([
    ['42501', 'compose_ack_chase_draft: purchase order po-1 not found or access denied'],
    ['23514', 'compose_ack_chase_draft: purchase order po-1 was not sent or is cancelled'],
  ])('a refusal before the insert (%s) says nothing was saved, and offers the save again', async (code, message) => {
    mockComposeRpc = async () => ({ data: null, error: { code, message, details: null, hint: null } });
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', SAVE));
    expect(await screen.findByText(SAVE_FAILED)).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(SAVE_UNCONFIRMED)).toBeNull();
    expect(screen.queryByText(/compose_ack_chase_draft/)).toBeNull();
    expect(count('compose_ack_chase_draft')).toBe(1);
    expect(mockCalls).not.toContain('update_procurement_draft');
    expect(screen.getByRole('button', SAVE)).toBeInTheDocument();
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });

  it('a save whose answer was lost cannot be confirmed, and offers no second save', async () => {
    // postgrest-js's answer to a request that never came back.
    mockComposeRpc = async () => ({
      data: null,
      error: { code: '', message: 'TypeError: fetch failed', details: 'TypeError: fetch failed', hint: '' },
    });
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', SAVE));
    expect(await screen.findByText(SAVE_UNCONFIRMED)).toHaveAttribute('role', 'alert');
    expect(screen.queryByText(SAVE_FAILED)).toBeNull();
    expect(screen.queryByText(/fetch failed/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^(Save|Send|Mark)/ })).toBeNull();
    expect(count('compose_ack_chase_draft')).toBe(1);
    expect(mockCalls).not.toContain('update_procurement_draft');
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });
});
