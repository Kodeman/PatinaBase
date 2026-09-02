//
//  ReleaseConfigurationTests.swift
//  PatinaTests
//
//  The build settings an upload is rejected for, asserted against the MERGED,
//  as-built plist rather than against the pbxproj — the pbxproj is what the
//  audit read, and it is not what App Store Connect reads.
//
//  This suite is deliberately fast and deliberately runs on a Debug simulator:
//  `Config/Version.xcconfig` does not move the build number on its own (Xcode
//  resolves target-level settings ABOVE an xcconfig), so a mis-wire has to fail
//  in seconds here rather than after a twenty-minute archive. The `plutil`
//  checks in R1 Step 2 are the backstop, not the first signal.
//

import Foundation
import Testing

struct ReleaseConfigurationTests {

    /// `Bundle.main` inside a unit-test bundle with a TEST_HOST is the HOST
    /// app, so this is Patina.app's own merged Info.plist.
    private var appInfo: [String: Any] {
        Bundle.main.infoDictionary ?? [:]
    }

    /// The widget appex's plist, read out of `PlugIns/` exactly the way the
    /// archive check in R1 Step 2 reads it.
    private func widgetInfo() throws -> [String: Any] {
        let url = Bundle.main.bundleURL
            .appendingPathComponent("PlugIns/PatinaWidget.appex/Info.plist")
        let data = try Data(contentsOf: url)
        let plist = try PropertyListSerialization.propertyList(
            from: data, options: [], format: nil
        )
        return try #require(plist as? [String: Any])
    }

    // MARK: - A2-01 — the build number

    /// ASC already holds build "2" (uploaded 2026-05-12), so 1 is below the
    /// floor and the upload bounces before anyone sees it.
    @Test("the resolved CFBundleVersion is 3")
    func resolvedBuildNumberIsThree() {
        #expect(appInfo["CFBundleVersion"] as? String == "3")
    }

    @Test("the resolved CFBundleShortVersionString is 1.0")
    func resolvedMarketingVersionIsOnePointZero() {
        #expect(appInfo["CFBundleShortVersionString"] as? String == "1.0")
    }

    /// ITMS-90473: the appex's build number must equal the app's, or
    /// processing rejects the bundle.
    @Test("the widget appex carries the same build number as the app")
    func widgetBuildNumberMatchesTheApp() throws {
        let widget = try widgetInfo()
        #expect(widget["CFBundleVersion"] as? String == "3")
        #expect(
            widget["CFBundleVersion"] as? String == appInfo["CFBundleVersion"] as? String,
            "app and appex build numbers diverged — ITMS-90473"
        )
        #expect(widget["CFBundleShortVersionString"] as? String
                == appInfo["CFBundleShortVersionString"] as? String)
    }

    // MARK: - A2-03 / C7-11 (D4) — iPhone only

    /// Round one is an invited iPhone cohort. Shipping the iPad idiom with no
    /// iPad design, no size-class handling anywhere in 435 files and a
    /// portrait-only orientation set is the ITMS-90474 shape, and it puts a
    /// portrait phone layout on an iPad for anyone who installs there first.
    @Test("the app declares the iPhone device family and nothing else")
    func appIsIPhoneOnly() throws {
        let families = try #require(appInfo["UIDeviceFamily"] as? [Int])
        #expect(families == [1])
    }

    @Test("the widget appex declares the iPhone device family and nothing else")
    func widgetIsIPhoneOnly() throws {
        let families = try #require(try widgetInfo()["UIDeviceFamily"] as? [Int])
        #expect(families == [1])
    }

    // MARK: - A2-13 (D6) — the deployment floor

    /// The only availability gates in the app are four `#available(iOS 26.0, *)`
    /// checks. A 26.5 floor excluded every tester on 26.0–26.4 from the invite
    /// with no signal on either end.
    @Test("the deployment floor is 26.0, matching the only gates in the code")
    func minimumOSVersionIsTwentySixPointZero() {
        #expect(appInfo["MinimumOSVersion"] as? String == "26.0")
    }

    // MARK: - A2-14 / C-29 — the cold-launch ground

    /// The generated launch config was empty, so frame one of the product was
    /// the system background: pure white against an off-white app ground, pure
    /// black against a warm-graphite one. `INFOPLIST_KEY_UILaunchScreen_*`
    /// resolves but is not written through by this toolchain (it yields a
    /// nested, empty `UILaunchScreen`), so the dictionary is declared in
    /// `Patina/Info.plist` and generation is off. This assertion is what keeps
    /// that from silently reverting.
    @Test("the launch screen declares the app's own ground colour")
    func launchScreenHasTheAppGround() throws {
        let launch = try #require(appInfo["UILaunchScreen"] as? [String: Any])
        #expect(launch["UIColorName"] as? String == "LaunchBackground")
    }

    // MARK: - A2-06 — export compliance

    /// Without this key every upload parks in "Missing Compliance" until
    /// someone answers the question by hand in the App Store Connect UI. The
    /// app uses HTTPS/TLS plus Apple and swift-crypto for standard purposes,
    /// which is exempt.
    @Test("the app answers the export-compliance question in the binary")
    func encryptionComplianceIsDeclared() throws {
        let declared = try #require(
            appInfo["ITSAppUsesNonExemptEncryption"] as? Bool,
            "ITSAppUsesNonExemptEncryption is absent — every upload parks in Missing Compliance"
        )
        #expect(declared == false)
    }
}
