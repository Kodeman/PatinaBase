import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateReceivingInspectionInput, CreateReceivingInspectionResult } from '../use-procurement';

const client = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock('../../client', () => ({ createBrowserClient: () => client }));
vi.mock('@tanstack/react-query', () => ({
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
import { useCreateReceivingInspection } from '../use-procurement';

const run = (input: CreateReceivingInspectionInput) =>
  (useCreateReceivingInspection() as unknown as {
    mutationFn: (input: CreateReceivingInspectionInput) => Promise<CreateReceivingInspectionResult>;
  }).mutationFn(input);
const items = [{ ffeItemId: 'item-1', receivedQuantity: 1, orderedQuantity: 1 }];

beforeEach(() => {
  client.rpc.mockReset();
  client.from.mockReset();
  const table = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  client.from.mockReturnValue(table);
});

describe('receipt linkage follow-up boundary', () => {
  it('forwards pending source facts and never drafts a claim for an uninspected arrival', async () => {
    client.rpc.mockResolvedValue({ data: {
      inspectionId: 'pending-1', outcome: null, inspectionPending: true,
      inspectionOwnerUserId: 'member-1', poShipmentId: 'shipment-1',
      reportedBy: 'receiver_report', reportSource: 'Receiver report',
      receivedOn: '2026-10-20', locationId: 'location-1', arrivalMethod: 'delivered',
    }, error: null });
    const result = await run({ purchaseOrderId: 'po-1', items, outcome: null,
      inspectionPending: true, inspectionOwnerUserId: 'member-1', poShipmentId: 'shipment-1',
      reportedBy: 'receiver_report', reportSource: 'Receiver report',
      receivedOn: '2026-10-20', locationId: 'location-1', arrivalMethod: 'delivered', receiptKey: 'key-1',
    });
    expect(client.rpc).toHaveBeenCalledWith('record_project_ffe_receipt_batch', expect.objectContaining({
      p_po_shipment_id: 'shipment-1', p_studio_purchase_id: null, p_inspection_pending: true,
      p_inspection_owner_user_id: 'member-1', p_reported_by: 'receiver_report',
      p_report_source: 'Receiver report', p_received_on: '2026-10-20',
      p_location_id: 'location-1', p_arrival_method: 'delivered', p_receipt_key: 'key-1',
    }));
    expect(result.inspection).toMatchObject({ outcome: null, inspection_pending: true, inspection_owner_user_id: 'member-1' });
    expect(result.damageClaimCreated).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('uses the stored clean outcome on keyed replay rather than drafting from revised damage input', async () => {
    client.rpc.mockResolvedValue({ data: { inspectionId: 'original-1', outcome: 'clean', reused: true }, error: null });
    const result = await run({ purchaseOrderId: 'po-1', items, outcome: 'damaged', receiptKey: 'key-1' });
    expect(result.inspection.outcome).toBe('clean');
    expect(result.damageClaimCreated).toBe(false);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('records purchase damage and exposes the PO-only claim skip instead of inserting damage_claims', async () => {
    client.rpc.mockResolvedValue({ data: {
      inspectionId: 'purchase-1', outcome: 'damaged', studioPurchaseId: 'buy-1',
      arrivalMethod: 'picked_up', claim_draft_skipped: 'no_purchase_order',
    }, error: null });
    const result = await run({ purchaseOrderId: null, studioPurchaseId: 'buy-1',
      items, outcome: 'damaged', arrivalMethod: 'picked_up', receiptKey: 'key-buy',
    });
    expect(client.rpc).toHaveBeenCalledWith('record_project_ffe_receipt_batch', expect.objectContaining({
      p_purchase_order_id: null, p_studio_purchase_id: 'buy-1', p_arrival_method: 'picked_up',
    }));
    expect(result).toMatchObject({ claimDraftSkipped: 'no_purchase_order', damageClaimCreated: false,
      inspection: { purchase_order_id: null, studio_purchase_id: 'buy-1', outcome: 'damaged' },
    });
    expect(client.from).not.toHaveBeenCalled();
  });
});
