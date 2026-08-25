//  FieldTodayBand.swift
//  CaptureKit
//
//  The Today band (spec §7.1) — the open visit, the unplaced tray, and
//  "+ Start a visit", above the three attention sections. It renders from the
//  local store, so it is correct with no signal.

import Foundation

public struct FieldTodayBand: Equatable, Sendable {
    public enum VisitRow: Equatable, Sendable {
        case none
        case open(label: String, startedAt: Date, captures: Int, notes: Int, scans: Int)
        /// > 30 min idle. Subtitle swaps to "Still at Maple St?" + Resume / End visit.
        case stale(label: String, startedAt: Date)
    }

    public let visit: VisitRow
    /// FC-R6: `project_id == nil`, regardless of sync state — includes `.committed`
    /// rows. Callers pass a list already filtered by `Specimen.isUnplaced`; this
    /// type never re-derives placement and never consults sync state itself.
    public let unplacedCount: Int
    public let queuedCount: Int
    public let isOffline: Bool

    public init(visit: VisitRow, unplacedCount: Int, queuedCount: Int, isOffline: Bool) {
        self.visit = visit
        self.unplacedCount = unplacedCount
        self.queuedCount = queuedCount
        self.isOffline = isOffline
    }

    /// nil when the tray is empty.
    public var unplacedLine: String? {
        switch unplacedCount {
        case 0:  return nil
        case 1:  return "1 capture not placed yet"
        default: return "\(unplacedCount) captures not placed yet"
        }
    }

    public var visitSubtitle: String? {
        switch visit {
        case .none:
            return nil
        case .stale(let label, _):
            return "Still at \(label)?"
        case .open(_, _, let captures, let notes, let scans):
            // Never the word "queued" (mechanism vocabulary). Spec §7.1's
            // Syncing state still owes her the true thing in her words: what
            // hasn't left the phone is what she needs to know before she
            // drives away, so it is re-voiced as "still on this phone" and
            // appended only when there is any (never "0 still on this
            // phone", never a stray separator). `captures` is always
            // appended, so `parts` is never empty.
            var parts: [String] = []
            parts.append(captures == 1 ? "1 capture" : "\(captures) captures")
            if scans > 0 { parts.append(scans == 1 ? "1 scan" : "\(scans) scans") }
            if notes > 0 { parts.append(notes == 1 ? "1 note" : "\(notes) notes") }
            if queuedCount > 0 { parts.append("\(queuedCount) still on this phone") }
            return parts.joined(separator: " · ")
        }
    }

    public var offlineLine: String? {
        isOffline ? "Showing what's on this phone." : nil
    }
}

public enum FieldTodayBandBuilder {
    // @MainActor — it reads Specimen, which is a SwiftData @Model.
    // The 7-parameter shape is the Interfaces-block contract Wave 4's Task 0
    // reads — do not collapse it into a struct to satisfy the linter.
    @MainActor
    // swiftlint:disable:next function_parameter_count
    public static func build(visitState: CaptureVisitState,
                             visitCaptures: [Specimen],
                             unplaced: [Specimen],
                             pendingScanUploads: Int,
                             queued: Int,
                             isOffline: Bool,
                             now: Date) -> FieldTodayBand {
        // A "note" is a capture with a transcript or audio and no photo; a
        // "capture" is everything else in the visit.
        let notes = visitCaptures.filter { specimen in
            specimen.photos.isEmpty
                && ((specimen.voiceTranscript?.isEmpty == false)
                    || specimen.voiceAudioFilename?.isEmpty == false)
        }.count
        let captures = visitCaptures.count - notes

        let row: FieldTodayBand.VisitRow
        switch visitState {
        case .none:
            row = .none
        case .active(let context):
            row = .open(label: context.label ?? "This visit",
                        startedAt: context.startedAt,
                        captures: max(0, captures),
                        notes: notes,
                        scans: pendingScanUploads)
        case .stale(let context):
            row = .stale(label: context.label ?? "This visit", startedAt: context.startedAt)
        }

        // FC-R6: `unplaced` is trusted as-is — never re-filtered by status,
        // remoteId, or any other sync signal. Placement, not sync, empties this.
        return FieldTodayBand(visit: row,
                              unplacedCount: unplaced.count,
                              queuedCount: queued,
                              isOffline: isOffline)
    }
}
