"use client";

import { useEffect } from "react";

import { payLinkEvents } from "@/lib/analytics/events";

/**
 * The reporting mouth for the sheets that have none.
 *
 * `DeadLink`, `SettlingSheet` and `WithdrawnSheet` are server components, so
 * §9's `deadLink`, `settling` and `withdrawn` events had no way to fire and
 * were shipping as declared-but-unreachable exports (S-5; `withdrawn` was
 * missing outright until J15). Same for `rateLimitBindingMissing`:
 * S4 was ruled as "log an error AND emit a PostHog event", and there is no
 * server-side PostHog client in this portal — so the server logs, and this
 * carries the same fact to the browser half.
 *
 * Renders nothing. Every property it takes is a boolean or a fixed word: no
 * token, no nonce, no id ever reaches it.
 */
export function PayLinkBeacon({
  sheet,
  limiterMissing = false,
}: {
  sheet?: "dead" | "settling" | "withdrawn";
  limiterMissing?: boolean;
}) {
  useEffect(() => {
    if (limiterMissing) payLinkEvents.rateLimitBindingMissing();
    if (sheet === "dead") payLinkEvents.deadLink();
    if (sheet === "settling") payLinkEvents.settling();
    if (sheet === "withdrawn") payLinkEvents.withdrawn();
  }, [sheet, limiterMissing]);

  return null;
}
