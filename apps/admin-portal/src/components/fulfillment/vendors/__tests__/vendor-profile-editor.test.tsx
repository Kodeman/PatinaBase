import { render, screen, fireEvent } from '@testing-library/react';
import { VendorProfileEditor } from '@/components/fulfillment/vendors/vendor-profile-editor';
import type { VendorProfileDTO } from '@patina/fulfillment';

// Vendor Directory profile-editor form state (S4, spec §7/R1.6). The
// form-state <-> RPC-patch mapping itself is exhaustively unit-tested in
// packages/fulfillment/src/__tests__/vendor-form.test.ts; this suite proves
// the COMPONENT renders the right conditional fields per transmission type
// and wires Save to the real patch builder. (Radix Select's dropdown
// interaction isn't exercised here — jsdom needs extra polyfills for
// pointer-capture that this suite doesn't carry; the conditional-field
// behavior is driven by the `profile` fixture's transmissionType instead,
// which is equally load-bearing.)

const CSV_VENDOR: VendorProfileDTO = {
  vendorId: 'v-1',
  vendorName: 'Blu Dot',
  transmissionType: 'csv',
  contacts: [],
  poEmail: null,
  portalUrl: null,
  csvColumnSpec: { columns: ['sku', 'qty', 'ship_to', 'side_mark'] },
  paymentTerms: 'net_30',
  depositPct: null,
  leadTimeDays: 10,
  changeWindowDays: 3,
  blindShip: false,
  claimsWindowDays: 30,
  inspectionWindowDays: { parcel: 5 },
  freightArrangement: 'vendor_arranged',
  commissionRate: 0.15,
};

const EMAIL_VENDOR: VendorProfileDTO = {
  ...CSV_VENDOR,
  vendorId: 'v-2',
  vendorName: 'Room & Board',
  transmissionType: 'email',
  poEmail: 'trade@roomandboard.example',
  csvColumnSpec: null,
  blindShip: true,
};

describe('VendorProfileEditor', () => {
  it('csv vendor shows the CSV column field, not PO email or portal URL', () => {
    render(<VendorProfileEditor vendorId="v-1" vendorName="Blu Dot" profile={CSV_VENDOR} onSave={jest.fn()} saving={false} />);
    expect(screen.getByTestId('vendor-csv-columns')).toHaveValue('sku, qty, ship_to, side_mark');
    expect(screen.queryByTestId('vendor-po-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('vendor-portal-url')).not.toBeInTheDocument();
  });

  it('email vendor shows the PO email field, not the CSV field', () => {
    render(<VendorProfileEditor vendorId="v-2" vendorName="Room & Board" profile={EMAIL_VENDOR} onSave={jest.fn()} saving={false} />);
    expect(screen.getByTestId('vendor-po-email')).toHaveValue('trade@roomandboard.example');
    expect(screen.queryByTestId('vendor-csv-columns')).not.toBeInTheDocument();
  });

  it('blind ship switch reflects the profile and toggles', () => {
    render(<VendorProfileEditor vendorId="v-2" vendorName="Room & Board" profile={EMAIL_VENDOR} onSave={jest.fn()} saving={false} />);
    const toggle = screen.getByTestId('vendor-blind-ship');
    expect(toggle).toHaveAttribute('data-state', 'checked');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('editing a numeric field and saving produces the real patch shape (commission % -> fraction)', () => {
    const onSave = jest.fn();
    render(<VendorProfileEditor vendorId="v-1" vendorName="Blu Dot" profile={CSV_VENDOR} onSave={onSave} saving={false} />);

    fireEvent.change(screen.getByTestId('vendor-commission-rate'), { target: { value: '20' } });
    fireEvent.click(screen.getByTestId('vendor-profile-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const patch = onSave.mock.calls[0][0];
    expect(patch.commission_rate).toBe(0.2);
    expect(patch.transmission_type).toBe('csv');
    expect(patch.csv_column_spec).toEqual({ columns: ['sku', 'qty', 'ship_to', 'side_mark'] });
  });

  it('a null profile (new vendor) starts from the empty form', () => {
    render(<VendorProfileEditor vendorId="v-3" vendorName="New Vendor" profile={null} onSave={jest.fn()} saving={false} />);
    expect(screen.getByTestId('vendor-po-email')).toHaveValue(''); // default transmissionType is 'email'
  });

  it('disables Save while saving', () => {
    render(<VendorProfileEditor vendorId="v-1" vendorName="Blu Dot" profile={CSV_VENDOR} onSave={jest.fn()} saving />);
    expect(screen.getByTestId('vendor-profile-save')).toBeDisabled();
  });
});
