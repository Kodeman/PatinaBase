import Foundation
import Testing
@testable import Patina

@Suite(.serialized)
@MainActor
struct LocalSupabaseEndpointOverrideTests {
    @Test("Local endpoints default to the shared CLI port without an override")
    func localDefaults() {
        withConfiguration(target: "local") {
            #expect(APIConfiguration.apiURL.absoluteString == "http://127.0.0.1:54321")
            #expect(APIConfiguration.realtimeURL.absoluteString == "ws://127.0.0.1:54321/realtime/v1/websocket")
        }
    }

    @Test("Local endpoints use the owned stack port")
    func ownedStackOverride() {
        withConfiguration(target: "local", override: "http://127.0.0.1:56321") {
            #expect(APIConfiguration.apiURL.absoluteString == "http://127.0.0.1:56321")
            #expect(APIConfiguration.realtimeURL.absoluteString == "ws://127.0.0.1:56321/realtime/v1/websocket")
        }
    }

    @Test("Local HTTPS localhost endpoints derive secure realtime")
    func secureLocalhostOverride() {
        withConfiguration(target: "local", override: "https://localhost:56321/") {
            #expect(APIConfiguration.apiURL.absoluteString == "https://localhost:56321/")
            #expect(APIConfiguration.realtimeURL.absoluteString == "wss://localhost:56321/realtime/v1/websocket")
        }
    }

    @Test("Invalid local overrides fall back to the CLI stack", arguments: [
        "http://10.0.0.5:56321",
        "https://bkvcixdmuyejfzcijpdg.supabase.co",
        "http://127.0.0.1:56321/rest/v1",
        "http://127.0.0.1:56321?query=value",
        "http://127.0.0.1:56321#fragment",
        "ftp://127.0.0.1:56321",
        "http://localhost.example.com:56321",
        "http://user:password@localhost:56321",
        "not a URL"
    ])
    func invalidOverride(override: String) {
        withConfiguration(target: "local", override: override) {
            #expect(APIConfiguration.apiURL.absoluteString == "http://127.0.0.1:54321")
            #expect(APIConfiguration.realtimeURL.absoluteString == "ws://127.0.0.1:54321/realtime/v1/websocket")
        }
    }

    @Test("Cloud endpoints ignore the local override")
    func cloudIgnoresOverride() {
        withConfiguration(target: "cloud", override: "http://127.0.0.1:56321") {
            #expect(APIConfiguration.apiURL.absoluteString == "https://bkvcixdmuyejfzcijpdg.supabase.co")
            #expect(APIConfiguration.realtimeURL.absoluteString ==
                "wss://bkvcixdmuyejfzcijpdg.supabase.co/realtime/v1/websocket")
        }
    }

    private func withConfiguration(target: String, override: String? = nil, assertions: () -> Void) {
        let defaults = UserDefaults.standard
        let previousTarget = defaults.object(forKey: "DeploymentTarget")
        let previousOverride = defaults.object(forKey: "LocalSupabaseURL")
        defaults.set(target, forKey: "DeploymentTarget")
        defaults.set(override, forKey: "LocalSupabaseURL")
        defer {
            defaults.set(previousTarget, forKey: "DeploymentTarget")
            defaults.set(previousOverride, forKey: "LocalSupabaseURL")
        }
        assertions()
    }
}
