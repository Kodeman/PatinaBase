//
//  AuthService.swift
//  Patina
//
//  Authentication service using Supabase Auth
//

import Foundation
import AuthenticationServices
import Supabase

/// Authentication service managing user sessions
@Observable
public final class AuthService {
    public static let shared = AuthService()

    // MARK: - State

    /// Current user session
    public private(set) var session: Session?

    /// Current user
    public var currentUser: User? {
        session?.user
    }

    /// Current user ID as string (for convenience)
    public var currentUserId: String? {
        session?.user.id.uuidString
    }

    /// Whether user is authenticated
    public var isAuthenticated: Bool {
        session != nil
    }

    /// Loading state
    public private(set) var isLoading = false

    /// Error message
    public private(set) var errorMessage: String?

    /// Whether initial auth state has been determined
    public private(set) var isAuthStateReady = false

    // MARK: - Private

    private var authStateTask: Task<Void, Never>?

    /// Continuation for waiting on auth ready
    private var authReadyContinuation: CheckedContinuation<Void, Never>?

    // MARK: - Initialization

    private init() {
        startAuthStateListener()
    }

    // MARK: - Auth State Listener

    private func startAuthStateListener() {
        authStateTask = Task { @MainActor in
            for await (event, session) in supabase.auth.authStateChanges {
                self.session = session

                // Mark auth state as ready after first event
                if !self.isAuthStateReady {
                    self.isAuthStateReady = true
                    self.authReadyContinuation?.resume()
                    self.authReadyContinuation = nil
                }

                switch event {
                case .signedIn:
                    print("User signed in: \(session?.user.id.uuidString ?? "unknown")")
                    if let user = session?.user {
                        let emailDomain = user.email.map { $0.components(separatedBy: "@").last ?? "" } ?? ""
                        PostHogService.shared.identify(userId: user.id.uuidString, properties: [
                            "email_domain": emailDomain,
                            "platform": "ios"
                        ])
                    }
                case .signedOut:
                    print("User signed out")
                    PostHogService.shared.reset()
                case .userUpdated:
                    print("User updated")
                default:
                    break
                }
            }
        }
    }

    /// Wait for auth state to be determined
    @MainActor
    public func waitForAuthReady() async {
        guard !isAuthStateReady else { return }
        await withCheckedContinuation { continuation in
            self.authReadyContinuation = continuation
        }
    }

    // MARK: - Sign In Methods

    /// Sign in with email and password
    @MainActor
    public func signIn(email: String, password: String) async throws {
        isLoading = true
        errorMessage = nil

        do {
            let session = try await supabase.auth.signIn(
                email: email,
                password: password
            )
            self.session = session
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }

        isLoading = false
    }

    /// Sign in with Apple
    @MainActor
    public func signInWithApple(credential: ASAuthorizationAppleIDCredential) async throws {
        isLoading = true
        errorMessage = nil

        guard let identityToken = credential.identityToken,
              let tokenString = String(data: identityToken, encoding: .utf8) else {
            errorMessage = "Failed to get Apple ID token"
            isLoading = false
            throw NetworkError.unauthorized
        }

        do {
            let session = try await supabase.auth.signInWithIdToken(
                credentials: .init(
                    provider: .apple,
                    idToken: tokenString
                )
            )
            self.session = session
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }

        isLoading = false
    }

    // MARK: - Sign Up

    /// Sign up with email and password
    @MainActor
    public func signUp(email: String, password: String, displayName: String?) async throws {
        isLoading = true
        errorMessage = nil

        do {
            let session = try await supabase.auth.signUp(
                email: email,
                password: password,
                data: displayName.map { ["display_name": .string($0)] } ?? [:]
            )
            self.session = session.session
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }

        isLoading = false
    }

    // MARK: - Sign Out

    /// Sign out current user
    @MainActor
    public func signOut() async throws {
        isLoading = true
        errorMessage = nil

        do {
            try await supabase.auth.signOut()
            session = nil
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }

        isLoading = false
    }

    // MARK: - Password Reset

    /// Send password reset email
    @MainActor
    public func resetPassword(email: String) async throws {
        isLoading = true
        errorMessage = nil

        do {
            try await supabase.auth.resetPasswordForEmail(email)
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }

        isLoading = false
    }

    // MARK: - Magic Link

    /// Send magic link to email for passwordless login
    @MainActor
    public func sendMagicLink(email: String) async throws {
        isLoading = true
        errorMessage = nil

        do {
            try await supabase.auth.signInWithOTP(
                email: email,
                redirectTo: URL(string: "\(APIConfiguration.appURLScheme)://auth/callback")
            )
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }

        isLoading = false
    }

    /// Handle magic link URL callback
    @MainActor
    public func handleMagicLinkURL(_ url: URL) async throws {
        isLoading = true
        errorMessage = nil

        do {
            let session = try await supabase.auth.session(from: url)
            self.session = session
        } catch {
            errorMessage = error.localizedDescription
            throw error
        }

        isLoading = false
    }

    // MARK: - Session Management

    /// Refresh current session
    @MainActor
    public func refreshSession() async throws {
        guard let currentSession = session else { return }

        do {
            let newSession = try await supabase.auth.refreshSession()
            self.session = newSession
        } catch {
            // If refresh fails, user needs to re-authenticate
            session = nil
            throw error
        }
    }

    /// Get current session (checking validity)
    @MainActor
    public func getSession() async -> Session? {
        do {
            let session = try await supabase.auth.session
            self.session = session
            return session
        } catch {
            return nil
        }
    }
}
