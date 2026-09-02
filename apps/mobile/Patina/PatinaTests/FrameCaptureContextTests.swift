//
//  FrameCaptureContextTests.swift
//  PatinaTests
//
//  C7-05. `let context = CIContext()` sat inside the per-captured-frame
//  compression path of a `@MainActor` service, with `captureInterval` at
//  2.0 s — so every two seconds of a walk the app compiled Core Image
//  kernels and allocated GPU state on the actor driving the scan's own UI,
//  then rendered and HEIC-encoded there too. `PosedPhotoService` had it
//  right: one shared GPU-backed context built at init.
//
//  A source pin because the path needs an `ARFrame`, which the simulator
//  cannot produce.
//

import Foundation
import Testing
@testable import Patina

struct FrameCaptureContextTests {

    private func source() throws -> String {
        try SourcePin.read("Patina/Features/Walk/Services/FrameCaptureService.swift")
    }

    @Test
    func thereIsExactlyOneSharedContext() throws {
        let text = try source()
        #expect(text.contains("private nonisolated let ciContext = CIContext("))
        // One construction site, and it is that one. Comment lines are
        // skipped so the doc comment above the declaration does not count.
        let constructions = text
            .split(separator: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .filter { $0.contains("CIContext(") }
        #expect(constructions.count == 1, "a second CIContext construction appeared")
    }

    @Test
    func noContextIsBuiltInsideThePerFramePath() throws {
        let text = try source()
        let perFrame = try #require(
            text.components(separatedBy: "private func processARFrame(").last?
                .components(separatedBy: "private nonisolated static func encode(").first
        )
        #expect(perFrame.contains("CIContext()") == false)
    }

    @Test
    func theEncodeLeavesTheMainActor() throws {
        let text = try source()
        #expect(text.contains("private nonisolated static func encode("))
        #expect(text.contains("Task.detached(priority: .utility)"))
    }

    /// The context is GPU-backed, matching `PosedPhotoService` — a software
    /// renderer on the main actor would be the same defect wearing a hat.
    @Test
    func theSharedContextIsGPUBacked() throws {
        #expect(try source().contains("[.useSoftwareRenderer: false]"))
    }
}
