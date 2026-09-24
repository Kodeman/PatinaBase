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
    /// Wall clock: visit start → now. KEPT, unchanged, and still what the visit
    /// actually spanned.
    public let elapsedMinutes: Int
    /// HT-16 — visit start → the LAST capture, which is the last moment this
    /// visit is known to have been worked. A visit left open in a truck for
    /// three hours proposes the twenty minutes she was in the house, not the
    /// three hours; D10 binds every surface that proposes a duration, not only
    /// the desk, and Field was breaching it with one confirm tap (CR-2, MOB-2,
    /// LEAH-2, FS-28).
    ///
    /// With no captures there is nothing to bound it by, so this IS
    /// `elapsedMinutes` — the stepper is then the whole of the correction.
    public let activeMinutes: Int
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

        // `ordered` is already sorted ascending, so the last row is the last
        // capture. A capture made BEFORE the visit opened (a clock change, a
        // restored context) cannot shorten the visit below one minute, and
        // cannot stretch it past the wall clock either — hence the clamp.
        let active: Int
        if let lastCapture = ordered.last?.createdAt {
            let worked = Int((lastCapture.timeIntervalSince(startedAt) / 60).rounded())
            active = min(elapsed, max(1, worked))
        } else {
            active = elapsed
        }

        return VisitReviewSummary(
            photoCount: photos,
            noteCount: notes,
            unplacedCount: ordered.filter { !$0.isPlaced }.count,
            rooms: rooms,
            elapsedMinutes: elapsed,
            activeMinutes: active)
    }

    /// Honest and non-blocking: Done always works, and says what is waiting.
    public static func doneCaption(unplacedCount: Int) -> String? {
        guard unplacedCount > 0 else { return nil }
        return unplacedCount == 1
            ? "1 capture still unplaced — it'll wait on Today."
            : "\(unplacedCount) captures still unplaced — they'll wait on Today."
    }

    /// `summarize` can never hand this a zero, but the function is `public` and
    /// "Log 0m as a site visit" is an offer that cannot be honoured — the same
    /// CHECK (duration_minutes > 0) floor, applied to the words as well.
    public static func timeOffer(minutes: Int) -> String {
        let minutes = max(1, minutes)
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

    /// HT-16's stepper, as a value. The floor is the CHECK's own
    /// (duration_minutes > 0); the ceiling is the visit's wall clock, because a
    /// close may correct DOWN from what the clock says and may never invent
    /// time the visit did not span. `elapsedMinutes` is therefore both the
    /// bound and the only value that needs no defence.
    public static func steppedMinutes(_ minutes: Int, by delta: Int,
                                      elapsedMinutes: Int) -> Int {
        let ceiling = max(1, elapsedMinutes)
        return min(ceiling, max(1, minutes + delta))
    }

    /// The step a thumb takes. A quarter hour is what a studio bills in and
    /// what keeps a correction to taps.
    public static let stepMinutes = 15

    /// Whether the Hours offer is still tappable, given the standing close
    /// record's state (nil = no record).
    ///
    /// `.disabled(closeState != nil)` killed the button the instant ANY record
    /// existed — including one waiting out a backoff, which is the state a
    /// designer with no signal is in at the moment she taps. The three states
    /// the record's own `isDue` will hand back to the drainer are the three
    /// that keep the offer live; `.writing` is in flight, and `.written`,
    /// `.refused` and `.unwritable` are done for good — nothing a second tap
    /// can change.
    public static func timeOfferEnabled(closeState: FieldWriteState?) -> Bool {
        switch closeState {
        case .none, .pending, .failed:
            return true
        case .writing, .written, .refused, .unwritable:
            return false
        }
    }

    /// The account a close may be minted against, or nil — in which case the
    /// Hours offer must not be shown at all.
    ///
    /// TWO conditions, because two different things read the close. The row
    /// needs a uuid for `project_time_entries.user_id`, which is NOT NULL. The
    /// DRAINER needs a whole `CaptureOwnerIdentity` to scope its fetch, and a
    /// missing workspace resolves `.unavailable` — so gating on the user id
    /// alone minted a record the drainer could never select, and the offer sat
    /// on "Logging these hours." for good.
    public static func closeOwnerUserID(
        runsRealServices: Bool,
        userID: String?,
        workspaceID: String?
    ) -> UUID? {
        guard CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: runsRealServices,
            userID: userID,
            workspaceID: workspaceID) != .unavailable
        else { return nil }
        return userID
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .flatMap(UUID.init(uuidString:))
    }
}

public extension VisitReviewRow {
    /// "Filed" is project_id IS NOT NULL (§9.2) — there is deliberately no
    /// terminal field_captures.status for it, because introducing one would
    /// silently revoke studio read (field_captures_org_inbox_select keys on
    /// status='inbox', 00233:175-186).
    init(specimen: Piece) {
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
