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
  | 'general';

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
 * The full project_parties.party_kind vocab (00212 + 00281). The field kinds
 * (gc / sub / installer / receiver) are the ones the SMS rails reach; vendor /
 * client_rep / other are the pre-field coordination courts.
 */
export type PartyKind =
  | 'gc'
  | 'vendor'
  | 'client_rep'
  | 'other'
  | 'sub'
  | 'installer'
  | 'receiver';

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
};

export function getPartyKindLabel(kind: string | null | undefined): string {
  if (!kind) return '';
  return PARTY_KIND_LABELS[kind as PartyKind] ?? kind;
}

/** True when a party kind participates in field SMS coordination. */
export function isFieldPartyKind(kind: string | null | undefined): kind is PartyKind {
  return !!kind && (FIELD_PARTY_KINDS as readonly string[]).includes(kind);
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
