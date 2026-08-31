//  VisitCloseOutboxDrainer.swift
//  Capture
//
//  Relaunch-safe runner for the one row a visit close owes the desk: the Hours
//  entry that shadows the Visits block (FC-R3). Mirrors SiteRequestOutboxDrainer
//  — durable record, lookup before write, exponential backoff — because she
//  closes a visit standing in a house with one bar of signal.
//
//  The entry is ALWAYS a completed one. `project_time_entries` reserves
//  duration_minutes IS NULL for the designer's single running desk timer
//  (uniq_project_time_entries_running_timer, 00177:39-41), and nothing here can
//  express a nil duration.

import Foundation
import SwiftData
import CaptureKit

@MainActor
final class VisitCloseOutboxDrainer {
    private let store: CaptureStore
    private let gateway: any TimeEntryGateway
    private var isDraining = false

    init(store: CaptureStore, gateway: any TimeEntryGateway) {
        self.store = store
        self.gateway = gateway
    }

    func resume(now: Date = Date()) async {
        guard !isDraining else { return }
        isDraining = true
        defer { isDraining = false }
        for record in due(at: now) {
            await drain(record, now: now)
        }
    }

    private func due(at now: Date) -> [FieldVisitCloseRecord] {
        let descriptor = FetchDescriptor<FieldVisitCloseRecord>(
            sortBy: [SortDescriptor(\.endedAt, order: .forward)])
        return ((try? store.context.fetch(descriptor)) ?? []).filter { $0.isDue(at: now) }
    }

    private func drain(_ record: FieldVisitCloseRecord, now: Date) async {
        // project_id and user_id are both NOT NULL uuids. A record carrying
        // neither can never land, so it closes instead of retrying hourly
        // forever with nothing to say for itself.
        guard let projectID = UUID(uuidString: record.projectID),
              let userID = UUID(uuidString: record.ownerUserID) else {
            record.state = .refused
            record.lastError = "This visit had no project to log the hours against."
            try? store.save()
            return
        }

        let request = TimeEntryWriteRequest(
            id: record.timeEntryID,
            projectID: projectID,
            userID: userID,
            startedAt: record.startedAt,
            durationMinutes: record.durationMinutes,
            notes: notes(for: record))

        record.state = .writing
        try? store.save()
        do {
            // Lookup before write: the id is client-minted, so a row already
            // standing under it is THIS close arriving twice, not a second visit.
            if try await gateway.existingTimeEntry(id: request.id) {
                record.markDelivered()
            } else {
                try await gateway.insertTimeEntry(request)
                record.markDelivered()
            }
        } catch {
            apply(FieldWriteClassifier.outcome(
                      code: SupabaseFieldWriteGateway.postgrestCode(from: error),
                      message: error.localizedDescription),
                  to: record, now: now)
        }
        try? store.save()
    }

    private func apply(_ outcome: FieldWriteOutcome,
                       to record: FieldVisitCloseRecord,
                       now: Date) {
        switch outcome {
        case .written, .alreadyWritten:
            record.markDelivered()
        case .deferred(let message):
            // She is offline, not refused: the next drain tries again straight
            // away rather than serving a backoff for a road she is still on.
            record.state = .pending
            record.lastError = message
            record.nextAttemptAt = nil
        case .refused(let message):
            record.state = .refused
            record.lastError = message
            record.nextAttemptAt = nil
        case .unsatisfiable(let message):
            // 23514 is the one that would bite here — a duration that failed
            // CHECK (duration_minutes > 0). No retry can satisfy it, so the
            // lane closes rather than looping hourly with nothing to show.
            record.state = .refused
            record.lastError = message
            record.nextAttemptAt = nil
        case .failed(let message):
            record.markFailed(message, now: now)
        }
    }

    /// FC-R3: the Visits block is the record and the Hours entry is its billing
    /// shadow, so they carry the same name — "Maple St · Living, Dining".
    /// Derived from the visit's own captures, which is where the label and the
    /// rooms actually live once the context has closed.
    private func notes(for record: FieldVisitCloseRecord) -> String? {
        let captures = store.session(visitID: record.visitID)
        let label = captures
            .compactMap { $0.visitLabel?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
        let rooms = VisitReviewComposer.summarize(
            rows: captures.map(VisitReviewRow.init(specimen:)),
            startedAt: record.startedAt,
            now: record.endedAt).rooms
        let parts = [label, rooms.isEmpty ? nil : rooms.joined(separator: ", ")]
            .compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}
