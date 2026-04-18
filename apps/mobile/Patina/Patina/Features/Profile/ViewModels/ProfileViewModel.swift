//
//  ProfileViewModel.swift
//  Patina
//
//  Manages profile data from SwiftData and app settings
//

import SwiftUI
import SwiftData

@Observable
final class ProfileViewModel {

    // MARK: - State

    var roomCount: Int = 0
    var savedItemCount: Int = 0
    var styleProfile: StylePreferenceModel?
    var rooms: [RoomModel] = []

    // MARK: - Computed

    var userName: String {
        // In production, from Supabase user profile
        "Kody"
    }

    var userInitial: String {
        String(userName.prefix(1))
    }

    var memberSince: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM yyyy"
        return "Member since \(formatter.string(from: Date()))"
    }

    var styleBadge: String {
        styleProfile?.keywords.first?.capitalized ?? "Style Explorer"
    }

    var matchPercentage: String {
        if let confidence = styleProfile?.confidence, confidence > 0 {
            return "\(Int(confidence * 100))%"
        }
        return "—"
    }

    // MARK: - Loading

    func loadData(context: ModelContext) {
        // Rooms
        let roomDescriptor = FetchDescriptor<RoomModel>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])
        rooms = (try? context.fetch(roomDescriptor)) ?? []
        roomCount = rooms.count

        // Saved items count
        let itemDescriptor = FetchDescriptor<TableItemModel>()
        savedItemCount = (try? context.fetchCount(itemDescriptor)) ?? 0

        // Style profile (most recent)
        let styleDescriptor = FetchDescriptor<StylePreferenceModel>(sortBy: [SortDescriptor(\.updatedAt, order: .reverse)])
        styleProfile = (try? context.fetch(styleDescriptor))?.first
    }
}
