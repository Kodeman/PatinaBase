//
//  AppleSignInRoleTests.swift
//  PatinaTests
//
//  A3-07 / ruling B2 v3(c) — the Apple path writes `role: "homeowner"`.
//
//  `handle_new_user` (00313) honours exactly one client-supplied role string,
//  the literal `'homeowner'` in `raw_user_meta_data.role`, and otherwise falls
//  to 00013's default, `'designer'`. `sendMagicLink` and `signUp` both pass the
//  hint; `signInWithIdToken` takes no `data:` parameter, so an Apple tester
//  landed labelled `designer` and nothing corrected it.
//
//  B2 v3 kept the trigger at 00313 verbatim and moved the correction to the
//  two callers that know the answer. This pins the app's half against the five
//  rules in `build/waves/w1/l1-a-notes.md`.
//

import Foundation
import Testing
@testable import Patina

struct AppleSignInRoleTests {

    private func authService() throws -> String {
        try SourcePin.read("Patina/Services/Auth/AuthService.swift")
    }

    /// The seam: what the sign-in path calls, and what it does with a failure.
    private func relabelBody() throws -> String {
        let source = try authService()
        let start = try #require(source.range(of: "func applyHomeownerRoleAfterOAuth("))
        let end = try #require(source.range(of: "/// Sign in with Google via OAuth"))
        return String(source[start.lowerBound..<end.lowerBound])
    }

    /// The live write itself, now a named closure rather than an inline body.
    private func liveWriteBody() throws -> String {
        let source = try authService()
        let start = try #require(source.range(of: "static let liveRelabelProfile:"))
        let end = try #require(source.range(of: "/// Sign in with Google via OAuth"))
        return String(source[start.lowerBound..<end.lowerBound])
    }

    @Test("the write happens, on the profiles table, with role = homeowner")
    func theWriteHappens() throws {
        let body = try liveWriteBody()
        #expect(body.contains(".from(\"profiles\")"))
        #expect(body.contains(".update([\"role\": \"homeowner\"])"))
    }

    /// Rule 1 — scoped to `id = self`, from the session this sign-in returned.
    @Test("scoped to the caller's own id, taken from the returned session")
    func scopedToSelf() throws {
        let live = try liveWriteBody()
        #expect(live.contains(".eq(\"id\", value: userId)"))
        let source = try authService()
        // The id the seam is handed is the one this sign-in just returned.
        #expect(source.contains("await applyHomeownerRoleAfterOAuth(userId: session.user.id)"))
    }

    /// Rule 2 — `role` only. One key in the body.
    @Test("role only — is_designer is never written")
    func roleOnly() throws {
        let body = try liveWriteBody()
        #expect(!body.contains("is_designer"))
        let updates = body.components(separatedBy: ".update(").count - 1
        #expect(updates == 1)
    }

    /// Rule 3 + 4 — idempotent, once per sign-in, called from exactly the two
    /// OAuth paths and nowhere else.
    @Test("called after Apple and after Google, and from nowhere else")
    func calledFromExactlyTheTwoOAuthPaths() throws {
        let source = try authService()
        let calls = source.components(separatedBy: "await applyHomeownerRoleAfterOAuth(userId:").count - 1
        #expect(calls == 2, "expected exactly the Apple and Google paths, found \(calls)")

        // Apple: immediately after the id-token exchange lands a session.
        let apple = try #require(source.range(of: "signInWithIdToken("))
        let appleCall = try #require(source.range(of: "await applyHomeownerRoleAfterOAuth(userId: session.user.id)"))
        #expect(apple.lowerBound < appleCall.lowerBound)

        // Google: `signInWithOAuth` returns the Session, so it is the same seam
        // — the relabel is inside the same `do` block, before its `catch`.
        let google = try #require(source.range(of: "let session = try await supabase.auth.signInWithOAuth("))
        let googleBlock = String(source[google.lowerBound...].prefix(600))
        #expect(googleBlock.contains("await applyHomeownerRoleAfterOAuth(userId: session.user.id)"))
    }

    @Test("it is not in a view's onAppear or a retry timer")
    func notInAViewOrARetry() {
        for path in SourcePin.swiftFiles(under: "Patina/Features") {
            guard let source = try? String(contentsOfFile: path, encoding: .utf8) else { continue }
            #expect(
                !source.contains("applyHomeownerRoleAfterOAuth"),
                "the relabel must stay on the sign-in seam, not in \(path)"
            )
        }
    }

    /// Rule 5 — never fatal.
    @Test("a failure is logged and swallowed; the sign-in still succeeds")
    func neverFatal() throws {
        let body = try relabelBody()
        #expect(body.contains("} catch {"))
        #expect(body.contains("PatinaLog.auth.debug"))
        // No rethrow, and the function itself cannot throw.
        #expect(!body.contains("throw "))
        #expect(body.contains("func applyHomeownerRoleAfterOAuth(userId: UUID) async {"))
    }

    /// The note is explicit that the email/OTP paths must NOT gain this write.
    @Test("the email and OTP paths are untouched — they already send the hint")
    func emailAndOtpPathsUnchanged() throws {
        let source = try authService()

        let signUpStart = try #require(source.range(of: "public func signUp(email:"))
        let signUpEnd = try #require(source.range(of: "/// Surface an error from an external sign-in surface"))
        let signUp = String(source[signUpStart.lowerBound..<signUpEnd.lowerBound])
        #expect(signUp.contains("[\"role\": .string(\"homeowner\")]"))
        #expect(!signUp.contains("applyHomeownerRoleAfterOAuth"))

        let magicStart = try #require(source.range(of: "public func sendMagicLink(email:"))
        let magicEnd = try #require(source.range(of: "/// Verify a 6-digit OTP code"))
        let magic = String(source[magicStart.lowerBound..<magicEnd.lowerBound])
        #expect(magic.contains("data: [\"role\": .string(\"homeowner\")]"))
        #expect(!magic.contains("applyHomeownerRoleAfterOAuth"))

        let otpStart = try #require(source.range(of: "public func verifyOtp(email:"))
        let otpEnd = try #require(source.range(of: "/// Handle magic link URL callback"))
        #expect(!String(source[otpStart.lowerBound..<otpEnd.lowerBound]).contains("applyHomeownerRoleAfterOAuth"))
    }

    // MARK: - RL2A-09 · driven, not read

    /// Rule 3, measured: a returning Apple tester runs the relabel again and
    /// it is the same single-key write. Round one asserted the CALL-SITE COUNT
    /// was 2 under the word "idempotent", which is a different claim.
    @Test("a second sign-in for the same account issues the same single-key write")
    @MainActor
    func aSecondSignInIssuesTheSameSingleKeyWrite() async {
        let recorder = RelabelRecorder()
        let service = AuthService.shared
        let original = service.relabelProfile
        defer { service.relabelProfile = original }
        service.relabelProfile = { userId in recorder.record(userId) }

        let userId = UUID()
        await service.applyHomeownerRoleAfterOAuth(userId: userId)
        await service.applyHomeownerRoleAfterOAuth(userId: userId)

        #expect(recorder.ids == [userId, userId])
    }

    /// Rule 5, measured: a 4xx on a cosmetic PATCH must not fail the sign-in.
    @Test("a thrown relabel does not propagate out of the sign-in seam")
    @MainActor
    func aThrownRelabelDoesNotFailTheSignIn() async {
        struct Boom: Error {}
        let service = AuthService.shared
        let original = service.relabelProfile
        defer { service.relabelProfile = original }
        service.relabelProfile = { _ in throw Boom() }

        // No `try`: the seam cannot throw, which is the rule.
        await service.applyHomeownerRoleAfterOAuth(userId: UUID())
    }
}

private final class RelabelRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [UUID] = []

    func record(_ id: UUID) {
        lock.lock(); recorded.append(id); lock.unlock()
    }

    var ids: [UUID] {
        lock.lock(); defer { lock.unlock() }; return recorded
    }
}
