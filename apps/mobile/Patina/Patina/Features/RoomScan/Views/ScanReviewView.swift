//
//  ScanReviewView.swift
//  Patina
//
//  Screen 08: The Review. Shown after the scan freezes and before the bundle
//  manifest finalizes, so the user can set the room name, pick a hero photo,
//  reorder or hide supporting photos, caption individual shots, and leave a
//  personal room note. On submit we call
//  `RoomCaptureService.finalizeBundleAfterReview(...)` which seals the
//  manifest; the coordinator saves locally and hands off the background upload.
//

import SwiftUI
import UIKit

/// SwiftUI view for the post-scan review step.
public struct ScanReviewView: View {

    // MARK: - Inputs

    private let captureService: RoomCaptureService
    private let scanId: UUID
    private let session: RoomScanSession?
    private let onComplete: () -> Void
    private let onCancel: () -> Void

    // MARK: - Local state

    /// Snapshot of the manifest — nil until we successfully read it from disk.
    @State private var manifest: ScanManifest?
    /// Error shown if the manifest can't be loaded after a short retry window.
    @State private var loadError: String?
    /// True while we're still trying to read the manifest (poll loop).
    @State private var isLoading: Bool = true

    /// Room name the user can edit.
    @State private var roomName: String = ""
    /// Free-form note attached to this room (private until the user shares).
    @State private var roomNotes: String = ""
    /// The photo id the user picked as hero (nil = keep manifest's current hero).
    @State private var selectedHeroPhotoId: UUID?
    /// User-entered captions keyed by photo id. Persisted per-photo on save.
    @State private var captions: [UUID: String] = [:]
    /// Working order of photos (manifest photos + user reorders, excluding the hero).
    @State private var workingOrder: [UUID] = []
    /// Photos the user chose to hide.
    @State private var hiddenPhotoIds: Set<UUID> = []

    /// Sheet state for the hero picker, per-photo caption editor, and reorder.
    @State private var showingHeroPicker: Bool = false
    @State private var showingReorderSheet: Bool = false
    @State private var editingPhotoId: UUID?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // MARK: - Init

    public init(
        captureService: RoomCaptureService,
        scanId: UUID,
        session: RoomScanSession? = nil,
        onComplete: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.captureService = captureService
        self.scanId = scanId
        self.session = session
        self.onComplete = onComplete
        self.onCancel = onCancel
    }

    // MARK: - Body

    public var body: some View {
        ZStack {
            PatinaColors.offWhite.ignoresSafeArea()

            if let manifest = manifest {
                loadedContent(manifest: manifest)
            } else if isLoading {
                loadingState
            } else {
                errorState
            }
        }
        .task(id: scanId) {
            await loadManifest()
        }
    }

    // MARK: - Loading / error

    private var loadingState: some View {
        VStack(spacing: 16) {
            Spacer()
            ProgressView()
                .tint(PatinaColors.charcoal)
            Text("Preparing your scan…")
                .font(.custom("Inter-Regular", size: 14))
                .foregroundColor(PatinaColors.agedOak)
            Spacer()
        }
    }

    private var errorState: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Something went wrong")
                .font(.custom("PlayfairDisplay-Italic", size: 22))
                .foregroundColor(PatinaColors.charcoal.opacity(0.8))
            if let loadError {
                Text(loadError)
                    .font(.custom("Inter-Regular", size: 13))
                    .foregroundColor(PatinaColors.agedOak)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            Text("Your other rooms are safe — this only affects this scan.")
                .font(.custom("Inter-Regular", size: 12))
                .foregroundColor(PatinaColors.agedOak.opacity(0.8))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
            Button(action: onCancel) {
                Text("Discard this scan")
                    .font(.custom("Inter-Medium", size: 15))
                    .foregroundColor(PatinaColors.charcoal)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 26)
                            .stroke(PatinaColors.charcoal, lineWidth: 1.5)
                    )
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 24)
            .padding(.bottom, 42)
        }
    }

    // MARK: - Loaded content

    @ViewBuilder
    private func loadedContent(manifest: ScanManifest) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    headerSection
                    if manifest.photos.isEmpty {
                        emptyPhotosNote
                    } else {
                        heroSection(manifest: manifest)
                        gallerySection(manifest: manifest)
                    }
                    notesSection
                    scanDetailsSection(manifest: manifest)
                    Spacer(minLength: 8)
                    ctaSection
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
            .background(PatinaColors.offWhite.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onCancel) {
                        Text("Discard")
                            .font(.custom("Inter-Regular", size: 14))
                            .foregroundColor(PatinaColors.agedOak)
                    }
                    .buttonStyle(.plain)
                }
                ToolbarItem(placement: .principal) {
                    Text("Review")
                        .font(.custom("DMMono-Regular", size: 10))
                        .tracking(0.8)
                        .textCase(.uppercase)
                        .foregroundColor(PatinaColors.clay)
                }
            }
            .sheet(isPresented: $showingHeroPicker) {
                heroPickerSheet(manifest: manifest)
            }
            .sheet(isPresented: $showingReorderSheet) {
                reorderSheet(manifest: manifest)
            }
            .sheet(item: Binding(
                get: { editingPhotoId.map { PhotoIdWrapper(id: $0) } },
                set: { editingPhotoId = $0?.id }
            )) { wrapped in
                captionSheet(photoId: wrapped.id, manifest: manifest)
            }
        }
    }

    private var emptyPhotosNote: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.seal")
                .font(.system(size: 18, weight: .regular))
                .foregroundColor(PatinaColors.agedOak)
            Text("No photos captured — the scan shape is still saved.")
                .font(.custom("Inter-Regular", size: 13))
                .foregroundColor(PatinaColors.agedOak)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(PatinaColors.softCream)
        )
    }

    // MARK: - Sections

    private var headerSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Your room, your way")
                .font(.custom("PlayfairDisplay-Italic", size: 22))
                .foregroundColor(PatinaColors.charcoal.opacity(0.85))
            Text("Give the room a name, pick the photo you love most, and jot down anything worth remembering. You can share it later.")
                .font(.custom("Inter-Regular", size: 13))
                .foregroundColor(PatinaColors.agedOak)
                .fixedSize(horizontal: false, vertical: true)

            TextField("Room name", text: $roomName)
                .font(.custom("Inter-Regular", size: 15))
                .foregroundColor(PatinaColors.charcoal)
                .padding(.horizontal, 16)
                .frame(height: 48)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(PatinaColors.softCream)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(PatinaColors.pearl, lineWidth: 1.5)
                )
                .padding(.top, 8)
        }
    }

    private func heroSection(manifest: ScanManifest) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Hero Photo")

            let heroEntry = effectiveHeroEntry(manifest: manifest)
            Button(action: { showingHeroPicker = true }) {
                ZStack(alignment: .bottomLeading) {
                    photoImage(for: heroEntry)
                        .frame(height: 240)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    HStack(spacing: 6) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 11, weight: .medium))
                        Text("Change")
                            .font(.custom("Inter-Medium", size: 12))
                    }
                    .foregroundColor(PatinaColors.charcoal)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(PatinaColors.offWhite.opacity(0.92))
                    )
                    .padding(12)
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(PatinaColors.pearl, lineWidth: 1.5)
                )
            }
            .buttonStyle(.plain)
        }
    }

    private func gallerySection(manifest: ScanManifest) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                sectionLabel("Supporting Photos")
                Spacer()
                if visibleSupportingPhotos(manifest: manifest).count > 1 {
                    Button(action: { showingReorderSheet = true }) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.arrow.down")
                                .font(.system(size: 10, weight: .medium))
                            Text("Reorder")
                                .font(.custom("Inter-Medium", size: 11))
                        }
                        .foregroundColor(PatinaColors.charcoal)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Capsule().stroke(PatinaColors.pearl, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Reorder supporting photos")
                }
                Text("\(visibleSupportingPhotos(manifest: manifest).count)")
                    .font(.custom("DMMono-Regular", size: 10))
                    .foregroundColor(PatinaColors.agedOak)
            }

            let supporting = visibleSupportingPhotos(manifest: manifest)
            if supporting.isEmpty {
                Text("No additional photos captured.")
                    .font(.custom("Inter-Regular", size: 13))
                    .foregroundColor(PatinaColors.agedOak)
                    .padding(.vertical, 16)
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 12) {
                        ForEach(supporting, id: \.id) { photo in
                            supportingPhotoTile(photo: photo, manifest: manifest)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            // Hidden photos can be restored here.
            let hidden = hiddenSupportingPhotos(manifest: manifest)
            if !hidden.isEmpty {
                Text("Hidden from your designer (\(hidden.count))")
                    .font(.custom("DMMono-Regular", size: 9))
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundColor(PatinaColors.clay)
                    .padding(.top, 8)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(hidden, id: \.id) { photo in
                            Button(action: { restorePhoto(photo.id) }) {
                                ZStack {
                                    photoImage(for: photo)
                                        .frame(width: 80, height: 80)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                        .opacity(0.45)
                                    Image(systemName: "arrow.uturn.backward")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(PatinaColors.offWhite)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
    }

    private func supportingPhotoTile(photo: ScanManifest.PhotoEntry, manifest: ScanManifest) -> some View {
        let hasCaption = (captions[photo.id] ?? photo.userAnnotation ?? "").isEmpty == false
        return ZStack(alignment: .topTrailing) {
            Button(action: { editingPhotoId = photo.id }) {
                ZStack(alignment: .bottomLeading) {
                    photoImage(for: photo)
                        .frame(width: 132, height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    if hasCaption {
                        HStack(spacing: 4) {
                            Image(systemName: "text.bubble")
                                .font(.system(size: 9, weight: .medium))
                            Text("Note")
                                .font(.custom("Inter-Medium", size: 10))
                        }
                        .foregroundColor(PatinaColors.charcoal)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(PatinaColors.offWhite.opacity(0.92)))
                        .padding(8)
                    }
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(PatinaColors.pearl, lineWidth: 1)
                )
            }
            .buttonStyle(.plain)

            // Hide affordance
            Button(action: { hidePhoto(photo.id) }) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(PatinaColors.offWhite)
                    .frame(width: 22, height: 22)
                    .background(Circle().fill(PatinaColors.charcoal.opacity(0.7)))
            }
            .buttonStyle(.plain)
            .padding(6)
            .accessibilityLabel("Hide photo")
        }
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Room Notes")

            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(PatinaColors.softCream)
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.pearl, lineWidth: 1.5)

                if roomNotes.isEmpty {
                    Text("Anything worth remembering? (private to you for now)")
                        .font(.custom("Inter-Regular", size: 14))
                        .foregroundColor(PatinaColors.agedOak.opacity(0.7))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .allowsHitTesting(false)
                }

                TextEditor(text: $roomNotes)
                    .font(.custom("Inter-Regular", size: 14))
                    .foregroundColor(PatinaColors.charcoal)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
            }
            .frame(minHeight: 140)
        }
    }

    private var ctaSection: some View {
        VStack(spacing: 12) {
            StyleContinueButton(
                title: "Save room",
                isEnabled: true,
                action: { Task { await submit(skipping: false) } }
            )

            Button(action: { Task { await submit(skipping: true) } }) {
                Text("Save without notes")
                    .font(.custom("Inter-Medium", size: 14))
                    .foregroundColor(PatinaColors.agedOak)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Save room without adding notes")
        }
        .padding(.top, 8)
    }

    // MARK: - Scan details

    private func scanDetailsSection(manifest: ScanManifest) -> some View {
        let rows = scanDetailRows(manifest: manifest)
        return VStack(alignment: .leading, spacing: 12) {
            sectionLabel("Scan Details")
            VStack(spacing: 0) {
                ForEach(rows.indices, id: \.self) { idx in
                    let row = rows[idx]
                    HStack {
                        Text(row.label)
                            .font(.custom("Inter-Regular", size: 13))
                            .foregroundColor(PatinaColors.agedOak)
                        Spacer()
                        Text(row.value)
                            .font(.custom("DMMono-Regular", size: 12))
                            .foregroundColor(PatinaColors.charcoal)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    if idx < rows.count - 1 {
                        Rectangle()
                            .fill(PatinaColors.pearl.opacity(0.6))
                            .frame(height: 1)
                            .padding(.horizontal, 14)
                    }
                }
            }
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(PatinaColors.softCream)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.pearl, lineWidth: 1)
            )
        }
    }

    private struct DetailRow {
        let label: String
        let value: String
    }

    private func scanDetailRows(manifest: ScanManifest) -> [DetailRow] {
        var rows: [DetailRow] = []

        rows.append(DetailRow(label: "Photos", value: "\(manifest.photos.count)"))

        if let session {
            let dims = session.dimensions
            let length = dims.length
            let width = dims.width
            if length > 0 && width > 0 {
                if let height = dims.height, height > 0 {
                    rows.append(DetailRow(
                        label: "Dimensions",
                        value: String(format: "%.1f × %.1f × %.1f m", length, width, height)
                    ))
                } else {
                    rows.append(DetailRow(
                        label: "Dimensions",
                        value: String(format: "%.1f × %.1f m", length, width)
                    ))
                }
            }
            if dims.area > 0 {
                rows.append(DetailRow(
                    label: "Floor area",
                    value: String(format: "%.1f m²", dims.area)
                ))
            }

            let windows = session.features.windowCount
            let doors = session.features.doorCount
            if windows > 0 || doors > 0 {
                rows.append(DetailRow(
                    label: "Openings",
                    value: "\(windows) window\(windows == 1 ? "" : "s"), \(doors) door\(doors == 1 ? "" : "s")"
                ))
            }

            if !session.detectedObjects.isEmpty {
                rows.append(DetailRow(
                    label: "Objects detected",
                    value: "\(session.detectedObjects.count)"
                ))
            }

            rows.append(DetailRow(
                label: "Method",
                value: session.scanMethod == .lidar ? "LiDAR" : "Manual"
            ))
        }

        let totalBytes = manifest.artifacts.reduce(0) { $0 + $1.sizeBytes }
            + manifest.photos.reduce(0) { $0 + $1.sizeBytes }
        if totalBytes > 0 {
            rows.append(DetailRow(label: "Captured", value: formattedSize(bytes: totalBytes)))
        }

        return rows
    }

    private func formattedSize(bytes: Int) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        formatter.allowedUnits = [.useMB, .useKB, .useGB]
        return formatter.string(fromByteCount: Int64(bytes))
    }

    // MARK: - Sheets

    private func heroPickerSheet(manifest: ScanManifest) -> some View {
        let ranked = topPhotosByScore(manifest: manifest, limit: 10)
        return NavigationStack {
            ScrollView {
                LazyVGrid(
                    columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)],
                    spacing: 12
                ) {
                    ForEach(ranked, id: \.id) { photo in
                        Button(action: {
                            selectedHeroPhotoId = photo.id
                            showingHeroPicker = false
                        }) {
                            ZStack(alignment: .topTrailing) {
                                photoImage(for: photo)
                                    .frame(height: 180)
                                    .frame(maxWidth: .infinity)
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 12)
                                            .stroke(
                                                isEffectiveHero(photoId: photo.id, manifest: manifest)
                                                    ? PatinaColors.charcoal
                                                    : PatinaColors.pearl,
                                                lineWidth: isEffectiveHero(photoId: photo.id, manifest: manifest) ? 2 : 1
                                            )
                                    )

                                if isEffectiveHero(photoId: photo.id, manifest: manifest) {
                                    Image(systemName: "checkmark.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundColor(PatinaColors.charcoal)
                                        .padding(8)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .background(PatinaColors.offWhite.ignoresSafeArea())
            .navigationTitle("Pick Hero Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { showingHeroPicker = false }
                        .foregroundColor(PatinaColors.charcoal)
                }
            }
        }
        .presentationDetents([.large])
    }

    private func reorderSheet(manifest: ScanManifest) -> some View {
        let heroId = effectiveHeroEntry(manifest: manifest)?.id
        let reorderable = workingOrder.filter { id in
            id != heroId && !hiddenPhotoIds.contains(id)
        }
        return NavigationStack {
            List {
                ForEach(reorderable, id: \.self) { photoId in
                    if let photo = manifest.photos.first(where: { $0.id == photoId }) {
                        HStack(spacing: 12) {
                            photoImage(for: photo)
                                .frame(width: 56, height: 56)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reorderableTitle(for: photo))
                                    .font(.custom("Inter-Medium", size: 13))
                                    .foregroundColor(PatinaColors.charcoal)
                                if let caption = captions[photo.id] ?? photo.userAnnotation,
                                   !caption.isEmpty {
                                    Text(caption)
                                        .font(.custom("Inter-Regular", size: 11))
                                        .foregroundColor(PatinaColors.agedOak)
                                        .lineLimit(1)
                                }
                            }
                            Spacer()
                            Image(systemName: "line.3.horizontal")
                                .font(.system(size: 14, weight: .regular))
                                .foregroundColor(PatinaColors.agedOak.opacity(0.6))
                        }
                        .padding(.vertical, 4)
                    }
                }
                .onMove { indices, newOffset in
                    applyReorder(indices: indices, newOffset: newOffset, heroId: heroId)
                }
            }
            .listStyle(.plain)
            .environment(\.editMode, .constant(.active))
            .background(PatinaColors.offWhite.ignoresSafeArea())
            .scrollContentBackground(.hidden)
            .navigationTitle("Reorder Photos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { showingReorderSheet = false }
                        .foregroundColor(PatinaColors.charcoal)
                }
            }
        }
        .presentationDetents([.large])
    }

    /// Apply a reorder delta from a SwiftUI List `.onMove` against the subset
    /// of `workingOrder` that is currently visible (non-hero, non-hidden).
    private func applyReorder(indices: IndexSet, newOffset: Int, heroId: UUID?) {
        var visible = workingOrder.filter { id in
            id != heroId && !hiddenPhotoIds.contains(id)
        }
        visible.move(fromOffsets: indices, toOffset: newOffset)

        // Reassemble workingOrder: keep hero at its current slot, preserve
        // hidden photos at their current positions, splice the reordered
        // visible sequence into the remaining slots in order.
        var result: [UUID] = []
        var visibleIter = visible.makeIterator()
        for id in workingOrder {
            if id == heroId || hiddenPhotoIds.contains(id) {
                result.append(id)
            } else if let next = visibleIter.next() {
                result.append(next)
            }
        }
        workingOrder = result
    }

    private func reorderableTitle(for photo: ScanManifest.PhotoEntry) -> String {
        if let feature = photo.associatedFeatureCategory, !feature.isEmpty {
            return feature.capitalized
        }
        switch photo.kind {
        case .hero: return "Hero"
        case .auto: return "Photo"
        case .user: return "Tapped"
        case .feature: return "Feature"
        }
    }

    private func captionSheet(photoId: UUID, manifest: ScanManifest) -> some View {
        let photo = manifest.photos.first(where: { $0.id == photoId })
        return NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if let photo = photo {
                    photoImage(for: photo)
                        .frame(height: 280)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                }

                sectionLabel("Note for this photo")

                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(PatinaColors.softCream)
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(PatinaColors.pearl, lineWidth: 1.5)

                    let binding = Binding<String>(
                        get: { captions[photoId] ?? photo?.userAnnotation ?? "" },
                        set: { captions[photoId] = $0 }
                    )

                    if binding.wrappedValue.isEmpty {
                        Text("What's worth noticing here?")
                            .font(.custom("Inter-Regular", size: 14))
                            .foregroundColor(PatinaColors.agedOak.opacity(0.7))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .allowsHitTesting(false)
                    }

                    TextEditor(text: binding)
                        .font(.custom("Inter-Regular", size: 14))
                        .foregroundColor(PatinaColors.charcoal)
                        .scrollContentBackground(.hidden)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                }
                .frame(minHeight: 120)

                Spacer()
            }
            .padding(24)
            .background(PatinaColors.offWhite.ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { editingPhotoId = nil }
                        .foregroundColor(PatinaColors.charcoal)
                }
            }
        }
        .presentationDetents([.large])
    }

    // MARK: - Small components

    private func sectionLabel(_ text: String) -> some View {
        Text(text)
            .font(.custom("DMMono-Regular", size: 10))
            .tracking(0.6)
            .textCase(.uppercase)
            .foregroundColor(PatinaColors.clay)
    }

    /// Load a photo from the bundle's `photos/` directory. Falls back to a
    /// neutral placeholder when we can't find the file.
    private func photoImage(for entry: ScanManifest.PhotoEntry?) -> some View {
        Group {
            if let entry = entry,
               let url = photoURL(for: entry),
               let data = try? Data(contentsOf: url),
               let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .scaledToFill()
            } else {
                Rectangle()
                    .fill(PatinaColors.softCream)
                    .overlay(
                        Image(systemName: "photo")
                            .font(.system(size: 28))
                            .foregroundColor(PatinaColors.agedOak.opacity(0.5))
                    )
            }
        }
    }

    // MARK: - Data helpers

    /// Async poll for the manifest file. Bundle freeze happens after the
    /// capture session's `didEndWith` fires — we may beat it by a beat.
    private func loadManifest() async {
        isLoading = true
        loadError = nil
        let bundleURL = bundleURL(for: scanId)
        // Try up to 10 times across ~5 seconds before giving up.
        for attempt in 0..<10 {
            if let loaded = try? ScanBundleWriter.readManifest(at: bundleURL) {
                applyManifest(loaded)
                return
            }
            if attempt < 9 {
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
        isLoading = false
        loadError = "We couldn't find the scan file. If this keeps happening, please start a fresh scan."
    }

    private func applyManifest(_ loaded: ScanManifest) {
        manifest = loaded
        isLoading = false
        if roomName.isEmpty {
            roomName = loaded.roomName.isEmpty ? "" : loaded.roomName
        }
        if roomNotes.isEmpty {
            roomNotes = loaded.annotations.roomNotes
        }
        if captions.isEmpty {
            for photo in loaded.photos {
                if let existing = photo.userAnnotation, !existing.isEmpty {
                    captions[photo.id] = existing
                }
            }
        }
        if workingOrder.isEmpty {
            workingOrder = orderedPhotoIds(from: loaded)
        }
        if selectedHeroPhotoId == nil {
            selectedHeroPhotoId = loaded.photos.first(where: { $0.isUserSelectedHero })?.id
        }
    }

    private func orderedPhotoIds(from manifest: ScanManifest) -> [UUID] {
        manifest.photos
            .sorted { lhs, rhs in
                switch (lhs.orderIndex, rhs.orderIndex) {
                case let (l?, r?): return l < r
                case (_?, nil):    return true
                case (nil, _?):    return false
                default:           return lhs.capturedAt < rhs.capturedAt
                }
            }
            .map(\.id)
    }

    private func bundleURL(for scanId: UUID) -> URL {
        let fm = FileManager.default
        let appSupport = (try? fm.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: false
        )) ?? URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Application Support", isDirectory: true)
        return appSupport
            .appendingPathComponent("Scans", isDirectory: true)
            .appendingPathComponent(scanId.uuidString, isDirectory: true)
    }

    private func photoURL(for entry: ScanManifest.PhotoEntry) -> URL? {
        let url = bundleURL(for: scanId).appendingPathComponent(entry.relativePath)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Returns the photo currently treated as "hero" in the UI.
    private func effectiveHeroEntry(manifest: ScanManifest) -> ScanManifest.PhotoEntry? {
        if let id = selectedHeroPhotoId,
           let match = manifest.photos.first(where: { $0.id == id }) {
            return match
        }
        if let manifestHero = manifest.photos.first(where: { $0.isUserSelectedHero }) {
            return manifestHero
        }
        if let heroKind = manifest.photos.first(where: { $0.kind == .hero }) {
            return heroKind
        }
        return manifest.photos.first
    }

    private func isEffectiveHero(photoId: UUID, manifest: ScanManifest) -> Bool {
        effectiveHeroEntry(manifest: manifest)?.id == photoId
    }

    private func visibleSupportingPhotos(manifest: ScanManifest) -> [ScanManifest.PhotoEntry] {
        let heroId = effectiveHeroEntry(manifest: manifest)?.id
        return workingOrder
            .filter { $0 != heroId && !hiddenPhotoIds.contains($0) }
            .compactMap { id in manifest.photos.first(where: { $0.id == id }) }
    }

    private func hiddenSupportingPhotos(manifest: ScanManifest) -> [ScanManifest.PhotoEntry] {
        hiddenPhotoIds.compactMap { id in manifest.photos.first(where: { $0.id == id }) }
    }

    /// Top photos by quality score — falls back to capture order when scores
    /// are nil so the picker always has something to show.
    private func topPhotosByScore(manifest: ScanManifest, limit: Int) -> [ScanManifest.PhotoEntry] {
        let ranked = manifest.photos.sorted { lhs, rhs in
            let l = Self.rankingKey(for: lhs)
            let r = Self.rankingKey(for: rhs)
            return l > r
        }
        return Array(ranked.prefix(limit))
    }

    /// Ranking fallback: quality score when available, otherwise a small
    /// negative based on capture order so later shots lose the tiebreaker.
    private static func rankingKey(for photo: ScanManifest.PhotoEntry) -> Float {
        if let score = photo.qualityScore { return score }
        if let idx = photo.orderIndex { return -Float(idx) / 1000.0 }
        return -Float(photo.timestampSeconds) / 1000.0
    }

    // MARK: - User actions

    private func hidePhoto(_ id: UUID) {
        hiddenPhotoIds.insert(id)
    }

    private func restorePhoto(_ id: UUID) {
        hiddenPhotoIds.remove(id)
    }

    // MARK: - Submit

    private func submit(skipping: Bool) async {
        guard let manifest = manifest else { return }

        let trimmedName = roomName.trimmingCharacters(in: .whitespacesAndNewlines)
        let userName: String? = trimmedName.isEmpty ? nil : trimmedName
        let notes = skipping ? "" : roomNotes

        let annotations = ScanManifest.Annotations(
            roomNotes: notes,
            userProvidedRoomName: userName,
            reviewCompletedAt: Date()
        )

        let heroId = skipping ? nil : (selectedHeroPhotoId ?? effectiveHeroEntry(manifest: manifest)?.id)
        let reorderedIds: [UUID]
        if skipping {
            reorderedIds = []
        } else {
            reorderedIds = workingOrder.filter { !hiddenPhotoIds.contains($0) }
        }

        // Per-photo captions land on PhotoEntry.userAnnotation via
        // finalizeBundleAfterReview. Skip-save still persists captions the user
        // already typed — dropping them would be surprising.
        var photoAnnotations: [UUID: String] = [:]
        for (id, caption) in captions {
            let trimmed = caption.trimmingCharacters(in: .whitespacesAndNewlines)
            photoAnnotations[id] = trimmed
        }

        do {
            try await captureService.finalizeBundleAfterReview(
                annotations: annotations,
                heroPhotoId: heroId,
                reorderedPhotoIds: reorderedIds,
                photoAnnotations: photoAnnotations
            )
            _ = manifest  // keep explicit dependency for guard above
            onComplete()
        } catch {
            loadError = "We couldn't save your changes. \(error.localizedDescription)"
        }
    }
}

// MARK: - Supporting types

/// Sheet(item:) requires Identifiable; UUID isn't directly Identifiable on
/// its own, so wrap it.
private struct PhotoIdWrapper: Identifiable, Equatable {
    let id: UUID
}

