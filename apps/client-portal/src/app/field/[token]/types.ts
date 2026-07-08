/**
 * Field guest page — shared DTO shape + token format gate (Field Coordination
 * Wave 4). resolve_field_link() (00283) mints the raw token exactly like
 * document_shares (00266): 32 random bytes → 64-char lowercase hex. The shape
 * is identical to a share token, but this is a distinct guest surface, so the
 * gate is its own small literal here rather than importing
 * isLikelyShareToken from @patina/utils under a confusing name.
 */

export const FIELD_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

/** Cheap format gate — rejects an obviously-malformed token before any DB round-trip. */
export function isLikelyFieldToken(token: string | null | undefined): boolean {
  return typeof token === 'string' && FIELD_TOKEN_PATTERN.test(token);
}

export type FieldEffectTargetKind = 'task' | 'coordination';

export interface FieldEffectTarget {
  kind: FieldEffectTargetKind;
  id: string;
}

export interface FieldLinkTask {
  id: string;
  title: string;
  status: 'todo' | 'blocked' | 'done';
  due_date: string | null;
}

export interface FieldLinkItem {
  id: string;
  title: string;
  coordination_kind: string;
  due_date: string | null;
}

export interface FieldLinkPunchItem {
  id: string;
  title: string;
  due_date: string | null;
}

export interface FieldLinkDelivery {
  id: string;
  vendor_name: string | null;
  event_date: string | null;
  po_status: string | null;
  ffe_item_count: number | null;
}

/** The exact narrow JSONB DTO resolve_field_link() returns (00283). */
export interface FieldLinkDTO {
  project: { id: string; name: string };
  studio_name: string | null;
  party: {
    id: string;
    display_name: string;
    party_kind: string;
    trade: string | null;
  };
  tasks: FieldLinkTask[];
  items: FieldLinkItem[];
  punch: FieldLinkPunchItem[];
  deliveries: FieldLinkDelivery[];
}

/** First given name off a party's display_name, for a friendlier greeting. */
export function firstName(displayName: string): string {
  const trimmed = displayName.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}

/** Short "Mon 7/14" label for a due/expected date; null when unset/unparsable. */
export function formatShortDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
}

export const COORDINATION_KIND_LABELS: Record<string, string> = {
  rfi: 'RFI',
  submittal: 'Submittal',
  signoff: 'Sign-off',
  selection: 'Selection',
  punch: 'Punch',
};

export function getCoordinationKindLabel(kind: string): string {
  return COORDINATION_KIND_LABELS[kind] ?? kind;
}
