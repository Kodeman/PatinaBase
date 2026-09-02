//
//  OnboardingResumptionTests.swift
//  PatinaTests
//
//  B-21 — an existing account is never re-run through the first-run intro and
//  the mandatory five-question quiz.
//
//  `client@patina.dev` — projects, rooms, invoices, a designer — signed in on
//  a fresh install and landed on "Every room tells a story. Let's discover
//  yours." and, on Skip, in the quiz. Every round-one tester is a fresh
//  install, so this is the finding the wave was written around.
//
//  Completion is a fact about the ACCOUNT: a device-local set of user ids,
//  plus `user_style_signals` on the server (the row `process_style_quiz`
//  writes, owner-readable under 00019).
//

import Foundation
import Testing
@testable import Patina

struct OnboardingResumptionTests {

    private func store(_ suite: String) -> (OnboardingCompletion, UserDefaults) {
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return (OnboardingCompletion(defaults: defaults), defaults)
    }

    // MARK: - The decision

    @Test("any one source saying yes skips onboarding")
    func anySourceSkips() {
        #expect(OnboardingCompletion.shouldSkipOnboarding(
            deviceFlag: true, completedOnThisDevice: false, hasServerStyleProfile: false))
        #expect(OnboardingCompletion.shouldSkipOnboarding(
            deviceFlag: false, completedOnThisDevice: true, hasServerStyleProfile: false))
        #expect(OnboardingCompletion.shouldSkipOnboarding(
            deviceFlag: false, completedOnThisDevice: false, hasServerStyleProfile: true))
    }

    @Test("a genuinely new account still onboards")
    func newAccountOnboards() {
        #expect(!OnboardingCompletion.shouldSkipOnboarding(
            deviceFlag: false, completedOnThisDevice: false, hasServerStyleProfile: false))
    }

    // MARK: - The record

    @Test("completion is recorded per account, not per install")
    func recordIsKeyedByAccount() {
        let (completion, defaults) = store("OnboardingResumptionTests.record")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.record") }

        #expect(!completion.hasCompleted(userId: "user-a"))
        completion.markCompleted(userId: "user-a")
        #expect(completion.hasCompleted(userId: "user-a"))
        // A DIFFERENT account on the same phone is still new.
        #expect(!completion.hasCompleted(userId: "user-b"))
    }

    @Test("marking is idempotent and ignores a nil or empty id")
    func markingIsIdempotent() {
        let (completion, defaults) = store("OnboardingResumptionTests.idem")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.idem") }

        completion.markCompleted(userId: "user-a")
        completion.markCompleted(userId: "user-a")
        #expect(defaults.stringArray(forKey: OnboardingCompletion.key) == ["user-a"])

        completion.markCompleted(userId: nil)
        completion.markCompleted(userId: "")
        #expect(defaults.stringArray(forKey: OnboardingCompletion.key) == ["user-a"])
    }

    // MARK: - Resolution at sign-in

    @Test("an account with a server style profile skips the intro on a fresh install")
    @MainActor
    func serverProfileSkipsTheIntro() async {
        let (completion, defaults) = store("OnboardingResumptionTests.server")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.server") }

        let previous = AppSettings.shared.hasCompletedOnboarding
        defer { AppSettings.shared.hasCompletedOnboarding = previous }
        AppSettings.shared.hasCompletedOnboarding = false

        await completion.resolve(userId: "client-uuid", hasServerStyleProfile: { _ in true })
        #expect(AppSettings.shared.hasCompletedOnboarding)
        #expect(completion.hasCompleted(userId: "client-uuid"))
    }

    @Test("a genuinely new account is left to onboard")
    @MainActor
    func newAccountIsLeftAlone() async {
        let (completion, defaults) = store("OnboardingResumptionTests.new")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.new") }

        let previous = AppSettings.shared.hasCompletedOnboarding
        defer { AppSettings.shared.hasCompletedOnboarding = previous }
        AppSettings.shared.hasCompletedOnboarding = false

        await completion.resolve(userId: "brand-new", hasServerStyleProfile: { _ in false })
        #expect(!AppSettings.shared.hasCompletedOnboarding)
    }

    @Test("the device record alone is enough — no server read is needed")
    @MainActor
    func deviceRecordSkipsTheServerRead() async {
        let (completion, defaults) = store("OnboardingResumptionTests.device")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.device") }

        let previous = AppSettings.shared.hasCompletedOnboarding
        defer { AppSettings.shared.hasCompletedOnboarding = previous }
        AppSettings.shared.hasCompletedOnboarding = false
        completion.markCompleted(userId: "returning")

        let reads = OnboardingReadCounter()
        await completion.resolve(userId: "returning", hasServerStyleProfile: { _ in
            reads.increment()
            return false
        })
        #expect(AppSettings.shared.hasCompletedOnboarding)
        #expect(reads.value == 0)
    }

    @Test("the flag is never turned back off")
    @MainActor
    func neverTurnsTheFlagOff() async {
        let (completion, defaults) = store("OnboardingResumptionTests.never")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.never") }

        let previous = AppSettings.shared.hasCompletedOnboarding
        defer { AppSettings.shared.hasCompletedOnboarding = previous }
        AppSettings.shared.hasCompletedOnboarding = true

        await completion.resolve(userId: "someone", hasServerStyleProfile: { _ in false })
        #expect(AppSettings.shared.hasCompletedOnboarding)
        // And the account is recorded on the way past, so the next sign-in is free.
        #expect(completion.hasCompleted(userId: "someone"))
    }

    @Test("a hung server read cannot hold the launch open")
    @MainActor
    func serverReadIsBudgeted() async {
        let (completion, defaults) = store("OnboardingResumptionTests.budget")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.budget") }

        let previous = AppSettings.shared.hasCompletedOnboarding
        defer { AppSettings.shared.hasCompletedOnboarding = previous }
        AppSettings.shared.hasCompletedOnboarding = false

        #expect(OnboardingCompletion.serverReadBudget <= .seconds(3))

        let started = Date()
        await completion.resolve(userId: "slow", hasServerStyleProfile: { _ in
            try? await Task.sleep(for: .seconds(30))
            return true
        })
        #expect(Date().timeIntervalSince(started) < 10)
        #expect(!AppSettings.shared.hasCompletedOnboarding)
    }

    // MARK: - Wiring

    @Test("resolution runs on a real change of account, before auth state is published")
    func resolvedBeforeThePhaseObserverReads() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        let resolve = try #require(source.range(of: "await self.onboardingCompletion.resolve(userId:"))
        let ready = try #require(source.range(of: "self.markAuthStateReady()"))
        #expect(resolve.lowerBound < ready.lowerBound)
        // Not on every token refresh.
        #expect(source.contains("if accountChanged {\n                        await self.onboardingCompletion.resolve"))
    }

    @Test("finishing onboarding records the account as well as the device")
    func completionRecordsTheAccount() throws {
        let host = try SourcePin.read("Patina/Features/FirstLaunch/Views/OnboardingFlowHost.swift")
        #expect(host.contains("OnboardingCompletion.shared.markCompleted(userId: AuthService.shared.currentUserId)"))
        // Every site that sets the device flag also records the account.
        let flagSites = host.components(separatedBy: "AppSettings.shared.hasCompletedOnboarding = true").count - 1
        let recordSites = host.components(separatedBy: "OnboardingCompletion.shared.markCompleted").count - 1
        #expect(flagSites == recordSites, "\(flagSites) flag writes vs \(recordSites) account records")
    }
}

private final class OnboardingReadCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var count = 0

    func increment() {
        lock.lock(); count += 1; lock.unlock()
    }

    var value: Int {
        lock.lock(); defer { lock.unlock() }; return count
    }
}
