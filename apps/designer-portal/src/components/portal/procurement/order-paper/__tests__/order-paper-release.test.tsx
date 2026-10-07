/**
 * C-32 held for release on the order paper (SQ-430): the terminal becomes
 * "Hold for release · $X" for a seat the studio's gate applies to, with
 * "Leah or an admin releases it before it goes to Hewn." An owner/admin seat
 * releases (00710) and then sends through po-send; on a held paper she can
 * send it back with a note. Anyone else reading a held paper gets no act.
 */

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockCreate = jest.fn();
const mockSetHeader = jest.fn();
const mockSend = jest.fn();
const mockSetShipTo = jest.fn();
const mockHold = jest.fn();
const mockRelease = jest.fn();
const mockSendBack = jest.fn();
const mockGate: { data: Record<string, unknown> | null } = { data: null };
const mockServerState: { data: Record<string, unknown> | undefined } = { data: undefined };
const mockPreviewState: { data: Record<string, unknown> | undefined } = { data: undefined };
const mockPreviewArgs: Array<[string | null, string, number]> = [];
const mockCanRelease: { data: boolean } = { data: false };

jest.mock('@patina/supabase', () => ({
  useVendorQuotes: () => ({ data: [] }),
  useCreatePurchaseOrder: () => ({ mutateAsync: mockCreate, isPending: false }),
  useSetPurchaseOrderHeader: () => ({ mutateAsync: mockSetHeader, isPending: false }),
  useSendPurchaseOrder: () => ({ mutateAsync: mockSend, isPending: false }),
  useStartPoCheckout: () => ({ mutateAsync: jest.fn(), isPending: false }),
  fetchPOPayments: jest.fn(),
  useFfeInvoiceCoverage: () => ({
    data: { 'line-sofa': { coverage: 'paid' } },
    isLoading: false,
    isError: false,
  }),
  useProcurementItems: () => ({ data: [] }),
  useStudioIdentity: (params: { projectId?: string }) => ({
    data: params.projectId ? { studioId: 'org-studio', name: 'Middle West Studio' } : undefined,
  }),
  useStudioVendorAccount: () => ({ data: null }),
  useOrganizations: () => ({ data: [] }),
  useProject: () => ({ data: { studio_id: 'org-studio', site_address: '418 Lakeview Dr' } }),
  useStudioLocations: () => ({ data: [] }),
  useSetPurchaseOrderShipTo: () => ({ mutateAsync: mockSetShipTo, isPending: false }),
  useSetPurchaseOrderShipToLocation: () => ({ mutateAsync: jest.fn(), isPending: false }),
  // C-32 (00710): the gate, the server's answer, the seat and the three acts.
  useStudioReleaseGate: (studioId: string | null) => ({
    data: studioId === 'org-studio' ? mockGate.data : undefined,
  }),
  usePoReleaseState: (poId: string | null) => ({
    data: poId ? mockServerState.data : undefined,
  }),
  usePoReleasePreview: (projectId: string | null, vendorId: string, totalCents: number) => {
    mockPreviewArgs.push([projectId, vendorId, totalCents]);
    return { data: projectId ? mockPreviewState.data : undefined };
  },
  useIsStudioReleaser: () => ({ data: mockCanRelease.data }),
  useOrganizationMembers: () => ({
    data: [
      { user_id: 'user-leah', role: 'owner', status: 'active', profiles: { full_name: 'Leah Strand' } },
      { user_id: 'user-maya', role: 'member', status: 'active', profiles: { full_name: 'Maya Okafor' } },
    ],
  }),
  useHoldPurchaseOrderForRelease: () => ({ mutateAsync: mockHold, isPending: false }),
  useReleasePurchaseOrder: () => ({ mutateAsync: mockRelease, isPending: false }),
  useSendBackPurchaseOrder: () => ({ mutateAsync: mockSendBack, isPending: false }),
}));

jest.mock('../riders', () => ({ PoRiders: () => null }));
jest.mock('../com-slot', () => ({
  useComPaper: () => ({
    isFabricPaper: false,
    workroomName: null,
    facts: new Map(),
    orderLocations: <T,>(locations: T[]) => locations,
    linkSupplies: async () => undefined,
  }),
  ComLineNote: () => null,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
jest.mock('@/components/document/overlays/doc-sheet', () => ({
  DocSheet: ({ title, children }: { title: string; children: ReactNode }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}));
jest.mock('@/components/document/po-preview', () => ({ PoPreview: () => null }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/lib/analytics/procurement-events', () => ({
  procurementEvents: {
    coverageGateShown: jest.fn(),
    coverageOverridden: jest.fn(),
    orderBlocked: jest.fn(),
    poCreated: jest.fn(),
    poSent: jest.fn(),
  },
}));

import { OrderPaper, SENT_NOT_RECORDED_MESSAGE, type OrderPaperPurchaseOrder } from '..';
import { procurementEvents } from '@/lib/analytics/procurement-events';
import { releaseConsequence, releaseErrorMessage, releaseModeFor } from '../release-slot';

const HEWN = { id: 'vendor-hewn', name: 'Hewn', default_payment_terms: null, orders_email: 'orders@hewn.example' };
const PROJECT = { id: 'project-1', name: 'Kochaver house' };
const SOFA = { id: 'line-sofa', name: 'Sofa', line_total_cents: 1_500_000, trade_price_cents: 1_248_000, quantity: 1 };

const HELD_PO: OrderPaperPurchaseOrder = {
  id: 'po-9',
  project_id: 'project-1',
  vendor_id: 'vendor-hewn',
  total_cents: 1_248_000,
  status: 'held_for_release',
  sent_at: null,
  po_number: 'PO-1044',
  payment_pattern: 'fifty_fifty',
  is_patina_catalog: false,
  ship_to: 'Dock 4, Racine',
  sidemark: 'MWS-KOCH-LR',
  held_at: '2026-10-05T15:00:00Z',
  held_by: 'user-maya',
  hold_note: 'Leah — the walnut one.',
};

const renderPaper = (props: Partial<Parameters<typeof OrderPaper>[0]> = {}) =>
  render(<OrderPaper open onClose={jest.fn()} vendor={HEWN} project={PROJECT} ffeItems={[SOFA]} {...props} />);

const chooseSite = () =>
  fireEvent.click(
    within(screen.getByRole('group', { name: 'Ship to' })).getByRole('radio', { name: /The job site/ }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockGate.data = { release_threshold_cents: 1_000_000, require_release_per_order: false };
  mockServerState.data = undefined;
  mockPreviewState.data = undefined;
  mockPreviewArgs.length = 0;
  mockCanRelease.data = false;
  mockCreate.mockResolvedValue({ id: 'po-1', total_cents: 1_248_000 });
  mockSetHeader.mockResolvedValue({ id: 'po-1', project_id: 'project-1' });
  mockSetShipTo.mockResolvedValue({ id: 'po-1' });
  mockSend.mockResolvedValue({ ok: true, recipient: 'orders@hewn.example' });
  mockHold.mockResolvedValue({ id: 'po-1' });
  mockRelease.mockResolvedValue({ id: 'po-1' });
  mockSendBack.mockResolvedValue({ id: 'po-9' });
});

describe('releaseModeFor', () => {
  const base = {
    isPatinaMaker: false,
    sent: false,
    status: null,
    gate: { release_threshold_cents: 1_000_000, require_release_per_order: false },
    totalCents: 1_248_000,
    serverState: undefined,
    canRelease: false,
  };

  it('holds at or over the threshold, and not under it', () => {
    expect(releaseModeFor(base)).toBe('hold');
    expect(releaseModeFor({ ...base, totalCents: 1_000_000 })).toBe('hold');
    expect(releaseModeFor({ ...base, totalCents: 999_999 })).toBe('none');
  });

  it('is off by default, holds every order when the studio asks, and lets a releaser release', () => {
    expect(releaseModeFor({ ...base, gate: null })).toBe('none');
    expect(
      releaseModeFor({
        ...base,
        totalCents: 100,
        gate: { release_threshold_cents: null, require_release_per_order: true },
      }),
    ).toBe('hold');
    expect(releaseModeFor({ ...base, canRelease: true })).toBe('release');
  });

  it("follows the server's answer for an existing PO over the studio's gate", () => {
    expect(
      releaseModeFor({ ...base, serverState: { applies: true, cleared: true } as never }),
    ).toBe('none');
    expect(
      releaseModeFor({
        ...base,
        gate: null,
        serverState: { applies: true, cleared: false } as never,
      }),
    ).toBe('hold');
  });

  it('waits on a held PO for a seat that cannot release; never applies to Patina or a sent PO', () => {
    expect(releaseModeFor({ ...base, status: 'held_for_release' })).toBe('waiting');
    expect(releaseModeFor({ ...base, status: 'held_for_release', canRelease: true })).toBe('release');
    expect(releaseModeFor({ ...base, isPatinaMaker: true })).toBe('none');
    expect(releaseModeFor({ ...base, sent: true })).toBe('none');
  });

  it('says who releases, and reads the held_for_release refusal', () => {
    expect(releaseConsequence('Leah', 'Hewn')).toBe('Leah or an admin releases it before it goes to Hewn.');
    expect(releaseConsequence(null, 'Hewn')).toBe('An owner or admin releases it before it goes to Hewn.');
    expect(releaseErrorMessage('held_for_release')).toMatch(/waits for an owner or admin/);
    expect(releaseErrorMessage('ship_to_required')).toBeNull();
  });
});

describe('a seat the gate applies to', () => {
  it('gets "Hold for release · $X" and the release sentence, with no send', () => {
    renderPaper();
    expect(screen.getByRole('button', { name: 'Hold for release · $12,480' })).toHaveAttribute(
      'data-action-variant',
      'terminal',
    );
    expect(screen.getByText('Leah or an admin releases it before it goes to Hewn.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send to Hewn/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /mark as sent/ })).not.toBeInTheDocument();
  });

  it('keeps the ordinary send under the threshold', () => {
    mockGate.data = { release_threshold_cents: 2_000_000, require_release_per_order: false };
    renderPaper();
    expect(screen.getByRole('button', { name: 'Send to Hewn · $12,480' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hold for release/ })).not.toBeInTheDocument();
  });

  it('holds the PO and never calls po-send', async () => {
    renderPaper();
    chooseSite();
    fireEvent.click(screen.getByRole('button', { name: 'Hold for release · $12,480' }));
    await waitFor(() => expect(mockHold).toHaveBeenCalledWith({ purchaseOrderId: 'po-1' }));
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/^Held for release · .*\. Leah or an admin releases it before it goes to Hewn\.$/),
    ).toBeInTheDocument();
  });

  it('reads a held paper with its record and no act', () => {
    renderPaper({ purchaseOrder: HELD_PO });
    expect(screen.getByText(/^Held for release · .* · Maya — “Leah — the walnut one\.”$/)).toBeInTheDocument();
    expect(screen.getByText('Leah or an admin releases it before it goes to Hewn.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Hold for release|Release to|Send to Hewn/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send back/ })).not.toBeInTheDocument();
  });
});

describe("the server's reason on an existing paper (00719)", () => {
  const DRAFT_PO: OrderPaperPurchaseOrder = {
    ...HELD_PO,
    id: 'po-7',
    status: 'draft',
    held_at: null,
    held_by: null,
    hold_note: null,
  };
  const state = (over: Record<string, unknown>) => ({
    applies: true,
    released: true,
    cleared: false,
    reason: null,
    group_total_cents: 1_248_000,
    threshold_cents: 1_000_000,
    ...over,
  });

  it.each([
    ['changed', 'Changed since release — needs release again'],
    ['total_rose', 'The total rose after release — needs release again'],
  ])('says a %s paper needs release again, and holds it', (reason, sentence) => {
    mockServerState.data = state({ reason });
    renderPaper({ purchaseOrder: DRAFT_PO });
    expect(screen.getByText(sentence)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hold for release · $12,480' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send to Hewn/ })).not.toBeInTheDocument();
  });

  it("names the group total and the studio's line when the job's other orders carry it over", () => {
    mockServerState.data = state({ released: false, reason: 'group_over', group_total_cents: 1_848_000 });
    renderPaper({ purchaseOrder: { ...DRAFT_PO, total_cents: 600_000 } });
    expect(
      screen.getByText(
        "With your other open orders to Hewn on this job, this comes to $18,480 — over the studio's release line ($10,000).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hold for release · $6,000' })).toBeInTheDocument();
  });

  it('says nothing while the release still covers the paper', () => {
    mockServerState.data = state({ cleared: true });
    renderPaper({ purchaseOrder: DRAFT_PO });
    expect(screen.queryByText(/needs release again|release line/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Hewn · $12,480' })).toBeInTheDocument();
  });
});

describe('the group on a new paper (00726)', () => {
  it("holds a new paper the job's other orders carry over the line, and says so before save", () => {
    // Under the line on its own: the studio's gate alone would send it.
    mockGate.data = { release_threshold_cents: 2_000_000, require_release_per_order: false };
    mockPreviewState.data = {
      applies: true,
      released: false,
      cleared: false,
      reason: 'group_over',
      group_total_cents: 2_448_000,
      threshold_cents: 2_000_000,
    };
    renderPaper();
    expect(mockPreviewArgs).toContainEqual(['project-1', 'vendor-hewn', 1_248_000]);
    expect(
      screen.getByText(
        "With your other open orders to Hewn on this job, this comes to $24,480 — over the studio's release line ($20,000).",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hold for release · $12,480' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Send to Hewn/ })).not.toBeInTheDocument();
  });

  it('keeps the send when the group is under the line, and asks no preview once the PO exists', () => {
    mockGate.data = { release_threshold_cents: 2_000_000, require_release_per_order: false };
    mockPreviewState.data = {
      applies: false,
      released: false,
      cleared: true,
      reason: null,
      group_total_cents: 1_248_000,
      threshold_cents: 2_000_000,
    };
    renderPaper();
    expect(screen.getByRole('button', { name: 'Send to Hewn · $12,480' })).toBeInTheDocument();
    expect(screen.queryByText(/release line/)).not.toBeInTheDocument();

    mockPreviewArgs.length = 0;
    renderPaper({ purchaseOrder: { ...HELD_PO, id: 'po-7', status: 'draft', held_at: null, held_by: null, hold_note: null } });
    expect(mockPreviewArgs.every(([projectId]) => projectId === null)).toBe(true);
  });
});

describe('an owner or admin seat', () => {
  beforeEach(() => {
    mockCanRelease.data = true;
  });

  it('releases a new paper on record, then sends it', async () => {
    renderPaper();
    chooseSite();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Hewn · $12,480' }));
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockRelease).toHaveBeenCalledWith('po-1');
    expect(mockRelease.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
    expect(mockHold).not.toHaveBeenCalled();
  });

  it('gets "Release to Hewn · $X" on a held paper: release, then po-send', async () => {
    mockRelease.mockResolvedValue({ id: 'po-9' });
    renderPaper({ purchaseOrder: HELD_PO });
    fireEvent.click(screen.getByRole('button', { name: 'Release to Hewn · $12,480' }));
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ purchaseOrderId: 'po-9', mode: 'send' })),
    );
    expect(mockRelease).toHaveBeenCalledWith('po-9');
    expect(mockRelease.mock.invocationCallOrder[0]).toBeLessThan(mockSend.mock.invocationCallOrder[0]);
  });

  it('SQ-448: says the email went but the order is not marked sent when po-send refuses the stamp', async () => {
    mockSend.mockRejectedValue(new Error('sent_not_recorded'));
    renderPaper();
    chooseSite();
    fireEvent.click(screen.getByRole('button', { name: 'Send to Hewn · $12,480' }));
    expect(await screen.findByText(SENT_NOT_RECORDED_MESSAGE)).toBeInTheDocument();
    expect(procurementEvents.poSent).not.toHaveBeenCalled();
    expect(screen.queryByText(/^Sent ·/)).not.toBeInTheDocument();
    expect(screen.queryByText(/waits for an owner or admin to release it before it goes/)).not.toBeInTheDocument();
  });

  it('sends a held paper back only with a note', async () => {
    renderPaper({ purchaseOrder: HELD_PO });
    fireEvent.click(screen.getByRole('button', { name: 'Send back to Maya with a note' }));
    const sendBack = screen.getByRole('button', { name: 'Send back' });
    expect(sendBack).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Note to Maya'), { target: { value: 'Swap to the oak.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send back' }));
    await waitFor(() =>
      expect(mockSendBack).toHaveBeenCalledWith({ purchaseOrderId: 'po-9', note: 'Swap to the oak.' }),
    );
    expect(mockSend).not.toHaveBeenCalled();
    expect(await screen.findByText(/^Sent back · .* · “Swap to the oak\.”$/)).toBeInTheDocument();
  });
});
