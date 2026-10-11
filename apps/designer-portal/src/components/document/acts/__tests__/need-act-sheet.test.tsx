/**
 * US-25 slice 5 — the scoped act sheets. Each opens prefilled, sends only
 * through its separate named control and then marks the need `acted`, waiting
 * on the counterpart. A non-lead never sends (Q11, SQ-746 ruling (b)): her PO
 * chase is saved for the lead; her invoice reminder and proposal follow-up
 * are read-only, with no send and no save control.
 *
 * The real provider, DocSheet, DocumentAction and controls render; the send
 * paths are mocks whose calls are counted.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DeskNeed } from '@/lib/document/desk-need-list';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));
jest.mock('@/hooks/use-auth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));

const mockSendNote = jest.fn();
jest.mock('../../letterhead-instruments', () => ({
  useSendDocumentNote: () => ({ mutateAsync: mockSendNote }),
}));

const mockCompose = jest.fn();
const mockUpdate = jest.fn();
const mockSendDraft = jest.fn();
const mockSendInvoice = jest.fn();
const mockChase = jest.fn();
const mockRelease = jest.fn();
const mockSetNeedState = jest.fn();
let mockLeadUserId: string | null = 'me';
let mockHandoffNote: string | null = null;
let mockRole = 'member';
let mockInvoiceLoaded = true;
let mockDesignerId: string | null = null;
let mockStateProjects: Set<string> | undefined = new Set(['proj-1']);
// The target job's own studio (SQ-774 R2): its lead and the seat that counts.
let mockStudioId: string | null = 'org-1';
const mockLeadRead = () => ({
  studioId: mockStudioId,
  lead: mockLeadUserId
    ? { leadUserId: mockLeadUserId, leadName: 'Leah Moreau', assignedAt: '2026-10-01T00:00:00Z' }
    : null,
});
const mockRefetchLeads = jest.fn();
const mockMember = (role: string, handoffNote: string | null = null) => ({
  user_id: 'me', role, handoff_note: handoffNote, invited_by: 'owner-1', profiles: { full_name: 'Ana Ruiz' },
});
const MOCK_OWNER = { user_id: 'owner-1', role: 'owner', handoff_note: null, invited_by: null, profiles: { full_name: 'Leah Moreau' } };
/** Each studio's members: her seat in `org-1` is `mockRole`; she owns her own
 *  `personal` studio and is a member of her `employer`'s. */
const mockMembersOf = (orgId: string) =>
  orgId === 'org-1'
    ? [mockMember(mockRole, mockHandoffNote), MOCK_OWNER]
    : orgId === 'employer'
      ? [mockMember('member'), MOCK_OWNER]
      : orgId === 'personal'
        ? [mockMember('owner')]
        : [];

jest.mock('@/hooks/use-document-state', () => ({
  useDocumentEngagement: () => ({
    isSuccess: true,
    data: { kind: 'engagement', row: { designer_id: mockDesignerId } },
  }),
}));

const LINES = [
  {
    id: 'line-1',
    removed_at: null,
    vendor_name: null,
    purchase_order: {
      id: 'po-1',
      po_number: '1042',
      sent_at: '2026-09-28T15:00:00Z',
      vendor: { name: 'Fenmoor Joinery' },
    },
  },
];
const INVOICE = {
  id: 'inv-1',
  invoice_number: '0031',
  project_id: 'proj-1',
  due_date: '2026-09-20',
  total_cents: 920000,
  amount_paid_cents: 0,
  client: { id: 'client-1', full_name: 'Mara Olsen', email: 'mara@example.com' },
};
const PROPOSAL = {
  id: 'prop-1',
  title: 'Lake house living room',
  project_id: null,
  decline_reason: 'The sofa is over budget',
  client: { id: 'client-1', full_name: 'Mara Olsen' },
};

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useOrganizationMembers: (orgId: string) => ({
    isSuccess: Boolean(orgId),
    data: orgId ? mockMembersOf(orgId) : undefined,
  }),
  useProjectLead: () => ({ isSuccess: true, data: mockLeadRead(), refetch: mockRefetchLeads }),
  useSetNeedState: () => ({ mutateAsync: mockSetNeedState }),
  useNeedStateProjectIds: () => ({ data: mockStateProjects }),
  useProjectFFEItems: () => ({ isSuccess: true, data: LINES }),
  useComposeProcurementDraft: () => ({ mutateAsync: mockCompose }),
  useUpdateProcurementDraft: () => ({ mutateAsync: mockUpdate }),
  useSendProcurementDraft: () => ({ mutateAsync: mockSendDraft }),
  useInvoice: () => ({ isSuccess: mockInvoiceLoaded, data: INVOICE }),
  useSendInvoice: () => ({ mutateAsync: mockSendInvoice }),
  useChaseInvoice: () => ({ mutateAsync: mockChase }),
  useProposal: () => ({ isSuccess: true, data: PROPOSAL }),
  useReleasePurchaseOrder: () => ({ mutateAsync: mockRelease }),
}));

import { NeedActSheetProvider, useNeedActSheet } from '../need-act-sheet';
import { silencePoId } from '../act-sheet-kind';

function deskNeed(kind: string, recordId: string | undefined, extra: Record<string, unknown> = {}): DeskNeed {
  const key = recordId ? `${kind}:${recordId}` : `${kind}:project:proj-1`;
  return {
    key,
    projectId: 'proj-1',
    projectName: 'Pell Court',
    need: {
      key,
      ...(recordId ? { recordId } : {}),
      kind,
      text: 'The need',
      actionLabel: 'Act',
      stamp: { label: 'X', color: 'x' },
      urgent: false,
      owner: 'designer',
      ...extra,
    } as DeskNeed['need'],
  };
}

const PO_NEED = deskNeed('po_unacknowledged', 'po-1', { owner: 'maker' });
const INVOICE_NEED = deskNeed('overdue_invoice', 'inv-1', { owner: 'client' });
const PROPOSAL_NEED = deskNeed('proposal_declined', 'prop-1');
const RELEASE_NEED = deskNeed('po_unsent', 'po-1', { releaseHeld: true, text: "Release Ana's order to Fenmoor Joinery · $4,800" });

let opened: boolean | null = null;
function Opener({ need }: { need: DeskNeed }) {
  const sheet = useNeedActSheet();
  return (
    <button type="button" onClick={() => (opened = sheet.open(need))}>
      open the act
    </button>
  );
}

function openSheet(need: DeskNeed) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NeedActSheetProvider>
        <Opener need={need} />
      </NeedActSheetProvider>
    </QueryClientProvider>,
  );
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'open the act' }));
  });
}

const textbox = (label: string) => screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
const noSendOrSave = () =>
  expect(screen.queryByRole('button', { name: /^(send|save|release)/i })).toBeNull();

beforeEach(() => {
  jest.clearAllMocks();
  opened = null;
  mockLeadUserId = 'me';
  mockHandoffNote = null;
  mockRole = 'member';
  mockInvoiceLoaded = true;
  mockDesignerId = null;
  mockStateProjects = new Set(['proj-1']);
  mockStudioId = 'org-1';
  mockRefetchLeads.mockImplementation(async () => ({ isError: false, data: mockLeadRead() }));
  mockCompose.mockResolvedValue({ id: 'draft-1' });
  mockUpdate.mockResolvedValue({ id: 'draft-1' });
  mockSendDraft.mockResolvedValue({ draftId: 'draft-1', messageId: 'm-1' });
  mockSendInvoice.mockResolvedValue({ ok: true });
  mockChase.mockResolvedValue('2026-10-10T12:00:00Z');
  mockSendNote.mockResolvedValue(undefined);
  mockRelease.mockResolvedValue({ id: 'po-1' });
  mockSetNeedState.mockResolvedValue(undefined);
});

describe('useNeedActSheet().open', () => {
  it('returns false for a need with no scoped sheet, and opens nothing', () => {
    openSheet(deskNeed('task_due', 'task-1'));
    expect(opened).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('returns false for an aggregate that names no record', () => {
    openSheet(deskNeed('po_unacknowledged', undefined));
    expect(opened).toBe(false);
  });

  it('returns false for a PO silence that already holds a note', () => {
    openSheet(deskNeed('po_unacknowledged', 'po-1', { draft: { id: 'd', kind: 'ack_chase', status: 'awaiting_review' } }));
    expect(opened).toBe(false);
  });

  it('returns false for a drafted PO that is not held for this seat', () => {
    openSheet(deskNeed('po_unsent', 'po-1'));
    expect(opened).toBe(false);
  });
});

describe('the act sheets while the record is read', () => {
  it('prints "Loading the record…" until the record arrives (SQ-752)', () => {
    mockInvoiceLoaded = false;
    openSheet(INVOICE_NEED);
    expect(screen.getByText('Loading the record…')).toBeInTheDocument();
  });
});

describe('Chase this PO', () => {
  it('opens prefilled, and nothing is composed or sent on open', () => {
    openSheet(PO_NEED);
    expect(opened).toBe(true);
    expect(screen.getByText('Follow up on this purchase order')).toBeInTheDocument();
    expect(screen.getByText('Fenmoor Joinery')).toBeInTheDocument();
    expect(textbox('Subject').value).toBe('PO 1042: please acknowledge');
    expect(textbox('Note').value).toMatch(/^Hello Fenmoor Joinery,/);
    expect(mockCompose).not.toHaveBeenCalled();
    expect(mockSendDraft).not.toHaveBeenCalled();
  });

  it('sends only from its named control, then marks the need acted', async () => {
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' }));
    await waitFor(() => expect(mockSetNeedState).toHaveBeenCalled());
    expect(mockCompose).toHaveBeenCalledWith({ kind: 'ack_chase', purchaseOrderId: 'po-1' });
    expect(mockUpdate).toHaveBeenCalledWith({
      draftId: 'draft-1',
      request: { subject: 'PO 1042: please acknowledge', body: expect.stringMatching(/^Hello Fenmoor Joinery,/) },
    });
    expect(mockSendDraft).toHaveBeenCalledWith('draft-1');
    expect(mockSetNeedState).toHaveBeenCalledWith({
      needKey: 'po_unacknowledged:po-1',
      projectId: 'proj-1',
      action: 'acted',
      waitingOn: 'Fenmoor Joinery',
    });
  });

  it("a non-lead saves the draft for the lead and never sends", async () => {
    mockLeadUserId = 'lead-1';
    mockHandoffNote = 'Start with the Olsen lake house';
    openSheet(PO_NEED);
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull();
    expect(screen.getByText('Leah sees this first.')).toBeInTheDocument();
    expect(screen.getByText(/From Leah: Start with the Olsen lake house/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save the draft for Leah' }));
    await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
    expect(mockCompose).toHaveBeenCalledWith({ kind: 'ack_chase', purchaseOrderId: 'po-1' });
    expect(mockSendDraft).toHaveBeenCalledTimes(0);
    expect(mockSetNeedState).toHaveBeenCalledTimes(0);
  });

  it('the owner sends even on a job another member leads', () => {
    mockLeadUserId = 'lead-1';
    mockRole = 'owner';
    openSheet(PO_NEED);
    expect(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' })).toBeInTheDocument();
    expect(screen.queryByText('Leah sees this first.')).toBeNull();
  });

  it('an admin sends on a job another member leads (SQ-751 F1 ruling)', () => {
    mockLeadUserId = 'lead-1';
    mockRole = 'admin';
    openSheet(PO_NEED);
    expect(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' })).toBeInTheDocument();
  });

  it('with no recorded lead, a member who is not the job’s designer never sends (SQ-751 F1)', () => {
    mockLeadUserId = null;
    mockDesignerId = 'designer-2';
    openSheet(PO_NEED);
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull();
    expect(screen.getByRole('button', { name: /^Save the draft for/ })).toBeInTheDocument();
  });

  it('with no recorded lead, the job’s designer sends (SQ-751 F1)', () => {
    mockLeadUserId = null;
    mockDesignerId = 'me';
    openSheet(PO_NEED);
    expect(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' })).toBeInTheDocument();
  });

  it('reads authority in the job’s own studio: owning her own studio is no standing on her employer’s job (SQ-774 R2)', () => {
    // The review input: the job is her employer's, where she is a member and
    // another member now leads it; she owns her personal studio and was the
    // job's original designer.
    mockStudioId = 'employer';
    mockLeadUserId = 'lead-1';
    mockDesignerId = 'me';
    openSheet(PO_NEED);
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull();
    expect(screen.getByText('Leah sees this first.')).toBeInTheDocument();
  });

  it('with no lead, the designer falls back only while she holds a seat in the job’s studio (SQ-774 R2)', () => {
    mockStudioId = 'elsewhere';
    mockLeadUserId = null;
    mockDesignerId = 'me';
    openSheet(PO_NEED);
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull();
  });

  it('a reassignment after the sheet opened holds the draft for the lead and sends nothing (SQ-751 F2)', async () => {
    openSheet(PO_NEED);
    mockRefetchLeads.mockImplementation(async () => {
      mockLeadUserId = 'lead-1';
      return { isError: false, data: mockLeadRead() };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' }));
    await screen.findByText(/^Who leads this project changed, so nothing was sent\. The draft is held for /);
    expect(mockRefetchLeads).toHaveBeenCalledTimes(1);
    expect(mockCompose).toHaveBeenCalledTimes(1);
    expect(mockSendDraft).not.toHaveBeenCalled();
    expect(mockSetNeedState).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^(Send|Save)/ })).toBeNull();
  });

  it('a reassignment while the draft is held is read before the send, and nothing goes (SQ-774 R3)', async () => {
    // The review input: the check passes at the click, the job moves to B
    // while the chase is composed and stored, then the outward send.
    const order: string[] = [];
    mockCompose.mockImplementation(async () => {
      order.push('compose');
      return { id: 'draft-1' };
    });
    mockUpdate.mockImplementation(async () => {
      order.push('update');
      mockLeadUserId = 'lead-1';
      return { id: 'draft-1' };
    });
    mockRefetchLeads.mockImplementation(async () => {
      order.push('recheck');
      return { isError: false, data: mockLeadRead() };
    });
    mockSendDraft.mockImplementation(async () => {
      order.push('send');
    });
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' }));
    await screen.findByText(/^Who leads this project changed, so nothing was sent\. The draft is held for /);
    expect(order).toEqual(['compose', 'update', 'recheck']);
    expect(mockSendDraft).toHaveBeenCalledTimes(0);
    expect(mockSetNeedState).not.toHaveBeenCalled();
  });

  it('a failed lead re-read sends nothing and says so (SQ-751 F2)', async () => {
    mockRefetchLeads.mockResolvedValue({ isError: true, data: undefined });
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' }));
    await screen.findByRole('alert');
    expect(mockSendDraft).not.toHaveBeenCalled();
  });

  it('a job with no project files no need state on its act (SQ-751 F6)', async () => {
    mockStateProjects = new Set();
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' }));
    await waitFor(() => expect(mockSendDraft).toHaveBeenCalledWith('draft-1'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(mockSetNeedState).not.toHaveBeenCalled();
  });

  it('a mark that fails after the send says so instead of staying silent (SQ-751 F6)', async () => {
    mockSetNeedState.mockRejectedValue(new Error('not permitted'));
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' }));
    await screen.findByText('It went. The Day Sheet could not record it, so this line may still show there.');
    expect(mockSendDraft).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Send/ })).toBeNull();
  });

  it('an unread eligibility answer is not "no": the sent act says it was not recorded, never offering a resend (SQ-774 R6)', async () => {
    // The review input: a real studio project whose eligibility read has not answered.
    mockStateProjects = undefined;
    openSheet(PO_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the chase to Fenmoor Joinery' }));
    await screen.findByText('It went. The Day Sheet could not record it, so this line may still show there.');
    expect(mockSendDraft).toHaveBeenCalledTimes(1);
    expect(mockSetNeedState).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /^(Send|Save)/ })).toBeNull();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('silencePoId', () => {
  const line = (id: string, poId: string, sent = true) => ({
    id,
    removed_at: null,
    purchase_order: { id: poId, sent_at: sent ? '2026-09-28T15:00:00Z' : null, acknowledged_at: null, status: 'sent' },
  });

  it('reads a per-PO silence off its line', () => {
    expect(silencePoId({ lineId: 'b' }, [line('a', 'po-1'), line('b', 'po-2')])).toBe('po-2');
  });

  it('names the aggregate only when one unanswered order stands', () => {
    expect(silencePoId({}, [line('a', 'po-1'), line('b', 'po-1')])).toBe('po-1');
    expect(silencePoId({}, [line('a', 'po-1'), line('b', 'po-2')])).toBeNull();
    expect(silencePoId({}, [line('a', 'po-1', false)])).toBeNull();
  });
});

describe('Remind this invoice', () => {
  it('opens prefilled with the client and the invoice', () => {
    openSheet(INVOICE_NEED);
    expect(opened).toBe(true);
    expect(screen.getByText('Send an invoice reminder')).toBeInTheDocument();
    expect(screen.getByText('Mara Olsen')).toBeInTheDocument();
    expect(screen.getByText(/Invoice 0031 · \$9,200/)).toBeInTheDocument();
    expect(textbox('A note with the reminder').value).toMatch(/^Mara,/);
    expect(mockSendInvoice).not.toHaveBeenCalled();
  });

  it('sends the reminder and the chase stamp from its named control, then marks acted', async () => {
    openSheet(INVOICE_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the reminder to Mara Olsen' }));
    await waitFor(() => expect(mockSetNeedState).toHaveBeenCalled());
    expect(mockSendInvoice).toHaveBeenCalledWith({
      invoiceId: 'inv-1',
      projectId: 'proj-1',
      type: 'reminder',
      message: expect.stringMatching(/^Mara,/),
    });
    expect(mockChase).toHaveBeenCalledWith({ invoiceId: 'inv-1', projectId: 'proj-1' });
    expect(mockSetNeedState).toHaveBeenCalledWith(
      expect.objectContaining({ needKey: 'overdue_invoice:inv-1', action: 'acted', waitingOn: 'Mara Olsen' }),
    );
  });

  it('a non-lead reads it only: no send control, no save control', () => {
    mockLeadUserId = 'lead-1';
    openSheet(INVOICE_NEED);
    noSendOrSave();
    expect(screen.getByText('Leah sees this first.')).toBeInTheDocument();
    expect(textbox('A note with the reminder')).toHaveAttribute('readonly');
    expect(mockSendInvoice).toHaveBeenCalledTimes(0);
    expect(mockChase).toHaveBeenCalledTimes(0);
  });

  it('reads the lead again just before the reminder goes; a reassignment sends nothing (SQ-751 F2)', async () => {
    openSheet(INVOICE_NEED);
    mockRefetchLeads.mockImplementation(async () => {
      mockLeadUserId = 'lead-1';
      return { isError: false, data: mockLeadRead() };
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send the reminder to Mara Olsen' }));
    await screen.findByText('Who leads this project changed since this opened, so nothing was sent.');
    expect(mockRefetchLeads).toHaveBeenCalledTimes(1);
    expect(mockSendInvoice).not.toHaveBeenCalled();
    expect(mockChase).not.toHaveBeenCalled();
    expect(mockSetNeedState).not.toHaveBeenCalled();
  });
});

describe('Follow up this proposal', () => {
  it('opens prefilled and quotes the decline reason', () => {
    openSheet(PROPOSAL_NEED);
    expect(opened).toBe(true);
    expect(screen.getByText('Follow up on this proposal')).toBeInTheDocument();
    expect(screen.getByText('Mara Olsen declined the proposal: “The sofa is over budget”')).toBeInTheDocument();
    expect(textbox('Note').value).toMatch(/^Mara,/);
    expect(mockSendNote).not.toHaveBeenCalled();
  });

  it('sends through the composer path from its named control, then marks acted', async () => {
    openSheet(PROPOSAL_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Send the follow-up to Mara Olsen' }));
    await waitFor(() => expect(mockSetNeedState).toHaveBeenCalled());
    expect(mockSendNote).toHaveBeenCalledWith(expect.stringMatching(/^Mara,/));
    expect(mockSetNeedState).toHaveBeenCalledWith(
      expect.objectContaining({ needKey: 'proposal_declined:prop-1', action: 'acted', waitingOn: 'Mara Olsen' }),
    );
  });

  it('a non-lead reads it only: no send control, no save control', () => {
    mockLeadUserId = 'lead-1';
    openSheet({ ...PROPOSAL_NEED });
    // The proposal has no project, so the job's lead is read on the need's own project.
    noSendOrSave();
    expect(screen.getByText('Leah sees this first.')).toBeInTheDocument();
    expect(mockSendNote).toHaveBeenCalledTimes(0);
  });
});

describe("Approve this order's release", () => {
  it('opens on the held order with a separate named release control', () => {
    openSheet(RELEASE_NEED);
    expect(opened).toBe(true);
    expect(screen.getByText("Approve this order's release")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve release' })).toBeInTheDocument();
    expect(screen.getByText('Vendor:')).toBeInTheDocument();
    expect(screen.getByText('Fenmoor Joinery')).toBeInTheDocument();
    expect(screen.getByText("Release Ana's order to Fenmoor Joinery · $4,800")).toBeInTheDocument();
    expect(mockRelease).not.toHaveBeenCalled();
  });

  it('labels the in-flight release as approval, not a send', () => {
    mockRelease.mockReturnValue(new Promise(() => {}));
    openSheet(RELEASE_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Approve release' }));
    expect(screen.getByText('Approving…')).toBeInTheDocument();
  });

  it('releases through the release hook, then marks acted', async () => {
    openSheet(RELEASE_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Approve release' }));
    await waitFor(() => expect(mockSetNeedState).toHaveBeenCalled());
    expect(mockRelease).toHaveBeenCalledWith('po-1');
    expect(mockSetNeedState).toHaveBeenCalledWith(
      expect.objectContaining({ needKey: 'po_unsent:po-1', action: 'acted', waitingOn: 'Fenmoor Joinery' }),
    );
  });

  it('says the release only readies the order to send, and stays open on that line (SQ-764 F22)', async () => {
    openSheet(RELEASE_NEED);
    fireEvent.click(screen.getByRole('button', { name: 'Approve release' }));
    expect(
      await screen.findByText(
        'Release approved. The order is ready to send to Fenmoor Joinery from its purchase order.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('button', { name: 'Approve release' })).toBeNull();
  });
});
