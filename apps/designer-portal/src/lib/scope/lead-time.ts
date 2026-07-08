/**
 * Lead-time buckets (Track S · S2) — a small controlled vocabulary over the
 * long-lived-but-never-surfaced proposal_items.lead_time_weeks INTEGER. The
 * designer picks a bucket; we STORE the bucket's upper bound (weeks). At
 * activation the existing carry seeds project_ffe_items.eta from it (00180+).
 *
 * Pure + dependency-free.
 */

export interface LeadTimeBucket {
  /** Stored value = the bucket's upper bound in weeks (0 = in stock). */
  value: number;
  label: string;
}

export const LEAD_TIME_BUCKETS: LeadTimeBucket[] = [
  { value: 0, label: 'In stock' },
  { value: 2, label: '1–2 wks' },
  { value: 4, label: '3–4 wks' },
  { value: 6, label: '5–6 wks' },
  { value: 8, label: '7–8 wks' },
  { value: 12, label: '9–12 wks' },
  { value: 16, label: '13–16 wks' },
  { value: 20, label: '17–20 wks' },
  { value: 26, label: '21–26 wks' },
];

const LABEL_BY_VALUE = new Map(LEAD_TIME_BUCKETS.map((b) => [b.value, b.label]));

/**
 * Display an int→bucket label. A stored value that matches a bucket shows its
 * label; any other non-null int (legacy free-form data) shows "N wks". Null /
 * undefined → null (nothing to show).
 */
export function leadTimeLabel(weeks: number | null | undefined): string | null {
  if (weeks == null) return null;
  const known = LABEL_BY_VALUE.get(weeks);
  if (known) return known;
  if (weeks === 0) return 'In stock';
  return `${weeks} wks`;
}

/** True when the stored int is one of the canonical bucket values. */
export function isKnownLeadTimeBucket(weeks: number | null | undefined): boolean {
  return weeks != null && LABEL_BY_VALUE.has(weeks);
}
