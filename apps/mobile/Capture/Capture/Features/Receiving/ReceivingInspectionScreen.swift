//  ReceivingInspectionScreen.swift
//  Capture · Wave G (Receiving / goods-in)
//
//  Hosts G2 (inspection: photos + notes) and G3 (outcome + submit) as internal
//  steps of the one `.receivingInspection(poID:)` sheet, inside a single
//  NavigationStack (title/toolbar swap per step; two nested stacks would rebuild
//  the whole hierarchy on every step change). Each step keeps its own
//  `.accessibilityIdentifier` (g2Inspection / g3Outcome) on its visible root so
//  both are reachable through normal navigation, per the wave brief. PhotosPicker
//  (photo-library) is the v1 capture path, matching the reference exactly.

import SwiftUI
import PhotosUI
import CaptureKit

struct ReceivingInspectionScreen: View {
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @State private var viewModel: ReceivingInspectionViewModel
    @State private var photoSelection: [PhotosPickerItem] = []

    init(poID: String, receiving: any ReceivingService, analytics: any CaptureAnalytics,
         coordinator: CaptureCoordinator) {
        self.analytics = analytics
        self.coordinator = coordinator
        _viewModel = State(initialValue: ReceivingInspectionViewModel(poID: poID, receiving: receiving))
    }

    var body: some View {
        NavigationStack {
            Group {
                switch viewModel.step {
                case .inspection: inspectionStepContent
                case .outcome: outcomeStepContent
                }
            }
            .navigationTitle(viewModel.step == .inspection ? "Inspection" : "Outcome")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbarContent }
            .overlay { if viewModel.didSubmit { successOverlay } }
        }
        .task { await viewModel.loadSummary() }
        .onChange(of: viewModel.didSubmit) { _, didSubmit in
            guard didSubmit else { return }
            Task {
                try? await Task.sleep(for: .milliseconds(700))
                coordinator.dismissSheet()
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            if viewModel.step == .inspection {
                Button("Cancel") { coordinator.dismissSheet() }
                    .foregroundStyle(CaptureColor.inkSoft)
            } else {
                Button("Back") { viewModel.step = .inspection }
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        if viewModel.step == .inspection {
            ToolbarItem(placement: .confirmationAction) {
                Button("Continue") { viewModel.step = .outcome }
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.verdigris)
            }
        }
    }

    // MARK: - G2: inspection step content

    private var inspectionStepContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                poSummaryCard
                photoSection
                notesSection
            }
            .padding(20)
        }
        .background(CaptureColor.paper)
        .task { analytics.screen(CaptureScreenID.g2Inspection.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.g2Inspection.rawValue)
    }

    private var poSummaryCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let summary = viewModel.poSummary {
                Text(summary.vendorName ?? "Vendor")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
                if let project = summary.projectName {
                    Text(project)
                        .font(CaptureType.callout)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                summaryMeta(summary)
            } else if viewModel.isLoadingSummary {
                ProgressView().tint(CaptureColor.verdigris)
            } else {
                Text("PO \(viewModel.poID)")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(CaptureColor.line, lineWidth: 1))
    }

    private func summaryMeta(_ summary: FieldArrivingPO) -> some View {
        HStack(spacing: 12) {
            if let poNumber = summary.poNumber {
                Text("PO \(poNumber)")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            if let eta = summary.eta {
                Text("ETA \(eta.formatted(date: .abbreviated, time: .omitted))")
                    .font(CaptureType.monoSmall)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
    }

    private var photoSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Photos (\(viewModel.photos.count)/\(viewModel.maxPhotos))")
                    .font(CaptureType.eyebrow).textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
                Spacer()
                if viewModel.photos.count < viewModel.maxPhotos {
                    PhotosPicker(selection: $photoSelection,
                                maxSelectionCount: viewModel.maxPhotos - viewModel.photos.count,
                                matching: .images) {
                        Label("Add", systemImage: "camera")
                            .font(CaptureType.callout.weight(.semibold))
                            .foregroundStyle(CaptureColor.verdigris)
                    }
                }
            }
            if viewModel.photos.isEmpty {
                emptyPhotoStrip
            } else {
                photoStrip
            }
            Text("Photos help the desktop team triage. Capture damage from multiple angles.")
                .font(CaptureType.footnote)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .onChange(of: photoSelection) { _, items in
            Task { await loadPickedPhotos(items) }
        }
    }

    private var photoStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(viewModel.photos) { photo in
                    photoThumb(photo)
                }
            }
        }
    }

    private var emptyPhotoStrip: some View {
        RoundedRectangle(cornerRadius: 10)
            .strokeBorder(CaptureColor.line2, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            .frame(height: 92)
            .overlay(
                VStack(spacing: 4) {
                    Image(systemName: "camera").foregroundStyle(CaptureColor.inkSoft)
                    Text("Add photos of the delivery")
                        .font(CaptureType.footnote)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
            )
    }

    private func photoThumb(_ photo: ReceivingInspectionViewModel.PendingPhoto) -> some View {
        ZStack(alignment: .topTrailing) {
            photoThumbImage(photo)
                .frame(width: 92, height: 92)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(CaptureColor.line, lineWidth: 1))
                .overlay { photoStateOverlay(photo) }

            Button {
                viewModel.removePhoto(photoID: photo.id)
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.white, CaptureColor.ink.opacity(0.7))
            }
            .padding(4)
            .accessibilityLabel("Remove photo")
        }
    }

    @ViewBuilder
    private func photoThumbImage(_ photo: ReceivingInspectionViewModel.PendingPhoto) -> some View {
        if let thumbnail = photo.thumbnail {
            Image(uiImage: thumbnail).resizable().scaledToFill()
        } else {
            CaptureColor.paper2
        }
    }

    @ViewBuilder
    private func photoStateOverlay(_ photo: ReceivingInspectionViewModel.PendingPhoto) -> some View {
        switch photo.state {
        case .uploading:
            ZStack {
                Color.black.opacity(0.35)
                ProgressView().tint(.white)
            }
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .accessibilityLabel("Photo uploading")
        case .failed:
            Button {
                viewModel.retryUpload(photoID: photo.id)
            } label: {
                ZStack {
                    CaptureColor.rust.opacity(0.85)
                    VStack(spacing: 2) {
                        Image(systemName: "arrow.clockwise").foregroundStyle(.white)
                        Text("Retry").font(CaptureType.eyebrow).foregroundStyle(.white)
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .accessibilityLabel("Photo upload failed. Double tap to retry.")
        case .uploaded:
            EmptyView()
        }
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Notes (optional)")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            TextEditor(text: notesBinding)
                .font(CaptureType.body)
                .frame(minHeight: 96)
                .padding(8)
                .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.line, lineWidth: 1))
        }
    }

    private var notesBinding: Binding<String> {
        Binding(get: { viewModel.notes }, set: { viewModel.notes = $0 })
    }

    private func loadPickedPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self) {
                viewModel.addPhoto(data: data)
            }
        }
        // Reset so a subsequent Add doesn't re-carry the same items.
        photoSelection = []
    }

    // MARK: - G3: outcome step content

    private var outcomeStepContent: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                poSummaryCard
                outcomeOptions
                if viewModel.requiresDamageDescription { damageDescriptionSection }
                submitSection
            }
            .padding(20)
        }
        .background(CaptureColor.paper)
        .task { analytics.screen(CaptureScreenID.g3Outcome.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.g3Outcome.rawValue)
    }

    private var outcomeOptions: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Outcome")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            outcomeButton(.clean, title: "Clean", systemImage: "checkmark.circle.fill",
                         accent: CaptureColor.verdigris)
            outcomeButton(.damaged, title: "Damaged", systemImage: "exclamationmark.triangle.fill",
                         accent: CaptureColor.rust)
            outcomeButton(.partial, title: "Partial delivery", systemImage: "shippingbox.fill",
                         accent: CaptureColor.brass)
        }
    }

    private func outcomeButton(_ value: FieldInspectionOutcome, title: String, systemImage: String,
                               accent: Color) -> some View {
        let isSelected = viewModel.outcome == value
        return Button {
            viewModel.outcome = value
        } label: {
            HStack(spacing: 10) {
                Image(systemName: systemImage).foregroundStyle(accent)
                Text(title).font(CaptureType.bodyEmph).foregroundStyle(CaptureColor.ink)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark").foregroundStyle(CaptureColor.verdigris)
                }
            }
            .padding(16)
            .background(isSelected ? accent.opacity(0.12) : CaptureColor.paper3,
                       in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? accent : CaptureColor.line, lineWidth: isSelected ? 1.5 : 1)
            )
        }
        .buttonStyle(.plain)
    }

    private var damageDescriptionSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Damage description")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            TextEditor(text: damageDescriptionBinding)
                .font(CaptureType.body)
                .frame(minHeight: 90)
                .padding(8)
                .background(CaptureColor.paper3, in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(CaptureColor.line, lineWidth: 1))
        }
    }

    private var damageDescriptionBinding: Binding<String> {
        Binding(get: { viewModel.damageDescription }, set: { viewModel.damageDescription = $0 })
    }

    private var submitSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let submitError = viewModel.submitError {
                Text(submitError).font(CaptureType.footnote).foregroundStyle(CaptureColor.rust)
            }
            Button {
                analytics.event("receiving.inspection_submit")
                Task {
                    await viewModel.submit()
                    analytics.event(viewModel.didSubmit
                        ? "receiving.inspection_submitted"
                        : "receiving.inspection_submit_failed")
                }
            } label: {
                submitLabel
            }
            .disabled(!viewModel.canSubmit)
            .buttonStyle(.plain)
        }
    }

    private var submitLabel: some View {
        Group {
            if viewModel.isSubmitting {
                ProgressView().tint(CaptureColor.paper3)
            } else {
                Text(submitTitle).font(CaptureType.bodyEmph)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 48)
        .foregroundStyle(CaptureColor.paper3)
        .background(viewModel.canSubmit ? CaptureColor.verdigris : CaptureColor.inkSoft.opacity(0.4),
                   in: RoundedRectangle(cornerRadius: 12))
    }

    private var submitTitle: String {
        if viewModel.outcome == nil { return "Choose an outcome" }
        if viewModel.isAnyPhotoBusyOrFailed { return "Waiting on photos…" }
        return "Submit inspection"
    }

    private var successOverlay: some View {
        ZStack {
            CaptureColor.paper.opacity(0.96).ignoresSafeArea()
            VStack(spacing: 10) {
                Image(systemName: "checkmark.circle.fill")
                    .font(CaptureType.display)
                    .foregroundStyle(CaptureColor.verdigris)
                Text("Inspection saved")
                    .font(CaptureType.title2)
                    .foregroundStyle(CaptureColor.ink)
            }
        }
        .transition(.opacity)
    }
}
