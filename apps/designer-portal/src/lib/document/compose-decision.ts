/**
 * C4 — a request to escalate a flagged proposal line to a client Decision.
 *
 * Raised from the Alternatives band (schedule-line-unfold), lifted through the
 * Drafting Room to the doc page, and consumed by the margin rail's ItemComposer
 * (the Document's single composer — D1 strict focus). The rejected line becomes
 * option A; the shortlisted taught alternatives become the further options. On
 * decision creation the margin rail links it back via
 * escalate_item_feedback_to_decision so item_feedback.decision_id points at it.
 */

export interface ComposeDecisionOption {
  productId: string | null;
  name: string;
  imageUrl: string | null;
  priceCents: number | null;
  brand?: string | null;
  layer?: string | null;
}

export interface ComposeDecisionRequest {
  /** The unresolved rejection this decision answers. */
  feedbackId: string;
  title: string;
  /** The rejected line's current product — option A. */
  rejected: ComposeDecisionOption;
  /** Shortlisted taught alternatives — the further options. */
  alternatives: ComposeDecisionOption[];
}
