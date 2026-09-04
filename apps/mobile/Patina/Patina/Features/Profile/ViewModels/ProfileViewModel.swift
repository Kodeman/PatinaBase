//
//  ProfileViewModel.swift
//  Patina
//
//  Manages profile data from SwiftData and app settings
//

import SwiftUI
import SwiftData
import Supabase

/// The signed-in client's name and monogram, resolved from the live auth /
/// profile services. Shared by the Profile header and the Daily Room
/// greeting monogram so the two can never disagree — and so neither can
/// greet a stranger by the developer's name (U01).
enum UserIdentity {

    /// Best available human name: the profile row, then the auth user's
    /// metadata, then the email's local part. Guests are "Guest"; a signed-in
    /// user we can't name yet is "You" — never a placeholder person.
    static var displayName: String {
        guard AuthService.shared.isAuthenticated else { return "Guest" }
        let candidates: [String?] = [
            ProfileService.shared.displayName,
            AuthService.shared.currentUser?.userMetadata["display_name"]?.stringValue,
            AuthService.shared.currentUser?.email
        ]
        for candidate in candidates {
            let trimmed = candidate?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !trimmed.isEmpty else { continue }
            // Any candidate can arrive email-shaped — `ProfileService`'s own
            // fallback ends at the email address — and a greeting wants the
            // local part, never the full address.
            return localPart(of: trimmed)
        }
        return "You"
    }

    /// Single uppercase initial for the avatar / greeting monogram.
    static var initial: String {
        String(displayName.prefix(1)).uppercased()
    }

    private static func localPart(of value: String) -> String {
        guard let at = value.firstIndex(of: "@") else { return value }
        return String(value[value.startIndex..<at])
    }
}

@Observable
final class ProfileViewModel {

    // MARK: - State

    /// The context `loadData(context:)` was handed, kept so the reads below
    /// can re-run when the store changes under them.
    @ObservationIgnored private var context: ModelContext?
    /// The revision `rooms` was last computed at, so a body that reads
    /// `rooms`, `roomCount` and the rail does one fetch rather than four.
    @ObservationIgnored private var cachedRevision: Int = -1
    @ObservationIgnored private var cachedRooms: [RoomModel] = []

    @ObservationIgnored private var cachedItemRevision: Int = -1
    @ObservationIgnored private var cachedItemCount: Int = 0
    @ObservationIgnored private var cachedStyleRevision: Int = -1
    @ObservationIgnored private var cachedStyleProfile: StylePreferenceModel?

    /// Bumped by `loadData(context:)`, and deliberately NOT
    /// `@ObservationIgnored`.
    ///
    /// The derived reads below all return their empty value while `context`
    /// is still nil, which it is on the first body pass — `onAppear` has not
    /// run yet. Nothing they read changes when the context finally arrives,
    /// so without an observable write here the body never runs again and the
    /// screen keeps the empty answer: sim-observed as "Style Explorer" over a
    /// store holding `["Warm Modern", …]`. Every derived read below touches
    /// this so that write re-runs the body.
    private(set) var contextRevision = 0

    /// GAP3-18/B-15's gate. Injectable so a test can read these without
    /// constructing `AuthService.shared` — the same stall `RoomStore` had to
    /// stop paying for (RL1B-01).
    @ObservationIgnored
    var accountRowsAreVisible: () -> Bool = { LocalStoreOwnership.accountRowsAreVisible }

    /// GAP3-18/B-15's gate, derived rather than snapshotted — see `rooms`.
    /// A stored count taken in one `loadData` stayed at `0` for the whole of
    /// a window `rooms` recovered from on the next signal bump.
    var savedItemCount: Int {
        let revision = LocalRoomSignal.shared.revision &+ contextRevision
        guard let context, accountRowsAreVisible() else { return 0 }
        if revision != cachedItemRevision {
            cachedItemCount = (try? context.fetchCount(FetchDescriptor<TableItemModel>())) ?? 0
            cachedItemRevision = revision
        }
        return cachedItemCount
    }

    /// The taste portrait is the account's, and a guest left behind by a
    /// sign-out is not it (B-15).
    var styleProfile: StylePreferenceModel? {
        let revision = LocalRoomSignal.shared.revision &+ contextRevision
        guard let context, accountRowsAreVisible() else { return nil }
        if revision != cachedStyleRevision {
            let descriptor = FetchDescriptor<StylePreferenceModel>(
                sortBy: [SortDescriptor(\.updatedAt, order: .reverse)]
            )
            cachedStyleProfile = (try? context.fetch(descriptor))?.first
            cachedStyleRevision = revision
        }
        return cachedStyleProfile
    }

    /// B-03: this was a stored snapshot taken in `loadData(context:)`, which
    /// ProfileView calls from one `onAppear`. Deleting a room two screens away
    /// changed the store and left the snapshot describing a room that no
    /// longer exists — Studio kept reporting "2 ROOMS" and kept rendering the
    /// deleted card. Reading `LocalRoomSignal.revision` here is what makes the
    /// next body pass refetch.
    ///
    /// GAP3-18: the fetch runs through `RoomStore`, so the guest left behind
    /// by a sign-out no longer reads the account's rooms.
    var rooms: [RoomModel] {
        let revision = LocalRoomSignal.shared.revision &+ contextRevision
        guard let context else { return [] }
        if revision != cachedRevision {
            cachedRooms = RoomStore(context: context).allRooms()
            cachedRevision = revision
        }
        return cachedRooms
    }

    var roomCount: Int { rooms.count }

    // MARK: - Computed

    var userName: String {
        UserIdentity.displayName
    }

    var userInitial: String {
        UserIdentity.initial
    }

    /// Shared formatter for the "member since" date — mirrors
    /// `AccountView.memberSinceFormatter` so the two surfaces render the same
    /// date the same way. `static let` so it's allocated once (PT-6-5).
    private static let memberSinceFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return formatter
    }()

    /// The account's real creation date, or nil for guests (no session — so
    /// there is no membership to date). Callers hide the line when nil.
    var memberSince: String? {
        guard let createdAt = AuthService.shared.currentUser?.createdAt else { return nil }
        return Self.memberSinceFormatter.string(from: createdAt)
    }

    var styleBadge: String {
        styleProfile?.keywords.first?.capitalized ?? "Style Explorer"
    }

    var matchPercentage: String {
        if let confidence = styleProfile?.confidence, confidence > 0 {
            return "\(Int(confidence * 100))%"
        }
        return "—"
    }

    // MARK: - Loading

    func loadData(context: ModelContext) {
        self.context = context
        // Force the three reads to refetch on the next pass: an appear is a
        // reason to look again even where nothing local changed.
        cachedRevision = -1
        cachedItemRevision = -1
        cachedStyleRevision = -1
        // …and make sure there IS a next pass. See `contextRevision`.
        contextRevision &+= 1
    }
}
