//  SessionProviding.swift
//  CaptureKit
//
//  Auth/session seam. The app provides SupabaseSessionService (a single
//  app-owned supabase-swift client), so feature teams import CaptureKit only and
//  never touch supabase-swift directly.

import Foundation

public enum CaptureSessionOwnerState: Hashable, Sendable {
    case loading
    case signedOut
    case needsWorkspace(userID: String)
    case ready(CaptureOwnerIdentity)

    public var owner: CaptureOwnerIdentity? {
        guard case .ready(let owner) = self else { return nil }
        return owner
    }
}

public enum CaptureOwnerTransition: Equatable, Sendable {
    case unchanged
    case established(CaptureOwnerIdentity)
    case invalidated(CaptureOwnerIdentity)
    case changed(from: CaptureOwnerIdentity, to: CaptureOwnerIdentity)
}

public struct CaptureOwnerTransitionTracker: Equatable, Sendable {
    public private(set) var currentOwner: CaptureOwnerIdentity?
    public private(set) var lastConfirmedOwner: CaptureOwnerIdentity?

    public init() {}

    public mutating func observe(_ state: CaptureSessionOwnerState) -> CaptureOwnerTransition {
        let owner = state.owner
        guard owner != currentOwner else { return .unchanged }

        let previousVisibleOwner = currentOwner
        currentOwner = owner

        guard let owner else {
            guard let previousVisibleOwner else { return .unchanged }
            return .invalidated(previousVisibleOwner)
        }

        let previousConfirmedOwner = lastConfirmedOwner
        lastConfirmedOwner = owner
        guard let previousConfirmedOwner, previousConfirmedOwner != owner else {
            return .established(owner)
        }
        return .changed(from: previousConfirmedOwner, to: owner)
    }
}

@MainActor
public protocol SessionProviding: AnyObject, Sendable {
    var isAuthenticated: Bool { get }
    var ownerState: CaptureSessionOwnerState { get }
    var userID: String? { get }
    /// Active workspace == organizations.id (the app's "workspace").
    var workspaceID: String? { get }
    var workspaceName: String? { get }
    func waitForReady() async
    func signOut() async

    // ── Additive (Phase 1a). Default-implemented below so existing conformers
    //    keep compiling; the real session + mock override them. ──
    /// Signed-in user's email, when the provider surfaces one.
    var userEmail: String? { get }
    /// Profile display name (falls back to nil when unknown).
    var displayName: String? { get }
    /// Re-point future captures at the given workspace (== organizations.id).
    func selectWorkspace(id: String)
}

public extension SessionProviding {
    var ownerState: CaptureSessionOwnerState {
        guard isAuthenticated else { return .signedOut }
        if let owner = CaptureOwnerIdentity(userID: userID, workspaceID: workspaceID) {
            return .ready(owner)
        }
        if let userID {
            return .needsWorkspace(userID: userID)
        }
        return .loading
    }

    var ownerIdentity: CaptureOwnerIdentity? { ownerState.owner }
    var userEmail: String? { nil }
    var displayName: String? { nil }
    func selectWorkspace(id: String) {}
}
