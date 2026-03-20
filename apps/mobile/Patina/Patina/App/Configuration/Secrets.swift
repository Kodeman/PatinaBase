//
//  Secrets.swift
//  Patina
//
//  API keys and secrets - THIS FILE SHOULD BE GITIGNORED
//
//  Instructions:
//  1. Copy this file to Secrets.swift
//  2. Fill in your actual API keys
//  3. Add Secrets.swift to .gitignore
//

import Foundation

/// API keys and secrets
/// WARNING: Do not commit actual secrets to version control
public enum Secrets {

    /// Supabase anonymous key - safe to expose, used for client-side auth
    /// Self-hosted Coolify deployment key
    public static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzcyODYzMjAwLCJleHAiOjE5MzA2Mjk2MDB9.8kdM7IiArooSgwnilRo60MVECQZUqtQeDimQBMFZkaE"

    /// OpenAI API key for conversation features (optional)
    public static let openAIKey: String? = nil

    /// Claude API key for conversation features (optional)
    public static let claudeAPIKey: String? = nil

    /// PostHog API key for analytics (optional)
    public static let postHogAPIKey: String? = nil
}
