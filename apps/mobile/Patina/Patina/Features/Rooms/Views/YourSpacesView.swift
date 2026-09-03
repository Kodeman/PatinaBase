//
//  YourSpacesView.swift
//  Patina
//
//  Room gallery — the master "Your Spaces" screen from the Room System spec.
//  Replaces the legacy RoomListView with spec-matching cards, a Whole Home
//  cross-room bar, and a first-room empty state.
//

import SwiftUI
import SwiftData

struct YourSpacesView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    /// True only when this screen is the Spaces tab's root (W3 · N2's seam).
    @Environment(\.isTabRoot) private var isTabRoot
    @Query(sort: \RoomModel.createdAt, order: .reverse) private var rooms: [RoomModel]
    /// Drives the contextual help-panel sheet attached to the Rooms surface.
    ///
    /// C5-02: nothing sets this in round one — the `?` triggers are removed
    /// because zero `ios-app/*` help articles exist in production Sanity, so
    /// every door opened on an empty panel. The sheet wiring stays as a seam
    /// W2 restores the buttons to; it is deliberately unreachable, not live.
    @State private var isHelpPanelPresented: Bool = false

    /// R14: scan-upload sync state. `RoomScanSyncService` is `@Observable`,
    /// so reading its properties in `body` keeps the pill live.
    private var syncService: RoomScanSyncService { .shared }

    var body: some View {
        ZStack {
            PatinaColors.Background.primary.ignoresSafeArea()

            if rooms.isEmpty {
                // The populated branch draws "Your Spaces" in its own header;
                // the empty one never did, which was invisible under a back
                // chevron and is not invisible as a tab root — the canonical
                // name (C4) would be nowhere on glass (`w3-n2-05`). Pushed,
                // the screen is byte-for-byte what it was.
                if isTabRoot {
                    VStack(spacing: 0) {
                        header
                            .padding(.horizontal, 20)
                            .padding(.top, 56)
                        emptyState
                    }
                } else {
                    emptyState
                }
            } else {
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 16) {
                        header
                            .padding(.horizontal, 20)
                            .padding(.top, 56)

                        // R14: quiet sync pill — only present while an upload
                        // is in flight or parked waiting for a connection.
                        syncStatusPill
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 20)

                        // C-05: this bar's sibling `?` was the last of four on
                        // one screen, and it sat OUTSIDE the card in the right
                        // gutter, attached to nothing a reader could see. The
                        // header's icon is the one help affordance this screen
                        // gets; the bar's own label already says what it rolls
                        // up.
                        WholeHomeCrossRoomBar(
                            roomCount: rooms.count,
                            itemCount: totalItemCount,
                            totalCents: totalInvestmentCents,
                            onTap: { coordinator.navigate(to: .crossRoom) }
                        )
                        .padding(.horizontal, 20)

                        ForEach(rooms) { room in
                            VStack(alignment: .leading, spacing: 6) {
                                RoomGalleryCard(
                                    room: room,
                                    newPickCount: 0,
                                    onTap: { coordinator.navigate(to: .roomProject(roomId: room.id)) }
                                )
                                // A room whose write-through never landed has
                                // no server-side counterpart — it gets no
                                // picks and follows the user nowhere. Say so
                                // rather than letting it pass for synced.
                                if isLocalOnly(room) {
                                    syncPill(text: "Saved on this phone", systemImage: "iphone")
                                }
                            }
                            .padding(.horizontal, 20)
                        }
                    }
                    .companionBottomClearance()
                }
            }
        }
        // The gallery reads the local store, and the local store only holds
        // the rooms this phone made until something asks the server for the
        // rest. Debounced and owner-keyed; a guest's rooms are never merged
        // into an account (SP-06).
        .task {
            await RoomSyncCoordinator.shared.reconcile(store: RoomStore(context: modelContext))
        }
        // C4-12 / R-03 (L1-B's note).
        .refreshable {
            await RoomSyncCoordinator.shared.reconcile(store: RoomStore(context: modelContext))
        }
        // U18: standard pushed-screen chrome — this screen's own "Your
        // Spaces" header stands in for the chrome title.
        .patinaScreen(title: nil)
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/rooms` or a child of it.
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Rooms.root
        )
    }

    // MARK: - Pieces

    private var header: some View {
        HStack(alignment: .firstTextBaseline) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Your Spaces")
                    .font(PatinaTypography.h3)
                    .foregroundStyle(PatinaColors.Text.primary)
                // Contextual help: explains the "Your Spaces" model —
                // every captured room as a gallery card with budget +
                // item count, plus a Whole Home aggregate at the top.
                HelpInfoIcon(
                    surfaceKey: SurfaceKeys.IOSApp.Rooms.yourSpaces,
                    fallback: "Your Spaces shows every room you've captured. Each card summarizes the room's items and budget. Scroll past the Whole Home bar to see them.",
                    size: 14,
                    accessibilityLabel: "About Your Spaces"
                )
            }
            Spacer()
            // C-05: the `+` control's own help icon was the fourth `?` on
            // this header and the third labelled "More information". The
            // sheet it opens names both paths in full; the icon is gone.
            Button {
                coordinator.presentedSheet = .newRoom
            } label: {
                ZStack {
                    Circle()
                        .fill(PatinaColors.Interactive.active)
                        .frame(width: 36, height: 36)
                    Text("+")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(PatinaColors.Text.inverse)
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Add a room")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            // R14: a just-finished scan uploads before any local room card
            // exists, so the empty state needs the pill too.
            syncStatusPill
                .padding(.top, isTabRoot ? 8 : 72)
            Spacer()
            ZStack {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(PatinaColors.Background.secondary)
                    .frame(width: 80, height: 80)
                Text("⌂").font(.system(size: 32))
            }
            // C-05: as the Spaces tab's root this state draws the header too,
            // so its own `?` was a second affordance in one viewport. The
            // sentence directly below already says why a scan matters, in
            // plainer words than the tooltip did.
            Text("No rooms yet")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
            Text("Scan a room and Patina fills it with furniture that knows your space — your light, your walls, your style.")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 260)
                .padding(.bottom, 8)
            Button {
                coordinator.presentedSheet = .newRoom
            } label: {
                HStack(spacing: 8) {
                    Text("◎")
                    Text("Scan Your First Room")
                }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.inverse)
                .frame(maxWidth: .infinity)
                .frame(height: 50)
                .background(Capsule().fill(PatinaColors.Interactive.active))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 32)
            Spacer()
        }
        .padding(.horizontal, 32)
    }

    // MARK: - Sync status (R14)

    /// Quiet, header-level sync pill. `RoomScanSyncService` doesn't expose
    /// per-room upload state, so this is the honest aggregate version:
    /// "Uploading…" while scan data is in flight, "Will retry when online"
    /// when uploads are parked offline. Renders nothing otherwise.
    @ViewBuilder
    private var syncStatusPill: some View {
        if !syncService.isNetworkAvailable && syncService.pendingUploads > 0 {
            syncPill(text: "Will retry when online", systemImage: "wifi.slash")
        } else if syncService.isSyncing {
            syncPill(text: "Uploading…", systemImage: "arrow.up.circle")
        }
    }

    /// A room lives on this phone only when it has no remote counterpart.
    /// `remoteId` is checked alongside `syncStatus` because rooms created
    /// before the coordinator started stamping the status sit at the `.local`
    /// default despite having synced — the id is the non-revisionist half.
    private func isLocalOnly(_ room: RoomModel) -> Bool {
        room.syncStatus != .synced && room.remoteId == nil
    }

    private func syncPill(text: String, systemImage: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.system(size: 9, weight: .regular))
            Text(text)
                .font(PatinaTypography.monoSmall)
                .tracking(0.5)
                .textCase(.uppercase)
        }
        .foregroundStyle(PatinaColors.Text.muted)
        .padding(.vertical, 4)
        .padding(.horizontal, 10)
        .background(Capsule().fill(PatinaColors.Background.secondary))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text(text))
    }

    // MARK: - Aggregates

    private var totalItemCount: Int {
        rooms.reduce(0) { $0 + $1.items.count }
    }
    private var totalInvestmentCents: Int {
        rooms.reduce(0) { $0 + $1.totalInvestmentCents }
    }
}
