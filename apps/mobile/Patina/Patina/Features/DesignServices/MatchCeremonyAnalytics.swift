//
//  MatchCeremonyAnalytics.swift
//  Patina
//
//  PostHog telemetry for the client's side of the Match Ceremony (Arrival Arc,
//  R106 §6). Two events:
//
//  - `client_held_state_shown` — fired once per lead the first time its held
//    state is rendered (deduped durably in `UserDefaults`, so a relaunch does
//    not re-fire it).
//  - `client_pick` — fired when the homeowner books a discovery slot, carrying
//    `time_from_send_seconds` (pick time − the introduction's `offered_at`),
//    the deliberation latency the arc cares about.
//
//  Thin wrapper over the shared `PostHogService`, kept out of the views so the
//  once-per-lead bookkeeping has a single home.
//

import Foundation

enum MatchCeremonyAnalytics {

    /// `UserDefaults` key holding the lead ids whose held state has already been
    /// lettered, so `client_held_state_shown` fires at most once per lead.
    private static let heldShownKey = "match.heldStateShown.leadIds"

    /// Fire `client_held_state_shown` for `leadId` the first time only. No-ops
    /// on every subsequent call for the same lead (across relaunches).
    static func heldStateShownIfNeeded(leadId: UUID) {
        let key = leadId.uuidString
        var shown = Set(UserDefaults.standard.stringArray(forKey: heldShownKey) ?? [])
        guard !shown.contains(key) else { return }
        shown.insert(key)
        UserDefaults.standard.set(Array(shown), forKey: heldShownKey)
        PostHogService.shared.capture("client_held_state_shown", properties: [
            "lead_id": key
        ])
    }

    /// Fire `client_pick` when a discovery slot is booked. `offeredAt` is the
    /// introduction's `offered_at`; when present, `time_from_send_seconds`
    /// records how long the homeowner took to decide.
    static func pick(
        leadId: UUID,
        ceremonyId: UUID,
        slotId: UUID,
        offeredAt: Date?,
        now: Date = Date()
    ) {
        var properties: [String: Any] = [
            "lead_id": leadId.uuidString,
            "ceremony_id": ceremonyId.uuidString,
            "slot_id": slotId.uuidString
        ]
        if let offeredAt {
            properties["time_from_send_seconds"] = Int(now.timeIntervalSince(offeredAt))
        }
        PostHogService.shared.capture("client_pick", properties: properties)
    }
}
