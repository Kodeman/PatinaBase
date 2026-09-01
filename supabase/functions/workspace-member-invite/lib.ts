// workspace-member-invite — the pure response-contract helpers, extracted so
// they can be tested without booting index.ts's `Deno.serve`.

/** Fate of the invite email, once the membership row is already committed. */
export type InviteEmailStatus = "sent" | "suppressed" | "failed";

export interface InviteEmailOutcome {
  email_status: InviteEmailStatus;
  /** Present only when email_status === 'failed'. */
  email_error?: string;
}

/** The branded template row is missing — nothing was handed to the provider. */
export const TEMPLATE_MISSING_OUTCOME: InviteEmailOutcome = {
  email_status: "failed",
  email_error: "template_missing",
};

/**
 * Map a sendCompliantEmail result onto the invite response contract.
 *
 * Suppression is not a failure: the recipient is on the durable
 * bounce/complaint list, the membership stands, and there is nothing for the
 * caller to retry.
 */
export function inviteEmailOutcome(
  result: { success: boolean; suppressed?: boolean; error?: string },
): InviteEmailOutcome {
  if (result.suppressed) return { email_status: "suppressed" };
  if (!result.success) {
    return { email_status: "failed", email_error: "send_failed" };
  }
  return { email_status: "sent" };
}
