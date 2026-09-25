//
//  CachedDirectionEdition.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.2. The offline shared direction: one approval
//  edition as this account last read it, plus the state of its verified files.
//
//  The server identity is `(decisionId, authorityRevision, artifactChecksum)`,
//  all three from immutable rows, so a new direction is a new decision and the
//  row never needs a history. The device identity adds the account that
//  fetched it, and nothing here is ever read for another account.
//

import Foundation
import SwiftData

/// The verified local file set of one edition, tracked apart from the manifest
/// (§C.2, §C.5.1) so a first download cut off by a timeout, or an evicted set,
/// is fetched again on the next good answer even though the manifest is the
/// same.
enum SharedDirectionAvailability: String, Sendable {
    /// Every manifest file is on disk and verified.
    case complete
    /// A fetch failed part-way. Nothing of it was committed.
    case incomplete
    /// No verified file is on disk: never fetched, or evicted.
    case none
    /// The files did not fit under the ceiling and nothing could be evicted
    /// for them (§C.3.3 step 4). The record stays; the screen needs a
    /// connection for the document.
    case noSpace
}

@Model
final class CachedDirectionEdition {
    #Unique<CachedDirectionEdition>([\.accountId, \.decisionId])

    /// The Supabase user id that read this edition (§C.2 device identity).
    var accountId: String
    /// `editionId = decisionId` (§C.2): the snapshot is 1:1 with the decision.
    var decisionId: String
    /// Groups the refresh into per-project chunks (§C.5.1).
    var projectId: String
    /// The held proof (§C.5): what `get_project_decision_editions` compares.
    var authorityRevision: Int?
    var artifactChecksum: String
    /// The `get_project_decision_reviews` item as served. No new fields, no
    /// renames (§C.2 part 1).
    var reviewJSON: Data
    /// The manifest as served. Nil when the server withheld it — a plan set
    /// whose checksum did not reproduce (§C.3.3) — and then no file is fetched.
    var attachmentsJSON: Data?
    /// A budget edition's frozen totals, inline (A3). Nil for the other kinds.
    var editionFiguresJSON: Data?
    /// Server time of the last `ok` (§C.7). The device never ages a record by
    /// its own wall clock.
    var servedAt: Date
    /// The ordered `attachmentId:sha256` pairs of the manifest (§C.2).
    var manifestKey: String?
    /// The manifest key of the verified files on disk, nil when there are none.
    /// A set whose key trails `manifestKey` is kept and served until its
    /// replacement commits (§C.5.1).
    var filesManifestKey: String?
    var availabilityRaw: String
    /// What an `incomplete` fetch did not deliver.
    var missingAttachmentIds: [String]
    /// Bytes of the verified set on disk; counted against the ceiling.
    var committedBytes: Int

    init(
        accountId: String,
        decisionId: String,
        projectId: String,
        authorityRevision: Int?,
        artifactChecksum: String,
        reviewJSON: Data,
        attachmentsJSON: Data?,
        editionFiguresJSON: Data?,
        servedAt: Date,
        manifestKey: String?
    ) {
        self.accountId = accountId
        self.decisionId = decisionId
        self.projectId = projectId
        self.authorityRevision = authorityRevision
        self.artifactChecksum = artifactChecksum
        self.reviewJSON = reviewJSON
        self.attachmentsJSON = attachmentsJSON
        self.editionFiguresJSON = editionFiguresJSON
        self.servedAt = servedAt
        self.manifestKey = manifestKey
        self.filesManifestKey = nil
        self.availabilityRaw = SharedDirectionAvailability.none.rawValue
        self.missingAttachmentIds = []
        self.committedBytes = 0
    }

    var availability: SharedDirectionAvailability {
        get { SharedDirectionAvailability(rawValue: availabilityRaw) ?? .none }
        set { availabilityRaw = newValue.rawValue }
    }

    /// The record as the screens read it.
    var review: RemoteProjectApprovalReview? {
        try? JSONDecoder().decode(RemoteProjectApprovalReview.self, from: reviewJSON)
    }

    /// The manifest, or nil when the server withheld it.
    var manifest: [SharedDirectionManifestEntry]? {
        attachmentsJSON.flatMap(SharedDirectionWire.manifest(from:))
    }
}
