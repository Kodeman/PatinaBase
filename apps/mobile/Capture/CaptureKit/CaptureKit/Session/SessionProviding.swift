//  SessionProviding.swift
//  CaptureKit
//
//  Auth/session seam. The app provides AuthSessionAdapter wrapping the
//  copy-adapted AuthService, so feature teams import CaptureKit only and never
//  touch supabase-swift directly.

import Foundation

@MainActor
public protocol SessionProviding: AnyObject {
    var isAuthenticated: Bool { get }
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
    var userEmail: String? { nil }
    var displayName: String? { nil }
    func selectWorkspace(id: String) {}
}
