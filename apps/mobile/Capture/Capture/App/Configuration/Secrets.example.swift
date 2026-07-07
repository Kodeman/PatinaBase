//  Secrets.example.swift
//  Capture
//
//  Template. Copy to Secrets.swift (gitignored) and fill in the real anon key
//  from the Patina Supabase project. Secrets.swift is excluded from the target
//  via the project's membershipExceptions, mirroring the existing app.

import Foundation

enum Secrets {
    /// Supabase anon (publishable) key for https://api.patina.cloud
    static let supabaseAnonKey = "REPLACE_WITH_SUPABASE_ANON_KEY"

    /// PostHog project API key (Phase 1b analytics). Leave `nil` to keep analytics
    /// a no-op; the app also falls back to the `POSTHOG_API_KEY` env var.
    static let postHogAPIKey: String? = nil
}
