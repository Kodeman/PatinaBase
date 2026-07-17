import { describe, it, expect } from 'vitest';
import {
  buildVendorProfilePatch,
  EMPTY_VENDOR_PROFILE_FORM,
  vendorProfileToFormState,
} from '../vendor-form';
import type { VendorProfileDTO } from '../types';

// Fixture mirrors the seeded Lee Industries profile (supabase/seed/
// fulfillment-vendor-profiles.sql): portal, net_30, no blind ship, commission
// OVERRIDE 0.18.
const LEE_INDUSTRIES: VendorProfileDTO = {
  vendorId: '11111111-1111-1111-1111-111111111103',
  vendorName: 'Lee Industries',
  transmissionType: 'portal',
  contacts: [],
  poEmail: null,
  portalUrl: 'https://portal.leeindustries.example',
  csvColumnSpec: null,
  paymentTerms: 'net_30',
  depositPct: null,
  leadTimeDays: 56,
  changeWindowDays: 7,
  blindShip: false,
  claimsWindowDays: 14,
  inspectionWindowDays: { parcel: 5, ltl: 3 },
  freightArrangement: 'patina_arranged',
  commissionRate: 0.18,
};

describe('vendorProfileToFormState', () => {
  it('null profile -> the empty form (new-vendor case)', () => {
    expect(vendorProfileToFormState(null)).toEqual(EMPTY_VENDOR_PROFILE_FORM);
  });

  it('maps an existing profile field-for-field', () => {
    const form = vendorProfileToFormState(LEE_INDUSTRIES);
    expect(form.transmissionType).toBe('portal');
    expect(form.portalUrl).toBe('https://portal.leeindustries.example');
    expect(form.paymentTerms).toBe('net_30');
    expect(form.leadTimeDays).toBe('56');
    expect(form.changeWindowDays).toBe('7');
    expect(form.blindShip).toBe(false);
    expect(form.claimsWindowDays).toBe('14');
    expect(form.inspectionParcelDays).toBe('5');
    expect(form.inspectionLtlDays).toBe('3');
    expect(form.inspectionWhiteGloveDays).toBe(''); // not set for this vendor
    expect(form.freightArrangement).toBe('patina_arranged');
    expect(form.commissionRatePct).toBe('18');
  });

  it('csv column spec renders as a comma-joined string', () => {
    const form = vendorProfileToFormState({
      ...LEE_INDUSTRIES,
      transmissionType: 'csv',
      csvColumnSpec: { columns: ['sku', 'qty', 'ship_to', 'side_mark'] },
    });
    expect(form.csvColumnsCsv).toBe('sku, qty, ship_to, side_mark');
  });
});

describe('buildVendorProfilePatch', () => {
  it('round-trips the Lee Industries fixture through form-state and back to an equivalent patch', () => {
    const form = vendorProfileToFormState(LEE_INDUSTRIES);
    const patch = buildVendorProfilePatch(form);
    expect(patch).toMatchObject({
      transmission_type: 'portal',
      portal_url: 'https://portal.leeindustries.example',
      po_email: null,
      payment_terms: 'net_30',
      deposit_pct: null,
      lead_time_days: 56,
      change_window_days: 7,
      blind_ship: false,
      claims_window_days: 14,
      inspection_window_days: { parcel: 5, ltl: 3 },
      freight_arrangement: 'patina_arranged',
      commission_rate: 0.18,
    });
  });

  it('csv transmission parses the comma-separated column list, trimming whitespace', () => {
    const patch = buildVendorProfilePatch({
      ...EMPTY_VENDOR_PROFILE_FORM,
      transmissionType: 'csv',
      csvColumnsCsv: ' sku ,qty,  ship_to ',
    });
    expect(patch.csv_column_spec).toEqual({ columns: ['sku', 'qty', 'ship_to'] });
  });

  it('non-csv transmission never carries a csv_column_spec, even if the field has stale text', () => {
    const patch = buildVendorProfilePatch({
      ...EMPTY_VENDOR_PROFILE_FORM,
      transmissionType: 'email',
      csvColumnsCsv: 'sku,qty',
    });
    expect(patch.csv_column_spec).toBeNull();
  });

  it('blank optional fields patch to null (creation-safe; see file header for the RPC COALESCE caveat on edits)', () => {
    const patch = buildVendorProfilePatch(EMPTY_VENDOR_PROFILE_FORM);
    expect(patch.po_email).toBeNull();
    expect(patch.portal_url).toBeNull();
    expect(patch.deposit_pct).toBeNull();
    expect(patch.lead_time_days).toBeNull();
    expect(patch.inspection_window_days).toBeNull();
    expect(patch.commission_rate).toBeNull();
  });

  it('commission rate: whole-percent form string -> fraction, rounded to 4dp', () => {
    expect(buildVendorProfilePatch({ ...EMPTY_VENDOR_PROFILE_FORM, commissionRatePct: '16' }).commission_rate).toBe(
      0.16,
    );
    expect(buildVendorProfilePatch({ ...EMPTY_VENDOR_PROFILE_FORM, commissionRatePct: '18.5' }).commission_rate).toBe(
      0.185,
    );
  });

  it('non-numeric optional fields parse to null rather than NaN', () => {
    const patch = buildVendorProfilePatch({ ...EMPTY_VENDOR_PROFILE_FORM, leadTimeDays: 'not a number' });
    expect(patch.lead_time_days).toBeNull();
  });
});
