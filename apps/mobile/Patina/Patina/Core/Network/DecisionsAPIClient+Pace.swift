//
//  DecisionsAPIClient+Pace.swift
//  Patina
//
//  `P-28`, the network half of the pace: the one call that asks Patina to
//  wait on a single approval.
//
//  It sits in its own file rather than beside the Stage-2 RPCs because
//  `DecisionsAPIClient+ProjectApprovals.swift` is at SwiftLint's 500-line
//  `file_length` warning, exactly as that file itself split off
//  `DecisionsAPIClient.swift` for the same reason.
//

import Foundation
import Supabase

extension DecisionsAPIClient {

    /// `P-28` / `r3 M1`. The snooze already standing on this approval.
    ///
    /// The write was the only half that existed, so the choice lived exactly
    /// as long as the screen did. RLS hands back her own row and nobody
    /// else's (`decision_snoozes_owner_select`, 00572), which is why this is a
    /// plain table read rather than another RPC: there is nothing to filter
    /// that the policy does not already filter.
    ///
    /// A list rather than `.single()`: the table's `UNIQUE (user_id,
    /// decision_id)` makes at most one row possible — a snooze is replaced,
    /// never stacked — and `.single()` answers the ordinary case (she has
    /// never snoozed this one) with a thrown PGRST116, which would draw the
    /// failure sentence over an approval nothing is wrong with.
    public func decisionSnooze(decisionId: String) async throws -> RemoteDecisionSnooze? {
        let rows: [RemoteDecisionSnooze] = try await supabase.database
            .from("decision_snoozes")
            .select("kind,snoozed_until")
            .eq("decision_id", value: decisionId)
            .limit(1)
            .execute()
            .value
        return rows.first
    }

    /// `P-28`. Ask Patina to wait, on ONE approval.
    ///
    /// `set_decision_snooze(p_decision_id, p_kind)` computes the moment in
    /// the reader's own timezone and writes `decision_snoozes`; the arithmetic
    /// is deliberately not done here, because a phone's idea of "tomorrow
    /// morning" and the cron's have to be the same one.
    ///
    /// `R16` is enforced where it has to be — in `decision-reminders` — and
    /// this call cannot weaken it: the overdue notice and a superseding
    /// edition bypass the snooze entirely. The screen's own job is to not
    /// PROMISE otherwise, which is why it does not offer the act on a past-due
    /// approval at all.
    public func setDecisionSnooze(
        decisionId: String,
        kind: DecisionSnooze
    ) async throws {
        _ = try await callRPC(
            "set_decision_snooze",
            body: ["p_decision_id": decisionId, "p_kind": kind.rawValue]
        )
    }
}
