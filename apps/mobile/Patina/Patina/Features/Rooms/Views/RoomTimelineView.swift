//
//  RoomTimelineView.swift
//  Patina
//
//  "Room Through Time" — vertical event feed for a single room.
//  Reads GET /api/rooms/:id/timeline which aggregates creation,
//  scans, saved items, and designer lead events.
//

import SwiftUI
import Supabase

public struct RoomTimelineEvent: Codable, Identifiable, Hashable {
    public var id: String { "\(type)-\(at)" }
    public let type: String   // room_created | scan_processed | item_added | designer_lead_sent
    public let at: String
    public let label: String
}

struct RoomTimelineResponse: Codable {
    struct Room: Codable { let id: String; let name: String }
    let room: Room
    let events: [RoomTimelineEvent]
}

@MainActor
@Observable
final class RoomTimelineViewModel {
    var events: [RoomTimelineEvent] = []
    var isLoading = false
    var error: String?

    func load(roomRemoteId: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            let url = APIConfiguration.clientPortalURL
                .appendingPathComponent("/api/rooms/\(roomRemoteId)/timeline")
            var req = URLRequest(url: url)
            req.setValue("application/json", forHTTPHeaderField: "Accept")
            if let token = try? await SupabaseClientManager.shared.client.auth.session.accessToken {
                req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            let (data, _) = try await URLSession.shared.data(for: req)
            let decoded = try JSONDecoder().decode(RoomTimelineResponse.self, from: data)
            self.events = decoded.events
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct RoomTimelineView: View {
    let roomRemoteId: String
    @State private var viewModel = RoomTimelineViewModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Room Through Time")
                    .font(PatinaTypography.h4)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                if viewModel.isLoading {
                    ProgressView().frame(maxWidth: .infinity).padding(.top, 40)
                } else if let err = viewModel.error {
                    Text("Couldn't load timeline: \(err)")
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 20)
                } else if viewModel.events.isEmpty {
                    Text("No activity yet. Scan and start saving picks to see your room emerge.")
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 20)
                } else {
                    ForEach(viewModel.events) { event in
                        TimelineRow(event: event)
                            .padding(.horizontal, 20)
                    }
                }
            }
            .padding(.bottom, 40)
        }
        .background(PatinaColors.Background.primary)
        .task { await viewModel.load(roomRemoteId: roomRemoteId) }
    }
}

private struct TimelineRow: View {
    let event: RoomTimelineEvent

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(iconColor)
                .frame(width: 10, height: 10)
                .padding(.top, 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.label)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(PatinaColors.Text.primary)
                Text(event.at.prefix(10))
                    .font(.system(size: 11))
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            Spacer()
        }
        .padding(.vertical, 6)
    }

    private var iconColor: Color {
        switch event.type {
        case "room_created": return PatinaColors.clay
        case "scan_processed": return .blue
        case "item_added": return .green
        case "designer_lead_sent": return .purple
        default: return PatinaColors.pearl
        }
    }
}
