//
//  SharedDirectionRaceTests.swift
//  PatinaTests
//
//  W1A-10 · CONTRACT-C §C.5.2, the six deterministic tests. A fake client
//  holds each answer until the test releases it, so every interleaving below
//  is the one named, not the one the scheduler happened to pick. The property
//  under test throughout: a stale result neither writes nor deletes.
//

import Foundation
import SwiftData
import Testing
@testable import Patina

@MainActor
struct SharedDirectionRaceTests {

    private let edition = DirectionFixture.decisionId(1)

    /// E answered `ok` with one sheet, its download held in the air.
    private func downloadHeld(_ harness: DirectionHarness) async throws {
        harness.client.editions[edition] = FakeEdition(sheetSizes: [64])
        harness.client.holdDownloads = true
        await harness.store.refresh(discovered: [try #require(harness.discovered(edition))])
        #expect(await eventually { harness.client.heldDownloadCount == 1 })
        #expect(harness.store.cachedEdition(decisionId: edition) != nil)
    }

    /// Lets the held download land, then waits for its task to finish.
    private func releaseDownload(_ harness: DirectionHarness, _ fetch: Task<Void, Never>?) async {
        harness.client.releaseDownloads()
        await fetch?.value
    }

    // 1
    @Test("revoked after ok: a download released after the purge recreates nothing")
    func revokedAfterOk() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        try await downloadHeld(harness)
        let fetch = harness.store.pendingFileFetch(edition)

        harness.client.editions[edition]?.status = "revoked"
        await harness.store.refresh(discovered: [])
        #expect(harness.store.cachedEdition(decisionId: edition) == nil)

        await releaseDownload(harness, fetch)
        #expect(harness.store.cachedEdition(decisionId: edition) == nil)
        #expect(harness.allRows().isEmpty)
        #expect(harness.everyFile().isEmpty, "files left behind: \(harness.everyFile())")
    }

    // 2
    @Test("account switch: A's download lands after the wipe and B's store stays empty")
    func accountSwitch() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        try await downloadHeld(harness)
        let fetch = harness.store.pendingFileFetch(edition)

        // AuthService: the seam resets the session, then the different account
        // wipes (`LocalStoreReset.wipeUserScopedData`).
        harness.account = DirectionFixture.accountB
        harness.store.resetForSessionChange()
        harness.store.wipe()

        await releaseDownload(harness, fetch)
        #expect(harness.store.rows().isEmpty)
        #expect(harness.allRows().isEmpty, "an A record survived under B")
        let accountA = SharedDirectionFiles.accountDirectory(root: harness.root, account: DirectionFixture.accountA)
        #expect(FileManager.default.fileExists(atPath: accountA.path) == false)
        #expect(harness.everyFile().isEmpty)
    }

    // 3
    @Test("account deletion: the deletion wipe drops the download in the air")
    func accountDeletion() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        try await downloadHeld(harness)
        let fetch = harness.store.pendingFileFetch(edition)

        // `AccountDeletionService`: the device is cleared while the deleted
        // account is still the one signed in; the caller ends the session.
        harness.store.wipe()
        harness.account = nil
        harness.store.resetForSessionChange()

        await releaseDownload(harness, fetch)
        #expect(harness.allRows().isEmpty)
        #expect(harness.everyFile().isEmpty)
    }

    @Test("both wipes reach the store, and the store's wipe clears everything it holds")
    func bothWipesReachTheStore() throws {
        let reset = try SourcePin.read("Patina/Core/Persistence/LocalStoreReset.swift")
        #expect(reset.contains("SharedDirectionStore.shared.wipe()"))
        let auth = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        #expect(auth.contains("LocalStoreReset.wipeUserScopedData()"))
        #expect(auth.contains("SharedDirectionStore.shared.resetForSessionChange()"))
        #expect(try SourcePin.read("Patina/Features/Account/AccountDeletionService.swift").contains("LocalStoreReset.wipeUserScopedData()"))

        let store = try SourcePin.read("Patina/Core/Persistence/SharedDirectionStore.swift")
        let wipe = try #require(store.components(separatedBy: "func wipe() {").last)
        #expect(wipe.contains("resetForSessionChange()"))
        #expect(wipe.contains("delete(model: CachedDirectionEdition.self)"))
        #expect(wipe.contains("SharedDirectionFiles.remove(env.root)"))
    }

    // 4
    @Test("stale revoked: a revocation held from before a purge cannot touch the re-cached edition")
    func staleRevoked() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        harness.client.editions[edition] = FakeEdition(sheetSizes: [64])
        await harness.refreshAndSettle([try #require(harness.discovered(edition))])

        // The refresh for E is held at generation N.
        harness.client.holdNextBatches = 1
        let held = Task { await harness.store.refresh(discovered: []) }
        #expect(await eventually { harness.client.heldBatchCount == 1 })

        // E is purged (the detail read answers `revoked`) and re-cached at N+1.
        harness.client.editions[edition]?.status = "revoked"
        _ = try await harness.store.readProjectApprovalReview(decisionId: edition)
        #expect(harness.store.cachedEdition(decisionId: edition) == nil)
        harness.client.editions[edition]?.status = "ok"
        _ = try await harness.store.readProjectApprovalReview(decisionId: edition)
        await harness.settle()
        #expect(harness.store.cachedEdition(decisionId: edition)?.availability == .complete)

        harness.client.releaseBatch(with: harness.client.answer([
            SharedDirectionHeldProof(decisionId: edition, heldAuthorityRevision: 3, heldArtifactChecksum: nil)
        ]).replacingStatus(of: edition, with: "revoked"))
        await held.value

        #expect(harness.store.cachedEdition(decisionId: edition)?.availability == .complete)
        #expect(harness.filesOnDisk(edition).count == 1)
        #expect(harness.telemetry == ["shared_direction_revoked"], "only the live revocation counted")
    }

    // 5
    @Test("held old ok, new revoked: the older ok never brings E back")
    func heldOldOkNewRevoked() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        harness.client.editions[edition] = FakeEdition()
        let okEnvelope = harness.client.answer([proof()])

        // Request 1 (seq 1) is held past its deadline, which frees the slot.
        harness.client.holdNextBatches = 1
        let first = Task { await harness.store.refresh(decisionIds: [edition]) }
        #expect(await eventually { harness.client.heldBatchCount == 1 })
        harness.deadlinesPassed = true
        #expect(await eventually { harness.store.inFlight[edition] == nil })
        harness.deadlinesPassed = false

        // Request 2 (seq 2) answers revoked; E is purged.
        harness.client.editions[edition]?.status = "revoked"
        await harness.store.refresh(decisionIds: [edition])
        #expect(harness.client.batchCalls.count == 2)

        harness.client.releaseBatch(with: okEnvelope)
        await first.value
        #expect(harness.allRows().isEmpty)
        #expect(harness.everyFile().isEmpty)
        #expect(harness.client.attachmentCalls.isEmpty)
    }

    // 5, variant
    @Test("held old ok released first: it commits, and the newer revoked still purges")
    func heldOldOkReleasedFirst() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        harness.client.editions[edition] = FakeEdition()
        let okEnvelope = harness.client.answer([proof()])
        let revokedEnvelope = okEnvelope.replacingStatus(of: edition, with: "revoked")

        harness.client.holdNextBatches = 2
        let first = Task { await harness.store.refresh(decisionIds: [edition]) }
        #expect(await eventually { harness.client.heldBatchCount == 1 })
        harness.deadlinesPassed = true
        #expect(await eventually { harness.store.inFlight[edition] == nil })
        harness.deadlinesPassed = false
        let second = Task { await harness.store.refresh(decisionIds: [edition]) }
        #expect(await eventually { harness.client.heldBatchCount == 2 })

        harness.client.releaseBatch(with: okEnvelope)
        await first.value
        #expect(harness.store.cachedEdition(decisionId: edition) != nil, "the older ok commits first")

        harness.client.releaseBatch(with: revokedEnvelope)
        await second.value
        #expect(harness.allRows().isEmpty)
    }

    // 6
    @Test("coalescing: three refreshes while one is in flight make exactly two calls")
    func coalescing() async throws {
        let harness = try DirectionHarness()
        defer { harness.cleanUp() }
        harness.client.editions[edition] = FakeEdition()
        await harness.store.refresh(discovered: [try #require(harness.discovered(edition))])
        let before = harness.client.batchCalls.count

        harness.client.holdNextBatches = 1
        let first = Task { await harness.store.refresh(discovered: []) }
        #expect(await eventually { harness.client.heldBatchCount == 1 })
        for _ in 0..<3 { await harness.store.refresh(discovered: []) }
        #expect(harness.client.batchCalls.count == before + 1, "a request in flight is not repeated")

        harness.client.releaseBatch(with: harness.client.answer([proof()]))
        await first.value
        #expect(harness.client.batchCalls.count == before + 2)
        #expect(harness.store.inFlight.isEmpty)
    }

    private func proof() -> SharedDirectionHeldProof {
        SharedDirectionHeldProof(decisionId: edition, heldAuthorityRevision: 3, heldArtifactChecksum: nil)
    }
}

extension Data {
    /// A copy of an envelope with one edition's answer changed, the review
    /// and attachments dropped as the contract serves a non-`ok`.
    func replacingStatus(of decisionId: String, with status: String) -> Data {
        guard var root = (try? JSONSerialization.jsonObject(with: self)) as? [String: Any],
              let items = root["editions"] as? [[String: Any]] else { return self }
        root["editions"] = items.map { item -> [String: Any] in
            guard item["decisionId"] as? String == decisionId else { return item }
            return DirectionFixture.item(decisionId, FakeEdition(status: status))
        }
        return DirectionFixture.json(root)
    }
}
