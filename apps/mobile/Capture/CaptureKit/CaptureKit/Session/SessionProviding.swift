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
}
