//
//  AccountDeletionService.swift
//  Patina
//
//  SP-20 — closing the account. App Store Review Guideline 5.1.1(v) makes
//  this release-gating for any app that lets a person create an account.
//
//  Server side is the `delete-account` edge function (verify_jwt): it removes
//  the caller's rows and then the auth user through the admin API. The app
//  only sends the caller's own JWT — there is no id in the body, so this can
//  never be aimed at somebody else's account.
//
//  Deletion also has to clear the device: SP-06 keeps rooms, saves and the
//  taste portrait in a local SwiftData store, and leaving those behind after
//  the account is gone would hand them to the next person who signs in.
//

import Foundation
import Supabase

enum AccountDeletionError: LocalizedError {
    case failed

    var errorDescription: String? { AccountDeletionService.failureCopy }
}

@MainActor
final class AccountDeletionService {

    static let shared = AccountDeletionService()

    private init() {}

    static let endpointPath = "/functions/v1/delete-account"

    /// C5: the homeowner never reads the server's words. One sentence, ours,
    /// naming the one thing she can do next.
    static let failureCopy =
        "We couldn't close your account just now. Try again, or write to hello@patina.cloud."

    static let confirmationTitle = "Close your account?"
    static let confirmationBody =
        "This removes your account and everything Patina keeps on this device. It can't be undone."

    /// Delete the signed-in account, wipe the device-local store, and end the
    /// session. Throws `AccountDeletionError.failed` for every failure mode —
    /// the response body is logged in DEBUG and never surfaced.
    func deleteAccount() async throws {
        guard let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken else {
            throw AccountDeletionError.failed
        }

        var request = URLRequest(
            url: APIConfiguration.apiURL.appendingPathComponent(Self.endpointPath)
        )
        request.httpMethod = APIConfiguration.Endpoint.deleteAccount.method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(APIConfiguration.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = APIConfiguration.requestTimeout

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await URLSession.shared.data(for: request)
        } catch {
            #if DEBUG
            PatinaLog.auth.error("[DeleteAccount] transport failed: \(error.localizedDescription)")
            #endif
            throw AccountDeletionError.failed
        }

        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            #if DEBUG
            let body = String(data: data, encoding: .utf8) ?? ""
            PatinaLog.auth.error("[DeleteAccount] rejected: \(body)")
            #endif
            throw AccountDeletionError.failed
        }

        // The account is gone server-side. Clear the device before ending the
        // session — the sign-out transition tears the UI down.
        LocalStoreReset.wipeUserScopedData()
        try? await AuthService.shared.signOut()
    }
}
