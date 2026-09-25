//
//  SharedDirectionWire.swift
//  Patina
//
//  W1A-10 · CONTRACT-C §C.5 and §C.3.2. What the typed edition RPCs (NI-05)
//  and the attachment signer (NI-06) answer, read under one rule: only a
//  DECODED `shared_direction_v1` envelope may drive a purge. A transport
//  failure, a non-2xx, a null body, malformed JSON, an unknown contract tag or
//  a missing `servedAt` or `editions` array all come out of here as `nil` —
//  `indeterminate` — and an indeterminate answer never deletes anything.
//  Inside a decoded envelope each edition stands alone: one with an unknown
//  status or an item that does not decode is left out, so it is indeterminate
//  for that edition only and never purges, while its neighbours' answers
//  still land (SQ-247 F5).
//
//  Built against the contract's wire shapes; NI-05 and NI-06 ship with this
//  build (00670 deploys only in the same distribution).
//

import Foundation

/// The four typed answers (§C.5). `unauthorized` means "no session", never
/// "never had authority" — that is `not_found`.
enum SharedDirectionStatus: String, Sendable {
    case ok
    case revoked
    case notFound = "not_found"
    case unauthorized
}

/// One manifest entry (§C.3). `label` is advisory and not read here;
/// `sizeBytes` and `contentType` are advisory for the key but checked before
/// a download is admitted.
struct SharedDirectionManifestEntry: Sendable, Equatable {
    static let kinds: Set<String> = ["spec_book_pdf", "plan_sheet"]
    static let contentTypes: Set<String> = ["application/pdf", "image/png", "image/jpeg"]

    let attachmentId: String
    let kind: String
    let position: Int
    let sha256: String
    let sizeBytes: Int?
    let contentType: String?
}

/// One edition's typed answer.
struct SharedDirectionAnswer: Sendable {
    let decisionId: String
    let status: SharedDirectionStatus
    /// Present only on `ok`.
    let review: RemoteProjectApprovalReview?
    /// The review item re-serialized from what was served, every key kept.
    let reviewJSON: Data?
    let attachmentsJSON: Data?
    /// Nil on `ok` when the server withheld the manifest (§C.3.3).
    let manifest: [SharedDirectionManifestEntry]?
    let editionFiguresJSON: Data?
    /// `superseded` names the edition that took this one's place (§C.5).
    let successorDecisionId: String?
}

/// A decoded envelope. Its `servedAt` is the server's clock (§C.7).
struct SharedDirectionEnvelope: Sendable {
    let servedAt: Date
    let answers: [SharedDirectionAnswer]
}

/// One signed URL from NI-06 (§C.3.2 step 5).
struct SharedDirectionSignedFile: Sendable, Equatable {
    let attachmentId: String
    let url: URL
    let sizeBytes: Int
}

/// What NI-06 said. It never drives a purge (§C.5): a non-2xx only marks this
/// fetch unavailable and schedules an RPC refresh.
enum SharedDirectionAttachmentAnswer: Sendable, Equatable {
    case signed([SharedDirectionSignedFile])
    case materializing(retryAfterSeconds: Int?)
    case unavailable
}

enum SharedDirectionWire {

    static let contract = "shared_direction_v1"

    /// `get_project_decision_editions`' batch envelope, or nil when the
    /// envelope itself is not the contract's. An item that does not decode is
    /// left out, and so is every other answer naming the same edition: the
    /// edition gets no answer — indeterminate — and cannot be purged by it.
    static func envelope(from data: Data) -> SharedDirectionEnvelope? {
        guard let root = object(data), root["contract"] as? String == contract,
              let servedAt = date(root["servedAt"]),
              let items = root["editions"] as? [Any] else { return nil }
        var answers: [SharedDirectionAnswer] = []
        var undecodable: Set<String> = []
        for item in items {
            let object = item as? [String: Any]
            if let object, let answer = answer(from: object) {
                answers.append(answer)
            } else if let decisionId = object?["decisionId"] as? String {
                undecodable.insert(decisionId)
            }
        }
        return SharedDirectionEnvelope(
            servedAt: servedAt,
            answers: answers.filter { !undecodable.contains($0.decisionId) }
        )
    }

    /// `get_project_decision_edition`'s single envelope — one edition object
    /// with `contract` and `servedAt` copied onto it — or nil.
    static func singleEdition(from data: Data) -> SharedDirectionEnvelope? {
        guard let root = object(data), root["contract"] as? String == contract,
              let servedAt = date(root["servedAt"]),
              let answer = answer(from: root) else { return nil }
        return SharedDirectionEnvelope(servedAt: servedAt, answers: [answer])
    }

    /// The manifest as stored, ordered by `position`.
    static func manifest(from data: Data) -> [SharedDirectionManifestEntry]? {
        guard let items = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]] else {
            return nil
        }
        var entries: [SharedDirectionManifestEntry] = []
        for item in items {
            guard let attachmentId = item["attachmentId"] as? String,
                  SharedDirectionFiles.isSafeComponent(attachmentId),
                  let kind = item["kind"] as? String,
                  SharedDirectionManifestEntry.kinds.contains(kind),
                  let position = item["position"] as? Int,
                  let sha256 = item["sha256"] as? String, isSHA256(sha256) else { return nil }
            entries.append(SharedDirectionManifestEntry(
                attachmentId: attachmentId, kind: kind, position: position,
                sha256: sha256.lowercased(),
                sizeBytes: item["sizeBytes"] as? Int,
                contentType: item["contentType"] as? String
            ))
        }
        return entries.sorted { $0.position < $1.position }
    }

    /// The ordered `(attachmentId, sha256)` list (§C.2). `label`, `sizeBytes`
    /// and `contentType` do not change it.
    static func manifestKey(_ manifest: [SharedDirectionManifestEntry]) -> String {
        manifest.map { "\($0.attachmentId):\($0.sha256)" }.joined(separator: "|")
    }

    /// The attachment ids a `manifestKey` names, in order.
    static func attachmentIds(inManifestKey key: String) -> [String] {
        key.split(separator: "|").compactMap { entry in
            entry.split(separator: ":", maxSplits: 1).first.map(String.init)
        }
    }

    /// NI-06's answer (§C.3.2). Anything that is not an exact 200 or 202 shape
    /// is `unavailable`.
    static func attachmentAnswer(status: Int, body: Data) -> SharedDirectionAttachmentAnswer {
        guard let root = object(body) else { return .unavailable }
        switch status {
        case 200:
            guard let urls = root["urls"] as? [[String: Any]] else { return .unavailable }
            var files: [SharedDirectionSignedFile] = []
            for item in urls {
                guard let attachmentId = item["attachmentId"] as? String,
                      let signed = item["signedUrl"] as? String, !signed.isEmpty,
                      let url = URL(string: signed), url.scheme?.hasPrefix("http") == true,
                      let size = item["sizeBytes"] as? Int, size >= 0 else { return .unavailable }
                files.append(SharedDirectionSignedFile(attachmentId: attachmentId, url: url, sizeBytes: size))
            }
            return .signed(files)
        case 202:
            guard root["status"] as? String == "materializing" else { return .unavailable }
            return .materializing(retryAfterSeconds: root["retryAfterSeconds"] as? Int)
        default:
            return .unavailable
        }
    }

    // MARK: - Pieces

    private static func object(_ data: Data) -> [String: Any]? {
        (try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])) as? [String: Any]
    }

    private static func date(_ value: Any?) -> Date? {
        (value as? String).flatMap(ISO8601DateParsing.date(from:))
    }

    private static func isSHA256(_ value: String) -> Bool {
        value.count == 64 && value.allSatisfy(\.isHexDigit)
    }

    /// One edition object, or nil for an unknown `status` or an `ok` whose
    /// review or manifest does not decode as this edition. The batch envelope
    /// leaves a nil out; the single envelope is nil with it.
    private static func answer(from item: [String: Any]) -> SharedDirectionAnswer? {
        guard let decisionId = item["decisionId"] as? String, !decisionId.isEmpty,
              let raw = item["status"] as? String,
              let status = SharedDirectionStatus(rawValue: raw) else { return nil }
        guard status == .ok else {
            return SharedDirectionAnswer(
                decisionId: decisionId, status: status, review: nil, reviewJSON: nil,
                attachmentsJSON: nil, manifest: nil, editionFiguresJSON: nil,
                successorDecisionId: nil
            )
        }
        guard let reviewObject = item["review"] as? [String: Any],
              let reviewJSON = try? JSONSerialization.data(withJSONObject: reviewObject),
              let review = try? JSONDecoder().decode(RemoteProjectApprovalReview.self, from: reviewJSON),
              review.decisionId == decisionId else { return nil }
        var attachmentsJSON: Data?
        var manifest: [SharedDirectionManifestEntry]?
        if let attachments = item["attachments"] as? [Any] {
            guard let data = try? JSONSerialization.data(withJSONObject: attachments),
                  let entries = Self.manifest(from: data) else { return nil }
            attachmentsJSON = data
            manifest = entries
        }
        let figures = (item["editionFigures"] as? [String: Any])
            .flatMap { try? JSONSerialization.data(withJSONObject: $0) }
        return SharedDirectionAnswer(
            decisionId: decisionId, status: .ok, review: review, reviewJSON: reviewJSON,
            attachmentsJSON: attachmentsJSON, manifest: manifest, editionFiguresJSON: figures,
            successorDecisionId: reviewObject["successorDecisionId"] as? String
        )
    }
}
