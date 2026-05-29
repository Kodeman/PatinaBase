// Display-label maps for the lead enum columns (values defined in migration
// 00014). Used to render human-readable text in the leads list, lead detail,
// and the pipeline overview. Labels match the Add Lead form's option labels.

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  full_room: 'Full Room',
  consultation: 'Consultation',
  single_piece: 'Single Piece',
  staging: 'Staging',
};

export const BUDGET_RANGE_LABELS: Record<string, string> = {
  under_5k: 'Under $5k',
  '5k_15k': '$5k – $15k',
  '15k_50k': '$15k – $50k',
  '50k_100k': '$50k – $100k',
  over_100k: 'Over $100k',
};

export const TIMELINE_LABELS: Record<string, string> = {
  asap: 'ASAP',
  '1_3_months': '1 – 3 months',
  '3_6_months': '3 – 6 months',
  '6_12_months': '6 – 12 months',
  flexible: 'Flexible',
};

function labelFor(map: Record<string, string>, value?: string | null): string {
  if (!value) return '';
  return map[value] ?? value; // fall back to the raw value if unmapped
}

export const formatProjectType = (v?: string | null) =>
  labelFor(PROJECT_TYPE_LABELS, v);
export const formatBudgetRange = (v?: string | null) =>
  labelFor(BUDGET_RANGE_LABELS, v);
export const formatTimeline = (v?: string | null) =>
  labelFor(TIMELINE_LABELS, v);

/**
 * Display name for a lead: the matched homeowner's profile name, else the
 * designer-captured contact name, else a generic fallback. Designer-created
 * leads have no homeowner profile, so without contact_name they would all
 * read "Anonymous Client".
 */
export function leadDisplayName(lead: {
  homeowner?: { full_name?: string | null } | null;
  contact_name?: string | null;
}): string {
  return lead.homeowner?.full_name || lead.contact_name || 'Anonymous Client';
}
