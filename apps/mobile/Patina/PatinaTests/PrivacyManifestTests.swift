//
//  PrivacyManifestTests.swift
//  PatinaTests
//
//  ITMS-91053 is evaluated PER BINARY, so an app-only manifest still parks
//  processing on `PatinaWidget.appex`. Two subjects, not one: the app's own
//  manifest at the bundle root, and the appex's copy inside `PlugIns/`.
//
//  These assertions are about the manifests being COPIED INTO THE PRODUCT, not
//  about files existing in the repo — the synchronized root groups are supposed
//  to pick both up automatically, and "supposed to" is what this suite refuses
//  to take on trust.
//

import Foundation
import Testing

struct PrivacyManifestTests {

    /// Reason codes, from Apple's required-reason API list.
    private static let userDefaults = "NSPrivacyAccessedAPICategoryUserDefaults"
    private static let diskSpace = "NSPrivacyAccessedAPICategoryDiskSpace"
    private static let fileTimestamp = "NSPrivacyAccessedAPICategoryFileTimestamp"

    private func manifest(at url: URL) throws -> [String: Any] {
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(
            from: data, options: [], format: nil
        )
        return try #require(plist as? [String: Any])
    }

    private var appManifestURL: URL {
        Bundle.main.bundleURL.appendingPathComponent("PrivacyInfo.xcprivacy")
    }

    private var widgetManifestURL: URL {
        Bundle.main.bundleURL
            .appendingPathComponent("PlugIns/PatinaWidget.appex/PrivacyInfo.xcprivacy")
    }

    /// Shared by both binaries: Patina tracks nobody and contacts no tracking
    /// domain. A non-empty `NSPrivacyTrackingDomains` with tracking false is
    /// itself a processing warning.
    private func assertNoTracking(_ manifest: [String: Any], _ label: String) throws {
        #expect(manifest["NSPrivacyTracking"] as? Bool == false, "\(label): NSPrivacyTracking")
        let domains = try #require(
            manifest["NSPrivacyTrackingDomains"] as? [String],
            "\(label): NSPrivacyTrackingDomains missing"
        )
        #expect(domains.isEmpty, "\(label): tracking domains must be empty")
    }

    private func accessedCategories(_ manifest: [String: Any]) throws -> [String: [String]] {
        let entries = try #require(manifest["NSPrivacyAccessedAPITypes"] as? [[String: Any]])
        var byType: [String: [String]] = [:]
        for entry in entries {
            guard let type = entry["NSPrivacyAccessedAPIType"] as? String else { continue }
            byType[type] = entry["NSPrivacyAccessedAPITypeReasons"] as? [String] ?? []
        }
        return byType
    }

    // MARK: - The app

    @Test("the app ships a privacy manifest at its bundle root")
    func appManifestIsInTheProduct() {
        #expect(
            FileManager.default.fileExists(atPath: appManifestURL.path),
            "no PrivacyInfo.xcprivacy at the app bundle root — ITMS-91053"
        )
    }

    @Test("the app's manifest declares no tracking")
    func appManifestDeclaresNoTracking() throws {
        try assertNoTracking(try manifest(at: appManifestURL), "app")
    }

    /// UserDefaults ×117 including the App Group suite, the volume-capacity
    /// read in `ScanDiskBudget`, and the scan bundle's file timestamps.
    @Test("the app declares every required-reason API it uses")
    func appDeclaresItsRequiredReasonAPIs() throws {
        let categories = try accessedCategories(try manifest(at: appManifestURL))
        #expect(categories[Self.userDefaults]?.contains("CA92.1") == true)
        #expect(categories[Self.diskSpace]?.contains("E174.1") == true)
        #expect(categories[Self.fileTimestamp]?.contains("C617.1") == true)
    }

    // MARK: - The widget appex (D15)

    @Test("the widget appex ships its own privacy manifest")
    func widgetManifestIsInTheProduct() {
        #expect(
            FileManager.default.fileExists(atPath: widgetManifestURL.path),
            "no PrivacyInfo.xcprivacy inside PatinaWidget.appex — ITMS-91053 is per binary"
        )
    }

    @Test("the widget's manifest declares no tracking")
    func widgetManifestDeclaresNoTracking() throws {
        try assertNoTracking(try manifest(at: widgetManifestURL), "widget")
    }

    @Test("the widget declares the UserDefaults category at minimum")
    func widgetDeclaresUserDefaults() throws {
        let categories = try accessedCategories(try manifest(at: widgetManifestURL))
        #expect(categories[Self.userDefaults]?.contains("CA92.1") == true)
    }
}
