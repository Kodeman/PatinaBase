//  TimeEntryOutboxDrainer.swift
//  Capture
//
//  Relaunch-safe runner for the hours LogTimeSheet queues (plan-v2 §7, W6).
//
//  A SIBLING of VisitCloseOutboxDrainer, not a second job bolted onto it. That
//  class is visit-specific — it fetches the visit's captures to name the entry,
//  and it is covered by ~49 tests across two suites. Generalising it into a
//  two-queue drainer is the LARGER change, not the smaller (FS-44): this one is
//  thirty lines, shares the orchestrator, the backoff and the classifier, and
//  leaves the proven path untouched.
//
//  The entry is ALWAYS a completed one. HT-7 keeps the single running-timer slot
//  (uniq_project_time_entries_running_timer, 00177:39-41) with the desk in v1,
//  and nothing here — not the record, not the request, not `log_time` — can
//  express a nil duration.

import Foundation
import SwiftData
import CaptureKit

@MainActor
final class TimeEntryOutboxDrainer {
    private let store: CaptureStore
    private let gateway: any TimeEntryGateway
    private let session: any SessionProviding
    private let analytics: any CaptureAnalytics
    private var isDraining = false

    init(store: CaptureStore, gateway: any TimeEntryGateway,
         session: any SessionProviding, analytics: any CaptureAnalytics) {
        self.store = store
        self.gateway = gateway
        self.session = session
        self.analytics = analytics
    }

    func resume(now: Date = Date(),
                trigger: VisitCloseDrainTrigger = .automatic) async {
        guard !isDraining else { return }
        isDraining = true
        defer { isDraining = false }
        for record in due(at: now, trigger: trigger) {
            await drain(record, now: now)
        }
    }

    /// Owner-scoped, exactly as every sibling outbox is. An unscoped fetch
    /// drains the PREVIOUS designer's hour under the current designer's JWT
    /// after an account switch — and `log_time` takes the author from
    /// `auth.uid()`, so the row would land against the wrong account outright.
    private func due(at now: Date,
                     trigger: VisitCloseDrainTrigger) -> [TimeEntryOutboxRecord] {
        let standing: [TimeEntryOutboxRecord]
        switch CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID
        ) {
        case .globalFixtures:   standing = store.timeEntryOutbox()
        case .owner(let owner): standing = store.timeEntryOutbox(owner: owner)
        case .unavailable:      standing = []
        }
        return TimeEntryOutboxOrchestrator.drainable(standing, at: now, trigger: trigger)
    }

    private func drain(_ record: TimeEntryOutboxRecord, now: Date) async {
        // project_id is a uuid and the author id has to parse for the record to
        // have been scoped to an owner at all. A record carrying either as
        // unparseable text can never land, so it closes `.unwritable` — the
        // state FieldWriteState reserves for exactly this — rather than
        // retrying hourly for the life of the install.
        guard let request = TimeEntryOutboxOrchestrator.request(for: record) else {
            record.state = .unwritable
            record.lastError = "These hours had no project to log against."
            record.nextAttemptAt = nil
            try? store.save()
            return
        }

        record.state = .writing
        try? store.save()
        do {
            // Lookup before write closes the response-loss gap one round-trip
            // before `log_time`'s own ON CONFLICT does. Both are needed: the
            // probe is an RLS-scoped read that can itself be lost.
            if try await gateway.existingTimeEntry(id: request.id) {
                record.markDelivered()
            } else {
                try await gateway.insertTimeEntry(request)
                record.markDelivered()
                emitLogged(record, now: now)
            }
        } catch {
            // Cancellation first: it is the app being stopped, not the write
            // being refused, and spending an attempt on it means five
            // interrupted launches close a perfectly writable hour as
            // `.unwritable`.
            TimeEntryOutboxOrchestrator.apply(
                FieldWriteClassifier.cancellationOutcome(for: error)
                    ?? FieldWriteClassifier.outcome(
                        code: SupabaseFieldWriteGateway.postgrestCode(from: error),
                        message: error.localizedDescription),
                to: record, now: now)
        }
        try? store.save()
    }

    /// HT-27 — the event fires when the hour LANDS, not when she taps. The
    /// widget/intent decision rests on whether capture actually works, and a
    /// queued row that never drained is not capture working. `latency_ms` is
    /// tap → landed, which on this phone is often a drive long.
    private func emitLogged(_ record: TimeEntryOutboxRecord, now: Date) {
        analytics.event("time_entry_logged", [
            "surface": "field_sheet",
            "source": record.source,
            "activity": record.activityRaw ?? "unset",
            "billable": String(record.billable),
            "rate_role": record.rateRole?.rawValue ?? "unset",
            "duration_minutes": String(record.durationMinutes),
            "latency_ms": String(Int(max(0, now.timeIntervalSince(record.createdAt)) * 1000))
        ])
    }
}
