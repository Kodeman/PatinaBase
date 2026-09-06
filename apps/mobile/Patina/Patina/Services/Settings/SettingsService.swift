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

    /// `P-28`. How often Patina checks in about an approval.
    ///
    /// Defaults to the quietest cadence that still gets an answer on time —
    /// there is no dark default here — and is replaced by whatever the row
    /// actually says the moment `load()` reads one.
    public var reminderCadence: ReminderCadence = .quietestHonest

    /// Whether the initial fetch has completed.
    public private(set) var isLoaded: Bool = false

    private init() {}

    /// Drop the previous account's preferences.
    ///
    /// Both toggles are server-backed rows keyed on `user_id`, so leaving them
    /// standing shows one person's notification choice to the next and — worse
    /// — a write from the new account's Settings screen would save a value it
    /// never chose. Back to the same defaults a never-loaded service holds.
    func resetForSessionChange() {
        notificationsEnabled = true
        hapticsEnabled = true
        reminderCadence = .quietestHonest
        isLoaded = false
    }

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
        /// `P-28`. Two values before the widening (00278), three after. Both
        /// vocabularies decode — `ReminderCadence.from(wireValue:)` reads
        /// either — and a value neither knows leaves the default standing.
        public var reminder_cadence: String?
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
                .select("user_id, channels_push, channels_email, channels_in_app, reminder_cadence")
                .eq("user_id", value: userId)
                .single()
                .execute()
                .value
            if let push = row.channels_push {
                self.notificationsEnabled = push
            }
            if let cadence = ReminderCadence.from(wireValue: row.reminder_cadence) {
                self.reminderCadence = cadence
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

    /// `P-28`. Persist the cadence she chose.
    ///
    /// Written optimistically, and written twice where it has to be: a
    /// database that has not yet taken the widening still holds the 00278
    /// CHECK, and a write of `right_away` against it fails. The fallback is
    /// the same choice in the old vocabulary, so the two sides of the
    /// backend lane's deploy both save. `weekly_sunday` has no old spelling —
    /// it is the option the widening adds — so there the failure stands and
    /// the screen keeps what the row last said.
    public func setReminderCadence(_ cadence: ReminderCadence) {
        let previous = reminderCadence
        reminderCadence = cadence
        Task { [cadence, previous] in
            guard let userId = await currentUserId() else { return }
            if await upsertReminderCadence(userId: userId, value: cadence.rawValue) { return }
            if let legacy = cadence.legacyWireValue,
               await upsertReminderCadence(userId: userId, value: legacy) { return }
            self.reminderCadence = previous
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

    /// - Returns: whether the write landed.
    private func upsertReminderCadence(userId: String, value: String) async -> Bool {
        struct UpsertPayload: Encodable {
            let user_id: String
            let reminder_cadence: String
        }
        do {
            try await supabase.database
                .from("notification_preferences")
                .upsert(UpsertPayload(user_id: userId, reminder_cadence: value),
                        onConflict: "user_id")
                .execute()
            return true
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[SettingsService] reminder_cadence upsert failed for \(value): \(error.localizedDescription)")
            #endif
            return false
        }
    }

    private func currentUserId() async -> String? {
        try? await SupabaseClientManager.shared.client.auth.session.user.id.uuidString.lowercased()
    }
}
