//
//  HouseRecordStoreTests.swift
//  PatinaTests
//
//  The two stores the Record stands on: the last-visit mark that decides what
//  is "new", and the snapshot that lets Today paint before any fetch lands.
//

import Foundation
import Testing
@testable import Patina

struct LastSeenStoreTests {

    private func freshDefaults() throws -> UserDefaults {
        let suite = "patina.tests.lastseen.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        return defaults
    }

    @Test("before the first open there is no last visit, so nothing can be new")
    func lastSeenIsNilBeforeTheFirstOpen() throws {
        let store = LastSeenStore(defaults: try freshDefaults())
        #expect(store.lastSeenAt == nil)
    }

    @Test("markSeen writes the one canonical key")
    func markSeenWritesTheCanonicalKey() throws {
        let defaults = try freshDefaults()
        let store = LastSeenStore(defaults: defaults)
        let moment = Date(timeIntervalSince1970: 1_787_000_000)

        store.markSeen(now: moment)

        let readBack = try #require(store.lastSeenAt)
        #expect(abs(readBack.timeIntervalSince(moment)) < 1)
        // The widget and a later device read the same key; it is a contract.
        #expect(defaults.object(forKey: "patina.house.lastSeenAt") != nil)
    }

    @Test("a later mark replaces the earlier one")
    func markSeenMovesForward() throws {
        let store = LastSeenStore(defaults: try freshDefaults())
        let first = Date(timeIntervalSince1970: 1_787_000_000)
        store.markSeen(now: first)
        store.markSeen(now: first.addingTimeInterval(3600))

        let readBack = try #require(store.lastSeenAt)
        #expect(readBack > first)
    }

    /// M16 / steward §9.4: the snapshot store is specified as an App Group
    /// container, and the entitlement lands in THIS wave, not W6.
    @Test("the entitlement carries the App Group the snapshot store asks for")
    func theEntitlementCarriesTheAppGroup() throws {
        let entitlements = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // Patina (project dir)
            .appendingPathComponent("Patina/Patina.entitlements")
        let source = try String(contentsOf: entitlements, encoding: .utf8)

        #expect(source.contains("com.apple.security.application-groups"))
        #expect(source.contains("group.cloud.patina.app"))
        // The three that were already there must survive the edit.
        #expect(source.contains("aps-environment"))
        #expect(source.contains("com.apple.developer.associated-domains"))
        #expect(source.contains("com.apple.developer.applesignin"))
    }
}
