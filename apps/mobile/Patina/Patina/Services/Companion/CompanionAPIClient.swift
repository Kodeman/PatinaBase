//
//  CompanionAPIClient.swift
//  Patina
//
//  API client for Companion Edge Functions
//  Handles authenticated requests with retry logic
//

import Foundation
import Supabase

/// Client for Companion API endpoints
public final class CompanionAPIClient {

    // MARK: - Singleton

    public static let shared = CompanionAPIClient()

    // MARK: - Configuration

    private let baseURL: URL
    private let maxRetries = 3
    private let baseRetryDelay: TimeInterval = 1.0

    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    // MARK: - Initialization

    private init() {
        // Edge Functions are at: {supabase_url}/functions/v1/{function-name}
        self.baseURL = AppConfiguration.supabaseURL.appendingPathComponent("functions/v1")
    }

    // MARK: - Public API Methods

    /// Fetch context-aware quick actions
    /// - Parameters:
    ///   - screen: Current screen identifier
    ///   - screenData: Additional screen context (product_id, room_id, etc.)
    ///   - sessionMetrics: Session metrics for stuck detection
    /// - Returns: Quick actions response
    public func fetchQuickActions(
        screen: String,
        screenData: QuickActionsRequest.ScreenData? = nil,
        sessionMetrics: QuickActionsRequest.SessionMetrics? = nil
    ) async throws -> QuickActionsResponse {
        guard let userId = await getCurrentUserId() else {
            throw CompanionAPIError.noToken
        }

        let request = QuickActionsRequest(
            userId: userId,
            screen: screen,
            screenData: screenData,
            sessionMetrics: sessionMetrics
        )

        return try await performRequest(
            endpoint: "companion-context",
            method: "POST",
            body: request
        )
    }

    /// Send a conversational message
    /// - Parameters:
    ///   - message: User's message text
    ///   - context: Message context (screen, product, room)
    ///   - conversationId: Optional existing conversation ID
    /// - Returns: Companion's response
    public func sendMessage(
        _ message: String,
        context: CompanionMessageRequest.MessageContext,
        conversationId: String? = nil
    ) async throws -> CompanionMessageResponse {
        guard let userId = await getCurrentUserId() else {
            throw CompanionAPIError.noToken
        }

        let request = CompanionMessageRequest(
            userId: userId,
            message: message,
            context: context,
            conversationId: conversationId
        )

        return try await performRequest(
            endpoint: "companion-message",
            method: "POST",
            body: request
        )
    }

    /// Fetch conversation history
    /// - Parameters:
    ///   - limit: Maximum messages to return (default 50, max 100)
    ///   - cursor: Pagination cursor (timestamp)
    /// - Returns: Paginated message history
    public func fetchHistory(
        limit: Int = 50,
        cursor: String? = nil
    ) async throws -> ConversationHistoryResponse {
        var queryItems = [URLQueryItem(name: "limit", value: String(min(limit, 100)))]
        if let cursor = cursor {
            queryItems.append(URLQueryItem(name: "before", value: cursor))
        }

        return try await performRequest(
            endpoint: "companion-history",
            method: "GET",
            queryItems: queryItems
        )
    }

    // MARK: - Private Helpers

    private func getCurrentUserId() async -> String? {
        do {
            let session = try await supabase.auth.session
            return session.user.id.uuidString
        } catch {
            return nil
        }
    }

    private func getAccessToken() async throws -> String {
        do {
            let session = try await supabase.auth.session
            return session.accessToken
        } catch {
            throw CompanionAPIError.noToken
        }
    }

    /// Perform an API request with retry logic
    private func performRequest<T: Codable, R: Codable>(
        endpoint: String,
        method: String,
        body: T? = nil as EmptyBody?,
        queryItems: [URLQueryItem] = []
    ) async throws -> R {
        var lastError: Error?

        for attempt in 0..<maxRetries {
            do {
                return try await executeRequest(
                    endpoint: endpoint,
                    method: method,
                    body: body,
                    queryItems: queryItems
                )
            } catch let error as CompanionAPIError {
                lastError = error
                if error.isRetryable && attempt < maxRetries - 1 {
                    let delay = calculateRetryDelay(attempt: attempt, error: error)
                    try await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
                    continue
                }
                throw error
            } catch {
                lastError = error
                throw CompanionAPIError.networkError(underlying: error)
            }
        }

        throw lastError ?? CompanionAPIError.serverError(statusCode: 0)
    }

    /// Execute a single API request
    private func executeRequest<T: Codable, R: Codable>(
        endpoint: String,
        method: String,
        body: T?,
        queryItems: [URLQueryItem]
    ) async throws -> R {
        // Build URL
        var urlComponents = URLComponents(url: baseURL.appendingPathComponent(endpoint), resolvingAgainstBaseURL: true)!
        if !queryItems.isEmpty {
            urlComponents.queryItems = queryItems
        }

        guard let url = urlComponents.url else {
            throw CompanionAPIError.badRequest(message: "Invalid URL")
        }

        // Build request
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Add auth header
        let token = try await getAccessToken()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        // Add Supabase headers
        request.setValue(AppConfiguration.supabaseAnonKey, forHTTPHeaderField: "apikey")

        // Add body if present
        if let body = body, !(body is EmptyBody) {
            request.httpBody = try encoder.encode(body)
        }

        // Execute request
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw CompanionAPIError.networkError(underlying: URLError(.badServerResponse))
        }

        // Handle response
        switch httpResponse.statusCode {
        case 200...299:
            do {
                return try decoder.decode(R.self, from: data)
            } catch {
                print("Decoding error: \(error)")
                throw CompanionAPIError.decodingError(underlying: error)
            }

        case 401:
            throw CompanionAPIError.unauthorized

        case 400:
            let message = parseErrorMessage(from: data)
            throw CompanionAPIError.badRequest(message: message)

        case 429:
            let retryAfter = parseRetryAfter(from: httpResponse)
            throw CompanionAPIError.rateLimited(retryAfter: retryAfter)

        default:
            throw CompanionAPIError.serverError(statusCode: httpResponse.statusCode)
        }
    }

    /// Calculate retry delay with exponential backoff
    private func calculateRetryDelay(attempt: Int, error: CompanionAPIError) -> TimeInterval {
        // If rate limited, use the retry-after header
        if case .rateLimited(let retryAfter) = error, let delay = retryAfter {
            return delay
        }

        // Exponential backoff with jitter
        let exponentialDelay = baseRetryDelay * pow(2.0, Double(attempt))
        let jitter = Double.random(in: 0...0.3) * exponentialDelay
        return exponentialDelay + jitter
    }

    /// Parse error message from response body
    private func parseErrorMessage(from data: Data) -> String {
        struct ErrorResponse: Codable {
            let error: String?
            let message: String?
        }

        if let errorResponse = try? decoder.decode(ErrorResponse.self, from: data) {
            return errorResponse.message ?? errorResponse.error ?? "Request failed"
        }

        return "Request failed"
    }

    /// Parse Retry-After header
    private func parseRetryAfter(from response: HTTPURLResponse) -> TimeInterval? {
        guard let retryAfterString = response.value(forHTTPHeaderField: "Retry-After") else {
            return nil
        }

        if let seconds = TimeInterval(retryAfterString) {
            return seconds
        }

        // Try parsing as HTTP date
        let formatter = DateFormatter()
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        if let date = formatter.date(from: retryAfterString) {
            return date.timeIntervalSinceNow
        }

        return nil
    }
}

// MARK: - Empty Body Type

/// Placeholder type for requests without a body
private struct EmptyBody: Codable {}

// MARK: - Convenience Extensions

extension CompanionAPIClient {

    /// Create a message context from CompanionContext
    public func messageContext(from context: CompanionContext) -> CompanionMessageRequest.MessageContext {
        CompanionMessageRequest.MessageContext(
            screen: screenIdentifier(for: context.currentScreen),
            productId: context.viewingPiece?.id,
            roomId: context.activeRoom?.id.uuidString
        )
    }

    /// Create screen data from CompanionContext
    public func screenData(from context: CompanionContext) -> QuickActionsRequest.ScreenData {
        QuickActionsRequest.ScreenData(
            productId: context.viewingPiece?.id,
            roomId: context.activeRoom?.id.uuidString
        )
    }

    /// Convert AppRoute to API screen identifier
    private func screenIdentifier(for route: AppRoute) -> String {
        switch route {
        case .threshold: return "threshold"
        case .heroFrame: return "hero_frame"
        case .conversation: return "conversation"
        case .roomList: return "room_list"
        case .roomDetail: return "room_detail"
        case .roomSavedItems: return "room_saved_items"
        case .roomOptions: return "room_options"
        case .walk, .walkSession: return "walk"
        case .rescan: return "rescan"
        case .emergence, .roomEmergence: return "emergence"
        case .table: return "table"
        case .pieceDetail: return "piece_detail"
        case .authentication: return "authentication"
        case .settings: return "settings"
        case .designServicesRequest: return "design_services"
        case .walkInvitation: return "walk_invitation"
        case .cameraPermission: return "camera_permission"
        case .walkComplete: return "walk_complete"
        case .firstEmergence: return "first_emergence"
        case .roomNaming: return "room_naming"
        case .qrScanner: return "qr_scanner"
        case .qrApproval: return "qr_approval"
        }
    }
}
