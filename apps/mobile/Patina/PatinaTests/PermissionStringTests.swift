//
//  PermissionStringTests.swift
//  PatinaTests
//
//  The permission modal is the app's first sentence about itself, and until
//  now it had two authors: `Patina/Info.plist` and the
//  `INFOPLIST_KEY_NS*UsageDescription` build settings. Both were set, the build
//  settings silently won, and the tracked file was read by everyone who went
//  looking. One source now — the build settings, because they were already the
//  ones that shipped — and this suite is what keeps it one.
//
//  Every assertion is against the MERGED plist, which is the only artefact iOS
//  ever reads.
//

import Foundation
import Testing

struct PermissionStringTests {

    /// Every `NS*UsageDescription` the app can trigger. A missing string here
    /// is not a warning — iOS terminates the process when the API is called.
    private static let required = [
        "NSCameraUsageDescription",
        "NSMicrophoneUsageDescription",
        "NSMotionUsageDescription",
        "NSSpeechRecognitionUsageDescription",
        "NSPhotoLibraryUsageDescription",
        "NSPhotoLibraryAddUsageDescription",
        "NSFaceIDUsageDescription"
    ]

    private var appInfo: [String: Any] {
        Bundle.main.infoDictionary ?? [:]
    }

    /// The tracked `Patina/Info.plist` as it sits in the repo — read from
    /// source, not from the product, because the whole point is that this file
    /// must no longer be a *second* author of these strings.
    private func trackedInfoPlist() throws -> [String: Any] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // PatinaTests
            .deletingLastPathComponent()   // apps/mobile/Patina
            .appendingPathComponent("Patina/Info.plist")
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(
            from: data, options: [], format: nil
        )
        return try #require(plist as? [String: Any])
    }

    @Test("every permission string the app can trigger is present and non-empty")
    func everyPermissionStringIsPresent() {
        for key in Self.required {
            let value = appInfo[key] as? String
            #expect(value != nil, "\(key) is missing from the merged plist")
            #expect(value?.isEmpty == false, "\(key) is present but empty")
        }
    }

    /// A2-12 / G-07: two sources cannot disagree if only one of them exists.
    @Test("the tracked Info.plist declares no permission strings of its own")
    func trackedPlistIsNotASecondSource() throws {
        let tracked = try trackedInfoPlist()
        let shadowed = tracked.keys.filter { $0.hasSuffix("UsageDescription") }.sorted()
        #expect(
            shadowed.isEmpty,
            "Patina/Info.plist still declares \(shadowed) — the build settings win and these are read by nobody"
        )
    }
}
