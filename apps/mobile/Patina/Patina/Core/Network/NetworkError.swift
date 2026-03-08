//
//  NetworkError.swift
//  Patina
//
//  Network error types for API operations
//

import Foundation

/// Network-related errors
public enum NetworkError: LocalizedError {
    case invalidURL
    case noData
    case decodingError(Error)
    case serverError(statusCode: Int, message: String?)
    case networkUnavailable
    case unauthorized
    case notFound
    case rateLimited
    case unknown(Error)

    public var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .noData:
            return "No data received from server"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .serverError(let statusCode, let message):
            return "Server error (\(statusCode)): \(message ?? "Unknown error")"
        case .networkUnavailable:
            return "Network unavailable. Please check your connection."
        case .unauthorized:
            return "You are not authorized to perform this action"
        case .notFound:
            return "The requested resource was not found"
        case .rateLimited:
            return "Too many requests. Please try again later."
        case .unknown(let error):
            return "An unexpected error occurred: \(error.localizedDescription)"
        }
    }

    public var isRetryable: Bool {
        switch self {
        case .networkUnavailable, .rateLimited:
            return true
        case .serverError(let code, _):
            return code >= 500
        default:
            return false
        }
    }
}
