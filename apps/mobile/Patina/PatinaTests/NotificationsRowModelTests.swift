//
//  NotificationsRowModelTests.swift
//  PatinaTests
//
//  P-07 — the Settings toggle that tells the truth.
//
//  `setNotificationsEnabled` wrote `user_settings.push_notifications` and
//  `notification_preferences.channels_push` and never touched iOS
//  authorization, so a homeowner who had tapped "Not now" could flip the
//  switch, watch it stay on, and never receive anything.
//
//  The status provider is injected for the same reason `PushTokenService`
//  keeps `outcome(for:)` pure: touching `UNUserNotificationCenter` in a test
//  run surfaces a real system dialog and hangs the run.
//

import Foundation
import UserNotifications
import Testing
@testable import Patina

@MainActor
struct NotificationsRowModelTests {

    private func model(
        status: UNAuthorizationStatus,
        answer: PushTokenService.AuthorizationOutcome = .granted,
        asked: Box<Int> = Box(0),
        armed: Box<Int> = Box(0)
    ) -> NotificationsRowModel {
        NotificationsRowModel(
            readStatus: { status },
            requestAuthorization: {
                asked.value += 1
                return answer
            },
            armPromptGate: {
                armed.value += 1
                return true
            }
        )
    }

    /// A mutable counter a `@Sendable` closure can bump.
    final class Box<Value>: @unchecked Sendable {
        var value: Value
        init(_ value: Value) { self.value = value }
    }

    // MARK: - The three states

    @Test("an install that has never been asked is undecided")
    func notDeterminedIsUndecided() async {
        let row = model(status: .notDetermined)
        #expect(row.state == nil, "the row asserts nothing before the read lands")
        await row.refresh()
        #expect(row.state == .undecided)
    }

    @Test("a granted install is authorized, however it was granted")
    func authorizedIsAuthorized() async {
        for status in [UNAuthorizationStatus.authorized, .provisional, .ephemeral] {
            let row = model(status: status)
            await row.refresh()
            #expect(row.state == .authorized, "\(status) should read as authorized")
        }
    }

    @Test("a refused install is denied")
    func deniedIsDenied() async {
        let row = model(status: .denied)
        await row.refresh()
        #expect(row.state == .denied)
    }

    // MARK: - What the toggle does in each state

    @Test("turning it on from undecided asks iOS, once, and spends the install's one ask")
    func undecidedAsks() async {
        let asked = Box(0), armed = Box(0)
        let row = model(status: .notDetermined, answer: .granted, asked: asked, armed: armed)
        await row.refresh()

        await row.setEnabled(true, settings: SettingsService.shared)

        #expect(asked.value == 1)
        #expect(armed.value == 1, "the primer must not offer a second ask afterwards")
        #expect(row.state == .authorized)
    }

    /// The defect itself: a refusal must leave the row denied, never on.
    @Test("a refusal at the system alert settles the row as denied")
    func aRefusalIsNotSwallowed() async {
        let asked = Box(0)
        let row = model(status: .notDetermined, answer: .denied, asked: asked)
        await row.refresh()

        await row.setEnabled(true, settings: SettingsService.shared)

        #expect(asked.value == 1)
        #expect(row.state == .denied)
    }

    /// A throw is the system failing to ask, not the person refusing — the
    /// distinction `PushTokenService.AuthorizationOutcome.failed` exists for.
    @Test("an ask that throws changes nothing, so the person can tap again")
    func aFailedAskChangesNothing() async {
        let row = model(status: .notDetermined, answer: .failed)
        await row.refresh()

        await row.setEnabled(true, settings: SettingsService.shared)

        #expect(row.state == .undecided)
    }

    @Test("an authorized install never re-asks — the toggle is the preference again")
    func authorizedDoesNotReAsk() async {
        let asked = Box(0), armed = Box(0)
        let row = model(status: .authorized, asked: asked, armed: armed)
        await row.refresh()

        await row.setEnabled(true, settings: SettingsService.shared)
        await row.setEnabled(false, settings: SettingsService.shared)

        #expect(asked.value == 0)
        #expect(armed.value == 0)
        #expect(row.state == .authorized)
    }

    @Test("turning it off never asks, in any state")
    func turningOffNeverAsks() async {
        let asked = Box(0)
        let row = model(status: .notDetermined, asked: asked)
        await row.refresh()

        await row.setEnabled(false, settings: SettingsService.shared)

        #expect(asked.value == 0)
        #expect(row.state == .undecided)
    }

    /// The window before the read lands. The stored preference defaults ON,
    /// so anything that falls through to it draws a switch that claims
    /// notifications arrive over an install iOS has never been asked about.
    @Test("before the read lands the row draws off, and a tap still asks iOS")
    func theUnreadStateNeverClaimsAnything() async throws {
        let asked = Box(0)
        let row = model(status: .notDetermined, asked: asked)
        #expect(row.state == nil)

        // What the row draws, as `SettingsView` computes it.
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(code.contains("notificationsAuthorization.state == .authorized"),
                "the toggle reads the preference only over a status read as authorized")

        // And a tap in that window asks iOS rather than writing the
        // preference behind its back.
        await row.setEnabled(true, settings: SettingsService.shared)
        #expect(asked.value == 1)
        #expect(row.state == .authorized)
    }

    /// The read is local and `settings.load()` is two network round-trips —
    /// running them the other way round is the whole pre-read window.
    @Test("the status read runs before the settings load")
    func theStatusIsReadFirst() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        let refresh = try #require(code.range(of: "notificationsAuthorization.refresh()"))
        let load = try #require(code.range(of: "settings.load()"))
        #expect(refresh.lowerBound < load.lowerBound)
    }

    // MARK: - The row on screen

    /// The denied row is a door, and it says where it goes.
    @Test("the denied row offers iOS Settings in its own sentence")
    func theDeniedRowIsADoor() throws {
        #expect(SettingsView.turnOnInSettingsLabel == "Turn on in iOS Settings")

        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Settings/Views/SettingsView.swift")
        )
        #expect(code.contains("PushTokenService.settingsURL"))
        #expect(code.contains("Self.turnOnInSettingsLabel"))
    }

    /// No automatic re-ask path anywhere else: the only call sites of the ask
    /// are the primer, which is gated once per install, and this row.
    @Test("nothing else in the app asks for authorization")
    func theAskHasExactlyTwoCallSites() {
        let asks = SourcePin.swiftFiles(under: "Patina").filter { path in
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { return false }
            // The declaration itself lives in PushTokenService.
            guard !path.hasSuffix("PushTokenService.swift") else { return false }
            return SourceScan.code(in: source).contains("requestAuthorizationAndRegister()")
        }.map { URL(fileURLWithPath: $0).lastPathComponent }.sorted()

        #expect(asks == ["NotificationsRowModel.swift", "PushPrimerView.swift"],
                "a third automatic ask appeared: \(asks)")
    }
}
