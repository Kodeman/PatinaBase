/**
 * C-21 (D1-10) — change orders over start_purchase_order_change: the
 * consequence sentence per kind and PO state, the R8 gate on price-bearing
 * kinds, and the request the sheet sends.
 */

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const startMutateAsync = jest.fn();

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('@patina/supabase', () => ({
  useStartPurchaseOrderChange: () => ({ mutateAsync: startMutateAsync, isPending: false }),
  useFindOrCreateVendor: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useVendors: (filters?: { search?: string }) => ({
    data: filters?.search
      ? {
          data: [
            { id: 'vendor-1', name: 'Hale Upholstery Works' },
            { id: 'vendor-2', name: 'Hollowell Woodshop' },
          ],
        }
      : { data: [] },
  }),
}));

import {
  ChangeOrderAct,
  changeConfirmation,
  changeConsequence,
  changeGate,
  poRebuildable,
} from '../change-order';
import type { LineAuthorization } from '@/lib/document/authorization-derivation';

const unsent = { id: 'po-1', status: 'draft', vendor_id: 'vendor-1', sent_at: null, acknowledged_at: null, payments: [] };
const sent = { ...unsent, status: 'confirmed', sent_at: '2026-10-02T12:00:00Z', acknowledged_at: '2026-10-04T12:00:00Z' };
const authorized: LineAuthorization = {
  track: 'authorized',
  number: 3,
  signedLineTotalCents: 648000,
  depositClear: true,
  deltaCents: null,
};

describe('poRebuildable — the client mirror of the 00449 rule', () => {
  it('is true only for an unsent, unacknowledged, unpaid draft', () => {
    expect(poRebuildable(unsent)).toBe(true);
    expect(poRebuildable(sent)).toBe(false);
    expect(poRebuildable({ ...unsent, status: 'confirmed' })).toBe(false);
    expect(poRebuildable({ ...unsent, payments: [{ state: 'paid' }] })).toBe(false);
  });
});

describe('changeConsequence — one sentence per kind', () => {
  it('says an unsent PO will be cancelled or rebuilt', () => {
    expect(changeConsequence('cancellation', unsent, 'Hale')).toBe(
      'The PO is unsent and unpaid, so it will be cancelled and its lines go back to ready to order.',
    );
    expect(changeConsequence('vendor_change', unsent, 'Hale')).toBe(
      'The PO is unsent and unpaid, so it will be rebuilt for the new maker and priced again before it goes out.',
    );
  });

  it('says a sent PO stands and the change is a record to send the maker', () => {
    expect(changeConsequence('cancellation', sent, 'Hale')).toBe(
      'This PO was sent, so it stands as it is. The change is kept on its record — tell Hale in writing.',
    );
    expect(changeConsequence('vendor_change', { ...unsent, payments: [{ state: 'paid' }] }, 'Hale')).toBe(
      'This PO has a payment recorded, so it stands as it is. The change is kept on its record — tell Hale in writing.',
    );
  });

  it.each([
    ['credit', 'credit'],
    ['claim', 'claim'],
    ['remedy', 'remedy'],
  ] as const)('keeps a %s on the record without touching the PO', (kind, noun) => {
    expect(changeConsequence(kind, unsent, 'Hale')).toBe(
      `The PO stays as it is. The ${noun} is kept on its record.`,
    );
    expect(changeConsequence(kind, sent, 'Hale')).toBe(
      `The PO stays as it is. The ${noun} is kept on its record — tell Hale in writing.`,
    );
  });
});

describe('changeGate — R8', () => {
  it('never holds cancel, claim or remedy', () => {
    for (const kind of ['cancellation', 'claim', 'remedy'] as const) {
      expect(changeGate(kind, authorized)).toEqual({ held: false });
      expect(changeGate(kind, { track: 'awaiting', number: 3 })).toEqual({ held: false });
    }
  });

  it('holds a price-bearing change on a signed authorization for the client yes', () => {
    for (const kind of ['credit', 'vendor_change'] as const) {
      const gate = changeGate(kind, authorized);
      expect(gate.held).toBe(true);
      expect(gate.held && gate.reason).toMatch(/^This needs the client's yes\./);
      expect(gate.held && gate.reason).toMatch(/authorization № 3/);
    }
  });

  it('sends a price-bearing change on a sent authorization to void & supersede', () => {
    const gate = changeGate('credit', { track: 'awaiting', number: 4 });
    expect(gate).toEqual({
      held: true,
      reason: 'This line is on authorization № 4, which is with the client. Void & supersede it to change the price.',
    });
  });

  it('lets a price-bearing change through when no authorization holds the line', () => {
    expect(changeGate('credit', { track: 'none' })).toEqual({ held: false });
    expect(changeGate('vendor_change', { track: 'draft', number: 2 })).toEqual({ held: false });
  });
});

describe('changeConfirmation — reads the RPC answer', () => {
  it('confirms a rebuild only when the server rebuilt', () => {
    expect(changeConfirmation('cancellation', { rebuildable: true })).toBe(
      'Cancelled. Its lines are back to ready to order.',
    );
    expect(changeConfirmation('vendor_change', { rebuildable: true }, 'Hollowell')).toBe(
      'Rebuilt for Hollowell. Price the new PO before it goes out.',
    );
    expect(changeConfirmation('cancellation', { rebuildable: false })).toBe(
      'Kept on the PO’s change history.',
    );
    expect(changeConfirmation('credit', { rebuildable: true })).toBe(
      'Kept on the PO’s change history.',
    );
  });
});

describe('ChangeOrderAct — the sheet', () => {
  beforeEach(() => {
    startMutateAsync.mockReset();
    startMutateAsync.mockResolvedValue({ rebuildable: false });
  });

  const renderAct = (po = sent, auth: LineAuthorization = { track: 'none' }) =>
    render(
      <ChangeOrderAct
        item={{ id: 'line-1' }}
        po={po}
        projectId="project-1"
        auth={auth}
        vendorName="Hale"
        poLabel="PO-1042"
      />,
    );

  const openSheet = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Change this order…' }));
    return screen.getByTestId('po-change-sheet');
  };

  it('records a claim with the line, the kind and the reason', async () => {
    renderAct();
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole('radio', { name: /Claim/ }));
    expect(within(sheet).getByTestId('po-change-consequence')).toHaveTextContent(
      'The PO stays as it is. The claim is kept on its record — tell Hale in writing.',
    );
    const record = within(sheet).getByRole('button', { name: 'Record the change' });
    expect(record).toBeDisabled();

    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Arm scuffed in transit' },
    });
    fireEvent.click(record);

    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledTimes(1));
    expect(startMutateAsync).toHaveBeenCalledWith({
      purchaseOrderId: 'po-1',
      projectId: 'project-1',
      changeKind: 'claim',
      reason: 'Arm scuffed in transit',
      selectionId: 'line-1',
      replacementVendorId: null,
    });
    expect(await within(sheet).findByRole('status')).toHaveTextContent(
      'Kept on the PO’s change history.',
    );
  });

  it('needs a different maker before a vendor change can be recorded', async () => {
    startMutateAsync.mockResolvedValue({ rebuildable: true });
    renderAct(unsent);
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole('radio', { name: /Change the maker/ }));
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Hale discontinued the frame' },
    });
    const record = within(sheet).getByRole('button', { name: 'Record the change' });
    expect(record).toBeDisabled();

    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Maker' }), {
      target: { value: 'H' },
    });
    fireEvent.click(within(sheet).getByRole('option', { name: 'Hale Upholstery Works' }));
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(
      /already makes this order/,
    );

    fireEvent.change(within(sheet).getByRole('combobox', { name: 'Maker' }), {
      target: { value: 'H' },
    });
    fireEvent.click(within(sheet).getByRole('option', { name: 'Hollowell Woodshop' }));
    await waitFor(() => expect(record).toBeEnabled());
    fireEvent.click(record);

    await waitFor(() => expect(startMutateAsync).toHaveBeenCalledTimes(1));
    expect(startMutateAsync.mock.calls[0][0]).toMatchObject({
      changeKind: 'vendor_change',
      replacementVendorId: 'vendor-2',
    });
    expect(await within(sheet).findByRole('status')).toHaveTextContent(
      'Rebuilt for Hollowell Woodshop. Price the new PO before it goes out.',
    );
  });

  it('holds a credit on a signed line and says it needs the client yes (R8)', () => {
    renderAct(sent, authorized);
    const sheet = openSheet();

    fireEvent.click(within(sheet).getByRole('radio', { name: /Credit/ }));
    fireEvent.change(within(sheet).getByLabelText('Reason'), {
      target: { value: 'Maker credit for the late ship' },
    });

    const held = within(sheet).getByTestId('po-change-held');
    expect(held).toHaveTextContent(/^This needs the client's yes\./);
    const record = within(sheet).getByRole('button', { name: 'Record the change' });
    expect(record).toHaveAttribute('aria-disabled', 'true');
    expect(record).toHaveAttribute('aria-describedby', held.id);
    fireEvent.click(record);
    expect(startMutateAsync).not.toHaveBeenCalled();

    // A cancel on the same signed line is not price-bearing and goes through.
    fireEvent.click(within(sheet).getByRole('radio', { name: /Cancel/ }));
    expect(within(sheet).queryByTestId('po-change-held')).not.toBeInTheDocument();
    expect(record).toBeEnabled();
  });
});
