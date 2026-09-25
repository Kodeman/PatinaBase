//
//  SharedDirectionTestSupport.swift
//  PatinaTests
//
//  W1A-10 · CONTRACT-C. The fake server behind `SharedDirectionStore`'s
//  suites: the typed edition RPCs (NI-05) and the attachment signer (NI-06)
//  answered from an in-memory table, every call recorded, and any call held
//  until the test releases it — so each race in §C.5.2 is driven step by step
//  instead of by timing.
//

import CryptoKit
import Foundation
import SwiftData
@testable import Patina

/// One edition as the fake server holds it. The review keys are
/// `get_project_decision_reviews`' own (the same set `ProjectApprovalFixture`
/// decodes); anything a test does not set is a pending edition awaiting the
/// lead, with no attachments.
struct FakeEdition {
    var status = "ok"
    var projectId = "b0000000-0000-0000-0000-0000000000b1"
    var lifecycleStatus = "pending"
    var outcome: Any = NSNull()
    var disposition = "active"
    var completed = 1
    var required = 1
    var authorityRevision: Any = 3
    var sentAt: Any = "2026-09-02T00:00:00+00:00"
    var respondedAt: Any = NSNull()
    var viewerRole: Any = NSNull()
    var successorDecisionId: Any = NSNull()
    /// One plan sheet per entry, of that many bytes. Empty: no attachments.
    var sheetSizes: [Int] = []

    static func responded(at respondedAt: String = "2026-09-05T09:00:00+00:00") -> FakeEdition {
        FakeEdition(lifecycleStatus: "responded", outcome: "approved", respondedAt: respondedAt)
    }
}

enum DirectionFixture {
    static let accountA = "a1111111-1111-4111-8111-111111111111"
    static let accountB = "b2222222-2222-4222-8222-222222222222"
    static let noon = "2026-09-24T12:00:00+00:00"

    /// A UUID-shaped decision id, distinct per `index`.
    static func decisionId(_ index: Int) -> String {
        String(format: "e0000000-0000-4000-8000-%012d", index)
    }

    static func date(_ iso: String) -> Date {
        ISO8601DateParsing.date(from: iso) ?? .distantPast
    }

    static func attachmentId(_ decisionId: String, _ sheet: Int) -> String {
        "\(decisionId)-s\(sheet)"
    }

    static func bytes(_ decisionId: String, _ sheet: Int, size: Int) -> Data {
        let seed = decisionId.utf8.reduce(sheet) { $0 &+ Int($1) }
        return Data(repeating: UInt8(seed & 0x7f), count: size)
    }

    static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    static func review(_ decisionId: String, _ edition: FakeEdition) -> [String: Any] {
        [
            "decisionId": decisionId, "projectId": edition.projectId,
            "phaseId": "c0000000-0000-0000-0000-0000000000c1", "sectionKey": NSNull(),
            "authorityRevision": edition.authorityRevision, "artifactKind": "plan_issue",
            "artifactId": "d0000000-0000-0000-0000-0000000000d1", "artifactVersion": 3,
            "artifactChecksum": String(repeating: "a", count: 64),
            "artifactTitle": "Kitchen plans", "question": "Approve the kitchen plans?",
            "context": NSNull(), "why": NSNull(), "whyAuthorName": NSNull(),
            "dueAt": "2026-09-11T00:00:00+00:00", "costCentsDelta": 0,
            "scheduleDaysDelta": 0, "leadTimeDaysDelta": 0,
            "lifecycleStatus": edition.lifecycleStatus, "outcome": edition.outcome,
            "disposition": edition.disposition, "isOverdue": false,
            "completedReviewCount": edition.completed, "requiredReviewCount": edition.required,
            "predecessorDecisionId": NSNull(), "successorDecisionId": edition.successorDecisionId,
            "createdAt": "2026-09-01T00:00:00+00:00", "sentAt": edition.sentAt,
            "respondedAt": edition.respondedAt, "updatedAt": "2026-09-04T10:15:00+00:00",
            "viewerRole": edition.viewerRole
        ]
    }

    static func manifest(_ decisionId: String, _ edition: FakeEdition) -> [[String: Any]] {
        edition.sheetSizes.enumerated().map { index, size in
            [
                "attachmentId": attachmentId(decisionId, index), "kind": "plan_sheet",
                "position": index + 1, "label": "A-10\(index)",
                "sha256": sha256(bytes(decisionId, index, size: size)),
                "sizeBytes": size, "contentType": "application/pdf"
            ]
        }
    }

    /// One edition object of the envelope (§C.5): `review`, `attachments` and
    /// `editionFigures` are non-null only on `ok`.
    static func item(_ decisionId: String, _ edition: FakeEdition) -> [String: Any] {
        guard edition.status == "ok" else {
            return [
                "decisionId": decisionId, "status": edition.status,
                "review": NSNull(), "attachments": NSNull(), "editionFigures": NSNull()
            ]
        }
        return [
            "decisionId": decisionId, "status": "ok", "review": review(decisionId, edition),
            "attachments": manifest(decisionId, edition), "editionFigures": NSNull()
        ]
    }

    static func envelope(servedAt: String, items: [[String: Any]]) -> Data {
        json(["contract": "shared_direction_v1", "servedAt": servedAt, "editions": items])
    }

    static func single(servedAt: String, item: [String: Any]) -> Data {
        var object = item
        object["contract"] = "shared_direction_v1"
        object["servedAt"] = servedAt
        return json(object)
    }

    static func json(_ object: Any) -> Data {
        (try? JSONSerialization.data(withJSONObject: object)) ?? Data()
    }
}

/// NI-05 and NI-06, answered from `editions`. A held call waits until the
/// test releases it; everything else answers at once.
@MainActor
final class FakeDirectionClient: SharedDirectionClient {
    var editions: [String: FakeEdition] = [:]
    var servedAt = DirectionFixture.noon

    private(set) var batchCalls: [[String]] = []
    private(set) var singleCalls: [String] = []
    private(set) var attachmentCalls: [String] = []
    private(set) var downloadCalls: [String] = []

    /// Replaces the table's answer for every batch call while set.
    var batchOverride: (() throws -> Data)?
    var singleOverride: (() throws -> Data)?
    /// Per edition, answered in order before the table's `200`.
    var attachmentScript: [String: [(status: Int, body: Data)]] = [:]

    var holdNextBatches = 0
    var holdDownloads = false
    private var heldBatches: [CheckedContinuation<Data, Error>] = []
    private var heldDownloads: [CheckedContinuation<Void, Error>] = []

    var heldBatchCount: Int { heldBatches.count }
    var heldDownloadCount: Int { heldDownloads.count }

    func answer(_ held: [SharedDirectionHeldProof]) -> Data {
        DirectionFixture.envelope(servedAt: servedAt, items: held.map { proof in
            DirectionFixture.item(proof.decisionId, editions[proof.decisionId] ?? FakeEdition(status: "not_found"))
        })
    }

    /// Releases the oldest held batch with `data`.
    func releaseBatch(with data: Data) {
        heldBatches.removeFirst().resume(returning: data)
    }

    func releaseDownloads() {
        let held = heldDownloads
        heldDownloads = []
        for continuation in held { continuation.resume() }
    }

    // MARK: - SharedDirectionClient
    //
    // The protocol is nonisolated, so its witnesses are too; each hops onto
    // the main actor, where the table and the held calls live.

    nonisolated func projectDecisionEditions(held: [SharedDirectionHeldProof]) async throws -> Data {
        try await batch(held)
    }

    nonisolated func projectDecisionEdition(_ held: SharedDirectionHeldProof) async throws -> Data {
        try await single(held)
    }

    nonisolated func projectApprovalAttachments(decisionId: String) async throws -> (status: Int, body: Data) {
        await attachments(decisionId)
    }

    nonisolated func downloadAttachment(from url: URL, to destination: URL) async throws {
        try await download(url, to: destination)
    }

    nonisolated func confirmProjectApprovalReview(
        decisionId: String, authorityRevision: Int, artifactChecksum: String, idempotencyKey: String
    ) async throws {}

    nonisolated func respondToProjectApproval(
        decisionId: String, outcome: ProjectApprovalOutcome, clientSignature: String,
        expectedUpdatedAt: String, idempotencyKey: String
    ) async throws {}

    // MARK: - The answers, on the main actor

    private func batch(_ held: [SharedDirectionHeldProof]) async throws -> Data {
        batchCalls.append(held.map(\.decisionId))
        if holdNextBatches > 0 {
            holdNextBatches -= 1
            return try await withCheckedThrowingContinuation { heldBatches.append($0) }
        }
        if let batchOverride { return try batchOverride() }
        return answer(held)
    }

    private func single(_ held: SharedDirectionHeldProof) async throws -> Data {
        singleCalls.append(held.decisionId)
        if let singleOverride { return try singleOverride() }
        let edition = editions[held.decisionId] ?? FakeEdition(status: "not_found")
        return DirectionFixture.single(servedAt: servedAt, item: DirectionFixture.item(held.decisionId, edition))
    }

    private func attachments(_ decisionId: String) async -> (status: Int, body: Data) {
        attachmentCalls.append(decisionId)
        if var script = attachmentScript[decisionId], !script.isEmpty {
            let next = script.removeFirst()
            attachmentScript[decisionId] = script
            return next
        }
        let urls = (editions[decisionId]?.sheetSizes ?? []).enumerated().map { index, size in
            [
                "attachmentId": DirectionFixture.attachmentId(decisionId, index),
                "signedUrl": "https://files.test/\(decisionId)/\(index)/\(size)",
                "sizeBytes": size
            ] as [String: Any]
        }
        return (200, DirectionFixture.json(["urls": urls]))
    }

    private func download(_ url: URL, to destination: URL) async throws {
        downloadCalls.append(url.path)
        if holdDownloads {
            try await withCheckedThrowingContinuation { heldDownloads.append($0) }
        }
        let parts = url.pathComponents.suffix(3)
        guard parts.count == 3, let sheet = Int(parts[parts.startIndex + 1]),
              let size = Int(parts[parts.startIndex + 2]) else {
            throw SharedDirectionDownloadError(status: 404)
        }
        try DirectionFixture.bytes(parts[parts.startIndex], sheet, size: size).write(to: destination)
    }
}

/// A clock the test moves by hand (§C.7).
final class ManualClock: @unchecked Sendable {
    private let lock = NSLock()
    private var instant = ContinuousClock.now

    var now: ContinuousClock.Instant {
        lock.lock()
        defer { lock.unlock() }
        return instant
    }

    func advance(_ duration: Duration) {
        lock.lock()
        instant = instant.advanced(by: duration)
        lock.unlock()
    }
}

/// A store over an in-memory container and a temporary file root.
@MainActor
final class DirectionHarness {
    let client = FakeDirectionClient()
    let clock = ManualClock()
    let context: ModelContext
    let root: URL
    var account: String? = DirectionFixture.accountA
    private(set) var telemetry: [String] = []
    private(set) var waits: [Duration] = []
    var holdWaits = false
    private var heldWaits: [CheckedContinuation<Void, Error>] = []
    /// While true, every authority request is past its deadline.
    var deadlinesPassed = false
    private(set) var store: SharedDirectionStore!

    var heldWaitCount: Int { heldWaits.count }

    /// `limits` defaults to the contract's own.
    init(limits: SharedDirectionLimits? = nil) throws {
        let schema = Schema(versionedSchema: PatinaSchemaV2.self)
        let container = try ModelContainer(
            for: schema, configurations: [ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)]
        )
        context = ModelContext(container)
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("SharedDirectionTests-\(UUID().uuidString)", isDirectory: true)
        // Weak throughout: a task the store started (a deadline, a follow-up)
        // can still run after the test that owned this harness has returned.
        let clock = self.clock
        let context = self.context
        let environment = SharedDirectionStore.Environment(
            client: client,
            context: { context },
            root: root,
            account: { [weak self] in self?.account },
            limits: limits ?? .contract,
            retryWait: { [weak self] duration in
                guard let self else { throw CancellationError() }
                try await self.wait(duration)
            },
            deadline: { [weak self] in
                guard let self else { throw CancellationError() }
                try await self.deadline()
            },
            now: { clock.now },
            telemetry: { [weak self] name, _ in self?.telemetry.append(name) }
        )
        store = SharedDirectionStore(environment: environment)
    }

    func cleanUp() {
        try? FileManager.default.removeItem(at: root)
    }

    func releaseWaits() {
        let held = heldWaits
        heldWaits = []
        for continuation in held { continuation.resume() }
    }

    private func wait(_ duration: Duration) async throws {
        waits.append(duration)
        if holdWaits { try await withCheckedThrowingContinuation { heldWaits.append($0) } }
    }

    private func deadline() async throws {
        while !deadlinesPassed { try await Task.sleep(for: .milliseconds(2)) }
    }

    // MARK: - Reading the result

    /// Every cached row, whatever account it is under.
    func allRows() -> [CachedDirectionEdition] {
        (try? context.fetch(FetchDescriptor<CachedDirectionEdition>())) ?? []
    }

    func editionDirectory(_ decisionId: String, account: String = DirectionFixture.accountA) -> URL {
        SharedDirectionFiles.editionDirectory(root: root, account: account, decisionId: decisionId)
    }

    func filesOnDisk(_ decisionId: String, account: String = DirectionFixture.accountA) -> [String] {
        let path = editionDirectory(decisionId, account: account).path
        return ((try? FileManager.default.contentsOfDirectory(atPath: path)) ?? []).sorted()
    }

    /// Every regular file under the root, staging included.
    func everyFile() -> [String] {
        guard let walker = FileManager.default.enumerator(atPath: root.path) else { return [] }
        return walker.compactMap { $0 as? String }.filter { path in
            var isDirectory: ObjCBool = false
            FileManager.default.fileExists(
                atPath: root.appendingPathComponent(path).path, isDirectory: &isDirectory
            )
            return !isDirectory.boolValue
        }.sorted()
    }

    /// Refreshes, then waits for every file fetch it started.
    func refreshAndSettle(_ discovered: [RemoteProjectApprovalReview] = []) async {
        await store.refresh(discovered: discovered)
        await settle()
    }

    func settle() async {
        for _ in 0..<50 {
            let pending = allRows().compactMap { store.pendingFileFetch($0.decisionId) }
            if pending.isEmpty { return }
            for task in pending { await task.value }
        }
    }

    /// A review as `list_my_project_decision_reviews` would discover it.
    func discovered(_ decisionId: String) -> RemoteProjectApprovalReview? {
        let edition = client.editions[decisionId] ?? FakeEdition()
        let data = DirectionFixture.json(DirectionFixture.review(decisionId, edition))
        return try? JSONDecoder().decode(RemoteProjectApprovalReview.self, from: data)
    }
}

/// Polls on the main actor until `condition` holds, for at most `timeout`.
@MainActor
func eventually(timeout: Duration = .seconds(5), _ condition: () -> Bool) async -> Bool {
    let end = ContinuousClock.now.advanced(by: timeout)
    while !condition() {
        if ContinuousClock.now > end { return false }
        try? await Task.sleep(for: .milliseconds(2))
    }
    return true
}
