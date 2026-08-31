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
    /// The visit's captures are read owner-scoped, the way every other
    /// authenticated surface reads them — an unscoped fetch would name a room
    /// from another account's visit in this designer's Hours entry.
    private let session: any SessionProviding
    private var isDraining = false

    init(store: CaptureStore, gateway: any TimeEntryGateway, session: any SessionProviding) {
        self.store = store
        self.gateway = gateway
        self.session = session
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

    /// Owner-scoped the way every sibling outbox is (`store.outbox(owner:)`,
    /// `scanUploadRecords(owner:)`). An unscoped fetch drains the PREVIOUS
    /// designer's close under the current designer's JWT after an account
    /// switch, and `project_time_entries.user_id` is carried in the record, not
    /// taken from the session — so the row lands against the wrong account.
    private func due(at now: Date,
                     trigger: VisitCloseDrainTrigger) -> [FieldVisitCloseRecord] {
        let standing: [FieldVisitCloseRecord]
        switch CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID
        ) {
        case .globalFixtures:   standing = store.visitCloseOutbox()
        case .owner(let owner): standing = store.visitCloseOutbox(owner: owner)
        case .unavailable:      standing = []
        }
        return VisitCloseOrchestrator.drainable(standing, at: now, trigger: trigger)
    }

    private func drain(_ record: FieldVisitCloseRecord, now: Date) async {
        // project_id and user_id are both NOT NULL uuids. A record carrying
        // either as unparseable text can never land, so it closes as
        // `.unwritable` — the state FieldWriteState reserves for exactly this,
        // "an unparseable uuid" included — rather than retrying hourly forever.
        // Two guards, not one: a missing project and a missing account are
        // different failures and she is owed the one that actually happened.
        guard let projectID = UUID(uuidString: record.projectID) else {
            close(record, unwritable: "This visit had no project to log the hours against.")
            return
        }
        guard let userID = UUID(uuidString: record.ownerUserID) else {
            close(record,
                  unwritable: "Your account wasn't ready when this visit closed, "
                      + "so the hours weren't logged.")
            return
        }

        let request = TimeEntryWriteRequest(
            id: record.timeEntryID,
            projectID: projectID,
            userID: userID,
            startedAt: record.startedAt,
            durationMinutes: record.durationMinutes,
            notes: VisitCloseOrchestrator.notes(for: record, captures: captures(for: record)))

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
            // Cancellation first: it is the app being stopped, not the write
            // being refused, and spending an attempt on it means five
            // interrupted launches close a perfectly writable record as
            // `.unwritable`.
            VisitCloseOrchestrator.apply(
                FieldWriteClassifier.cancellationOutcome(for: error)
                    ?? FieldWriteClassifier.outcome(
                        code: SupabaseFieldWriteGateway.postgrestCode(from: error),
                        message: error.localizedDescription),
                to: record, now: now)
        }
        try? store.save()
    }

    private func close(_ record: FieldVisitCloseRecord, unwritable message: String) {
        record.state = .unwritable
        record.lastError = message
        record.nextAttemptAt = nil
        try? store.save()
    }

    private func captures(for record: FieldVisitCloseRecord) -> [Specimen] {
        switch CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID
        ) {
        case .globalFixtures:   return store.session(visitID: record.visitID)
        case .owner(let owner): return store.session(visitID: record.visitID, owner: owner)
        case .unavailable:      return []
        }
    }
}
