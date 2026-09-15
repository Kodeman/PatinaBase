// resend-webhook — writing the provider's verdict back onto the typed reach
// channel (studio_contact_channels, 00593). CRM-12.
//
// profiles.email_suppressed is the record for an address with a Patina account
// behind it, and resend-webhook has always written it. An address with NO
// account — Dana Kowalski's dead one, the fixture's whole motivating case — had
// no record anywhere, so the studio kept sending to it forever and the
// Directory row kept printing "Email".
//
// The channel row is that record. Every row carrying the bounced address is
// written, across every card and every studio, because a dead mailbox is dead
// for everyone; what differs between studios is CONSENT (studio_channel_consent,
// 00594), which this never touches.
//
// Extracted from index.ts so it can be tested without booting `serve()`.

export type ChannelStatus = "active" | "bounced" | "unsubscribed" | "dead";

/** Worst-first. A verdict never walks backwards: a 'bounced' event after a
 *  'dead' one leaves the row dead, and nothing here ever writes 'active'. */
export const CHANNEL_STATUS_RANK: Record<ChannelStatus, number> = {
  active: 0,
  bounced: 1,
  unsubscribed: 2,
  dead: 3,
};

/**
 * The channel status a Resend event means.
 *
 * A PERMANENT bounce is proof the address is dead — the same first-event rule
 * profiles get (isHardBounce). A transient one is recorded as 'bounced' and no
 * more: the send gate does not refuse a bounced row, exactly as one soft bounce
 * does not suppress a profile. A complaint is the recipient saying stop, which
 * is what 'unsubscribed' means.
 */
export function channelStatusForEvent(
  eventType: string,
  hardBounce: boolean,
): ChannelStatus | null {
  if (eventType === "email.complained") return "unsubscribed";
  if (eventType === "email.bounced") return hardBounce ? "dead" : "bounced";
  return null;
}

interface ChannelRow {
  id: string;
  status: string;
}

/** The narrow client surface this module needs. */
export interface ChannelStatusClient {
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        in(col: string, vals: unknown[]): PromiseLike<
          { data: unknown; error: { message: string } | null }
        >;
      };
    };
    update(values: Record<string, unknown>): {
      in(col: string, vals: unknown[]): PromiseLike<
        { data: unknown; error: { message: string } | null }
      >;
    };
  };
}

/**
 * Mark every typed email channel on `address` with `status`, skipping any row
 * already at that status or worse. Returns how many rows were written.
 *
 * Best effort by design: a failure here must not fail the webhook, because the
 * notification_log side of the same event is already recorded and Resend would
 * retry the whole delivery.
 */
export async function applyChannelStatus(
  supabase: ChannelStatusClient,
  address: string | null | undefined,
  status: ChannelStatus,
  now: string = new Date().toISOString(),
): Promise<number> {
  const value = (address ?? "").trim().toLowerCase();
  if (!value) return 0;

  const { data, error } = await supabase
    .from("studio_contact_channels")
    .select("id, status")
    .eq("value", value)
    .in("channel_kind", ["email", "ap_email"]);
  if (error) {
    console.warn("resend-webhook: channel lookup failed", error.message);
    return 0;
  }

  const target = CHANNEL_STATUS_RANK[status];
  const ids = ((data ?? []) as ChannelRow[])
    .filter((row) =>
      (CHANNEL_STATUS_RANK[row.status as ChannelStatus] ?? 0) < target
    )
    .map((row) => row.id);
  if (ids.length === 0) return 0;

  const { error: updateError } = await supabase
    .from("studio_contact_channels")
    .update({ status, status_at: now })
    .in("id", ids);
  if (updateError) {
    console.warn("resend-webhook: channel status write failed", updateError.message);
    return 0;
  }
  return ids.length;
}
