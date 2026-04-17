//
//  Secrets.example.swift
//  Patina
//
//  Template for Secrets.swift. Copy this file to Secrets.swift and fill in
//  your actual API keys. Secrets.swift is gitignored.
//
//  Instructions:
//  1. cp Secrets.example.swift Secrets.swift
//  2. Fill in your actual keys (at minimum, supabaseAnonKey).
//  3. The real Secrets.swift is ignored by git and will not be committed.
//

import Foundation

/// API keys and secrets
/// WARNING: Do not commit actual secrets to version control
public enum Secrets {

    /// Supabase anonymous key - safe to expose, used for client-side auth
    /// Self-hosted Coolify deployment key
    public static let supabaseAnonKey = ""

    /// OpenAI API key for conversation features (optional)
    public static let openAIKey: String? = nil

    /// Claude API key for conversation features (optional)
    public static let claudeAPIKey: String? = nil

    /// PostHog API key for analytics (optional)
    /// Public project key (phc_...) — safe to ship in a client build.
    public static let postHogAPIKey: String? = nil
}
