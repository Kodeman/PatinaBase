//
//  PushAuthorizationCopyTests.swift
//  PatinaTests
//
//  C2-09 — "Turn on notifications" was a silent no-op once authorization had
//  been refused.
//
//  `requestAuthorizationAndRegister()` was `guard granted else { return }` with
//  no `.denied` branch. iOS shows its alert once per install, and
//  `InvoiceReminderService.requestAlertAuthorization([.alert])` can consume it
//  first — after which `requestAuthorization` returns `false` instantly. The
//  primer's primary black capsule, tapped, did nothing at all and dismissed:
//  the purest dead end there is, on the one screen that asks a homeowner for
//  something.
//
//  The decision is pure here on purpose. Touching `UNUserNotificationCenter` in
//  a test run surfaces a real system dialog and hangs the run.
//

import Foundation
import UIKit
import UserNotifications
import Testing
@testable import Patina

@MainActor
struct PushAuthorizationCopyTests {

    // MARK: - The decision

    @Test("an undecided install is asked")
    func undecidedIsAsked() {
        #expect(PushTokenService.outcome(for: .notDetermined) == .ask)
    }

    @Test("an install that already granted registers without re-prompting")
    func authorizedRegistersWithoutAsking() {
        #expect(PushTokenService.outcome(for: .authorized) == .alreadyAuthorized)
        #expect(PushTokenService.outcome(for: .provisional) == .alreadyAuthorized)
        #expect(PushTokenService.outcome(for: .ephemeral) == .alreadyAuthorized)
    }

    @Test("a refusal is a refusal, and the app has to say so")
    func deniedIsDenied() {
        #expect(PushTokenService.outcome(for: .denied) == .denied)
    }

    // MARK: - What it says, and where it sends them

    @Test("the denied line is the app's own sentence, and the app's only one")
    func theDeniedLineIsOneSentence() {
        let line = PushTokenService.deniedLine
        #expect(line == "Notifications are off for Patina. You can turn them on in Settings.")
        // One app, one way of saying this — the invoice reminder's line, reused
        // rather than reworded.
        #expect(line == InvoiceReminder.deniedLine)
        // No vendor, no API, no error string in front of a homeowner (C5).
        #expect(!line.contains("UN"))
        #expect(!line.lowercased().contains("error"))
        #expect(!line.lowercased().contains("failed"))
    }

    @Test("the door it offers is the system Settings door")
    func theSettingsDoorIsReal() throws {
        let url = try #require(PushTokenService.settingsURL)
        #expect(url.absoluteString == UIApplication.openSettingsURLString)
    }

    // MARK: - The screen

    /// The primer must read the status BEFORE asking, and must not dismiss on a
    /// refusal — the two halves of the finding, pinned where they live.
    @Test("the ask reads authorization before it asks")
    func theStatusIsReadFirst() throws {
        let code = SourceScan.code(in: try SourcePin.read("Patina/Services/API/PushTokenService.swift"))
        let asked = try #require(code.range(of: "func requestAuthorizationAndRegister()"))
        let body = String(code[asked.lowerBound...].prefix(900))

        let statusRead = try #require(body.range(of: "notificationSettings().authorizationStatus"))
        let request = try #require(body.range(of: "requestAuthorization(options:"))
        #expect(statusRead.lowerBound < request.lowerBound)
    }

    @Test("a denied ask keeps the screen and offers Settings")
    func aDeniedAskDoesNotJustDismiss() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Notifications/Views/PushPrimerView.swift")
        )

        #expect(code.contains("if outcome == .denied {"))
        #expect(code.contains("isDenied = true"))
        #expect(code.contains("PushTokenService.deniedLine"))
        #expect(code.contains("PatinaButton(\"Open Settings\", style: .primary)"))
        #expect(code.contains("PushPrimerView.OpenSettings"))
    }

    /// Round 2: `.granted` is not a state the pre-ask switch can be in —
    /// `outcome(for:)` produces only `.alreadyAuthorized`, `.denied` or `.ask`.
    /// It shares `.ask`'s arm so the switch stays exhaustive over the enum
    /// without reading as a fourth reachable case.
    @Test("the pre-ask switch has no unreachable arm")
    func thePreAskSwitchHasNoUnreachableArm() throws {
        for status in [
            UNAuthorizationStatus.notDetermined, .denied, .authorized,
            .provisional, .ephemeral
        ] {
            #expect(PushTokenService.outcome(for: status) != .granted)
        }

        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Services/API/PushTokenService.swift")
        )
        #expect(code.contains("case .ask, .granted, .failed:"))
        #expect(code.contains("case .granted:\n            break") == false)
    }

    /// `C2-09`'s fix line says read the status BEFORE asking. The service does;
    /// the screen did not, so a tester who refused in an earlier session was
    /// still shown "Turn on notifications" and only learned it was inert by
    /// tapping it (`RL1F-30`).
    @Test("the primer opens in the state it is already in")
    func thePrimerReadsAuthorizationOnAppear() throws {
        let code = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Notifications/Views/PushPrimerView.swift")
        )
        let task = try #require(code.range(of: ".task {"))
        let read = try #require(code.range(of: "notificationSettings().authorizationStatus"))
        let set = try #require(code.range(of: "isDenied = PushTokenService.outcome(for: status) == .denied"))
        #expect(task.lowerBound < read.lowerBound)
        #expect(read.lowerBound < set.lowerBound)
    }

    /// A transport failure is not a refusal. Reporting it as `.denied` printed
    /// "Notifications are off for Patina" and handed over a Settings button for
    /// something Settings will not fix.
    @Test("a throw is its own outcome, and it changes nothing on the screen")
    func aThrowIsNotARefusal() throws {
        let service = SourceScan.code(
            in: try SourcePin.read("Patina/Services/API/PushTokenService.swift")
        )
        let caught = try #require(service.range(of: "} catch {"))
        let after = String(service[caught.lowerBound...].prefix(400))
        #expect(after.contains("return .failed"))
        #expect(!after.contains("return .denied"))

        let screen = SourceScan.code(
            in: try SourcePin.read("Patina/Features/Notifications/Views/PushPrimerView.swift")
        )
        #expect(screen.contains("if outcome == .failed { return }"))
        // …and it is not folded into the denied arm, which would print the
        // wrong sentence.
        #expect(screen.contains("if outcome == .denied {"))
    }

    /// Q7's words are ruled verbatim and this lane does not touch them.
    /// `W1-A-01` supersedes one glyph: the apostrophe is the app's U+2019, not
    /// the ruling file's U+0027, so `A-06` and Q7 stop contradicting each other.
    @Test("the promise the ask is made on is unchanged")
    func theRuledSentenceIsUntouched() {
        #expect(PushPrimerView.sentence == "We\u{2019}ll tell you when your designer sends something that needs you — a decision, a proposal, or an invoice. Nothing else.")
        #expect(PushPrimerView.title == "Before we interrupt you")
    }
}
