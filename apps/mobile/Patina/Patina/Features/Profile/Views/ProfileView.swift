//
//  ProfileView.swift
//  Patina
//
//  Profile / Design Journal with avatar, stats, style badge, rooms
//

import SwiftUI
import SwiftData

struct ProfileView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.appCoordinator) private var coordinator
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    /// True when this screen is the Studio tab's root rather than a pushed
    /// copy of itself (W3 · R2). It then carries the tab's canonical name and
    /// no back chevron; everywhere else it is unchanged.
    @Environment(\.isTabRoot) private var isTabRoot
    @State private var viewModel = ProfileViewModel()
    /// Drives the contextual help-panel sheet attached to the Profile surface.
    /// Toggled by the `?` button in the top-right corner of the header.
    @State private var isHelpPanelPresented: Bool = false

    /// Shared formatter for room-card "Scanned" dates. `static let` so we
    /// allocate the formatter once instead of per row render (PT-6-5).
    private static let scannedDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 0) {
                // Header
                VStack(spacing: 0) {
                    // Avatar
                    Circle()
                        .fill(PatinaGradients.earth)
                        .frame(width: 80, height: 80)
                        .overlay(
                            Text(viewModel.userInitial)
                                .font(PatinaTypography.displaySmall)
                                .foregroundStyle(PatinaColors.offWhite)
                        )
                        .padding(.bottom, 16)
                        .accessibilityHidden(true)

                    Text(viewModel.userName)
                        .font(PatinaTypography.h3)
                        .foregroundStyle(PatinaColors.Text.primary)
                        .padding(.bottom, 4)

                    // "Member since…" — wrapped in HelpTooltip because the
                    // Design Journal concept (Patina's name for the profile
                    // as a record of personal taste evolution) is worth
                    // explaining to a curious user. Guests have no membership
                    // date, so the line is absent rather than invented.
                    if let memberSince = viewModel.memberSince {
                        HelpTooltip(
                            surfaceKey: SurfaceKeys.IOSApp.Profile.designJournal,
                            fallback: "Your profile is a Design Journal — Patina tracks the style you've taught it, the rooms you've captured, and the pieces you've saved. Everything here informs your recommendations."
                        ) {
                            MonoLabel(text: "Member since \(memberSince)")
                                .accessibilityLabel("Member since \(memberSince). More information available.")
                        }
                    }

                    // Style badge — wrapped in HelpTooltip because the
                    // style signature is a Patina-specific resolved concept
                    // (it blends the quiz, teaching turns, and saved items).
                    HelpTooltip(
                        surfaceKey: SurfaceKeys.IOSApp.Profile.styleBadge,
                        fallback: "Your style signature is the label Patina has resolved for your taste — it blends the style quiz, every teaching turn, and the pieces you've saved into a single descriptor."
                    ) {
                        HStack(spacing: 6) {
                            Text("✦")
                            Text(viewModel.styleBadge)
                                .font(PatinaTypography.uiSmall)
                                .foregroundStyle(PatinaColors.Text.secondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(PatinaColors.Background.secondary)
                        .clipShape(Capsule())
                        .padding(.top, 12)
                        .accessibilityLabel("Style: \(viewModel.styleBadge). More information available.")
                    }
                }
                .padding(.top, 56)
                .padding(.bottom, 24)

                // Stats row — Saved and Match are Patina-specific concepts,
                // so each is wrapped in HelpTooltip. Rooms is self-explanatory
                // and gets no affordance to keep the row uncluttered.
                stats
                .padding(.vertical, 20)
                .padding(.horizontal, 24)
                .overlay(alignment: .top) {
                    Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                }
                .overlay(alignment: .bottom) {
                    Rectangle().fill(PatinaColors.Text.muted.opacity(0.25)).frame(height: 1)
                }

                StudioHubView()
                    .padding(.horizontal, 24)
                    .padding(.top, 28)

                // Your Rooms section
                if !viewModel.rooms.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("YOUR ROOMS")
                            .font(PatinaTypography.monoMedium)
                            .foregroundStyle(PatinaColors.Text.secondary)
                            .tracking(1)
                            .accessibilityAddTraits(.isHeader)

                        roomList
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 28)
                }

                // Actions
                VStack(alignment: .leading, spacing: 12) {
                    Text("MORE")
                        .font(PatinaTypography.monoMedium)
                        .foregroundStyle(PatinaColors.Text.secondary)
                        .tracking(1)
                        .accessibilityAddTraits(.isHeader)

                    profileActionRow(icon: "paintpalette", label: "Retake Style Quiz") {
                        coordinator.navigate(to: .styleQuiz)
                    }
                    profileActionRow(icon: "bubble.left", label: "Get design help") {
                        coordinator.presentDesignServices(roomId: nil)
                    }
                    profileActionRow(icon: "gearshape", label: "Settings") {
                        coordinator.presentedSheet = .settings
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 28)
            }
            .companionBottomClearance()
        }
        .background(PatinaColors.Background.primary)
        // U18: standard pushed-screen chrome — the avatar/name block above
        // is this screen's header, so the chrome adds only the back chevron.
        // As the Studio tab's root there is no chevron and the destination's
        // canonical name is what the screen is called; the string is read from
        // `PatinaTab`, never re-typed (B-7 a).
        .patinaScreen(title: isTabRoot ? PatinaTab.studio.canonicalName : nil)
        .onAppear {
            viewModel.loadData(context: modelContext)
        }
        // C4-12 / R-03 (L1-B's note).
        .refreshable {
            viewModel.loadData(context: modelContext)
        }
        // Contextual help panel — surfaces every Sanity article whose
        // surfaceKey is `ios-app/profile` or a child of it.
        .helpPanel(
            isPresented: $isHelpPanelPresented,
            surfaceKey: SurfaceKeys.IOSApp.Profile.root
        )
    }

    // MARK: - Components

    // SP-18: the "MATCH" stat is gone. It printed
    // `styleProfile.confidence` — the quiz's confidence in its own reading —
    // under a label claiming a match, against nothing the screen names. It
    // read 63% signed in and 48% on the same device signed out, with nothing
    // on screen explaining either. The app cannot compute the rationale the
    // plank asked for, so the number comes down rather than keeps lying.
    // Rooms and Saved stay: both are counts the screen can defend.
    @ViewBuilder
    private var stats: some View {
        if dynamicTypeSize.isAccessibilitySize {
            VStack(spacing: 14) {
                statItem(value: "\(viewModel.roomCount)", label: viewModel.roomCount == 1 ? "Room" : "Rooms")
                statHorizontalDivider
                savedStat
            }
        } else {
            HStack(spacing: 0) {
                statItem(value: "\(viewModel.roomCount)", label: viewModel.roomCount == 1 ? "Room" : "Rooms")
                statDivider
                savedStat
            }
        }
    }

    private var savedStat: some View {
        HelpTooltip(
            surfaceKey: SurfaceKeys.IOSApp.Profile.savedItems,
            fallback: "Saved counts every piece you've hearted across the app — from the daily feed, room views, and product details. They flow into your style signature."
        ) {
            statItem(value: "\(viewModel.savedItemCount)", label: "Saved")
                .accessibilityLabel("Saved items: \(viewModel.savedItemCount). More information available.")
        }
    }

    private func statItem(value: String, label: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.Text.primary)
            MonoLabel(text: label, size: PatinaTypography.monoLabel)
        }
        .frame(maxWidth: .infinity)
        .frame(minHeight: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label): \(value)")
    }

    private var statDivider: some View {
        Rectangle()
            .fill(PatinaColors.Text.muted.opacity(0.25))
            .frame(width: 1, height: 36)
            .accessibilityHidden(true)
    }

    private var statHorizontalDivider: some View {
        Rectangle()
            .fill(PatinaColors.Text.muted.opacity(0.25))
            .frame(maxWidth: .infinity)
            .frame(height: 1)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var roomList: some View {
        if dynamicTypeSize.isAccessibilitySize {
            LazyVStack(spacing: 12) {
                ForEach(viewModel.rooms) { room in
                    roomButton(room, wide: true)
                }
            }
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(viewModel.rooms) { room in
                        roomButton(room, wide: false)
                    }
                }
            }
        }
    }

    private func roomButton(_ room: RoomModel, wide: Bool) -> some View {
        Button {
            coordinator.navigate(to: .roomProject(roomId: room.id))
        } label: {
            roomCard(room, wide: wide)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open \(room.name)")
        .accessibilityHint("Opens this room.")
    }

    private func roomCard(_ room: RoomModel, wide: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            // Theme V: use the room's scan hero photo when one exists
            // instead of a bare gradient; falls back to the room-type
            // gradient for unscanned/manual rooms.
            RoomCardHeroImage(room: room)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(room.name)
                        .font(PatinaTypography.uiSmall)
                        .foregroundStyle(PatinaColors.Text.primary)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 11))
                        .foregroundStyle(PatinaColors.Text.muted)
                        .accessibilityHidden(true)
                }

                MonoLabel(text: "Scanned \(Self.scannedDateFormatter.string(from: room.createdAt))", size: PatinaTypography.monoLabel)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
        }
        .frame(width: wide ? nil : 140)
        .frame(maxWidth: wide ? .infinity : nil)
        .background(PatinaColors.Background.secondary)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func profileActionRow(icon: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .frame(width: 32, height: 32)
                    .background(PatinaColors.clay.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Text(label)
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.primary)

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 13))
                    .foregroundStyle(PatinaColors.Text.muted)
            }
            .padding(14)
            .background(PatinaColors.Background.secondary)
            .clipShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Room card hero (Theme V)

/// Hero image for a profile room card. Prefers the room's scan hero photo —
/// the legacy v1 `heroFrameData` blob first, then the hero photo inside the
/// newest v2/v3 scan bundle on disk (same bundle layout ScanReviewPhotoLoader
/// reads) — and falls back to the room-type gradient when neither exists.
private struct RoomCardHeroImage: View {
    let room: RoomModel

    @Environment(\.modelContext) private var modelContext
    @State private var heroImage: UIImage?

    var body: some View {
        Group {
            if let heroImage {
                Image(uiImage: heroImage)
                    .resizable()
                    .scaledToFill()
            } else {
                gradient
            }
        }
        .frame(width: 140, height: 100)
        .clipped()
        .task(id: room.id) {
            await loadHero()
        }
    }

    /// Room-type gradient fallback — same mapping RoomGalleryCard and
    /// RoomProjectView use, so the profile cards stay consistent with the
    /// rest of the Room System until a photo exists.
    private var gradient: LinearGradient {
        switch room.roomType.lowercased() {
        case "living", "living_room", "living room": return PatinaGradients.warm
        case "bedroom":                               return PatinaGradients.dusk
        case "office":                                return PatinaGradients.sageGradient
        case "dining", "dining_room":                 return PatinaGradients.earth
        case "kitchen":                               return PatinaGradients.rattan
        default:                                      return PatinaGradients.linen
        }
    }

    private func loadHero() async {
        // 1. Legacy v1 single hero frame stored directly on the room.
        if let data = room.heroFrameData {
            let decoded = await Task.detached(priority: .utility) {
                UIImage(data: data)
            }.value
            if let decoded {
                heroImage = decoded
                return
            }
        }

        // 2. v2/v3 scan bundle — newest RoomScanPackage for this room, hero
        //    photo (review thumbnail preferred) read off disk.
        guard let url = bundleHeroPhotoURL() else { return }
        let decoded = await Task.detached(priority: .utility) { () -> UIImage? in
            guard let data = try? Data(contentsOf: url) else { return nil }
            return UIImage(data: data)
        }.value
        if let decoded {
            heroImage = decoded
        }
    }

    /// Resolve the on-disk URL of the hero photo in the room's most recent
    /// scan bundle (Application Support/{package.bundlePath}). Hero pick
    /// order mirrors the review step: user-picked hero id → user-selected
    /// flag → captured hero kind → best quality score.
    private func bundleHeroPhotoURL() -> URL? {
        let roomId = room.id
        var descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { $0.roomLocalId == roomId },
            sortBy: [SortDescriptor(\.createdAt, order: .reverse)]
        )
        descriptor.fetchLimit = 1
        guard let package = try? modelContext.fetch(descriptor).first else { return nil }

        let fm = FileManager.default
        guard let appSupport = try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        ) else { return nil }
        let bundleURL = appSupport.appendingPathComponent(package.bundlePath, isDirectory: true)
        guard let manifest = try? ScanBundleWriter.readManifest(at: bundleURL) else { return nil }

        let photos = manifest.photos
        let hero = photos.first(where: { $0.id == package.heroPhotoId })
            ?? photos.first(where: { $0.isUserSelectedHero })
            ?? photos.first(where: { $0.kind == .hero })
            ?? photos.max(by: { ($0.qualityScore ?? 0) < ($1.qualityScore ?? 0) })
        guard let hero else { return nil }

        // The ~256px review thumbnail is plenty for a 140pt card; fall back
        // to the full-resolution photo when no thumbnail was generated.
        for relative in [hero.thumbnailRelativePath, hero.relativePath].compactMap({ $0 }) {
            let url = bundleURL.appendingPathComponent(relative)
            if fm.fileExists(atPath: url.path) { return url }
        }
        return nil
    }
}

#Preview {
    ProfileView()
        .environment(\.appCoordinator, AppCoordinator())
}
