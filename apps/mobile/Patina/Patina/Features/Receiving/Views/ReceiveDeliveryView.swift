//
//  ReceiveDeliveryView.swift
//  Patina
//
//  Sprint 2 / Wave 2.3 — iOS receiving flow. Designer-on-site path:
//  list arriving POs, tap into inspection, capture photos + notes,
//  pick outcome, submit.
//
//  Convention follows Features/Decisions/Views/DecisionListView.swift:
//  ScrollView header + content, PatinaColors / PatinaTypography tokens,
//  @State view model, .task / .refreshable hooks.
//

import SwiftUI
import PhotosUI

struct ReceiveDeliveryView: View {
    @State private var viewModel = ReceiveDeliveryViewModel()

    var body: some View {
        @Bindable var bindable = viewModel
        return ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                header
                content
            }
            .padding(.bottom, 120)
        }
        .background(PatinaColors.offWhite)
        .task { await viewModel.loadArriving() }
        .refreshable { await viewModel.loadArriving() }
        .sheet(item: $bindable.selectedPO) { po in
            ReceiveInspectionSheet(viewModel: viewModel, purchaseOrder: po)
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            MonoLabel(text: "RECEIVING")
                .tracking(2)
            Text(viewModel.arrivingPOs.isEmpty ? "Nothing arriving" : "Arriving deliveries")
                .font(PatinaTypography.h3)
                .foregroundStyle(PatinaColors.charcoal)
        }
        .padding(.top, 56)
        .padding(.horizontal, 24)
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.arrivingPOs.isEmpty {
            ProgressView()
                .tint(PatinaColors.Text.interactive)
                .padding(.top, 60)
                .frame(maxWidth: .infinity)
        } else if let error = viewModel.error, viewModel.arrivingPOs.isEmpty {
            errorView(error)
        } else if viewModel.arrivingPOs.isEmpty {
            emptyView
        } else {
            VStack(spacing: 12) {
                ForEach(viewModel.arrivingPOs) { po in
                    Button {
                        viewModel.beginInspection(for: po)
                    } label: {
                        poCard(po)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
        }
    }

    private func poCard(_ po: ReceivingArrivingPO) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(po.vendor?.name ?? "Vendor")
                    .font(PatinaTypography.h5)
                    .foregroundStyle(PatinaColors.charcoal)
                Spacer()
                Text(po.status.replacing("_", with: " ").capitalized)
                    .font(PatinaTypography.monoTiny)
                    .foregroundStyle(PatinaColors.Text.interactive)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(PatinaColors.clay.opacity(0.1))
                    .clipShape(Capsule())
            }
            if let project = po.project?.name {
                Text(project)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(PatinaColors.agedOak)
            }
            HStack(spacing: 6) {
                if let eta = po.confirmed_eta {
                    Image(systemName: "calendar")
                        .font(.system(size: 11))
                        .foregroundStyle(PatinaColors.mocha)
                    Text("ETA \(eta)")
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.mocha)
                }
                if let poNumber = po.vendor_po_number {
                    Spacer().frame(width: 12)
                    Text("PO \(poNumber)")
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.mocha)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    // MARK: - Empty / Error

    private var emptyView: some View {
        VStack(spacing: 8) {
            Image(systemName: "shippingbox")
                .font(.system(size: 28))
                .foregroundStyle(PatinaColors.sage)
            Text("No deliveries arriving")
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.mocha)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 80)
    }

    private func errorView(_ msg: String) -> some View {
        VStack(spacing: 10) {
            Text(msg)
                .font(PatinaTypography.bodySmall)
                .foregroundStyle(PatinaColors.mocha)
            Button("Let's try that again") { Task { await viewModel.loadArriving() } }
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.Text.interactive)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 60)
    }
}

// MARK: - Inspection sheet

/// Modal inspection flow: capture up to 3 photos, jot notes, pick an
/// outcome, submit. Uses PhotosPicker (iOS 16+) — camera capture would be
/// a UIImagePickerController representable. iOS 26.5 supports both;
/// PhotosPicker is the simplest path that doesn't require a representable.
struct ReceiveInspectionSheet: View {
    @Bindable var viewModel: ReceiveDeliveryViewModel
    let purchaseOrder: ReceivingArrivingPO

    @State private var photoSelection: [PhotosPickerItem] = []
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    poSummary
                    photoSection
                    notesSection
                    outcomeButtons
                    submitFeedback
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 24)
            }
            .background(PatinaColors.offWhite)
            .navigationTitle("Inspect delivery")
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        viewModel.dismissInspection()
                        dismiss()
                    }
                }
            }
            .onChange(of: viewModel.didSubmitSuccessfully) { _, didSucceed in
                if didSucceed {
                    // Refresh the list and dismiss after a brief beat so
                    // the success state is visible.
                    Task {
                        try? await Task.sleep(for: .milliseconds(600))
                        await viewModel.loadArriving()
                        viewModel.dismissInspection()
                        dismiss()
                    }
                }
            }
            .onChange(of: photoSelection) { _, newItems in
                Task { await loadPickedPhotos(newItems) }
            }
        }
    }

    // MARK: - Sub-sections

    private var poSummary: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(purchaseOrder.vendor?.name ?? "Vendor")
                .font(PatinaTypography.h4)
                .foregroundStyle(PatinaColors.charcoal)
            if let project = purchaseOrder.project?.name {
                Text(project)
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.agedOak)
            }
            HStack(spacing: 10) {
                if let poNumber = purchaseOrder.vendor_po_number {
                    Text("PO \(poNumber)")
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.mocha)
                }
                if let eta = purchaseOrder.confirmed_eta {
                    Text("ETA \(eta)")
                        .font(PatinaTypography.monoTiny)
                        .foregroundStyle(PatinaColors.mocha)
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PatinaColors.softCream)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var photoSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Photos (\(viewModel.photos.count) / \(viewModel.maxPhotos))")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.charcoal)
                Spacer()
                if viewModel.photos.count < viewModel.maxPhotos {
                    PhotosPicker(
                        selection: $photoSelection,
                        maxSelectionCount: viewModel.maxPhotos - viewModel.photos.count,
                        matching: .images
                    ) {
                        HStack(spacing: 4) {
                            Image(systemName: "camera")
                            Text("Add")
                        }
                        .font(PatinaTypography.bodySmallMedium)
                        .foregroundStyle(PatinaColors.Text.interactive)
                    }
                }
            }
            if viewModel.photos.isEmpty {
                placeholderPhotoStrip
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(viewModel.photos.enumerated()), id: \.offset) { index, image in
                            ZStack(alignment: .topTrailing) {
                                Image(uiImage: image)
                                    .resizable()
                                    .scaledToFill()
                                    .frame(width: 96, height: 96)
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                Button {
                                    viewModel.removePhoto(at: index)
                                } label: {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 18))
                                        .foregroundStyle(.white, PatinaColors.charcoal.opacity(0.7))
                                        .padding(4)
                                }
                                .accessibilityLabel("Remove photo")
                            }
                        }
                    }
                }
            }
            Text("Photos help the desktop team triage. Capture damage from multiple angles.")
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.mocha)
        }
    }

    private var placeholderPhotoStrip: some View {
        RoundedRectangle(cornerRadius: 10)
            .strokeBorder(PatinaColors.pearl, style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            .frame(height: 96)
            .overlay(
                VStack(spacing: 4) {
                    Image(systemName: "camera")
                        .foregroundStyle(PatinaColors.agedOak)
                    Text("Tap Add to capture photos")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(PatinaColors.agedOak)
                }
            )
    }

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Notes (optional)")
                .font(PatinaTypography.bodySmallMedium)
                .foregroundStyle(PatinaColors.charcoal)
            TextEditor(text: $viewModel.notes)
                .font(PatinaTypography.body)
                .frame(minHeight: 96)
                .padding(8)
                .background(PatinaColors.softCream)
                .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    private var outcomeButtons: some View {
        VStack(spacing: 12) {
            outcomeButton(
                title: "All good",
                systemImage: "checkmark.circle.fill",
                accent: PatinaColors.success,
                outcome: .clean
            )
            outcomeButton(
                title: "Damage",
                systemImage: "exclamationmark.triangle.fill",
                accent: PatinaColors.warning,
                outcome: .damaged
            )

            Button {
                Task { await viewModel.submit() }
            } label: {
                HStack {
                    if viewModel.isSubmitting {
                        ProgressView().tint(.white)
                    } else {
                        Text(viewModel.outcome == nil ? "Choose an outcome" : "Submit inspection")
                            .font(PatinaTypography.bodyMedium)
                    }
                }
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(.white)
                .background(viewModel.outcome == nil ? PatinaColors.agedOak.opacity(0.5) : PatinaColors.charcoal)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .disabled(viewModel.outcome == nil || viewModel.isSubmitting)
            .padding(.top, 4)
        }
    }

    private func outcomeButton(
        title: String,
        systemImage: String,
        accent: Color,
        outcome: ReceivingOutcome
    ) -> some View {
        let isSelected = viewModel.outcome == outcome
        return Button {
            viewModel.outcome = outcome
        } label: {
            HStack(spacing: 10) {
                Image(systemName: systemImage)
                    .font(.system(size: 18))
                    .foregroundStyle(accent)
                Text(title)
                    .font(PatinaTypography.bodyMedium)
                    .foregroundStyle(PatinaColors.charcoal)
                Spacer()
                if isSelected {
                    Image(systemName: "checkmark")
                        .foregroundStyle(PatinaColors.Text.interactive)
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isSelected
                    ? accent.opacity(0.12)
                    : PatinaColors.softCream
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? accent : Color.clear, lineWidth: 1.5)
            )
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var submitFeedback: some View {
        if let error = viewModel.error {
            Text(error)
                .font(PatinaTypography.caption)
                .foregroundStyle(PatinaColors.error)
        } else if viewModel.didSubmitSuccessfully {
            HStack(spacing: 6) {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(PatinaColors.success)
                Text("Inspection saved")
                    .font(PatinaTypography.bodySmall)
                    .foregroundStyle(PatinaColors.success)
            }
        }
    }

    // MARK: - Photo loading

    /// Decode PhotosPickerItem(s) into UIImage and hand them to the view
    /// model. Errors are swallowed silently — failed items just don't
    /// appear in the strip.
    private func loadPickedPhotos(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let image = UIImage(data: data) {
                viewModel.addPhoto(image)
            }
        }
        // Reset the picker selection so subsequent Adds don't carry the
        // same items.
        photoSelection = []
    }
}

#Preview {
    NavigationStack {
        ReceiveDeliveryView()
    }
}
