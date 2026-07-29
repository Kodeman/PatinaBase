//  UploadStateTests.swift
//  CaptureTests
//
//  Pure upload-state-machine contracts (Field Capture P1 · item 8, Part 3): the
//  resume set, completion gating, progress, and the bounded-retry decision.

import Foundation
import Testing
@testable import CaptureKit

struct UploadStateTests {

    private func artifact(_ kind: String, _ status: ScanArtifactUploadState.Status,
                          attempts: Int = 0) -> ScanArtifactUploadState {
        ScanArtifactUploadState(kind: kind, relativePath: "\(kind).bin", mimeType: "application/octet-stream",
                                status: status, attempts: attempts)
    }

    @Test func pendingIsTheResumeSet() {
        let arts = [artifact("usdz", .uploaded), artifact("mesh", .failed),
                    artifact("depth", .pending), artifact("photos", .uploading)]
        let resume = ScanUploadPlanner.pending(arts).map(\.kind)
        #expect(Set(resume) == ["mesh", "depth"])     // failed + pending only
    }

    @Test func allDoneGatesCompletion() {
        #expect(!ScanUploadPlanner.allDone([]))                                   // empty → not done
        #expect(!ScanUploadPlanner.allDone([artifact("a", .uploaded), artifact("b", .pending)]))
        #expect(ScanUploadPlanner.allDone([artifact("a", .uploaded), artifact("b", .skipped)]))
    }

    @Test func progressFraction() {
        let arts = [artifact("a", .uploaded), artifact("b", .skipped),
                    artifact("c", .pending), artifact("d", .failed)]
        #expect(ScanUploadPlanner.progress(arts) == 0.5)     // 2 of 4 terminal-success
        #expect(ScanUploadPlanner.progress([]) == 0)
    }

    @Test func canAttemptRespectsRetryBudget() {
        #expect(ScanUploadPlanner.maxAttempts == 3)
        #expect(ScanUploadPlanner.canAttempt(artifact("a", .pending, attempts: 0)))
        #expect(ScanUploadPlanner.canAttempt(artifact("a", .failed, attempts: 2)))
        #expect(!ScanUploadPlanner.canAttempt(artifact("a", .failed, attempts: 3)))   // budget spent
        #expect(!ScanUploadPlanner.canAttempt(artifact("a", .uploaded, attempts: 0))) // already done
    }

    // MARK: - Plan generation + rehydration

    @Test func kindsToUploadSkipsAlreadyUploaded() {
        let all = ["usdz", "mesh", "depthArchive"]
        #expect(ScanUploadPlanner.kindsToUpload(all: all, existing: []) == all)      // fresh → all
        let existing = [artifact("usdz", .uploaded), artifact("mesh", .failed)]
        #expect(ScanUploadPlanner.kindsToUpload(all: all, existing: existing) == ["mesh", "depthArchive"])
    }

    @Test func nextStepRehydrationDecision() {
        let all = ["usdz", "mesh"]
        #expect(ScanUploadPlanner.nextStep(all: all, existing: [], recordComplete: false)
                == .upload(["usdz", "mesh"]))                                        // fresh
        #expect(ScanUploadPlanner.nextStep(all: all, existing: [artifact("usdz", .uploaded)], recordComplete: false)
                == .upload(["mesh"]))                                                // partial → resume
        let full = [artifact("usdz", .uploaded), artifact("mesh", .uploaded)]
        #expect(ScanUploadPlanner.nextStep(all: all, existing: full, recordComplete: false) == .confirm)   // bytes up
        #expect(ScanUploadPlanner.nextStep(all: all, existing: full, recordComplete: true) == .done)       // finished
    }

    // MARK: - Confirm-fallback discrimination (C1)

    @Test func confirmFallbackDiscriminatesReachability() {
        // Unreachable — transport/relay (nil), not-deployed (404), or server error (5xx)
        // — the bundle is fine, the function isn't ⇒ the RPC fallback is safe.
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: nil) == .markCompleteViaRPC)
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: 404) == .markCompleteViaRPC)
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: 500) == .markCompleteViaRPC)
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: 503) == .markCompleteViaRPC)
        // The server looked at THIS bundle and rejected it (409 missing artifacts, or any
        // other 4xx) ⇒ propagate; never mark a broken bundle ready.
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: 409) == .propagate)
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: 400) == .propagate)
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: 401) == .propagate)
        #expect(ScanConfirmPolicy.fallback(forHTTPStatus: 403) == .propagate)
    }

    // MARK: - Bucket MIME drift guard (M2 upload fix)

    @Test func everyUploadContentTypeIsBucketAllowed() {
        // Storage returns 400 invalid_mime_type on any upload Content-Type outside the
        // room-scans bucket allow-list — supabase/migrations/00077_advanced_room_scan.sql
        // — and the retry policy treats 400 as terminal. depthIndex/keyframeIndex
        // (semantically application/x-ndjson) and the two tars (application/x-tar) MUST
        // therefore transport as application/octet-stream.
        for descriptor in ScanUploadDescriptor.all {
            #expect(ScanBucketMime.allowed.contains(descriptor.contentType),
                    "\(descriptor.kind) uploads as \(descriptor.contentType) — not in the 00077 allow-list")
        }
        // The exact kind that broke the M2 walk — pin its transport type.
        let depthIndex = ScanUploadDescriptor.all.first { $0.kind == "depthIndex" }
        #expect(depthIndex?.contentType == "application/octet-stream")
    }

    // MARK: - Durable bundle key (C2 — container-independent)

    @Test func relativeKeyIsContainerIndependent() {
        let base = "/Applications/.../Library/Application Support"
        let a = URL(fileURLWithPath: "\(base)/SiteScans/site-scan-abc")
        // Same bundle, a DIFFERENT absolute container prefix (app data path moved).
        let b = URL(fileURLWithPath: "/private/var/CHANGED/Application Support/SiteScans/site-scan-abc")
        #expect(SiteScanBundleHome.relativeKey(for: a) == "SiteScans/site-scan-abc")
        #expect(SiteScanBundleHome.relativeKey(for: a) == SiteScanBundleHome.relativeKey(for: b))
    }


    @Test func backgroundTransferKeysIncludeTheScanID() {
        let first = ScanArtifactTransferKey(
            scanID: "scan-a",
            kind: "mesh"
        )
        let second = ScanArtifactTransferKey(
            scanID: "scan-b",
            kind: "mesh"
        )

        #expect(first != second)
        #expect(Set([first, second]).count == 2)
    }

    @Test func scanResultCarriesTheF2OwnerAcrossCodableRoundTrip() throws {
        let owner = try #require(CaptureOwnerIdentity(
            userID: "designer-a",
            workspaceID: "studio-a"
        ))
        let result = FieldScanResult(
            localBundleURL: URL(fileURLWithPath: "/tmp/scan-a"),
            owner: owner
        )

        let data = try JSONEncoder().encode(result)
        let decoded = try JSONDecoder().decode(
            FieldScanResult.self,
            from: data
        )
        #expect(decoded.owner == owner)
    }

    @Test func backgroundMetadataPersistsTheImmutableOwner() throws {
        let owner = try #require(CaptureOwnerIdentity(
            userID: "designer-a",
            workspaceID: "studio-a"
        ))
        let metadata = ScanBackgroundTransferMetadata(
            scanID: "scan-a",
            artifactKind: "mesh",
            owner: owner,
            sha256: "abc"
        )
        let adopted = try #require(ScanBackgroundTransferMetadata(
            dictionary: metadata.dictionary
        ))

        #expect(adopted == metadata)
        #expect(adopted.dictionary["ownerUserId"] == owner.userID)
        #expect(adopted.dictionary["ownerWorkspaceId"] == owner.workspaceID)
    }

    @Test @MainActor
    func adoptedCompletionCannotResolveAnotherOwnersRecord() throws {
        let store = try CaptureStore.inMemory()
        let ownerA = try #require(CaptureOwnerIdentity(
            userID: "designer-a",
            workspaceID: "studio-a"
        ))
        let ownerB = try #require(CaptureOwnerIdentity(
            userID: "designer-a",
            workspaceID: "studio-b"
        ))
        _ = store.insertScanUploadRecord(ScanUploadRecord(
            bundlePath: "SiteScans/scan-a",
            scanID: "scan-a",
            roomID: "room-a",
            name: "A",
            projectID: nil,
            projectRoomID: nil,
            owner: ownerA
        ))
        let adopted = ScanBackgroundTransferMetadata(
            scanID: "scan-a",
            artifactKind: "mesh",
            owner: ownerB
        )

        #expect(store.scanUploadRecord(
            scanID: adopted.scanID,
            owner: adopted.owner
        ) == nil)
    }

    @Test func requiredArtifactGateRejectsSubsetsAndSkips() {
        let required = ["usdz", "mesh"]
        let subset = [artifact("usdz", .uploaded)]
        let skipped = [
            artifact("usdz", .uploaded),
            artifact("mesh", .skipped)
        ]
        let complete = [
            artifact("usdz", .uploaded),
            artifact("mesh", .uploaded)
        ]

        #expect(!ScanUploadPlanner.allRequiredUploaded(
            required,
            existing: subset
        ))
        #expect(!ScanUploadPlanner.allRequiredUploaded(
            required,
            existing: skipped
        ))
        #expect(ScanUploadPlanner.allRequiredUploaded(
            required,
            existing: complete
        ))
        let integrityError = ScanArtifactIntegrityError
            .missingRequiredArtifacts(["mesh"])
        #expect(integrityError.transferPhase == .rejected)
    }

    @Test func requiredArtifactGateRequiresEveryNonEmptyFile() throws {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory.appendingPathComponent(
            "required-scan-artifacts-\(UUID().uuidString)",
            isDirectory: true
        )
        defer { try? fileManager.removeItem(at: root) }

        for descriptor in ScanUploadDescriptor.all {
            let fileURL = root.appendingPathComponent(
                descriptor.relativePath
            )
            try fileManager.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try Data([0x01]).write(to: fileURL)
        }
        #expect(ScanUploadDescriptor.missingRequiredArtifacts(
            in: root
        ).isEmpty)

        let missing = try #require(ScanUploadDescriptor.all.first)
        try fileManager.removeItem(
            at: root.appendingPathComponent(missing.relativePath)
        )
        #expect(
            ScanUploadDescriptor.missingRequiredArtifacts(in: root).map(\.kind)
                == [missing.kind]
        )
    }

    @Test func orphanSweepPreservesProtectedDurableBundle() throws {
        let fileManager = FileManager.default
        let root = fileManager.temporaryDirectory.appendingPathComponent(
            "scan-sweep-\(UUID().uuidString)",
            isDirectory: true
        )
        let protected = root.appendingPathComponent(
            "site-scan-protected",
            isDirectory: true
        )
        let orphan = root.appendingPathComponent(
            "site-scan-orphan",
            isDirectory: true
        )
        defer { try? fileManager.removeItem(at: root) }
        try fileManager.createDirectory(
            at: protected,
            withIntermediateDirectories: true
        )
        try fileManager.createDirectory(
            at: orphan,
            withIntermediateDirectories: true
        )
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let old = now.addingTimeInterval(-8 * 86_400)
        try fileManager.setAttributes(
            [.modificationDate: old],
            ofItemAtPath: protected.path
        )
        try fileManager.setAttributes(
            [.modificationDate: old],
            ofItemAtPath: orphan.path
        )

        let removed = SiteScanBundleHome.sweepOrphans(
            olderThan: 7,
            protectedRelativeKeys: [
                SiteScanBundleHome.relativeKey(for: protected)
            ],
            rootURL: root,
            fileManager: fileManager,
            now: now
        )

        #expect(removed == 1)
        #expect(fileManager.fileExists(atPath: protected.path))
        #expect(!fileManager.fileExists(atPath: orphan.path))
    }
}
