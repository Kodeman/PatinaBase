/**
 * Shared Field Coordination Configuration
 *
 * Canonical vocab for the field-coordination layer (subs / installers /
 * receivers texting status against a project). Mirrors `phase-config.ts`:
 * const arrays + a union type + a display-label map, imported by every portal
 * so trade / party-kind / consent naming stays consistent.
 *
 * The trade vocab lives here — NOT as a DB CHECK on project_parties.trade — so
 * trades can evolve without a migration (see 00281). The DB stores free TEXT;
 * the UI validates against this list.
 */

// ============================================================================
// TRADES
// ============================================================================

export type FieldTrade =
  | 'electrical'
  | 'plumbing'
  | 'hvac'
  | 'tile'
  | 'millwork'
  | 'paint'
  | 'flooring'
  | 'drywall'
  | 'wallpaper'
  | 'window_treatments'
  | 'general'
  | 'carpentry_framing'
  | 'masonry_concrete'
  | 'roofing'
  | 'glazing'
  | 'stone_countertops'
  | 'cabinetry'
  | 'plaster'
  | 'metalwork'
  | 'low_voltage_av'
  | 'appliance_install'
  | 'landscape'
  | 'demo'
  // PR-f — the five construction trades the Okonkwo fixture needed and the
  // vocab had no word for. `roofing` was already here and is unchanged.
  | 'radon_mitigation'
  | 'insulation'
  | 'waterproofing'
  | 'septic';

export const ALL_FIELD_TRADES: readonly FieldTrade[] = [
  'electrical',
  'plumbing',
  'hvac',
  'tile',
  'millwork',
  'paint',
  'flooring',
  'drywall',
  'wallpaper',
  'window_treatments',
  'general',
  'carpentry_framing',
  'masonry_concrete',
  'roofing',
  'glazing',
  'stone_countertops',
  'cabinetry',
  'plaster',
  'metalwork',
  'low_voltage_av',
  'appliance_install',
  'landscape',
  'demo',
  'radon_mitigation',
  'insulation',
  'waterproofing',
  'septic',
] as const;

export const FIELD_TRADE_LABELS: Record<FieldTrade, string> = {
  electrical: 'Electrical',
  plumbing: 'Plumbing',
  hvac: 'HVAC',
  tile: 'Tile',
  millwork: 'Millwork',
  paint: 'Paint',
  flooring: 'Flooring',
  drywall: 'Drywall',
  wallpaper: 'Wallpaper',
  window_treatments: 'Window Treatments',
  general: 'General',
  carpentry_framing: 'Carpentry & framing',
  masonry_concrete: 'Masonry & concrete',
  roofing: 'Roofing',
  glazing: 'Glazing',
  stone_countertops: 'Stone countertops',
  cabinetry: 'Cabinetry',
  plaster: 'Plaster',
  metalwork: 'Metalwork',
  low_voltage_av: 'Low-voltage / AV',
  appliance_install: 'Appliance installation',
  landscape: 'Landscape',
  demo: 'Demo',
  radon_mitigation: 'Radon mitigation',
  insulation: 'Insulation',
  waterproofing: 'Waterproofing',
  septic: 'Septic',
};

/** Display label for a trade; falls back to the raw value for legacy/unknowns. */
export function getFieldTradeLabel(trade: string | null | undefined): string {
  if (!trade) return '';
  return FIELD_TRADE_LABELS[trade as FieldTrade] ?? trade;
}

// ============================================================================
// PARTY KINDS
// ============================================================================

/**
 * The full project_parties.party_kind vocab (00212 + 00281 + PR-f). The field
 * kinds (gc / sub / installer / receiver) are the ones the SMS rails reach;
 * vendor / client_rep / other are the pre-field coordination courts.
 *
 * PR-f widened this in code. `client_rep` and `vendor` were already here; the
 * four PR-f adds are `inspector`, `lender`, `engineer` and `other_named`.
 *
 * ⚠ THE DATABASE CHECK HAS NOT MOVED YET. `project_parties_party_kind_check`
 * still admits only the eleven values in `PARTY_KINDS_ACCEPTED_BY_DB` below,
 * so a seat WRITTEN with one of the four new kinds is refused by Postgres.
 * Read paths (labels, filters, a card's `contact_kind`, which is free TEXT)
 * are safe today; a picker that offers a kind for a seat INSERT must narrow to
 * `PARTY_KINDS_ACCEPTED_BY_DB` until the widening migration lands.
 */
export type PartyKind =
  | 'gc'
  | 'vendor'
  | 'client_rep'
  | 'other'
  | 'sub'
  | 'installer'
  | 'receiver'
  | 'architect'
  | 'photographer'
  | 'stager'
  | 'client'
  // PR-f
  | 'inspector'
  | 'lender'
  | 'engineer'
  | 'other_named';

export const ALL_PARTY_KINDS: readonly PartyKind[] = [
  'gc',
  'vendor',
  'client_rep',
  'other',
  'sub',
  'installer',
  'receiver',
  'architect',
  'photographer',
  'stager',
  'client',
  'inspector',
  'lender',
  'engineer',
  'other_named',
] as const;

/**
 * The eleven values `project_parties_party_kind_check` admits today. The four
 * PR-f kinds are deliberately absent: widening the CHECK is a migration this
 * wave did not mint. Gate any control that writes `project_parties.party_kind`
 * on this list, not on `ALL_PARTY_KINDS`.
 */
export const PARTY_KINDS_ACCEPTED_BY_DB: readonly PartyKind[] = [
  'gc',
  'vendor',
  'client_rep',
  'other',
  'sub',
  'installer',
  'receiver',
  'architect',
  'photographer',
  'stager',
  'client',
] as const;

/** True when a seat may be WRITTEN with this kind today (see the CHECK note). */
export function isPartyKindWritable(kind: string | null | undefined): kind is PartyKind {
  return !!kind && (PARTY_KINDS_ACCEPTED_BY_DB as readonly string[]).includes(kind);
}

/** The party kinds that participate in field SMS coordination. */
export const FIELD_PARTY_KINDS: readonly PartyKind[] = [
  'gc',
  'sub',
  'installer',
  'receiver',
] as const;

export const PARTY_KIND_LABELS: Record<PartyKind, string> = {
  gc: 'General Contractor',
  vendor: 'Vendor',
  client_rep: 'Client Rep',
  other: 'Other',
  sub: 'Subcontractor',
  installer: 'Installer',
  receiver: 'Receiver',
  architect: 'Architect',
  photographer: 'Photographer',
  stager: 'Stager',
  client: 'Client',
  inspector: 'Inspector',
  lender: 'Lender',
  engineer: 'Engineer',
  other_named: 'Other',
};

export function getPartyKindLabel(kind: string | null | undefined): string {
  if (!kind) return '';
  return PARTY_KIND_LABELS[kind as PartyKind] ?? kind;
}

/** True when a party kind participates in field SMS coordination. */
export function isFieldPartyKind(kind: string | null | undefined): kind is PartyKind {
  return !!kind && (FIELD_PARTY_KINDS as readonly string[]).includes(kind);
}

/**
 * PR-f: `other_named` is the one kind that carries no meaning of its own — an
 * unnamed "other" is exactly the row that goes dark — so it requires a written
 * label beside it. (The same rule the database already enforces on
 * `studio_compliance_documents.doc_type = 'other_named'`.)
 */
export const PARTY_KINDS_REQUIRING_LABEL: readonly PartyKind[] = ['other_named'] as const;

export function partyKindRequiresLabel(kind: string | null | undefined): boolean {
  return !!kind && (PARTY_KINDS_REQUIRING_LABEL as readonly string[]).includes(kind);
}

/**
 * PR-f: the sibling axis on an `inspector` seat — who the inspection answers
 * to. An AHJ inspector is the city; a lender's inspector certifies a draw; a
 * third-party inspector is hired by the studio or the owner.
 *
 * ⚠ `project_parties` carries NO `inspector_subtype` column (W1b added the
 * stage/window/firm columns and not this one), so the value rides in the
 * seat's `meta` under `INSPECTOR_SUBTYPE_META_KEY` until a migration gives it
 * a column of its own.
 */
export type InspectorSubtype = 'ahj' | 'lender' | 'third_party';

export const ALL_INSPECTOR_SUBTYPES: readonly InspectorSubtype[] = [
  'ahj',
  'lender',
  'third_party',
] as const;

export const INSPECTOR_SUBTYPE_LABELS: Record<InspectorSubtype, string> = {
  ahj: 'City inspector',
  lender: "Lender's inspector",
  third_party: 'Third-party inspector',
};

/** Where the subtype lives until it has a column (see `InspectorSubtype`). */
export const INSPECTOR_SUBTYPE_META_KEY = 'inspector_subtype';

export function getInspectorSubtypeLabel(subtype: string | null | undefined): string {
  if (!subtype) return '';
  return INSPECTOR_SUBTYPE_LABELS[subtype as InspectorSubtype] ?? subtype;
}

export function isInspectorSubtype(value: unknown): value is InspectorSubtype {
  return (
    typeof value === 'string' &&
    (ALL_INSPECTOR_SUBTYPES as readonly string[]).includes(value)
  );
}

/**
 * R-A / C13 / C24: a lender or an inspector never owed the studio compliance
 * paper, so no surface prints a paper word for one — not on the firm row, not
 * on the person row, not on the company card. The view reports the FACT
 * (`not_on_file`); this predicate is the display rule that decides whether the
 * fact is owed, kept in the app on purpose (W1b §4).
 */
export function partyKindOwesPaper(kind: string | null | undefined): boolean {
  return kind !== 'inspector' && kind !== 'lender';
}

// ============================================================================
// SMS CONSENT
// ============================================================================

export type SmsConsentStatus = 'not_asked' | 'pending' | 'granted' | 'opted_out';

export const ALL_SMS_CONSENT_STATUSES: readonly SmsConsentStatus[] = [
  'not_asked',
  'pending',
  'granted',
  'opted_out',
] as const;

export interface SmsConsentDisplayConfig {
  /** Short chip label for the People Room / party sheet. */
  label: string;
  /** Tailwind dot class (matches the phase-config chip idiom). */
  dotClass: string;
}

export const SMS_CONSENT_DISPLAY: Record<SmsConsentStatus, SmsConsentDisplayConfig> = {
  not_asked: { label: 'Not asked', dotClass: 'bg-patina-pearl' },
  pending: { label: 'Invited', dotClass: 'bg-patina-clay' },
  granted: { label: 'Texting', dotClass: 'bg-patina-sage' },
  opted_out: { label: 'Opted out', dotClass: 'bg-patina-terracotta' },
};

export function getSmsConsentLabel(status: string | null | undefined): string {
  if (!status) return SMS_CONSENT_DISPLAY.not_asked.label;
  return SMS_CONSENT_DISPLAY[status as SmsConsentStatus]?.label ?? status;
}

// ============================================================================
// FIELD EFFECTS (the apply_field_effect vocab — 00282)
// ============================================================================

/** The effect kinds apply_field_effect (00282) accepts. */
export type FieldEffectType =
  | 'mark_done'
  | 'report_delay'
  | 'flag_blocker'
  | 'punch_report'
  | 'confirm_delivery'
  | 'note';

export const ALL_FIELD_EFFECT_TYPES: readonly FieldEffectType[] = [
  'mark_done',
  'report_delay',
  'flag_blocker',
  'punch_report',
  'confirm_delivery',
  'note',
] as const;
