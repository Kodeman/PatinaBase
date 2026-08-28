//
//  RecordRefresh.swift
//  Patina
//
//  The order the Record depends on, in one place so a test can pin it.
//
//  0. Refuse a record that belongs to another account, and take the visit
//     stamp with it (`RecordIdentity`). Before the load, or the head start
//     paints the previous client's money.
//  1. Paint the snapshot FIRST. A cold launch must not open on a blank card
//     while five fetches land (`RecordSnapshotStore`).
//  2. Build against the visit that is still on disk.
//  3. Save the new record, and attribute it to the account it was built for.
//  4. Only THEN stamp the visit (`LastSeenStore.markSeen`).
//
//  Step 4 last is the whole point: stamping before the build makes every row's
//  `isNew` false on the very open that should have shown the ticks
//  (r1-notes §3). It is written here rather than inline in the view model so
//  the ordering is a testable fact and not a comment.
//

import Foundation

@MainActor
enum RecordRefresh {

    /// What happened, in order — so a test can assert the sequence itself and
    /// not just its result.
    enum Step: String, Equatable {
        case discardedForeignRecord
        case paintedSnapshot
        case built
        case saved
        case attributed
        case stamped
    }

    struct Outcome {
        let record: HouseRecord
        let steps: [Step]
    }

    /// - Parameters:
    ///   - build: builds the record for this open. It is handed the snapshot
    ///     (for the six-hour suppression) and the visit stamp it must be new
    ///     against — both read before anything is written.
    ///   - paint: puts a record on screen. Called for the snapshot, then again
    ///     for the freshly built record.
    ///   - sessionUserId: who is signed in. A snapshot stamped for anyone else
    ///     is removed before it can be read, and so is the visit it was new
    ///     against.
    @discardableResult
    static func run(
        snapshots: RecordSnapshotStore = .shared,
        lastSeen: LastSeenStore = .shared,
        owner: RecordOwnerStamp = .shared,
        sessionUserId: String?,
        now: Date = Date(),
        build: (_ previous: HouseRecord?, _ lastSeenAt: Date?) -> HouseRecord,
        paint: (HouseRecord) -> Void
    ) -> Outcome {
        var steps: [Step] = []

        let identity = RecordIdentity.decide(stampedOwner: owner.ownerId, session: sessionUserId)
        if identity == .discard {
            // The step is recorded only where something was actually thrown
            // away: a genuine first run has nothing to discard and should not
            // read as a leak that was caught.
            let hadRecord = snapshots.hasSnapshot || lastSeen.lastSeenAt != nil
            snapshots.remove()
            lastSeen.clear()
            owner.clear()
            if hadRecord { steps.append(.discardedForeignRecord) }
        }

        // `.withhold` keeps the file (a session still being restored is not a
        // different account) but paints nothing and builds against no visit.
        let previous = identity == .paint ? snapshots.load() : nil
        if let previous {
            paint(previous)
            steps.append(.paintedSnapshot)
        }

        let record = build(previous, lastSeen.lastSeenAt)
        steps.append(.built)
        paint(record)

        snapshots.save(record)
        steps.append(.saved)

        // Attributed before the visit is stamped: a crash between the two
        // costs one open's ticks, where an unattributed snapshot would be
        // discarded on the next launch instead.
        if let sessionUserId, !sessionUserId.isEmpty {
            owner.stamp(sessionUserId)
            steps.append(.attributed)
        }

        lastSeen.markSeen(now: now)
        steps.append(.stamped)

        return Outcome(record: record, steps: steps)
    }
}
