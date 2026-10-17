/**
 * SQ-1223 R2/R3: unknown is held. The folio's Send counts a household address
 * only from a settled read: a re-read in flight after an invalidation, or a
 * failed one, holds even with the earlier answer still cached. Issue runs one
 * fresh, uncached read of the recipient first and refuses unless it answers an
 * address. A contact edit that makes an older relationship the newest one
 * re-reads the newest-row selector, and readiness follows it.
 *
 * Runs the real useDesignerClientForClientUser / useClient /
 * useUpdateClientContact against a real QueryClient and an in-memory
 * designer_clients table, so the cached data is genuinely retained.
 */
import { type ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUpdateClientContact, type Invoice } from '@patina/supabase';
import { InvoiceFolio } from '../invoice-folio';

const mockIssue = jest.fn();
const mockSend = jest.fn();

const mockInvoice: Invoice = {
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
  // Her Patina account carries no email, so invoice-send falls to the household.
  client: { id: 'client-1', full_name: 'Elena Reyes', email: '' },
  line_items: [],
  payments: [],
};

jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: () => ({ value: false, isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  useSessionUserId: () => 'designer-1',
  useEmailDelivery: () => ({ byRef: {}, isLoading: false, isError: false }),
  useInvoice: () => ({
    data: mockInvoice,
    isLoading: false,
    isError: false,
    refetch: async () => ({ data: mockInvoice, isError: false }),
  }),
  useIssueInvoice: () => ({ mutateAsync: mockIssue, isPending: false }),
  useSendInvoice: () => ({ mutateAsync: mockSend, isPending: false }),
  useRecordPayment: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVoidInvoice: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useInvoiceLink: () => ({ data: null }),
  useRegenerateInvoiceLink: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useClientInvitationStatus: () => ({ data: null, isLoading: false, isError: false }),
  useInviteAndLinkClient: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

jest.mock(
  '@/hooks/use-invoice-checkout-reconciliation',
  () => ({
    useReconcileInvoiceCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  }),
  { virtual: true },
);

jest.mock('../../people/directory/client-letter-line', () => ({
  ClientLetterLine: () => null,
}));

jest.mock('@/hooks/use-attach-client', () => ({
  useAttachDocumentClient: () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null }),
}));

jest.mock('@/components/portal/client-picker', () => ({
  ClientPicker: () => null,
}));

// ── The designer_clients table, behind the browser client singleton ─────────
type Row = {
  id: string;
  designer_id: string;
  client_id: string;
  lead_id: null;
  client_name: string;
  client_email: string | null;
  client_phone: string | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  client: { id: string; email: string; full_name: string; avatar_url: null; phone: null };
};
const profile = { id: 'client-1', email: '', full_name: 'Elena Reyes', avatar_url: null, phone: null };
const row = (id: string, updatedAt: string, email: string | null): Row => ({
  id,
  designer_id: 'designer-1',
  client_id: 'client-1',
  lead_id: null,
  client_name: 'Elena Reyes',
  client_email: email,
  client_phone: null,
  notes: null,
  status: 'active',
  created_at: '2026-07-01T12:00:00.000Z',
  updated_at: updatedAt,
  client: profile,
});
let rows: Row[] = [];
/** How the next designer_clients read answers: as the table stands, never, or with an error. */
let readMode: 'answer' | 'hang' | 'fail' = 'answer';
let reads = 0;
let clock = 0;
const newestFirst = (a: Row, b: Row) =>
  b.updated_at.localeCompare(a.updated_at) ||
  b.created_at.localeCompare(a.created_at) ||
  b.id.localeCompare(a.id);

function designerClients() {
  const filters: Record<string, unknown> = {};
  let patch: Partial<Row> | null = null;
  const answer = () => {
    if (!patch) {
      reads += 1;
      if (readMode === 'hang') return new Promise<never>(() => {});
      if (readMode === 'fail') {
        return Promise.resolve({ data: null, error: { message: 'designer_clients read failed' } });
      }
    }
    const matches = rows.filter((r) =>
      Object.entries(filters).every(([column, value]) => r[column as keyof Row] === value),
    );
    // The 00014 BEFORE UPDATE trigger: every write moves updated_at to now.
    if (patch) {
      clock += 1;
      const at = `2026-10-17T12:00:${String(clock).padStart(2, '0')}.000Z`;
      matches.forEach((r) => Object.assign(r, patch, { updated_at: at }));
    }
    const [first] = [...matches].sort(newestFirst);
    return Promise.resolve({ data: first ? { ...first } : null, error: null });
  };
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    update: (values: Partial<Row>) => {
      patch = values;
      return builder;
    },
    maybeSingle: answer,
    single: answer,
  };
  return builder;
}

// createBrowserClient() hands back this browser singleton when it is set.
const browser = globalThis as { __supabaseBrowserClient?: unknown };

/** The designer edits an older relationship's notes from elsewhere in the portal. */
function EditHistoricalRow({ id }: { id: string }) {
  const edit = useUpdateClientContact();
  return (
    <button type="button" onClick={() => edit.mutate({ clientId: id, updates: { notes: 'Prefers Tuesdays' } })}>
      Edit the older row
    </button>
  );
}

let qc: QueryClient;
const renderFolio = (extra?: ReactNode) =>
  render(
    <QueryClientProvider client={qc}>
      {/* The folio lays inside PaperFolioSheet's panel: the spotlight's frame. */}
      <div data-spotlight-frame="">
        <InvoiceFolio invoiceId="invoice-1" />
      </div>
      {extra}
    </QueryClientProvider>,
  );
const sendAct = () => screen.getAllByRole('button', { name: 'Issue & send' })[0];
const confirmAct = () => {
  const acts = screen.getAllByRole('button', { name: 'Issue & send' });
  return acts[acts.length - 1];
};
const reasonOf = (el: HTMLElement) => document.getElementById(el.getAttribute('aria-describedby') ?? '');
const spotWindows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-hold-spotlight-window]')).map(
    (el) => el.dataset.holdSpotlightWindow,
  );
const householdKey = (id: string) => ['designer-client', id];

/** The folio has read its recipient and Send stands ready. */
async function readyToSend() {
  await waitFor(() => expect(sendAct()).not.toHaveAttribute('aria-disabled'));
}

beforeEach(() => {
  jest.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  rows = [row('dc-1', '2026-10-01T12:00:00.000Z', 'elena@example.com')];
  readMode = 'answer';
  reads = 0;
  clock = 0;
  browser.__supabaseBrowserClient = { from: () => designerClients() };
  mockIssue.mockResolvedValue({ ...mockInvoice, status: 'sent', invoice_number: 'INV-1' });
  mockSend.mockResolvedValue({ emailSent: true, recipient: 'elena@example.com' });
});
afterEach(() => {
  qc.clear();
  delete browser.__supabaseBrowserClient;
});

describe('SQ-1223 R2: a re-read establishes nothing, even with its answer cached', () => {
  it('holds Send while the household re-reads after an invalidation, the cached address still in hand', async () => {
    renderFolio();
    await readyToSend();

    readMode = 'hang';
    act(() => {
      void qc.invalidateQueries({ queryKey: householdKey('dc-1') });
    });

    await waitFor(() => expect(sendAct()).toHaveAttribute('aria-disabled', 'true'));
    expect(reasonOf(sendAct())).toHaveTextContent("Checking Elena's email before this sends.");
    // The retained answer is still the cached one: this is a refetch, not a first read.
    expect(qc.getQueryData<Row>(householdKey('dc-1'))?.client_email).toBe('elena@example.com');

    fireEvent.click(sendAct());
    await waitFor(() => expect(spotWindows()).toEqual(['send-recipient']));
    expect(mockIssue).not.toHaveBeenCalled();
    // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('holds Send on why after the household re-read fails, the cached address still in hand', async () => {
    renderFolio();
    await readyToSend();

    readMode = 'fail';
    act(() => {
      void qc.invalidateQueries({ queryKey: householdKey('dc-1') });
    });

    await waitFor(() =>
      expect(reasonOf(sendAct())).toHaveTextContent(
        "Elena's email couldn't be checked. Reload the folio to send this.",
      ),
    );
    expect(sendAct()).toHaveAttribute('aria-disabled', 'true');
    expect(qc.getQueryState(householdKey('dc-1'))?.status).toBe('error');
    expect(qc.getQueryData<Row>(householdKey('dc-1'))?.client_email).toBe('elena@example.com');
    expect(mockIssue).not.toHaveBeenCalled();
    // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('holds Send after the newest-relationship re-read fails, its cached row still in hand', async () => {
    renderFolio();
    await readyToSend();

    readMode = 'fail';
    act(() => {
      void qc.invalidateQueries({ queryKey: ['designer-client-for-user'] });
    });

    await waitFor(() =>
      expect(reasonOf(sendAct())).toHaveTextContent(
        "Elena's email couldn't be checked. Reload the folio to send this.",
      ),
    );
    expect(qc.getQueryData<{ id: string }>(['designer-client-for-user', 'client-1', 'designer-1'])?.id).toBe(
      'dc-1',
    );
    expect(mockIssue).not.toHaveBeenCalled();
    // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe('SQ-1223 R2: issue reads the recipient fresh, uncached, first', () => {
  it('refuses to issue when the fresh read finds the cached address gone', async () => {
    renderFolio();
    await readyToSend();
    fireEvent.click(sendAct());
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Issue & send' })).toHaveLength(2));
    expect(confirmAct()).not.toHaveAttribute('aria-disabled');

    // Removed elsewhere; nothing told this folio, so its cache still has it.
    rows[0].client_email = null;
    const before = reads;
    fireEvent.click(confirmAct());

    expect(await screen.findByText("Could not issue — Add Elena's email to send this.")).toBeInTheDocument();
    expect(reads - before).toBe(2);
    expect(mockIssue).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('refuses to issue when the fresh read fails, whatever the cache holds', async () => {
    renderFolio();
    await readyToSend();
    fireEvent.click(sendAct());
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Issue & send' })).toHaveLength(2));

    readMode = 'fail';
    fireEvent.click(confirmAct());

    expect(
      await screen.findByText(
        "Could not issue — Elena's email couldn't be checked. Reload the folio to send this.",
      ),
    ).toBeInTheDocument();
    expect(mockIssue).not.toHaveBeenCalled();
    // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('control: with the address still on file, the fresh read answers and Send issues once', async () => {
    renderFolio();
    await readyToSend();
    fireEvent.click(sendAct());
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Issue & send' })).toHaveLength(2));

    const before = reads;
    fireEvent.click(confirmAct());

    // F2 (SQ-1249): one invoice-send request issues the draft and sends it.
    await waitFor(() => expect(mockSend).toHaveBeenCalledTimes(1));
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ invoiceId: 'invoice-1', issue: true }));
    expect(mockIssue).not.toHaveBeenCalled();
    expect(reads - before).toBe(2);
  });
});

describe('SQ-1223 R3: a history edit that makes an older row the newest re-reads the selector', () => {
  it('B becomes newest on a notes edit, and Send holds on B having no address', async () => {
    rows = [
      row('dc-A', '2026-10-10T12:00:00.000Z', 'elena@example.com'),
      row('dc-B', '2026-09-01T12:00:00.000Z', null),
    ];
    renderFolio(<EditHistoricalRow id="dc-B" />);
    await readyToSend();
    expect(qc.getQueryData<{ id: string }>(['designer-client-for-user', 'client-1', 'designer-1'])?.id).toBe(
      'dc-A',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit the older row' }));

    await waitFor(() =>
      expect(qc.getQueryData<{ id: string }>(['designer-client-for-user', 'client-1', 'designer-1'])?.id).toBe(
        'dc-B',
      ),
    );
    await waitFor(() => expect(sendAct()).toHaveAttribute('aria-disabled', 'true'));
    expect(reasonOf(sendAct())).toHaveTextContent("Add Elena's email to send this.");
    expect(mockIssue).not.toHaveBeenCalled();
    // F2 (SQ-1249): the issue rides invoice-send, so nothing sent is nothing issued.
    expect(mockSend).not.toHaveBeenCalled();
  });
});
