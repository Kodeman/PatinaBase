//
//  InstrumentIsolationTests.swift
//  PatinaTests
//
//  Guards the ONE property of the instrument substrate that the compiler will not
//  defend for us: it must stay `nonisolated`.
//
//  ── Why this file exists ──────────────────────────────────────────────────────
//  Patina's app target sets `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (see
//  Patina.xcodeproj, both Debug and Release). Patina Field does not. So a
//  declaration that is implicitly non-isolated in Field becomes implicitly
//  `@MainActor` here — and the capture callback that will drive this logic runs at
//  frame rate off the main actor.
//
//  The project is on `SWIFT_VERSION = 5.0`, and in Swift 5 language mode every
//  diagnostic for calling a main-actor-isolated member from a nonisolated context is
//  a WARNING, not an error. Verified empirically against this exact configuration:
//
//      warning: main actor-isolated instance method 'x' cannot be called from
//               outside of the actor; this is an error in the Swift 6 language mode
//
//  A build therefore still succeeds if someone drops `nonisolated`. `@convention(c)`
//  conversion, `@Sendable` function-value conversion, and nonisolated protocol
//  conformance were all tried and all stay at warning level too. So a compile-time
//  guard is not available, and the honest substitute is a SOURCE guard plus a
//  runtime off-main execution check. Both are below.
//
//  When this project moves to `SWIFT_VERSION = 6`, `assertsEveryDeclarationIsNonisolated`
//  becomes redundant (the compiler enforces it) and can be deleted.
//

import Testing
import Foundation
@testable import Patina

/// Async-safe main-thread probe. `Thread.isMainThread` is
/// `NS_SWIFT_UNAVAILABLE_FROM_ASYNC`, which is exactly where this check has to run.
private func isMainThread() -> Bool { pthread_main_np() != 0 }

struct InstrumentIsolationTests {

    /// The ported substrate's source directory, resolved from this test file's own
    /// compile-time path. `DesignRequestIntroductionDecodeTests` uses the same
    /// `#filePath` trick — the suite runs on this machine, there is no iOS CI.
    private static var instrumentDirectory: URL {
        URL(fileURLWithPath: #filePath)                 // …/PatinaTests/<this file>
            .deletingLastPathComponent()                // …/PatinaTests
            .deletingLastPathComponent()                // …/Patina (project dir)
            .appendingPathComponent("Patina/Features/Walk/Instrument", isDirectory: true)
    }

    private static func instrumentSources() throws -> [(name: String, text: String)] {
        let names = try FileManager.default
            .contentsOfDirectory(atPath: instrumentDirectory.path)
            .filter { $0.hasSuffix(".swift") }
            .sorted()
        return try names.map { name in
            (name, try String(contentsOf: instrumentDirectory.appendingPathComponent(name),
                              encoding: .utf8))
        }
    }

    /// Top-level (column-zero) type declarations, ignoring comments.
    private static func topLevelTypeDeclarations(in text: String) -> [String] {
        let keywords = ["struct ", "enum ", "class ", "actor "]
        return text.split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { line in
                guard let first = line.first, first != " ", first != "\t" else { return false }
                guard !line.hasPrefix("//") else { return false }
                return keywords.contains { line.contains($0) }
            }
    }

    // MARK: - Source guard

    @Test
    func theSubstrateDirectoryIsWhereWeThinkItIs() throws {
        // Fail loudly rather than passing vacuously if the port is moved or renamed.
        let sources = try Self.instrumentSources()
        #expect(sources.count >= 13, "expected the ported substrate at \(Self.instrumentDirectory.path)")
        let names = Set(sources.map(\.name))
        for expected in ["KeyframeGate.swift", "Sharpness.swift", "DepthBinFormat.swift",
                         "AnchorRecord.swift", "AnchorGate.swift", "AnchorMeasurementParser.swift",
                         "CaptureSurface.swift", "SurfaceCoverageTracker.swift",
                         "CoverageScorecard.swift", "ScorecardEvaluator.swift"] {
            #expect(names.contains(expected), "missing \(expected) from the ported substrate")
        }
    }

    @Test
    func assertsEveryDeclarationIsNonisolated() throws {
        var checked = 0
        for source in try Self.instrumentSources() {
            for declaration in Self.topLevelTypeDeclarations(in: source.text) {
                checked += 1
                #expect(declaration.hasPrefix("nonisolated "),
                        """
                        \(source.name): top-level declaration is not explicitly nonisolated:
                            \(declaration)
                        Patina sets SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor, so dropping \
                        `nonisolated` silently binds this to the main actor — wrong for logic \
                        a capture callback runs at frame rate.
                        """)
            }
        }
        // If the parser stopped finding declarations, the guard is asleep.
        #expect(checked >= 20, "expected to inspect at least 20 top-level declarations, saw \(checked)")
    }

    @Test
    func theSubstrateImportsNoCaptureFramework() throws {
        // The other half of the contract: pure logic, testable without a device.
        let banned = ["ARKit", "RoomPlan", "AVFoundation", "UIKit", "SwiftUI",
                      "CoreVideo", "CoreImage", "CoreMedia", "Metal", "Vision", "simd"]
        for source in try Self.instrumentSources() {
            for line in source.text.split(separator: "\n").map(String.init)
            where line.hasPrefix("import ") {
                let module = String(line.dropFirst("import ".count))
                    .trimmingCharacters(in: .whitespaces)
                #expect(!banned.contains(module),
                        "\(source.name) imports \(module); the substrate must stay framework-free")
            }
        }
    }

    // MARK: - Runtime guard

    @Test
    func theSubstrateComputesCorrectlyOffTheMainThread() async {
        // Runs the whole decision chain on a detached task and asserts BOTH that it
        // genuinely executed off the main thread AND that it produced the pinned
        // answers there — a main-actor hop or a re-entrancy bug would show up as a
        // wrong value, not just a different thread.
        struct Outcome: Sendable {
            let wasOffMainThread: Bool
            let motionTriggered: Bool
            let sharpness: Double
            let verdict: Scorecard.Verdict
            let millimetres: Int?
            let flags: UInt16
        }

        let outcome = await Task.detached { () -> Outcome in
            let gate = KeyframeGate.standard
            let poseA: [Float] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
            let poseB: [Float] = [1, 0, 0, 0.3, 0, 1, 0, 0.4, 0, 0, 1, 0, 0, 0, 0, 1]
            var luma = [UInt8]()
            for row in 0..<5 {
                for column in 0..<5 { luma.append((row + column).isMultiple(of: 2) ? 255 : 0) }
            }
            let gap = SurfaceCoverage(
                surface: CaptureSurface(id: "wall:east", kind: .wall, center: .init(0, 0, 0),
                                        normal: .init(0, 0, 1), checklistKey: "wall:east",
                                        displayLabel: "East wall"),
                observed: false, dwellSeconds: 0)
            return Outcome(
                wasOffMainThread: !isMainThread(),
                motionTriggered: gate.motionTriggered(from: poseA, to: poseB),
                sharpness: Sharpness.varianceOfLaplacian(luma: luma, width: 5, height: 5),
                verdict: ScorecardEvaluator.make(coverage: [gap], sharpFrameRatio: 1.0,
                                                 trackingHealth: .good, anchorCount: 3).verdict,
                millimetres: AnchorMeasurementParser.parseMillimetres("12' 3 1/2\""),
                flags: DepthBinFormat.flags(smoothed: true, hasConfidence: true))
        }.value

        #expect(outcome.wasOffMainThread)
        #expect(outcome.motionTriggered)                     // exactly 0.5 m ⇒ fires
        #expect(abs(outcome.sharpness - 1_027_555.5555555555) < 1e-6)
        #expect(outcome.verdict == .red)
        #expect(outcome.millimetres == 3747)
        #expect(outcome.flags == 0x0003)
    }

    @Test
    func statefulPiecesRunOffTheMainThreadToo() async {
        // `SurfaceCoverageTracker` and `KeyframeSequencer` carry mutable state and are
        // deliberately NOT Sendable — they are caller-confined. Confining one to a
        // single detached task is the supported pattern and must work without a hop.
        let observed = await Task.detached { () -> Bool in
            let tracker = SurfaceCoverageTracker()
            tracker.setSurfaces([
                CaptureSurface(id: "north", kind: .wall, center: .init(0, 0, -3),
                               normal: .init(0, 0, 1), checklistKey: "wall:north",
                               displayLabel: "North wall")
            ])
            for _ in 0..<20 {
                tracker.observe(cameraPosition: .init(0, 0, 0),
                                cameraForward: .init(0, 0, -1), dt: 0.1)
            }
            let sequencer = KeyframeSequencer()
            let fired = sequencer.evaluate(
                pose: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                frameTimestamp: 0,
                sharpness: { 40 }) == .fire(score: 40)
            return !isMainThread() && tracker.coveragePct == 100 && fired
        }.value
        #expect(observed)
    }
}
