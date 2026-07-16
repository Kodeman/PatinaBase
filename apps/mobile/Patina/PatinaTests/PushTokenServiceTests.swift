//
//  PushTokenServiceTests.swift
//  PatinaTests
//
//  Covers the three pieces of `PushTokenService` that are safe to exercise
//  in a unit-test host WITHOUT touching the live `UNUserNotificationCenter`
//  (which would surface a real system permission dialog and hang an
//  automated test run):
//
//   1. The `aps-environment` detection ladder (I66) — injected profile
//      reader, no Bundle.main / filesystem dependency.
//   2. APNs device-token hex encoding.
//   3. The once-only authorization-prompt gate
//      (`armFirstSubmissionPromptGate`) — pure UserDefaults arithmetic,
//      deliberately separated from the actual
//      `requestAuthorizationAndRegister()` call for exactly this reason.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct PushTokenServiceTests {

    // MARK: - detectEnvironment ladder

    /// Rung 2: no embedded provisioning profile at all. This is how App
    /// Store / TestFlight distribution builds actually ship — Apple strips
    /// the embedded profile — so absence itself is the production signal,
    /// even though the ladder is entered first (it's checked before rung 1
    /// can run at all).
    @Test
    func noEmbeddedProfileMeansProduction() {
        let environment = PushTokenService.detectEnvironment(readProfile: { nil })
        #expect(environment == "production")
    }

    /// Rung 1: profile present, `aps-environment` says `development`.
    @Test
    func developmentProfileMapsToSandbox() {
        let profile = Self.fakeProvisioningProfile(apsEnvironment: "development")
        let environment = PushTokenService.detectEnvironment(readProfile: { profile })
        #expect(environment == "sandbox")
    }

    /// Rung 1: profile present, `aps-environment` says `production`.
    @Test
    func productionProfileMapsToProduction() {
        let profile = Self.fakeProvisioningProfile(apsEnvironment: "production")
        let environment = PushTokenService.detectEnvironment(readProfile: { profile })
        #expect(environment == "production")
    }

    /// Rung 3: a profile IS embedded, but the bytes don't contain a
    /// parseable plist (corrupt / unexpected format) — never crash
    /// registration over it; fall back to the build-configuration ladder.
    @Test
    func unparseableProfileFallsBackToBuildConfiguration() {
        let garbage = Data("not a provisioning profile".utf8)
        let environment = PushTokenService.detectEnvironment(readProfile: { garbage })
        #if DEBUG
        #expect(environment == "sandbox")
        #else
        #expect(environment == "production")
        #endif
    }

    /// The plist-extraction step must tolerate being embedded inside an
    /// opaque binary envelope (the real CMS/PKCS#7 signature bytes) rather
    /// than requiring the whole file to be the bare plist — this is what a
    /// real `.mobileprovision` looks like on disk.
    @Test
    func apsEnvironmentSurvivesBinaryEnvelope() {
        var bytes = Data([0xFF, 0x00, 0xDE, 0xAD, 0xBE, 0xEF])
        bytes.append(Self.fakeProvisioningProfile(apsEnvironment: "development"))
        bytes.append(Data([0x00, 0xFA, 0xCE]))
        #expect(PushTokenService.apsEnvironment(fromProvisioningProfileData: bytes) == "development")
    }

    /// A profile with no `aps-environment` entitlement at all (e.g. push
    /// capability never enabled) — the plist parses fine, but the key is
    /// simply absent. `apsEnvironment` returns nil so `detectEnvironment`
    /// falls to the rung-3 build-configuration ladder rather than crashing.
    @Test
    func profileWithoutApsEnvironmentEntitlementReturnsNil() {
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0">
        <dict>
            <key>Entitlements</key>
            <dict>
                <key>application-identifier</key>
                <string>ABCDE12345.com.patina.app</string>
            </dict>
        </dict>
        </plist>
        """
        let data = Data(plist.utf8)
        #expect(PushTokenService.apsEnvironment(fromProvisioningProfileData: data) == nil)
    }

    // MARK: - Token hex encoding

    @Test
    func hexEncodesDeviceTokenBytesLowercaseNoSeparators() {
        let token = Data([0x0A, 0xFF, 0x00, 0x1B, 0xDE, 0xAD, 0xBE, 0xEF])
        #expect(PushTokenService.hexString(from: token) == "0aff001bdeadbeef")
    }

    @Test
    func hexEncodingRoundTripsEmptyData() {
        #expect(PushTokenService.hexString(from: Data()) == "")
    }

    @Test
    func hexEncodingPadsSingleDigitBytes() {
        // 0x01 and 0x0A must each contribute two hex characters, not one —
        // a naive `String(byte, radix: 16)` would drop the leading zero.
        let token = Data([0x01, 0x0A, 0xF0])
        #expect(PushTokenService.hexString(from: token) == "010af0")
    }

    // MARK: - Once-only authorization gate

    @Test
    func firstCallArmsTheGateAndReturnsTrue() {
        let defaults = UserDefaults.standard
        PushTokenService.shared.resetFirstSubmissionPromptGate()
        defer { PushTokenService.shared.resetFirstSubmissionPromptGate() }

        let fired = PushTokenService.shared.armFirstSubmissionPromptGate()

        #expect(fired, "The first call, on a fresh install, must arm the gate")
        #expect(defaults.bool(forKey: "patina.push.hasPromptedAfterFirstSubmission"))
    }

    @Test
    func secondCallNeverReArmsTheGate() {
        PushTokenService.shared.resetFirstSubmissionPromptGate()
        defer { PushTokenService.shared.resetFirstSubmissionPromptGate() }

        let first = PushTokenService.shared.armFirstSubmissionPromptGate()
        let second = PushTokenService.shared.armFirstSubmissionPromptGate()
        let third = PushTokenService.shared.armFirstSubmissionPromptGate()

        #expect(first, "First submission ever must arm the gate")
        #expect(!second, "A second submission must never re-arm it")
        #expect(!third, "Nor a third, nor any later one")
    }

    @Test
    func gateStaysArmedAcrossManySubmissionsUntilExplicitlyReset() {
        PushTokenService.shared.resetFirstSubmissionPromptGate()
        defer { PushTokenService.shared.resetFirstSubmissionPromptGate() }

        _ = PushTokenService.shared.armFirstSubmissionPromptGate()
        for _ in 0..<10 {
            #expect(!PushTokenService.shared.armFirstSubmissionPromptGate())
        }
    }

    // MARK: - Fixtures

    /// A minimal, valid `.mobileprovision`-shaped XML plist body carrying
    /// `Entitlements.aps-environment`. Real profiles wrap this in a signed
    /// CMS envelope; `apsEnvironment(fromProvisioningProfileData:)` only
    /// needs the `<?xml …>…</plist>` substring to be present somewhere in
    /// the bytes, which `apsEnvironmentSurvivesBinaryEnvelope` pins directly.
    private static func fakeProvisioningProfile(apsEnvironment: String) -> Data {
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <plist version="1.0">
        <dict>
            <key>Entitlements</key>
            <dict>
                <key>aps-environment</key>
                <string>\(apsEnvironment)</string>
            </dict>
        </dict>
        </plist>
        """
        return Data(plist.utf8)
    }
}
