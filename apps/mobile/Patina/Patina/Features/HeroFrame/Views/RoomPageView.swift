//
//  RoomPageView.swift
//  Patina
//
//  Multi-room carousel using TabView with paging
//

import SwiftUI

/// A single room page in the Hero Frame carousel
struct RoomPageContent: View {

    let room: RoomModel
    let timeOfDay: TimeOfDay
    let onPhotoTap: () -> Void
    let onPhotoLongPress: () -> Void
    let onPlaceholderTap: () -> Void

    var body: some View {
        GeometryReader { geometry in
            if room.hasHeroFrame {
                HeroPhotoView(
                    imageData: room.heroFrameData,
                    timeOfDay: timeOfDay
                )
                .frame(width: geometry.size.width, height: geometry.size.height)
                .contentShape(Rectangle())
                .onTapGesture(perform: onPhotoTap)
                .onLongPressGesture(perform: onPhotoLongPress)
            } else {
                HeroPlaceholderView(
                    roomName: room.name,
                    timeOfDay: timeOfDay,
                    onTap: onPlaceholderTap
                )
                .frame(width: geometry.size.width, height: geometry.size.height)
            }
        }
    }
}

/// Paginated room carousel using TabView
struct RoomPageView: View {

    let rooms: [RoomModel]
    @Binding var currentIndex: Int
    let timeOfDay: TimeOfDay

    var onPhotoTap: ((RoomModel) -> Void)?
    var onPhotoLongPress: ((RoomModel) -> Void)?
    var onPlaceholderTap: ((RoomModel) -> Void)?

    var body: some View {
        TabView(selection: $currentIndex) {
            ForEach(Array(rooms.enumerated()), id: \.element.id) { index, room in
                RoomPageContent(
                    room: room,
                    timeOfDay: timeOfDay,
                    onPhotoTap: { onPhotoTap?(room) },
                    onPhotoLongPress: { onPhotoLongPress?(room) },
                    onPlaceholderTap: { onPlaceholderTap?(room) }
                )
                .tag(index)
            }
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: currentIndex)
    }
}

// MARK: - Preview

#Preview("Multi-Room") {
    RoomPageView(
        rooms: [],
        currentIndex: .constant(0),
        timeOfDay: .afternoon
    )
}
