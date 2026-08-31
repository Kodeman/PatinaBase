//  VisitReview.swift
//  CaptureKit
//
//  V4 — the close as output (§7.9, Flow 7). Everything V4 asserts about a
//  visit is derived here, from value types, so the screen holds no arithmetic.
//
//  ⚠ V4 groups Captures · Notes · Unplaced. §7.9 also names Scans; a scan is
//  not a Specimen and the device keeps no visit-keyed scan record, so counting
//  them would mean guessing. Scans stay in the portal's Room files block and a
//  room_scans.visit_id column is owed.
//
//  ⚠ elapsedMinutes is startedAt → now and never visit_ended_at.
//  commit_field_capture's upsert skips a status='saved' row without touching
//  it (00235:187-199), so a capture routed to the Library is immutable the
//  moment it commits and no close can stamp it.

import Foundation

public struct VisitReviewRow: Equatable, Sendable {
    public let specimenID: UUID
    public let hasPhoto: Bool
    public let hasTranscript: Bool
    public let roomName: String?
    public let isPlaced: Bool
    public let createdAt: Date

    public init(
        specimenID: UUID,
        hasPhoto: Bool,
        hasTranscript: Bool,
        roomName: String?,
        isPlaced: Bool,
        createdAt: Date
    ) {
        self.specimenID = specimenID
        self.hasPhoto = hasPhoto
        self.hasTranscript = hasTranscript
        self.roomName = roomName
        self.isPlaced = isPlaced
        self.createdAt = createdAt
    }
}

public struct VisitReviewSummary: Equatable, Sendable {
    public let photoCount: Int
    public let noteCount: Int
    public let unplacedCount: Int
    public let rooms: [String]
    public let elapsedMinutes: Int
}

public enum VisitReviewComposer {
    public static func summarize(
        rows: [VisitReviewRow],
        startedAt: Date,
        now: Date
    ) -> VisitReviewSummary {
        let ordered = rows.sorted { $0.createdAt < $1.createdAt }

        var rooms: [String] = []
        for row in ordered {
            guard let name = row.roomName?
                .trimmingCharacters(in: .whitespacesAndNewlines),
                  !name.isEmpty, !rooms.contains(name) else { continue }
            rooms.append(name)
        }

        // A capture with a photo counts once, as a photo, even when she spoke
        // over it — Flow 2's headline capture is one thing, not two.
        let photos = ordered.filter(\.hasPhoto).count
        let notes = ordered.filter { !$0.hasPhoto && $0.hasTranscript }.count

        // duration_minutes has CHECK (… > 0) (00177:20). A sub-minute visit
        // still cost her a trip, so the floor is one minute, never zero.
        let elapsed = max(1, Int((now.timeIntervalSince(startedAt) / 60).rounded()))

        return VisitReviewSummary(
            photoCount: photos,
            noteCount: notes,
            unplacedCount: ordered.filter { !$0.isPlaced }.count,
            rooms: rooms,
            elapsedMinutes: elapsed)
    }

    /// Honest and non-blocking: Done always works, and says what is waiting.
    public static func doneCaption(unplacedCount: Int) -> String? {
        guard unplacedCount > 0 else { return nil }
        return unplacedCount == 1
            ? "1 capture still unplaced — it'll wait on Today."
            : "\(unplacedCount) captures still unplaced — they'll wait on Today."
    }

    public static func timeOffer(minutes: Int) -> String {
        let hours = minutes / 60
        let mins = minutes % 60
        let span: String
        if hours == 0 {
            span = "\(mins)m"
        } else if mins == 0 {
            span = "\(hours)h"
        } else {
            span = "\(hours)h \(mins)m"
        }
        return "Log \(span) as a site visit"
    }
}

public extension VisitReviewRow {
    /// "Filed" is project_id IS NOT NULL (§9.2) — there is deliberately no
    /// terminal field_captures.status for it, because introducing one would
    /// silently revoke studio read (field_captures_org_inbox_select keys on
    /// status='inbox', 00233:175-186).
    init(specimen: Specimen) {
        let words = (specimen.voiceTranscript ?? specimen.voicePartialTranscript ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        self.init(
            specimenID: specimen.id,
            hasPhoto: !specimen.photos.isEmpty,
            hasTranscript: !words.isEmpty,
            roomName: specimen.venue?.room,
            isPlaced: specimen.venue?.projectId?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty == false,
            createdAt: specimen.createdAt)
    }
}
