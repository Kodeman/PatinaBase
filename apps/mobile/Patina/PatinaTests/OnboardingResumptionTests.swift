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

/// Serialized: five cases below move `AppSettings.shared.hasCompletedOnboarding`,
/// a process global. A `defer` restores it, which is enough for a sequential
/// run and not enough for a parallel one — Swift Testing parallelises by
/// default, and any other suite reading that flag during the window would see
/// the mutation.
@Suite(.serialized)
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

        // The shipped budget, and then the mechanism at a budget that does not
        // hold a parallel test run for two seconds to prove one branch.
        #expect(OnboardingCompletion.serverReadBudget <= .seconds(3))

        let started = ContinuousClock.now
        await completion.resolve(
            userId: "slow",
            budget: .milliseconds(50),
            hasServerStyleProfile: { _ in
                try? await Task.sleep(for: .seconds(30))
                return true
            }
        )
        // Generous on purpose: the claim is "it did not wait for the 30 s
        // read", and this suite runs in parallel with 1600 others.
        #expect(ContinuousClock.now - started < .seconds(20))
        #expect(!AppSettings.shared.hasCompletedOnboarding)
    }

    // MARK: - Wiring

    /// The resolve has to precede the assignment that wakes the phase
    /// observer, not merely `markAuthStateReady` — which is already true by
    /// the time anyone signs in from the Welcome screen.
    ///
    /// Measured on the lane's clone before the fix: signing in as an account
    /// that HAS a `user_style_signals` row logged
    /// `phase auth → onboarding (onboarded=false)` and then, 130 ms later,
    /// `phase onboarding → main (onboarded=true)`. `ContentView` animates
    /// phase changes over 0.5 s, so that was a visible cross-fade through the
    /// intro carousel — B-21's own symptom, at a tenth of the duration.
    @Test("the resolve runs before the session is published, not after")
    func resolvedBeforeTheSessionIsPublished() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        let body = try #require(
            source.range(of: "private func establishSession(_ session: Session) async -> Bool {")
        )
        let block = String(source[body.lowerBound...].prefix(700))
        let resolve = try #require(block.range(of: "await onboardingCompletion.resolve(userId:"))
        let publish = try #require(block.range(of: "return applySession(session)"))
        #expect(resolve.lowerBound < publish.lowerBound)

        // And every site that installs a REAL session goes through it, so the
        // ordering does not depend on which door the person came in by.
        let strays = source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map(String.init)
            .filter { $0.contains("applySession(") }
            .filter { !$0.contains("applySession(nil)") }
            .filter { !$0.contains("private func applySession") }
            .filter { !$0.contains("return applySession(session)") }
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
            .filter { !$0.contains("///") }
        #expect(strays.isEmpty, "a session is installed without resolving first: \(strays)")
    }

    /// The gate is its own watermark, NOT `accountChanged`.
    ///
    /// Six of the seven `applySession` call sites install the session before
    /// GoTrue emits the matching event, so by the time `.signedIn` arrives
    /// `settledUserId` already holds this user and `accountChanged` is false.
    /// Gated on it, this never fired on a real sign-in — `client@patina.dev`,
    /// which has a `user_style_signals` row, still met the intro carousel on
    /// the simulator. Caught by the self-check walk, not by a test, so the
    /// test is here now.
    @Test("the resolve gate is not accountChanged")
    func gateIsItsOwnWatermark() throws {
        let source = try SourcePin.read("Patina/Services/Auth/AuthService.swift")
        #expect(source.contains("private var onboardingResolvedForUserId: String?"))
        #expect(source.contains("if onboardingResolvedForUserId != userId {"))

        // Stamped BEFORE the await, so a second install landing during the
        // read cannot double-run it.
        let gate = try #require(source.range(of: "if onboardingResolvedForUserId != userId {"))
        let block = String(source[gate.lowerBound...].prefix(300))
        let stamp = try #require(block.range(of: "onboardingResolvedForUserId = userId"))
        let call = try #require(block.range(of: "await onboardingCompletion.resolve"))
        #expect(stamp.lowerBound < call.lowerBound)

        // And cleared on sign-out, so signing back in resolves again.
        #expect(source.contains("onboardingResolvedForUserId = nil"))
    }

    /// The list survives sign-out on purpose — that is the whole of B-21 on a
    /// shared phone — so it needs a ceiling, or the device accumulates an
    /// unbounded record of who has signed in here, outside everything
    /// `LocalStoreReset` wipes.
    @Test("the per-device account record is bounded, and delete-account drops it")
    func theAccountRecordIsBounded() throws {
        let (completion, defaults) = store("OnboardingResumptionTests.bound")
        defer { defaults.removePersistentDomain(forName: "OnboardingResumptionTests.bound") }

        for index in 0..<(OnboardingCompletion.recordLimit + 4) {
            completion.markCompleted(userId: "user-\(index)")
        }
        let kept = try #require(defaults.stringArray(forKey: OnboardingCompletion.key))
        #expect(kept.count == OnboardingCompletion.recordLimit)
        // Oldest out first; the most recent account is still known.
        #expect(!completion.hasCompleted(userId: "user-0"))
        #expect(completion.hasCompleted(userId: "user-\(OnboardingCompletion.recordLimit + 3)"))

        completion.forgetAll()
        #expect(defaults.stringArray(forKey: OnboardingCompletion.key) == nil)

        // And deleting the account is where the app drops it, because the
        // record deliberately sits outside LocalStoreReset.
        let deletion = try SourcePin.read("Patina/Features/Account/AccountDeletionService.swift")
        #expect(deletion.contains("OnboardingCompletion.shared.forgetAll()"))
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
