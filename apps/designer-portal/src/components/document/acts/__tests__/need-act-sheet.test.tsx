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
let mockLeadUserId = 'me';
let mockHandoffNote: string | null = null;
let mockRole = 'member';
let mockInvoiceLoaded = true;

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
  useOrganizations: () => ({ data: [{ id: 'org-1', type: 'design_studio' }] }),
  useOrganizationMembers: () => ({
    isSuccess: true,
    data: [
      { user_id: 'me', role: mockRole, handoff_note: mockHandoffNote, invited_by: 'owner-1', profiles: { full_name: 'Ana Ruiz' } },
      { user_id: 'owner-1', role: 'owner', handoff_note: null, invited_by: null, profiles: { full_name: 'Leah Moreau' } },
    ],
  }),
  useProjectLeads: () => ({
    isSuccess: true,
    data: new Map([['proj-1', { leadUserId: mockLeadUserId, leadName: 'Leah Moreau', assignedAt: '2026-10-01T00:00:00Z' }]]),
  }),
  useSetNeedState: () => ({ mutateAsync: mockSetNeedState }),
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
