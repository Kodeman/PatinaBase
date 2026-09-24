//  ScreenInventoryParityTests.swift
//  CaptureTests
//
//  capture-shots.sh's ALL_SCREENS is the one file in the navigation lockstep
//  (CaptureScreenID → CaptureRoute → registrar → CaptureDeepLink → sweep) that
//  the compiler does not cover. A new screen id compiles, routes and presents
//  perfectly while the sweep quietly never photographs it — which is exactly
//  what happened to the People room: W5 added pr1Roster/pr2Person/pr3SiteAccess
//  and the sweep list never heard about it, for four screens' worth of wave.
//  So the shell array gets a test where the other four files get a compiler.
//
//  capture-shots.sh holds BOTH lists — the sweep and the documented exclusions —
//  and this file parses them straight out of it. It deliberately keeps no copy
//  of its own: a second list is a second thing to drift.

import Foundation
import Testing
@testable import CaptureKit

struct ScreenInventoryParityTests {

    // MARK: - Reading the sweep script

    private struct ParseFailure: Error, CustomStringConvertible {
        let description: String
    }

    /// `apps/mobile/Capture/scripts/capture-shots.sh`, located from this file's
    /// own compile-time path (`CaptureTests/` → `Capture/`) rather than from a
    /// bundle resource, so it reads the working tree the tests were built from.
    private static func script() throws -> String {
        let here = #filePath
        guard here.hasPrefix("/") else {
            throw ParseFailure(description: "#filePath is not absolute (\(here)); "
                               + "capture-shots.sh cannot be located from it")
        }
        let url = URL(fileURLWithPath: here)
            .deletingLastPathComponent()   // CaptureTests/
            .deletingLastPathComponent()   // Capture/
            .appendingPathComponent("scripts/capture-shots.sh")
        do {
            return try String(contentsOf: url, encoding: .utf8)
        } catch {
            throw ParseFailure(description: "could not read \(url.path): \(error)")
        }
    }

    /// The words of a bash array literal declared as `NAME=(` … `)`, one entry
    /// per word, comments and blank lines skipped.
    private static func entries(of name: String, in source: String) throws -> [String] {
        let lines = source.components(separatedBy: "\n")
        let opener = "\(name)=("
        guard let start = lines.firstIndex(of: opener) else {
            throw ParseFailure(description: "capture-shots.sh no longer declares `\(opener)` "
                               + "on a line of its own")
        }
        var entries: [String] = []
        for line in lines[lines.index(after: start)...] {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed == ")" { return entries }
            guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { continue }
            entries += trimmed.split(separator: " ").map(String.init)
        }
        throw ParseFailure(description: "`\(opener)` in capture-shots.sh is never closed")
    }

    // MARK: - The parity contract

    @Test func everyScreenIDIsEitherSweptOrDocumentedAsExcluded() throws {
        let source = try Self.script()
        let swept = try Self.entries(of: "ALL_SCREENS", in: source)
        let excluded = try Self.entries(of: "EXCLUDED_SCREENS", in: source)

        let repeated = Set(swept.filter { suffix in swept.filter { $0 == suffix }.count > 1 })
        #expect(repeated.isEmpty, "ALL_SCREENS lists the same screen twice: \(repeated.sorted())")

        let sweptSet = Set(swept)
        let bothWays = sweptSet.intersection(excluded).sorted()
        #expect(bothWays.isEmpty,
                "capture-shots.sh both sweeps and excludes: \(bothWays)")

        let known = Set(CaptureScreenID.allCases.map(\.sweepSuffix))
        let listed = sweptSet.union(excluded)

        // Drift in the direction that actually bit: an id nothing photographs.
        let unaccounted = known.subtracting(listed).sorted()
        #expect(unaccounted.isEmpty, """
                CaptureScreenID cases the sweep never photographs and capture-shots.sh never \
                documents as excluded: \(unaccounted). Add each to ALL_SCREENS, or to \
                EXCLUDED_SCREENS with the reason, the way V4.visit-review is.
                """)

        // Drift the other way: a suffix the launch flag can no longer resolve.
        let unknown = listed.subtracting(known).sorted()
        #expect(unknown.isEmpty,
                "capture-shots.sh lists screens that are not CaptureScreenID cases: \(unknown)")
    }

    /// The specific regression this ticket closes: the People room reaches the
    /// sweep. All three ride one `.people(screen:projectID:personID:)` route,
    /// handed to the coordinator by `CaptureDeepLink.routePeopleScreen`.
    @Test func thePeopleRoomScreensAreSwept() throws {
        let swept = try Self.entries(of: "ALL_SCREENS", in: Self.script())
        for id in [CaptureScreenID.pr1Roster, .pr2Person, .pr3SiteAccess] {
            #expect(swept.contains(id.sweepSuffix),
                    "\(id.sweepSuffix) is missing from capture-shots.sh ALL_SCREENS")
        }
    }
}
