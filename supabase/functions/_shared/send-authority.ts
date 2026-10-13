export type SendAuthority =
  | { kind: "designer"; userId: string; draftId?: string }
  | { kind: "studio_schedule"; studioId: string; outboundKind: OutboundKind }
  | {
    kind: "exempt";
    reason:
      | "auth"
      | "recipient_receipt"
      | "internal"
      | "carrier_compliance"
      | "patina_to_designer"
      | "staff";
  };

export type OutboundKind =
  | "invoice_reminder"
  | "invoice_overdue"
  | "decision_reminder"
  | "decision_overdue"
  | "client_digest"
  | "review_request"
  | "trade_site_digest"
  | "trade_day_of"
  | "delivery_confirm"
  | "site_request_due"
  | "homeowner_window_pick"
  | "hours_prompt";

export function authorityLabel(authority: SendAuthority): string {
  switch (authority.kind) {
    case "designer":
      return authority.draftId
        ? `designer:${authority.userId}:draft:${authority.draftId}`
        : `designer:${authority.userId}`;
    case "studio_schedule":
      return `studio_schedule:${authority.studioId}:${authority.outboundKind}`;
    case "exempt":
      return `exempt:${authority.reason}`;
  }
}
