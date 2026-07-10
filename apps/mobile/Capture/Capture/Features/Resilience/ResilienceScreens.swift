//  ResilienceScreens.swift
//  Capture
//
//  Team D — Flow 4 (resilience & edges). The R3 `.photoImport` degraded-mode
//  sheet ("Camera is off for Patina Field") + the ResilienceScreens registrar. This
//  sheet doubles as the E3 share-import finisher: same surface, reflected id.
//
//  Registers ONLY `.photoImport`. (R1/R4 ship as composable overlays — see
//  LowLightTorchOverlay / OfflineQueueBanner — not registered screens. `.ocr`
//  (R2) and `.syncStatus` (U1) belong to Teams C/F.)

import SwiftUI
import PhotosUI
import Photos
import UIKit
import CaptureKit

/// Why the degraded-mode sheet is up: a denied camera permission (R3) or a
/// share-sheet hand-off that needs finishing (E3). Drives copy + the reflected
/// accessibility id so XCUITest/MobAI can tell the two entries apart.
enum PhotoImportContext {
    case denied        // R3 — camera off for Patina Field
    case shareImport   // E3 — "Save to Patina Field" share extension hand-off

    var screenID: CaptureScreenID { self == .shareImport ? .e3ShareSheet : .r3Denied }
    var title: String { self == .shareImport ? "Saved to Patina Field" : "Camera is off for Patina Field" }
    var blurb: String {
        self == .shareImport
            ? "These shots are in. Finish the record now, or pick more from Photos and add them by hand."
            : "You can still import from Photos and finish records by hand — or turn the camera on to capture live."
    }
}

/// R3 / E3 — degraded-capture entry. Three ways to keep a find without the live
/// camera: import from Photos, enter by hand, or jump to Settings to re-grant.
struct PhotoImportSheet: View {
    let store: CaptureStore
    let coordinator: CaptureCoordinator
    var analytics: (any CaptureAnalytics)?
    var context: PhotoImportContext = .denied

    @Environment(\.openURL) private var openURL
    @State private var pickerItems: [PhotosPickerItem] = []
    @State private var isImporting = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer(minLength: 24)

            // ── Header ──
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(CaptureColor.paper2)
                        .frame(width: 72, height: 72)
                    Image(systemName: context == .shareImport ? "square.and.arrow.down.fill" : "camera.fill")
                        .font(CaptureType.title)
                        .foregroundStyle(context == .shareImport ? CaptureColor.verdigris : CaptureColor.error)
                }
                .accessibilityHidden(true)
                Text(context.title)
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
                    .multilineTextAlignment(.center)
                Text(context.blurb)
                    .font(CaptureType.callout)
                    .foregroundStyle(CaptureColor.inkSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
            }
            .padding(.bottom, 28)

            // ── Primary degraded paths ──
            VStack(spacing: 12) {
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 5,
                             matching: .images, photoLibrary: .shared()) {
                    actionRow(icon: "photo.on.rectangle.angled",
                              title: "Import from Photos",
                              subtitle: "Pull existing shots into a specimen",
                              tint: CaptureColor.verdigris,
                              busy: isImporting)
                }
                .accessibilityIdentifier("photoImport.fromPhotos")

                Button { enterByHand() } label: {
                    actionRow(icon: "pencil.and.outline",
                              title: "Enter by hand",
                              subtitle: "Build a record without a photo",
                              tint: CaptureColor.ink2,
                              busy: false)
                }
                .accessibilityIdentifier("photoImport.byHand")
            }
            .padding(.horizontal, 16)

            Spacer(minLength: 16)

            // ── Settings / dismiss ──
            VStack(spacing: 4) {
                if context == .denied {
                    Button { openSettings() } label: {
                        Text("Open Settings")
                            .font(CaptureType.bodyEmph)
                            .foregroundStyle(CaptureColor.verdigrisInk)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .accessibilityIdentifier("photoImport.openSettings")
                }
                Button { coordinator.dismissSheet() } label: {
                    Text(context == .shareImport ? "Not now" : "Keep using import")
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.inkSoft)
                        .frame(maxWidth: .infinity, minHeight: 40)
                }
                .accessibilityIdentifier("photoImport.dismiss")
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(CaptureColor.paper)
        .onChange(of: pickerItems) { _, items in importPicked(items) }
        .task { analytics?.screen(context.screenID.rawValue) }
        .accessibilityIdentifier(context.screenID.rawValue)
    }

    // ── Row chrome ──
    @ViewBuilder
    private func actionRow(icon: String, title: String, subtitle: String,
                           tint: Color, busy: Bool) -> some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(tint.opacity(0.12))
                    .frame(width: 44, height: 44)
                if busy {
                    ProgressView().tint(tint)
                } else {
                    Image(systemName: icon)
                        .font(CaptureType.title2)
                        .foregroundStyle(tint)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.ink)
                Text(subtitle).font(CaptureType.footnote).foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.line2)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14).fill(CaptureColor.paper3)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1)
        )
        .contentShape(Rectangle())
    }

    // ── Actions ──
    private func importPicked(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        isImporting = true
        let draft = store.newDraft()                 // sync, on the main actor
        let draftID = draft.id
        Task { @MainActor in
            var order = 0
            for item in items {
                guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
                let name = "import-\(UUID().uuidString).img"
                guard (try? store.writeMedia(data, filename: name)) != nil else { continue }
                let photo = CapturePhoto(filename: name, isPrimary: order == 0,
                                         order: order, captureModeRaw: CameraMode.photo.rawValue)
                photo.specimen = draft
                draft.photos.append(photo)
                order += 1
            }
            // Provenance: the record originates from an import, not the camera.
            draft.provenanceRaw[FieldKey.note.rawValue] = ProvenanceSource.imported.rawValue
            try? store.save()
            isImporting = false
            analytics?.event("capture.photo_import", ["count": "\(order)"])
            openSpecimen(draftID)
        }
    }

    private func enterByHand() {
        let draft = store.newDraft()
        try? store.save()
        analytics?.event("capture.manual_entry",
                         ["from": context == .shareImport ? "share" : "denied"])
        openSpecimen(draft.id)
    }

    private func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        analytics?.event("capture.open_settings", ["from": "r3_denied"])
        openURL(url)
    }

    /// Hand off to the C5 specimen sheet (Team B). Dismiss first so SwiftUI
    /// cleanly swaps the single presented sheet.
    private func openSpecimen(_ id: UUID) {
        coordinator.dismissSheet()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) {
            coordinator.present(.specimenSheet(id))
        }
    }
}

/// Team D registrar — registers ONLY the R3/E3 `.photoImport` sheet.
enum ResilienceScreens {
    @MainActor
    static func register(into r: RouteRegistry, container: AppContainer, coordinator: CaptureCoordinator) {
        r.registerSheet(CaptureSheet.photoImport.registryKey) { _ in
            AnyView(
                PhotoImportSheet(store: container.store,
                                 coordinator: coordinator,
                                 analytics: container.analytics,
                                 context: .denied)
            )
        }
    }
}

#Preview("R3 · denied") {
    photoImportPreview(.denied)
}

#Preview("E3 · share import") {
    photoImportPreview(.shareImport)
}

@MainActor
private func photoImportPreview(_ context: PhotoImportContext) -> some View {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    return PhotoImportSheet(store: store,
                            coordinator: CaptureCoordinator(),
                            analytics: nil,
                            context: context)
}
