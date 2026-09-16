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
  const value = normalizeChannelAddress(address);
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

/**
 * The address as BOTH ledgers hold it. 00593 normalises an email channel's
 * `value` to `lower(btrim(...))` on write, so the channel lookup and the
 * profile mirror below must key on the same string or they part company on a
 * mixed-case recipient.
 */
export function normalizeChannelAddress(
  address: string | null | undefined,
): string {
  return (address ?? "").trim().toLowerCase();
}

/** The two verdicts that mean "no letter goes to this mailbox again". */
export function isSuppressingStatus(status: ChannelStatus): boolean {
  return status === "dead" || status === "unsubscribed";
}

/** The narrow client surface the profile mirror needs. */
export interface ProfileSuppressionClient {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(col: string, val: unknown): PromiseLike<
        { data: unknown; error: { message: string } | null }
      >;
    };
  };
}

/**
 * THE SECOND LEDGER (W4 r13 MAJOR-1).
 *
 * `campaign-dispatch` is the one branch of the email rail that never asks the
 * channel gate: it posts straight to Resend's batch endpoint and picks its
 * audience from `profiles` on a single column, `email_suppressed`. The bounce
 * and complaint branches of this webhook keep the two ledgers in step only
 * when the event carries a `notification_log` row WITH a `user_id` — and the
 * orphan branch (a letter from po-send / quote-request-send / trade-rfq-send /
 * trade-agreement-send that wrote no log row at all) reaches neither
 * `handleBounce` nor the complaint suppression. So an address could be `dead`
 * on every card in the channel ledger and still be mailed by the next
 * campaign, which is the thing D-6 says must not happen.
 *
 * This is the symmetric move to r12 MAJOR-2, which made the unsubscribe click
 * write both ledgers: a killing verdict on an address suppresses every profile
 * carrying it, whatever told us.
 *
 * Best effort, like the channel write itself: the notification_log side of the
 * same event is already recorded, and a failure here must not make Resend
 * retry the whole delivery. `eq`, not `ilike` — a perfectly ordinary address
 * carries `_` and `%`, and a wildcard read would suppress strangers.
 */
export async function suppressProfilesForAddress(
  supabase: ProfileSuppressionClient,
  address: string | null | undefined,
  now: string = new Date().toISOString(),
): Promise<boolean> {
  const value = normalizeChannelAddress(address);
  if (!value) return false;

  const { error } = await supabase
    .from("profiles")
    .update({ email_suppressed: true, email_suppressed_at: now })
    .eq("email", value);

  if (error) {
    console.warn("resend-webhook: profile suppression failed", error.message);
    return false;
  }
  return true;
}
