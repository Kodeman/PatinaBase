//
//  RecordRefresh.swift
//  Patina
//
//  The order the Record depends on, in one place so a test can pin it.
//
//  1. Paint the snapshot FIRST. A cold launch must not open on a blank card
//     while five fetches land (`RecordSnapshotStore`).
//  2. Build against the visit that is still on disk.
//  3. Save the new record.
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
        case paintedSnapshot
        case built
        case saved
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
    @discardableResult
    static func run(
        snapshots: RecordSnapshotStore = .shared,
        lastSeen: LastSeenStore = .shared,
        now: Date = Date(),
        build: (_ previous: HouseRecord?, _ lastSeenAt: Date?) -> HouseRecord,
        paint: (HouseRecord) -> Void
    ) -> Outcome {
        var steps: [Step] = []

        let previous = snapshots.load()
        if let previous {
            paint(previous)
            steps.append(.paintedSnapshot)
        }

        let record = build(previous, lastSeen.lastSeenAt)
        steps.append(.built)
        paint(record)

        snapshots.save(record)
        steps.append(.saved)

        lastSeen.markSeen(now: now)
        steps.append(.stamped)

        return Outcome(record: record, steps: steps)
    }
}
