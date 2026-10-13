/**
 * Plain-language names for each template outbound kind (US-31). The kinds are
 * the pinned `OutboundKind` set in supabase/functions/_shared/send-authority.ts;
 * the database stores them as text, so this map is the portal's one list.
 * Used by the studio's Correspondence card and the ready-to-send sheet.
 */

export type OutboundRecipientGroup = 'clients' | 'trades';

export const OUTBOUND_KIND_LABELS = {
  invoice_reminder: 'Invoice reminders',
  invoice_overdue: 'Overdue invoice notes',
  decision_reminder: 'Decision reminders',
  decision_overdue: 'Overdue decision notes',
  client_digest: 'Project digests',
  review_request: 'Requests for a review',
  homeowner_window_pick: 'Delivery window texts to homeowners',
  trade_site_digest: 'Morning site texts to trades',
  trade_day_of: 'Day-of texts to trades',
  delivery_confirm: 'Delivery check-in texts',
  site_request_due: 'Site request reminders',
  hours_prompt: 'End-of-day hours texts',
} as const;

export type OutboundKind = keyof typeof OUTBOUND_KIND_LABELS;

export const OUTBOUND_KIND_GROUPS: ReadonlyArray<{
  group: OutboundRecipientGroup;
  heading: string;
  kinds: readonly OutboundKind[];
}> = [
  {
    group: 'clients',
    heading: 'To clients',
    kinds: [
      'invoice_reminder',
      'invoice_overdue',
      'decision_reminder',
      'decision_overdue',
      'client_digest',
      'review_request',
      'homeowner_window_pick',
    ],
  },
  {
    group: 'trades',
    heading: 'To trades',
    kinds: [
      'trade_site_digest',
      'trade_day_of',
      'delivery_confirm',
      'site_request_due',
      'hours_prompt',
    ],
  },
];

/** The kind's name, or the raw kind when the portal does not know it yet. */
export function outboundKindLabel(kind: string): string {
  return (OUTBOUND_KIND_LABELS as Record<string, string>)[kind] ?? kind;
}
