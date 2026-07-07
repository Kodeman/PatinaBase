//
//  SettingsService.swift
//  Patina
//
//  Loads + persists per-user app settings from Supabase. Backed by two
//  tables:
//
//    • `user_settings`              (migration 00014) — generic app
//      preferences (theme, push toggles, etc.)
//    • `notification_preferences`   (migration 00040) — per-type
//      notification + digest preferences
//
//  This service owns the in-app source of truth for SettingsView. The
//  cellular-scan-upload toggle remains in UserDefaults via @AppStorage
//  because RoomScanSyncService also reads it directly at upload time.
//

import Foundation
import Supabase

@Observable
@MainActor
public final class SettingsService {
    public static let shared = SettingsService()

    // MARK: - Public State

    /// Aggregate "do you want notifications at all?" — derived from push
    /// channel + at least one type being enabled.
    public var notificationsEnabled: Bool = true
    /// Haptic feedback for in-app interactions.
    public var hapticsEnabled: Bool = true

    /// Whether the initial fetch has completed.
    public private(set) var isLoaded: Bool = false

    private init() {}

    // MARK: - DTOs

    public struct UserSettingsRow: Codable, Sendable {
        public var user_id: String
        public var push_notifications: Bool?
        public var email_notifications: Bool?
    }

    public struct NotificationPrefsRow: Codable, Sendable {
        public var user_id: String
        public var channels_push: Bool?
        public var channels_email: Bool?
        public var channels_in_app: Bool?
    }

    // MARK: - Fetch

    /// Pull settings for the current user. Safe to call multiple times.
    public func load() async {
        guard let userId = await currentUserId() else {
            self.isLoaded = true
            return
        }
        // user_settings
        do {
            let row: UserSettingsRow = try await supabase.database
                .from("user_settings")
                .select("user_id, push_notifications, email_notifications")
                .eq("user_id", value: userId)
                .single()
                .execute()
                .value
            self.notificationsEnabled = row.push_notifications ?? true
        } catch {
            // No row yet — defaults already applied.
            #if DEBUG
            PatinaLog.ui.error("[SettingsService] user_settings fetch failed (may not exist yet): \(error.localizedDescription)")
            #endif
        }

        // notification_preferences — refine the aggregate toggle from
        // channels_push when available.
        do {
            let row: NotificationPrefsRow = try await supabase.database
                .from("notification_preferences")
                .select("user_id, channels_push, channels_email, channels_in_app")
                .eq("user_id", value: userId)
                .single()
                .execute()
                .value
            if let push = row.channels_push {
                self.notificationsEnabled = push
            }
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[SettingsService] notification_preferences fetch failed: \(error.localizedDescription)")
            #endif
        }

        // Hydrate haptics from UserDefaults (no server table for this yet).
        if let stored = UserDefaults.standard.object(forKey: "patina.hapticsEnabled") as? Bool {
            self.hapticsEnabled = stored
        }

        self.isLoaded = true
    }

    // MARK: - Mutations

    /// Persist the notifications-enabled toggle. Writes both
    /// `user_settings.push_notifications` and
    /// `notification_preferences.channels_push` so each table stays in sync.
    public func setNotificationsEnabled(_ enabled: Bool) {
        notificationsEnabled = enabled
        Task { [enabled] in
            guard let userId = await currentUserId() else { return }
            await upsertUserSetting(userId: userId, pushEnabled: enabled)
            await upsertNotificationPref(userId: userId, pushEnabled: enabled)
        }
    }

    /// Persist the haptics toggle locally. No server column yet.
    public func setHapticsEnabled(_ enabled: Bool) {
        hapticsEnabled = enabled
        UserDefaults.standard.set(enabled, forKey: "patina.hapticsEnabled")
    }

    // MARK: - Internals

    private func upsertUserSetting(userId: String, pushEnabled: Bool) async {
        struct UpsertPayload: Encodable {
            let user_id: String
            let push_notifications: Bool
        }
        do {
            try await supabase.database
                .from("user_settings")
                .upsert(UpsertPayload(user_id: userId, push_notifications: pushEnabled),
                        onConflict: "user_id")
                .execute()
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[SettingsService] user_settings upsert failed: \(error.localizedDescription)")
            #endif
        }
    }

    private func upsertNotificationPref(userId: String, pushEnabled: Bool) async {
        struct UpsertPayload: Encodable {
            let user_id: String
            let channels_push: Bool
        }
        do {
            try await supabase.database
                .from("notification_preferences")
                .upsert(UpsertPayload(user_id: userId, channels_push: pushEnabled),
                        onConflict: "user_id")
                .execute()
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[SettingsService] notification_preferences upsert failed: \(error.localizedDescription)")
            #endif
        }
    }

    private func currentUserId() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.user.id.uuidString.lowercased()
    }
}
