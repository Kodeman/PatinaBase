//
//  PatinaSchemaGoldenTests.swift
//  PatinaTests
//
//  SQ-247 F2. Every shipped schema version is pinned by its entity version
//  hashes — the values Core Data stamps into a tester's store and compares on
//  every open. A stored property added, removed, renamed or retyped without a
//  new version changes a hash, and this suite fails before a build ships a
//  shape no stage of the plan reaches.
//
//  A failure here is not fixed by pasting the new value. Freeze the new shape
//  as `PatinaSchemaV3`, add its stage, pin its hashes as a third table, and
//  leave V1 and V2 exactly as they are.
//

import CoreData
import Foundation
import SwiftData
import Testing
@testable import Patina

@MainActor
struct PatinaSchemaGoldenTests {

    /// Build 1.0(4)'s store, as `PatinaSchemaV1` freezes it.
    private static let v1: [String: String] = [
        "BoardModel": "bFW3aqFs2iir8hitM3iGtJlTOscnVx2V1JOeZFv+x4Q=",
        "DesignRequestDraft": "bNWMgu0CrR5Kck8fqCb0YDPUkI2r8vV13mwDl3FnNNw=",
        "RoomModel": "MrBcqRNuqKzRi8Qgc7VCXcfFk9UDpXYcviTBrMZicGI=",
        "RoomScanPackage": "5uaWIhIhl1bpOiq9p2z/ehtenEDv0q3Z49V7jcEK4oA=",
        "SavedItem": "LfwPu8m75dJm9t/QCSDiUmgCPvqS4B1iRKY9mHos5bI=",
        "StylePreferenceModel": "R6j6/F6jUroF5bhYIWgtqavSrERtvzrw7elM+QeQtBE=",
        "SubmittedDesignRequest": "tND3BS/8f9KcODs5kjkpSqjC4d8kgUu7eB0x6rMWdDw=",
        "SyncQueueItem": "KgVidSFiRcO0icgJs8/HP8aHlllERaQYVmKRntSnXNU=",
        "TableItemModel": "CMnOJTOh6+G+ODVXPPYY3rCTTCSN0FuNGNc913iI2NQ="
    ]

    /// V1 unchanged, plus the cached shared direction (W1A-10).
    private static let v2: [String: String] = v1.merging([
        "CachedDirectionEdition": "JIWF6MASijWFdzn6RI6akWLOf0w6L4l0PTfVUjwwkVo="
    ]) { _, added in added }

    private func hashes(_ schema: Schema) throws -> [String: String] {
        let model = try #require(NSManagedObjectModel.makeManagedObjectModel(for: schema))
        return model.entityVersionHashesByName.mapValues { $0.base64EncodedString() }
    }

    private func mismatch(_ actual: [String: String]) -> Comment {
        let lines = actual.sorted { $0.key < $1.key }.map { "\"\($0.key)\": \"\($0.value)\"" }
        return Comment(rawValue: "actual hashes:\n" + lines.joined(separator: ",\n"))
    }

    @Test("V1's entity hashes are the ones build 1.0(4) wrote")
    func v1IsFrozen() throws {
        let actual = try hashes(Schema(versionedSchema: PatinaSchemaV1.self))
        #expect(actual == Self.v1, mismatch(actual))
    }

    @Test("V2's entity hashes are pinned")
    func v2IsFrozen() throws {
        let actual = try hashes(Schema(versionedSchema: PatinaSchemaV2.self))
        #expect(actual == Self.v2, mismatch(actual))
    }

    /// The app's own classes are what the container opens, stamped with the
    /// latest version. Unequal, the plan carries a store to a shape the app
    /// then cannot open — so an edit to a live model fails here too.
    @Test("the live classes hash exactly as the latest frozen version")
    func theLiveClassesAreTheLatestVersion() throws {
        let latest = try #require(PatinaMigrationPlan.schemas.last)
        #expect(PatinaSchemaCurrent.version.versionIdentifier == latest.versionIdentifier)
        let actual = try hashes(PatinaSchemaCurrent.schema)
        #expect(actual == (try hashes(Schema(versionedSchema: latest))), mismatch(actual))
    }

    /// A version that listed a live class would change shape the moment that
    /// class was edited, and no stage could be written from it.
    @Test("no frozen version lists a live class")
    func versionsHoldOnlySnapshots() {
        let live = Set(PatinaSchemaCurrent.models.map { ObjectIdentifier($0) })
        for version in PatinaMigrationPlan.schemas {
            for model in version.models {
                #expect(!live.contains(ObjectIdentifier(model)), "\(version) lists the live \(model)")
            }
        }
    }
}
