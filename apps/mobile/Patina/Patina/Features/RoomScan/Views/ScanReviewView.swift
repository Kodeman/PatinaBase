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
//  PT-6-3: this view is the thin façade that owns all editing state. The
//  header, scan-details table, and the three sheets (hero picker, reorder,
//  caption editor) are extracted into their own View types — see
//  ScanReviewHeader, ScanDetailsSection, HeroPickerSheet, PhotoReorderSheet,
//  CaptionEditorSheet, and the shared ScanReviewSupport helpers.
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

    /// Resolves bundle photos for this scan (shared with the extracted sheets).
    private var photoLoader: ScanReviewPhotoLoader {
        ScanReviewPhotoLoader(scanId: scanId)
    }

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
            PatinaColors.Background.primary.ignoresSafeArea()

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
                .tint(PatinaColors.Text.primary)
            Text("Preparing your scan…")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.Text.muted)
            Spacer()
        }
    }

    private var errorState: some View {
        VStack(spacing: 16) {
            Spacer()
            Text("Something went wrong")
                .font(PatinaTypography.patinaVoiceLarge)
                .foregroundStyle(PatinaColors.Text.primary.opacity(0.8))
            if let loadError {
                Text(loadError)
                    .font(.custom("Inter-Regular", size: 13, relativeTo: .footnote))
                    .foregroundStyle(PatinaColors.Text.muted)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            Text("Your other rooms are safe — this only affects this scan.")
                .font(.custom("Inter-Regular", size: 12, relativeTo: .caption))
                .foregroundStyle(PatinaColors.Text.muted.opacity(0.8))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Spacer()
            Button(action: onCancel) {
                Text("Discard this scan")
                    .font(PatinaTypography.uiAction)
                    .foregroundStyle(PatinaColors.Text.primary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(
                        RoundedRectangle(cornerRadius: 26)
                            .stroke(PatinaColors.Interactive.active, lineWidth: 1.5)
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
                    ScanReviewHeader(roomName: $roomName)
                    if manifest.photos.isEmpty {
                        emptyPhotosNote
                    } else {
                        heroSection(manifest: manifest)
                        gallerySection(manifest: manifest)
                    }
                    notesSection
                    ScanDetailsSection(manifest: manifest, session: session)
                    Spacer(minLength: 8)
                    ctaSection
                }
                .padding(.horizontal, 24)
                .padding(.top, 24)
                .padding(.bottom, 32)
            }
            .background(PatinaColors.Background.primary.ignoresSafeArea())
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(action: onCancel) {
                        Text("Discard")
                            .font(PatinaTypography.bodySmall)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }
                    .buttonStyle(.plain)
                }
                ToolbarItem(placement: .principal) {
                    Text("Review")
                        .font(PatinaTypography.mono)
                        .tracking(0.8)
                        .textCase(.uppercase)
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
            }
            .sheet(isPresented: $showingHeroPicker) {
                HeroPickerSheet(
                    manifest: manifest,
                    photoLoader: photoLoader,
                    selectedHeroPhotoId: selectedHeroPhotoId,
                    onSelect: { id in
                        selectedHeroPhotoId = id
                        showingHeroPicker = false
                    },
                    onDismiss: { showingHeroPicker = false }
                )
            }
            .sheet(isPresented: $showingReorderSheet) {
                PhotoReorderSheet(
                    manifest: manifest,
                    photoLoader: photoLoader,
                    heroId: effectiveHeroEntry(manifest: manifest)?.id,
                    hiddenPhotoIds: hiddenPhotoIds,
                    captions: captions,
                    workingOrder: $workingOrder,
                    onDismiss: { showingReorderSheet = false }
                )
            }
            .sheet(item: Binding(
                get: { editingPhotoId.map { ScanReviewPhotoIdWrapper(id: $0) } },
                set: { editingPhotoId = $0?.id }
            )) { wrapped in
                CaptionEditorSheet(
                    photoId: wrapped.id,
                    manifest: manifest,
                    photoLoader: photoLoader,
                    caption: captionBinding(for: wrapped.id, manifest: manifest),
                    onDismiss: { editingPhotoId = nil }
                )
            }
        }
    }

    private var emptyPhotosNote: some View {
        HStack(spacing: 12) {
            Image(systemName: "checkmark.seal")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(PatinaColors.Text.muted)
            Text("No photos captured — the scan shape is still saved.")
                .font(.custom("Inter-Regular", size: 13, relativeTo: .footnote))
                .foregroundStyle(PatinaColors.Text.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(PatinaColors.Background.secondary)
        )
    }

    // MARK: - Sections

    private func heroSection(manifest: ScanManifest) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            scanReviewSectionLabel("Hero Photo")

            let heroEntry = effectiveHeroEntry(manifest: manifest)
            Button(action: { showingHeroPicker = true }) {
                ZStack(alignment: .bottomLeading) {
                    photoLoader.image(for: heroEntry)
                        .frame(height: 240)
                        .frame(maxWidth: .infinity)
                        .clipShape(RoundedRectangle(cornerRadius: 16))

                    HStack(spacing: 6) {
                        Image(systemName: "photo.on.rectangle")
                            .font(.system(size: 11, weight: .medium))
                        Text("Change")
                            .font(PatinaTypography.caption)
                    }
                    .foregroundStyle(PatinaColors.Text.primary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .background(
                        Capsule().fill(PatinaColors.Background.primary.opacity(0.92))
                    )
                    .padding(12)
                }
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(PatinaColors.pearl, lineWidth: 1.5)
                )
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    private func gallerySection(manifest: ScanManifest) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                scanReviewSectionLabel("Supporting Photos")
                Spacer()
                if visibleSupportingPhotos(manifest: manifest).count > 1 {
                    Button(action: { showingReorderSheet = true }) {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.arrow.down")
                                .font(.system(size: 10, weight: .medium))
                            Text("Reorder")
                                .font(.custom("Inter-Medium", size: 11, relativeTo: .caption2))
                        }
                        .foregroundStyle(PatinaColors.Text.primary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Capsule().stroke(PatinaColors.pearl, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Reorder supporting photos")
                }
                Text("\(visibleSupportingPhotos(manifest: manifest).count)")
                    .font(PatinaTypography.mono)
                    .foregroundStyle(PatinaColors.Text.muted)
            }

            let supporting = visibleSupportingPhotos(manifest: manifest)
            if supporting.isEmpty {
                Text("No additional photos captured.")
                    .font(.custom("Inter-Regular", size: 13, relativeTo: .footnote))
                    .foregroundStyle(PatinaColors.Text.muted)
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
                    .font(PatinaTypography.monoSmall)
                    .tracking(0.4)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .padding(.top, 8)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(hidden, id: \.id) { photo in
                            Button(action: { restorePhoto(photo.id) }) {
                                ZStack {
                                    photoLoader.image(for: photo)
                                        .frame(width: 80, height: 80)
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                        .opacity(0.45)
                                    Image(systemName: "arrow.uturn.backward")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(PatinaColors.offWhite)
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
                    photoLoader.image(for: photo)
                        .frame(width: 132, height: 180)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    if hasCaption {
                        HStack(spacing: 4) {
                            Image(systemName: "text.bubble")
                                .font(.system(size: 9, weight: .medium))
                            Text("Note")
                                .font(.custom("Inter-Medium", size: 10, relativeTo: .caption2))
                        }
                        .foregroundStyle(PatinaColors.Text.primary)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Capsule().fill(PatinaColors.Background.primary.opacity(0.92)))
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
                    .foregroundStyle(PatinaColors.offWhite)
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
            scanReviewSectionLabel("Room Notes")

            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 12)
                    .fill(PatinaColors.Background.secondary)
                RoundedRectangle(cornerRadius: 12)
                    .stroke(PatinaColors.pearl, lineWidth: 1.5)

                if roomNotes.isEmpty {
                    Text("Anything worth remembering? (private to you for now)")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted.opacity(0.7))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .allowsHitTesting(false)
                }

                TextEditor(text: $roomNotes)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.Text.primary)
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
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .frame(maxWidth: .infinity)
                    .frame(height: 44)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Save room without adding notes")
        }
        .padding(.top, 8)
    }

    // MARK: - Caption binding

    /// Build the same get/set binding the inline caption editor used: read the
    /// user-entered caption, falling back to the photo's existing annotation;
    /// write into `captions`.
    private func captionBinding(for photoId: UUID, manifest: ScanManifest) -> Binding<String> {
        let photo = manifest.photos.first(where: { $0.id == photoId })
        return Binding<String>(
            get: { captions[photoId] ?? photo?.userAnnotation ?? "" },
            set: { captions[photoId] = $0 }
        )
    }

    // MARK: - Data helpers

    /// Async poll for the manifest file. Bundle freeze happens after the
    /// capture session's `didEndWith` fires — we may beat it by a beat.
    private func loadManifest() async {
        isLoading = true
        loadError = nil
        let bundleURL = bundleURL(for: scanId)
        // Try up to 20 attempts across ~10 seconds. We poll until the manifest
        // both exists AND has artifacts populated — the captureSession's
        // freezeBundleArtifacts can race the review screen presentation on
        // the .auto-complete path, leaving the on-disk manifest with photos
        // but zero structural artifacts for a brief window. Loading the
        // half-baked manifest and letting Save fire would push an empty
        // bundle through the uploader (the 2026-05-13 AF5527F5 race).
        var lastLoaded: ScanManifest?
        for attempt in 0..<20 {
            if let loaded = try? ScanBundleWriter.readManifest(at: bundleURL) {
                lastLoaded = loaded
                if !loaded.artifacts.isEmpty {
                    applyManifest(loaded)
                    return
                }
            }
            if attempt < 19 {
                try? await Task.sleep(nanoseconds: 500_000_000)
            }
        }
        // Best-effort fall-through: surface whatever we last loaded so the
        // user at least sees photos. Save will refuse to fire if artifacts
        // are still empty (the upload gate catches it), and if the freeze
        // eventually lands, the SwiftData package + resumePendingUploads
        // picks up the now-populated manifest on next launch.
        if let loaded = lastLoaded {
            applyManifest(loaded)
            return
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

    private func visibleSupportingPhotos(manifest: ScanManifest) -> [ScanManifest.PhotoEntry] {
        let heroId = effectiveHeroEntry(manifest: manifest)?.id
        return workingOrder
            .filter { $0 != heroId && !hiddenPhotoIds.contains($0) }
            .compactMap { id in manifest.photos.first(where: { $0.id == id }) }
    }

    private func hiddenSupportingPhotos(manifest: ScanManifest) -> [ScanManifest.PhotoEntry] {
        hiddenPhotoIds.compactMap { id in manifest.photos.first(where: { $0.id == id }) }
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
