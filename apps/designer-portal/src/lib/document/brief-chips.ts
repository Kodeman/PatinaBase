/**
 * SP-17/F44 — the Brief's BUDGET and TIMELINE chips print `leads.budget_range`
 * / `leads.timeline` (enum values defined in migration 00014) as words, not
 * their raw stored tokens (`15k_50k`, `3_6_months`).
 */

const BUDGET_RANGE_LABELS: Record<string, string> = {
  under_5k: 'Under $5k',
  '5k_15k': '$5k – $15k',
  '15k_50k': '$15k – $50k',
  '50k_100k': '$50k – $100k',
  over_100k: 'Over $100k',
};

const TIMELINE_LABELS: Record<string, string> = {
  asap: 'ASAP',
  '1_3_months': '1–3 Months',
  '3_6_months': '3–6 Months',
  '6_12_months': '6–12 Months',
  flexible: 'Flexible',
};

/** Falls back to the raw value if it is not one of the known enum members. */
export function formatBudgetRange(value?: string | null): string {
  if (!value) return '';
  return BUDGET_RANGE_LABELS[value] ?? value;
}

/** Falls back to the raw value if it is not one of the known enum members. */
export function formatTimeline(value?: string | null): string {
  if (!value) return '';
  return TIMELINE_LABELS[value] ?? value;
}
