//  SiteScanReviewUploadViews.swift
//  Capture · Wave F (Pro site-scan)
//
//  F3 (review) and F4 (upload) — the second and third internal steps of the
//  `.siteScan` route host. F3 summarises the finished local bundle (editable room
//  name, derived area, the two v1 artifacts with sizes) and offers Retake / Continue.
//  F4 shows the destination and drives the upload receipt to a success state; the
//  local bundle is never discarded, so a failed upload surfaces an inline error +
//  Retry without losing the scan.

import Foundation
import SwiftUI
import CaptureKit
import PatinaDesignKit

// MARK: - F3 · Review

struct SiteScanReviewStep: View {
    let result: FieldScanResult
    let model: SiteScanHostModel
    let companion: FieldCompanionController
    let analytics: any CaptureAnalytics
    let onRetake: () -> Void
    let onContinue: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                FieldCompanionHearthView(
                    presentation: companion.presentation,
                    onOpen: {
                        companion.send(.communicate(.init(
                            title: "Review this scan",
                            detail: "Confirm the room name and captured artifacts before continuing."
                        )))
                    },
                    onDismiss: { companion.send(.dismiss) }
                )
                header
                if let scorecard = result.scorecard {
                    SiteScanScorecardCard(scorecard: scorecard)
                }
                SiteScanSection("Room name") {
                    TextField("Room name", text: Binding(get: { model.name },
                                                         set: { model.name = $0 }))
                        .font(CaptureType.body)
                        .foregroundStyle(CaptureColor.ink)
                        .accessibilityLabel("Room name")
                }
                artifactsSection
            }
            .padding(20)
        }
        .background(CaptureColor.paper.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { actions }
        .navigationTitle("Review scan")
        .navigationBarTitleDisplayMode(.inline)
        .task { analytics.screen(CaptureScreenID.f3ScanReview.rawValue) }
        .accessibilityIdentifier(CaptureScreenID.f3ScanReview.rawValue)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Captured")
                .font(CaptureType.eyebrow).textCase(.uppercase)
                .foregroundStyle(CaptureColor.inkSoft)
            Text(result.areaLabel ?? "Room captured")
                .font(CaptureType.title)
                .foregroundStyle(CaptureColor.ink)
        }
    }

    private var artifactsSection: some View {
        SiteScanSection("Artifacts") {
            VStack(spacing: 0) {
                SiteScanArtifactRow(label: "3D model", detail: "USDZ",
                                    size: fileSize(RoomScanStoragePath.Filename.usdz))
                Divider().background(CaptureColor.line)
                SiteScanArtifactRow(label: "Room geometry", detail: "JSON",
                                    size: fileSize(RoomScanStoragePath.Filename.capturedRoom))
            }
        }
    }

    private var actions: some View {
        HStack(spacing: 12) {
            PatinaButton("Retake", style: .secondary,
                         icon: Image(systemName: "arrow.counterclockwise"), action: onRetake)
            PatinaButton("Continue", style: .clay,
                         icon: Image(systemName: "arrow.right"), action: onContinue)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(.ultraThinMaterial)
    }

    /// Human size of a bundle artifact, or "—" when unreadable (e.g. the mock's
    /// placeholder bundle dir that was never written on the simulator).
    private func fileSize(_ filename: String) -> String {
        let url = result.localBundleURL.appendingPathComponent(filename)
        guard let values = try? url.resourceValues(forKeys: [.fileSizeKey]),
              let bytes = values.fileSize else { return "—" }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}

// MARK: - F4 · Upload

@MainActor
@Observable
final class SiteScanUploadModel {
    enum Phase: Equatable {
        case idle
        case uploading
        case done(String)
        case failed(String)
        case rejected(String)
    }

    var phase: Phase = .idle
    var resolvedProjectName: String?

    private let siteScan: any SiteScanService
    private let projects: any ProjectsService
    private let analytics: any CaptureAnalytics
    private let result: FieldScanResult
    private let name: String
    private let projectID: String?
    private let projectRoomID: String?

    init(container: AppContainer, result: FieldScanResult, name: String,
         projectID: String?, projectRoomID: String?) {
        self.siteScan = container.siteScan
        self.projects = container.projects
        self.analytics = container.analytics
        self.result = result
        self.name = name
        self.projectID = projectID
        self.projectRoomID = projectRoomID
    }

    /// Resolve the project's display name for the destination summary (best-effort).
    func resolveProjectName() async {
        guard let projectID else { return }
        if let match = try? await projects.listProjects().first(where: { $0.id == projectID }) {
            resolvedProjectName = match.name
        }
    }

    func upload() async {
        guard phase != .uploading else { return }
        phase = .uploading
        do {
            let receipt = try await siteScan.upload(
                result: result, projectID: projectID, projectRoomID: projectRoomID, name: name)
            analytics.event("siteScan.upload_success", ["scan_id": receipt.remoteScanID])
            phase = .done(receipt.remoteScanID)
        } catch {
            let message = (error as? LocalizedError)?.errorDescription ?? "Upload failed."
            analytics.event("siteScan.upload_failure")
            if case SiteScanError.bundleRejected = error {
                phase = .rejected(message)
            } else {
                phase = .failed(message)
            }
        }
    }
}

struct SiteScanUploadStep: View {
    let result: FieldScanResult
    let name: String
    let projectID: String?
    let projectRoomID: String?
    let projectName: String?
    let container: AppContainer
    let onDone: () -> Void

    @State private var model: SiteScanUploadModel

    init(result: FieldScanResult, name: String, projectID: String?, projectRoomID: String?,
         projectName: String?, container: AppContainer, onDone: @escaping () -> Void) {
        self.result = result
        self.name = name
        self.projectID = projectID
        self.projectRoomID = projectRoomID
        self.projectName = projectName
        self.container = container
        self.onDone = onDone
        _model = State(wrappedValue: SiteScanUploadModel(
            container: container, result: result, name: name,
            projectID: projectID, projectRoomID: projectRoomID))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                FieldCompanionHearthView(
                    presentation: container.companion.presentation,
                    onDismiss: { container.companion.send(.dismiss) }
                )
                destinationSection
                statusView
            }
            .padding(20)
        }
        .background(CaptureColor.paper.ignoresSafeArea())
        .safeAreaInset(edge: .bottom) { actions }
        .navigationTitle("Upload scan")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(true)
        .task {
            container.analytics.screen(CaptureScreenID.f4ScanUpload.rawValue)
            await model.resolveProjectName()
            updateCompanion()
            if model.phase == .idle { await model.upload() }
        }
        .onChange(of: model.phase) { _, _ in updateCompanion() }
        .accessibilityIdentifier(CaptureScreenID.f4ScanUpload.rawValue)
    }

    private var destinationSection: some View {
        SiteScanSection("Destination") {
            VStack(spacing: 0) {
                SiteScanDestinationRow(label: "Project",
                                       value: model.resolvedProjectName ?? projectName ?? "No project")
                Divider().background(CaptureColor.line)
                SiteScanDestinationRow(label: "Room", value: name)
            }
        }
    }

    @ViewBuilder private var statusView: some View {
        switch model.phase {
        case .idle, .uploading:
            uploadingRow
        case .done(let scanID):
            successRow(scanID)
        case .failed(let message):
            failureRow(message)
        case .rejected(let message):
            rejectedRow(message)
        }
    }

    private var uploadingRow: some View {
        HStack(spacing: 10) {
            ProgressView().tint(CaptureColor.verdigris)
            Text("Uploading scan…")
                .font(CaptureType.callout)
                .foregroundStyle(CaptureColor.inkSoft)
        }
        .accessibilityLabel("Uploading scan")
    }

    private func successRow(_ scanID: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.seal.fill")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.success)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Scan uploaded")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text("It's attached to the project and ready in the portal.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func failureRow(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.error)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Upload didn't finish")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(message + " Your scan is kept on this device — retry now, or finish later without losing it.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func rejectedRow(_ message: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.octagon.fill")
                .font(CaptureType.title2)
                .foregroundStyle(CaptureColor.error)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Scan needs review")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(message + " It remains on this device and won’t be retried automatically.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var actions: some View {
        switch model.phase {
        case .done:
            PatinaButton("Done", style: .clay, icon: Image(systemName: "checkmark")) { onDone() }
                .padding(.horizontal, 20).padding(.vertical, 12)
                .background(.ultraThinMaterial)
        case .failed:
            // A persistent failure must not dead-end the flow: the local
            // bundle is retained, so the designer can park the scan and leave
            // instead of being locked into retrying forever.
            HStack(spacing: 12) {
                PatinaButton("Finish later", style: .secondary,
                             icon: Image(systemName: "tray.and.arrow.down")) {
                    container.analytics.event("scan.upload_finish_later")
                    onDone()
                }
                PatinaButton("Retry upload", style: .clay,
                             icon: Image(systemName: "arrow.clockwise")) {
                    Task { await model.upload() }
                }
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
            .background(.ultraThinMaterial)
        case .rejected:
            PatinaButton(
                "Keep for review",
                style: .secondary,
                icon: Image(systemName: "tray.and.arrow.down")) {
                    container.analytics.event("scan.upload_rejected_finish_later")
                    onDone()
                }
                .padding(.horizontal, 20).padding(.vertical, 12)
                .background(.ultraThinMaterial)
        case .idle, .uploading:
            EmptyView()
        }
    }

    private func updateCompanion() {
        switch model.phase {
        case .idle, .uploading:
            container.companion.send(.reportProgress(.init(
                activityID: "field.site-scan-upload",
                kind: .indeterminate,
                title: "Sending your scan",
                detail: "The original remains safely on this device"
            )))
        case .done:
            container.companion.send(.collapse(
                hint: "Scan confirmed",
                action: nil
            ))
        case .failed:
            container.companion.send(.communicate(.init(
                title: "Upload paused safely",
                detail: "Your scan is still on this device. Retry now or finish later."
            )))
        case .rejected:
            container.companion.send(.communicate(.init(
                title: "This scan needs review",
                detail: "It remains on this device and won’t be retried automatically."
            )))
        }
    }
}

#if DEBUG
#Preview("F4 · Upload") {
    let container = AppContainer()
    let result = FieldScanResult(
        localBundleURL: URL(fileURLWithPath: NSTemporaryDirectory()),
        roomName: "Living room", areaLabel: "312 sq ft")
    return NavigationStack {
        SiteScanUploadStep(result: result, name: "Living room",
                           projectID: "proj-9f2a41", projectRoomID: nil,
                           projectName: "Ashford Residence", container: container, onDone: {})
    }
}
#endif
