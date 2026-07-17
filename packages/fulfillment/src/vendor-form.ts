// @patina/fulfillment — the Vendor Directory profile editor's form state
// (S4, spec §7/R1.6). Pure mapping between the editor's flat string-keyed
// form and the fulfillment_update_vendor_profile RPC's jsonb patch shape
// (00353) — no fetch, no React, unit-testable without a live stack.
//
// ⚠ RPC quirk this module works around by NOT trying to (documented, not
// silently swallowed): fulfillment_update_vendor_profile's ON CONFLICT branch
// is `COALESCE(EXCLUDED.x, vendor_profiles.x)` for every column — so passing
// null for an already-set field NEVER clears it, only a non-null overwrite
// takes effect. First-time creation (no existing row) is unaffected — the
// INSERT branch uses the patch's values directly. Clearing a previously-set
// optional field back to empty is therefore not currently possible through
// this RPC; that's an S3-migration-owned fix if it's ever wanted, not
// something buildVendorProfilePatch can work around from the client side.

import type { PaymentTerms, TransmissionType, VendorProfileDTO } from './types';

export interface VendorProfileFormState {
  transmissionType: TransmissionType;
  poEmail: string;
  portalUrl: string;
  /** csv transmission only — comma-separated column names as the operator types them. */
  csvColumnsCsv: string;
  paymentTerms: PaymentTerms;
  /** '' or a whole-percent string, e.g. '50'. */
  depositPct: string;
  leadTimeDays: string;
  changeWindowDays: string;
  blindShip: boolean;
  claimsWindowDays: string;
  inspectionParcelDays: string;
  inspectionLtlDays: string;
  inspectionWhiteGloveDays: string;
  freightArrangement: string;
  /** '' or a whole-percent string, e.g. '18'. */
  commissionRatePct: string;
}

export const EMPTY_VENDOR_PROFILE_FORM: VendorProfileFormState = {
  transmissionType: 'email',
  poEmail: '',
  portalUrl: '',
  csvColumnsCsv: '',
  paymentTerms: 'net_30',
  depositPct: '',
  leadTimeDays: '',
  changeWindowDays: '',
  blindShip: false,
  claimsWindowDays: '',
  inspectionParcelDays: '',
  inspectionLtlDays: '',
  inspectionWhiteGloveDays: '',
  freightArrangement: '',
  commissionRatePct: '',
};

function numOrEmpty(n: number | null | undefined): string {
  return n == null ? '' : String(n);
}

/** An existing profile (or null, for a vendor with none yet) -> the form's
 *  starting state. */
export function vendorProfileToFormState(profile: VendorProfileDTO | null): VendorProfileFormState {
  if (!profile) return { ...EMPTY_VENDOR_PROFILE_FORM };
  const inspection = profile.inspectionWindowDays ?? {};
  return {
    transmissionType: profile.transmissionType,
    poEmail: profile.poEmail ?? '',
    portalUrl: profile.portalUrl ?? '',
    csvColumnsCsv: Array.isArray((profile.csvColumnSpec as { columns?: unknown[] } | null)?.columns)
      ? ((profile.csvColumnSpec as { columns: unknown[] }).columns as unknown[]).join(', ')
      : '',
    paymentTerms: profile.paymentTerms,
    depositPct: numOrEmpty(profile.depositPct),
    leadTimeDays: numOrEmpty(profile.leadTimeDays),
    changeWindowDays: numOrEmpty(profile.changeWindowDays),
    blindShip: profile.blindShip,
    claimsWindowDays: numOrEmpty(profile.claimsWindowDays),
    inspectionParcelDays: numOrEmpty(inspection.parcel ?? null),
    inspectionLtlDays: numOrEmpty(inspection.ltl ?? null),
    inspectionWhiteGloveDays: numOrEmpty(inspection.white_glove ?? null),
    freightArrangement: profile.freightArrangement ?? '',
    commissionRatePct: profile.commissionRate == null ? '' : String(Math.round(profile.commissionRate * 10000) / 100),
  };
}

function numOrNull(s: string): number | null {
  const trimmed = s.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Form state -> fulfillment_update_vendor_profile's p_patch jsonb. */
export function buildVendorProfilePatch(form: VendorProfileFormState): Record<string, unknown> {
  const inspection: Record<string, number> = {};
  const parcel = numOrNull(form.inspectionParcelDays);
  const ltl = numOrNull(form.inspectionLtlDays);
  const whiteGlove = numOrNull(form.inspectionWhiteGloveDays);
  if (parcel != null) inspection.parcel = parcel;
  if (ltl != null) inspection.ltl = ltl;
  if (whiteGlove != null) inspection.white_glove = whiteGlove;

  const commissionPct = numOrNull(form.commissionRatePct);

  return {
    transmission_type: form.transmissionType,
    po_email: form.poEmail.trim() || null,
    portal_url: form.portalUrl.trim() || null,
    csv_column_spec:
      form.transmissionType === 'csv' && form.csvColumnsCsv.trim()
        ? { columns: form.csvColumnsCsv.split(',').map((c) => c.trim()).filter(Boolean) }
        : null,
    payment_terms: form.paymentTerms,
    deposit_pct: numOrNull(form.depositPct),
    lead_time_days: numOrNull(form.leadTimeDays),
    change_window_days: numOrNull(form.changeWindowDays),
    blind_ship: form.blindShip,
    claims_window_days: numOrNull(form.claimsWindowDays),
    inspection_window_days: Object.keys(inspection).length ? inspection : null,
    freight_arrangement: form.freightArrangement.trim() || null,
    commission_rate: commissionPct == null ? null : Math.round((commissionPct / 100) * 10000) / 10000,
  };
}
