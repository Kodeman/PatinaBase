//
//  PushTokenService.swift
//  Patina
//
//  APNs registration half of push notifications — the receiving half
//  (foreground/background presentation + tap routing) already lives in
//  `PatinaAppDelegate`. This service owns:
//
//   1. Requesting notification authorization + calling
//      `registerForRemoteNotifications()` (never at cold launch — the one
//      sanctioned moment is `PushPrimerView`, presented before the first
//      money event; see SP-08 / ruling Q7).
//   2. Hex-encoding the APNs device token and upserting it into
//      `public.device_push_tokens` (owner-only RLS, unique on `token`).
//   3. Per-token `aps-environment` detection (I66) — the entitlement is
//      NOT inferred from `#if DEBUG`/build configuration, because this
//      project's Release signing has never produced a true distribution
//      archive: a Release build can still carry a `development` embedded
//      profile. Every token upload re-derives its own environment from
//      the CURRENT embedded provisioning profile.
//   4. Deleting the current device's row on sign-out (before the session
//      dies — RLS needs the JWT).
//
//  Table contract (arrival-arc/accept-db):
//    device_push_tokens(user_id uuid, token text unique, platform text
//    default 'ios', environment text check in ('sandbox','production'),
//    created_at, updated_at) — RLS owner-only (user_id = auth.uid()).
//

import Foundation
import UIKit
import UserNotifications
import Supabase

@MainActor
final class PushTokenService {

    static let shared = PushTokenService()

    private init() {}

    // MARK: - UserDefaults keys

    private enum DefaultsKey {
        /// Hex-encoded APNs token most recently uploaded, held so
        /// `removeCurrentToken()` can delete the right row on sign-out even
        /// without a fresh `didRegisterForRemoteNotifications` callback in
        /// that session.
        static let lastUploadedTokenHex = "patina.push.lastUploadedTokenHex"
        /// Set the first time the app asks for authorization, so the system
        /// prompt fires exactly once per install. The KEY IS UNCHANGED from
        /// when the ask lived after a design-request submission: an install
        /// that was already prompted must not be prompted again just because
        /// the ask moved rooms (SP-08 / Q7).
        static let hasPromptedAfterFirstSubmission = "patina.push.hasPromptedAfterFirstSubmission"
    }

    // MARK: - Authorization + registration

    /// Request notification authorization and, on grant, register for
    /// remote notifications. NEVER call this at cold launch — the app has no
    /// generic "enable notifications?" onboarding step; the only sanctioned
    /// call sites are `PushPrimerView` (whose one screen of copy explains the
    /// ask before the system dialog) and `reregisterIfAuthorized()`
    /// (foreground, no-op prompt for a returning user who already decided).
    @discardableResult
    func requestAuthorizationAndRegister() async -> AuthorizationOutcome {
        // C2-09: read the status BEFORE asking. iOS shows the system alert
        // once per install, and `InvoiceReminderService.requestAlertAuthorization`
        // can consume it first — after which `requestAuthorization` returns
        // `false` instantly, the old `guard granted else { return }` swallowed
        // it, and the primer's black capsule button did nothing at all and
        // dismissed. That is the purest kind of dead end the round-one bar
        // forbids.
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        switch Self.outcome(for: status) {
        case .alreadyAuthorized:
            UIApplication.shared.registerForRemoteNotifications()
            return .alreadyAuthorized
        case .denied:
            return .denied
        case .ask:
            break
        case .granted:
            break
        }

        do {
            let granted = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
            guard granted else { return .denied }
            UIApplication.shared.registerForRemoteNotifications()
            return .granted
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[Push] requestAuthorization failed: \(error.localizedDescription)")
            #endif
            return .denied
        }
    }

    /// What the ask can end in, and what the screen must say about each.
    enum AuthorizationOutcome: Equatable {
        /// Nothing has been decided yet — the system alert is the next step.
        case ask
        /// Already granted in a prior session; register, do not re-prompt.
        case alreadyAuthorized
        /// Granted just now.
        case granted
        /// Refused — here or in a prior session. The system will never show its
        /// alert again, so the app has to say so and hand over Settings.
        case denied
    }

    /// Pure, so the rule is testable without touching `UNUserNotificationCenter`
    /// — which in a test run would surface a real system dialog and hang.
    static func outcome(for status: UNAuthorizationStatus) -> AuthorizationOutcome {
        switch status {
        case .authorized, .provisional, .ephemeral: return .alreadyAuthorized
        case .denied: return .denied
        default: return .ask
        }
    }

    /// Said when authorization is off, and nowhere else. Deliberately the same
    /// sentence `InvoiceReminder.deniedLine` prints: one app, one way of saying
    /// this, and it names no vendor, no API and no error.
    static var deniedLine: String { InvoiceReminder.deniedLine }

    /// The door that makes the sentence actionable.
    static var settingsURL: URL? { URL(string: UIApplication.openSettingsURLString) }

    /// Cheap re-registration for a returning user who already granted
    /// authorization in a prior session — keeps the uploaded token fresh
    /// without re-prompting. `registerForRemoteNotifications()` is
    /// idempotent, so calling it every foreground is safe; we still gate on
    /// `.authorized` so a user who denied is never nagged by a system retry.
    func reregisterIfAuthorized() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Whether this install has already been asked. Read-only — checking must
    /// never consume the one ask.
    var hasAskedForAuthorization: Bool {
        UserDefaults.standard.bool(forKey: DefaultsKey.hasPromptedAfterFirstSubmission)
    }

    /// The once-per-install gate, isolated from the actual authorization call
    /// so it can be unit-tested without ever touching the live
    /// `UNUserNotificationCenter` (which would surface a real system prompt
    /// during a test run). Flips the UserDefaults flag and returns `true`
    /// exactly once per install; every subsequent call returns `false`
    /// without side effects.
    @discardableResult
    func armAuthorizationPromptGate() -> Bool {
        let defaults = UserDefaults.standard
        guard !defaults.bool(forKey: DefaultsKey.hasPromptedAfterFirstSubmission) else { return false }
        defaults.set(true, forKey: DefaultsKey.hasPromptedAfterFirstSubmission)
        return true
    }

    /// Test/debug seam — never used by product code.
    func resetAuthorizationPromptGate() {
        UserDefaults.standard.removeObject(forKey: DefaultsKey.hasPromptedAfterFirstSubmission)
    }

    // MARK: - Token upload

    private struct DevicePushTokenPayload: Encodable {
        let user_id: String
        let token: String
        let platform: String
        let environment: String
    }

    /// Hex-encode the APNs device token and upsert it into
    /// `device_push_tokens`, keyed to the current session user. No-ops
    /// (silently) when there's no signed-in session — a guest who granted
    /// notification permission has nothing to upload to yet; the token is
    /// still cached locally so a later sign-in can be followed by
    /// `reregisterIfAuthorized()` to complete the upload.
    func uploadToken(_ deviceToken: Data) async {
        let hex = Self.hexString(from: deviceToken)
        UserDefaults.standard.set(hex, forKey: DefaultsKey.lastUploadedTokenHex)

        guard let userId = AuthService.shared.currentUserId else {
            #if DEBUG
            PatinaLog.ui.debug("[Push] device token registered but no session yet — deferring upload")
            #endif
            return
        }

        let payload = DevicePushTokenPayload(
            user_id: userId,
            token: hex,
            platform: "ios",
            environment: Self.detectEnvironment()
        )
        do {
            try await supabase.database
                .from("device_push_tokens")
                .upsert(payload, onConflict: "token")
                .execute()
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[Push] device_push_tokens upsert failed: \(error.localizedDescription)")
            #endif
        }
    }

    /// Hex-encode raw APNs token bytes (`<a1b2c3…>`, lowercase, no
    /// separators) — the wire format GoTrue-adjacent APNs senders expect.
    static func hexString(from data: Data) -> String {
        data.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: - Sign-out cleanup

    /// Delete the current device's token row. MUST be called before the
    /// session dies (`supabase.auth.signOut()`) — RLS on
    /// `device_push_tokens` is owner-only (`user_id = auth.uid()`), so the
    /// delete needs a live JWT. Falls back to a no-op if no token was ever
    /// uploaded this install.
    func removeCurrentToken() async {
        guard let hex = UserDefaults.standard.string(forKey: DefaultsKey.lastUploadedTokenHex) else { return }
        do {
            try await supabase.database
                .from("device_push_tokens")
                .delete()
                .eq("token", value: hex)
                .execute()
        } catch {
            #if DEBUG
            PatinaLog.ui.error("[Push] device_push_tokens delete failed: \(error.localizedDescription)")
            #endif
        }
    }

    // MARK: - Environment detection (I66)
    //
    // `aps-environment` must be captured PER TOKEN at registration time,
    // never inferred from `#if DEBUG` / build configuration alone — this
    // project's Release signing has never performed a true distribution
    // archive, so a Release build's embedded provisioning profile can still
    // say `development`. Ladder, in priority order:
    //
    //  1. Parse the embedded `.mobileprovision`'s `Entitlements.aps-environment`.
    //     - "development" → "sandbox"
    //     - anything else (expected: "production") → "production"
    //  2. No embedded profile at all → "production". This is exactly how
    //     App Store / TestFlight distribution builds ship (Apple strips the
    //     embedded profile), so absence itself is the production signal.
    //  3. Profile present but unreadable/unparseable (shouldn't happen, but
    //     never allowed to crash registration) → last-resort `#if DEBUG`
    //     "sandbox" `#else` "production" `#endif`.

    /// - Parameter readProfile: injection seam for tests — defaults to
    ///   reading the app bundle's embedded provisioning profile.
    static func detectEnvironment(readProfile: () -> Data? = defaultProvisioningProfileData) -> String {
        guard let profileData = readProfile() else {
            // Rung 2: no embedded profile — production build signal.
            return "production"
        }
        if let apsEnv = apsEnvironment(fromProvisioningProfileData: profileData) {
            // Rung 1: profile parsed, entitlement present — use it directly.
            return apsEnv == "development" ? "sandbox" : "production"
        }
        // Rung 3: profile present but couldn't be parsed.
        #if DEBUG
        return "sandbox"
        #else
        return "production"
        #endif
    }

    /// Default profile reader: `Bundle.main`'s embedded `.mobileprovision`,
    /// present on ad hoc / development builds and absent on App Store builds.
    static func defaultProvisioningProfileData() -> Data? {
        guard let path = Bundle.main.path(forResource: "embedded", ofType: "mobileprovision"),
              let data = FileManager.default.contents(atPath: path) else {
            return nil
        }
        return data
    }

    /// Extract `Entitlements.aps-environment` from raw `.mobileprovision`
    /// bytes. The file is a CMS/PKCS#7-signed blob wrapping an XML plist
    /// body — we don't verify the signature (not our job here), just slice
    /// out the embedded `<?xml …>…</plist>` substring and parse that
    /// directly. `.isoLatin1` decodes the whole blob byte-for-byte (the CMS
    /// wrapper isn't valid UTF-8) while still round-tripping the ASCII plist
    /// text exactly, which is all `PropertyListSerialization` needs.
    static func apsEnvironment(fromProvisioningProfileData data: Data) -> String? {
        guard let raw = String(data: data, encoding: .isoLatin1) else { return nil }
        guard let xmlStart = raw.range(of: "<?xml"),
              let plistEnd = raw.range(of: "</plist>", range: xmlStart.upperBound..<raw.endIndex) else {
            return nil
        }
        let plistSubstring = String(raw[xmlStart.lowerBound..<plistEnd.upperBound])
        guard let plistData = plistSubstring.data(using: .isoLatin1) else { return nil }
        guard let plist = try? PropertyListSerialization.propertyList(
            from: plistData, options: [], format: nil
        ) as? [String: Any] else {
            return nil
        }
        guard let entitlements = plist["Entitlements"] as? [String: Any] else { return nil }
        return entitlements["aps-environment"] as? String
    }
}
