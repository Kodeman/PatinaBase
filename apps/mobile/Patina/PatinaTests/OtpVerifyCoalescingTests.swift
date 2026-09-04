//
//  OtpVerifyCoalescingTests.swift
//  PatinaTests
//
//  RL2A-12 — one code must start one verify.
//
//  `otpTokenChanged` normalises the pasted string and writes it back when it
//  differs, which re-fires the field's `.onChange` and calls the method a
//  second time. `verifyOtp` guarded on `isVerifyingOtp` but only raised the
//  flag INSIDE the Task it created, so both callers could pass the guard.
//  `verifyOtpTask?.cancel()` cancels the first handle, but its body never
//  checks `Task.isCancelled` and the network call proceeds — so a single-use
//  code produced a second POST, "Token has expired or is invalid", and an
//  error banner landing after a successful sign-in.
//
//  Reachable whenever the pasted value needs trimming: more than six
//  characters, or spaces or dashes inside it.
//

import Foundation
import Testing
@testable import Patina

@MainActor
struct OtpVerifyCoalescingTests {

    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var count = 0
        func increment() { lock.lock(); count += 1; lock.unlock() }
        var value: Int { lock.lock(); defer { lock.unlock() }; return count }
    }

    private func viewModel(_ counter: Counter) -> AuthViewModel {
        let model = AuthViewModel(initialMode: .magicLink)
        model.magicLinkEmail = "client@patina.dev"
        model.verifyOtpHandler = { _, _ in
            counter.increment()
            try await Task.sleep(for: .milliseconds(30))
        }
        return model
    }

    @Test("a pasted code that needs trimming starts exactly one verify")
    func oneCodeStartsOneVerify() async {
        let counter = Counter()
        let model = viewModel(counter)

        // The paste, then the `onChange` that writing the trimmed value back
        // fires — the two callers the finding is about.
        async let first: Void = model.otpTokenChanged("123 456")
        async let second: Void = model.otpTokenChanged("123456")
        _ = await (first, second)

        #expect(model.otpToken == "123456")
        #expect(counter.value == 1, "expected one verify, got \(counter.value)")
    }

    @Test("a clean six digits still verifies, exactly once")
    func aCleanCodeStillVerifies() async {
        let counter = Counter()
        let model = viewModel(counter)

        await model.otpTokenChanged("654321")
        #expect(counter.value == 1)
        #expect(!model.isVerifyingOtp)
    }

    @Test("fewer than six digits starts nothing")
    func aShortCodeStartsNothing() async {
        let counter = Counter()
        let model = viewModel(counter)

        await model.otpTokenChanged("12345")
        #expect(counter.value == 0)
    }

    /// The property the behaviour rests on: the flag is raised on the
    /// synchronous pass, before the Task that clears it in its `defer` exists.
    @Test("the in-flight flag is raised before the Task, not inside it")
    func theFlagIsRaisedBeforeTheTask() throws {
        let source = try SourcePin.read("Patina/Features/Authentication/ViewModels/AuthViewModel.swift")
        let start = try #require(source.range(of: "public func verifyOtp() async {"))
        let body = String(source[start.upperBound...].prefix(900))
        let raise = try #require(body.range(of: "isVerifyingOtp = true"))
        let spawn = try #require(body.range(of: "let task = Task {"))
        #expect(raise.lowerBound < spawn.lowerBound)
    }
}
