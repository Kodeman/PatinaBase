//
//  TestAccountLoginFallback.swift
//  Patina
//
//  A3-16 / ruling D7 — the advertised tester credential works IN THE APP.
//
//  `supabase/functions/test-account-login` is an owner-authorized, pre-auth
//  path for accounts on a Vault-backed allow-list (`app_setting`
//  'test_login_accounts' / 'test_login_code'). A caller POSTs `{email, code}`;
//  on a match the function mints a normal single-use GoTrue **magiclink**
//  token and returns its `hashed_token`. The CALLER redeems it. The designer
//  portal does exactly that in `apps/designer-portal/src/app/auth/
//  test-account-fallback.ts`; this is the same contract for iOS.
//
//  Three properties the reviewer will check, all inherited from the portal:
//
//  1. **No allow-list in the app.** The pair goes to the server and the server
//     decides. Every failure mode — not allow-listed, wrong code, missing
//     config, rate limited, `generateLink` failure — comes back as the same
//     generic 403, so the app cannot learn (and must not encode) who is on it.
//  2. **Fail closed.** Anything that is not a 200 carrying a `token_hash` that
//     then redeems to a session returns `false`, and the caller falls through
//     to the ordinary invalid-code error. `code` is never logged.
//  3. **Never on the happy path.** It is tried only after the plain GoTrue
//     verify has failed, so it can never intercept a real user's sign-in.
//
//  Redeems with `type: .magiclink`, matching the function's
//  `generateLink({ type: 'magiclink' })`. `.email` is for a real OTP code, not
//  a magiclink token hash — the portal's comment says the same.
//

import Foundation
import Supabase

/// The function's success body. A 403 carries `{error}` and no hash. File
/// scope so its `CodingKeys` is not two levels deep (SwiftLint `nesting`).
struct TestAccountLoginResponse: Decodable, Sendable {
    let tokenHash: String?

    enum CodingKeys: String, CodingKey {
        case tokenHash = "token_hash"
    }
}

struct TestAccountLoginFallback: Sendable {

    static let functionName = "test-account-login"

    /// POST `{email, code}` and return the body. Injected in tests.
    var mintTokenHash: @Sendable (_ email: String, _ code: String) async throws -> TestAccountLoginResponse
    /// Redeem the minted hash. Injected in tests.
    var redeem: @Sendable (_ tokenHash: String) async throws -> Bool

    static let live = TestAccountLoginFallback(
        mintTokenHash: { email, code in
            try await SupabaseClientManager.shared.client.functions.invoke(
                functionName,
                options: FunctionInvokeOptions(body: ["email": email, "code": code])
            )
        },
        redeem: { tokenHash in
            let response = try await SupabaseClientManager.shared.client.auth.verifyOTP(
                tokenHash: tokenHash,
                type: .magiclink
            )
            return response.session != nil
        }
    )

    /// The one domain a test account can be on. Patina's own, and public —
    /// it is on the App Store listing and in every invite — so it is not a
    /// roster and names nobody. Ruling D7's identity is on it; so was the
    /// retired one.
    ///
    /// Extending the Vault allow-list (`app_setting 'test_login_accounts'`) to
    /// an address outside this domain needs an app change, and that is the
    /// deliberate trade: without it every mistyped sixth digit from a real
    /// homeowner POSTs their address and the code they typed to a pre-auth
    /// public endpoint — and `C1-37`'s auto-verify fires on every one of them,
    /// which would also feed 00551's rate limiter with genuine-user traffic.
    static let testAccountDomain = "@patina.cloud"

    /// Whether the pair is even worth sending.
    ///
    /// Still NOT an allow-list: it names a domain, never an address, so no
    /// person is singled out and no roster can be read off the binary. The
    /// server remains the only thing that decides — every miss on a
    /// `@patina.cloud` address still comes back as the same generic 403.
    static func isWorthAttempting(email: String, code: String) -> Bool {
        let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
        return !address.isEmpty
            && address.lowercased().hasSuffix(testAccountDomain)
            && !code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// `true` only when a session actually landed.
    func attempt(email: String, code: String) async -> Bool {
        guard Self.isWorthAttempting(email: email, code: code) else { return false }
        do {
            let response = try await mintTokenHash(email, code)
            guard let tokenHash = response.tokenHash, !tokenHash.isEmpty else { return false }
            return try await redeem(tokenHash)
        } catch {
            // Never logs `code`, and never surfaces the function's words to a
            // homeowner — the caller shows the ordinary invalid-code error.
            PatinaLog.auth.debug("test-account-login fallback declined")
            return false
        }
    }
}
