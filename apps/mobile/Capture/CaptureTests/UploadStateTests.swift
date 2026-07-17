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
}
