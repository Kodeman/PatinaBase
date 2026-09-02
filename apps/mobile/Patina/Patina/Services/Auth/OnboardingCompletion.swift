//
//  OnboardingCompletion.swift
//  Patina
//
//  B-21 — an existing account is never re-run through the first-run intro and
//  the five-question quiz.
//
//  `AppSettings.hasCompletedOnboarding` is a bare device flag, so it is false
//  on every fresh install — and every round-one tester is a fresh install.
//  `client@patina.dev`, with projects, rooms, invoices and a designer, landed
//  on "Every room tells a story. Let's discover yours."
//
//  Onboarding is a fact about the ACCOUNT, so it is recorded against the
//  account, in two places:
//
//  * on this device, a set of user ids that finished here — the cheap answer,
//    correct for the second sign-in on the same phone;
//  * on the server, `user_style_signals`, the row `process_style_quiz` writes.
//    Owner-readable (`auth.uid() = user_id`, 00019), so the account's own
//    session can ask "have I already done this?" on a phone that has never
//    seen it. That is the case the finding was written about.
//
//  Never turns the flag OFF. An account that onboarded on device A and has no
//  server row (a Skip, which writes no quiz) still onboards once on device B —
//  the honest cost of not having a server-side onboarding column, and one
//  short pass rather than a wrong "you are new here" for a real client.
//

import Foundation
import Supabase

struct OnboardingCompletion: Sendable {

    static let key = "patina.onboarding.completedUserIds.v1"

    nonisolated static let shared = OnboardingCompletion()

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    // MARK: - Device-local record

    func hasCompleted(userId: String) -> Bool {
        completedUserIds().contains(userId)
    }

    /// Record that THIS account finished onboarding. Called wherever
    /// `hasCompletedOnboarding` is set, so the two never disagree.
    func markCompleted(userId: String?) {
        guard let userId, !userId.isEmpty else { return }
        var ids = completedUserIds()
        guard !ids.contains(userId) else { return }
        ids.insert(userId)
        defaults.set(Array(ids), forKey: Self.key)
    }

    private func completedUserIds() -> Set<String> {
        Set(defaults.stringArray(forKey: Self.key) ?? [])
    }

    // MARK: - Decision (pure)

    /// Whether the device flag should be flipped on for the account that just
    /// signed in. Pure so the seam is a testable fact rather than something
    /// only a live session can exercise.
    static func shouldSkipOnboarding(
        deviceFlag: Bool,
        completedOnThisDevice: Bool,
        hasServerStyleProfile: Bool
    ) -> Bool {
        deviceFlag || completedOnThisDevice || hasServerStyleProfile
    }

    // MARK: - Resolve, at sign-in

    /// How long the server read may hold the launch. It runs only when the
    /// device flag is FALSE — i.e. a fresh install, which is about to show the
    /// intro carousel anyway — so an already-onboarded install pays nothing.
    /// On a timeout the reader takes one short pass through onboarding, which
    /// is the pre-existing behaviour and cheaper than a stalled launch.
    static let serverReadBudget: Duration = .seconds(2)

    /// Ask the two sources and, if either says the account is past onboarding,
    /// flip the device flag. Never flips it back off, never throws.
    ///
    /// Awaited BEFORE the auth state is published, so the phase observer sees
    /// the resolved flag and a returning client never sees the carousel flash.
    @MainActor
    func resolve(
        userId: String,
        budget: Duration = OnboardingCompletion.serverReadBudget,
        hasServerStyleProfile: @escaping @Sendable (String) async -> Bool = OnboardingCompletion.serverStyleProfileExists
    ) async {
        if AppSettings.shared.hasCompletedOnboarding {
            markCompleted(userId: userId)
            return
        }
        let onThisDevice = hasCompleted(userId: userId)
        let server = onThisDevice
            ? true
            : await Self.withBudget(hasServerStyleProfile, userId, budget)

        guard Self.shouldSkipOnboarding(
            deviceFlag: false,
            completedOnThisDevice: onThisDevice,
            hasServerStyleProfile: server
        ) else { return }

        AppSettings.shared.hasCompletedOnboarding = true
        AppSettings.shared.hasSeenThreshold = true
        markCompleted(userId: userId)
    }

    private static func withBudget(
        _ read: @escaping @Sendable (String) async -> Bool,
        _ userId: String,
        _ budget: Duration
    ) async -> Bool {
        await withTaskGroup(of: Bool.self) { group in
            group.addTask { await read(userId) }
            group.addTask {
                try? await Task.sleep(for: budget)
                return false
            }
            let first = await group.next() ?? false
            group.cancelAll()
            return first
        }
    }

    /// One owner-scoped row read against `user_style_signals` — the table
    /// `process_style_quiz` writes when the quiz is submitted.
    static func serverStyleProfileExists(userId: String) async -> Bool {
        do {
            let rows: [StyleSignalRow] = try await SupabaseClientManager.shared.client.database
                .from("user_style_signals")
                .select("user_id")
                .eq("user_id", value: userId)
                .limit(1)
                .execute()
                .value
            return !rows.isEmpty
        } catch {
            PatinaLog.auth.debug(
                "OnboardingCompletion: style-signal read deferred — \(error.localizedDescription)"
            )
            return false
        }
    }

    private struct StyleSignalRow: Decodable, Sendable {
        let userId: String

        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
        }
    }
}
