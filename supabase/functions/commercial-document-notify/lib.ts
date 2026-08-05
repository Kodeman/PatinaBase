// Pure request-shape helpers for commercial-document-notify: parsing/
// validating the optional paper `channel` flag and narrowing the audience
// matrix for it. Kept separate from policy.ts (which only judges whether a
// transition is EVIDENCED — actor/document-kind/state invariants — never who
// hears about it) and out of index.ts (which boots Deno.serve on import, so
// its logic isn't directly test-importable — same split as po-send/lib.ts).

import type { CommercialTransition } from "./core.ts";

export type NotificationChannel = "paper";

export type ParsedNotificationChannel =
  | { ok: true; channel: NotificationChannel | null }
  | { ok: false };

/**
 * A designer recording a paper execution already knows it happened — the
 * "executed family" (executed, furnishings_executed, trade_scope_executed)
 * normally notifies both parties because the client's own online act
 * triggered it and the studio needs to hear about it. On paper the studio
 * IS the actor, so its own copy of that notification is redundant. `executed`
 * is already client-only for a different reason (it always follows the
 * studio's own countersign act, online or on paper) — paper narrowing is a
 * no-op there; it only bites for furnishings_executed and
 * trade_scope_executed, which normally notify both parties.
 */
const EXECUTED_FAMILY: ReadonlySet<CommercialTransition> = new Set([
  "executed",
  "furnishings_executed",
  "trade_scope_executed",
]);

/**
 * trade_scope_accepted does not fit the EXECUTED_FAMILY narrowing above — its
 * online (channel:null) audience is studio-only to begin with (the client
 * acted in the portal, so the studio is the one who needs telling), and
 * filtering a list that never contained the client can never produce one
 * that does. A paper acceptance inverts who needs telling: the studio
 * recorded the act FOR the client, so the client is the one who does not yet
 * know it happened. RULING (superseding the original "suppressed for paper"
 * decision): a paper trade-scope acceptance now sends the client a
 * paper-variant notice of its own (core.ts) — online acceptance keeps its
 * unchanged studio-only notice.
 */
const PAPER_AUDIENCE_OVERRIDE: Partial<
  Record<CommercialTransition, Array<"client" | "studio">>
> = {
  trade_scope_accepted: ["client"],
};

/** Accepts only 'paper' or an absent value (undefined/null); any other value
 * is a caller error, not a silent no-channel fallback. */
export function parseNotificationChannel(
  value: unknown,
): ParsedNotificationChannel {
  if (value === undefined || value === null) return { ok: true, channel: null };
  if (value === "paper") return { ok: true, channel: "paper" };
  return { ok: false };
}

/** The audience matrix for a transition, narrowed for the paper channel.
 * Mirrors the online matrix exactly when channel is null — this is the same
 * decision table index.ts computed inline before the paper channel existed. */
export function resolveCommercialNotificationAudiences(
  transition: CommercialTransition,
  channel: NotificationChannel | null,
): Array<"client" | "studio"> {
  const base: Array<"client" | "studio"> =
    transition === "client_signed" ||
      transition === "furnishings_executed" ||
      transition === "trade_scope_executed"
      ? ["client", "studio"]
      : transition === "executed" ||
          transition === "budget_published" ||
          transition === "furnishings_sent" ||
          transition === "deposit_ready" ||
          transition === "trade_scope_sent" ||
          transition === "trade_draw_ready"
        ? ["client"]
        : ["studio"];

  if (channel === "paper") {
    const override = PAPER_AUDIENCE_OVERRIDE[transition];
    if (override) return override;
    if (EXECUTED_FAMILY.has(transition)) {
      return base.filter((audience) => audience === "client");
    }
  }
  return base;
}
