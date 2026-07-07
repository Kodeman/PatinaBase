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

// MARK: - F3 · Review

struct SiteScanReviewStep: View {
    let result: FieldScanResult
    let model: SiteScanHostModel
    let analytics: any CaptureAnalytics
    let onRetake: () -> Void
    let onContinue: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                header
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
            SiteScanSecondaryButton(title: "Retake", systemImage: "arrow.counterclockwise",
                                    tint: CaptureColor.rust, action: onRetake)
            SiteScanPrimaryButton(title: "Continue", systemImage: "arrow.right", action: onContinue)
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
            phase = .failed(message)
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
            if model.phase == .idle { await model.upload() }
        }
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
                .foregroundStyle(CaptureColor.verdigris)
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
                .foregroundStyle(CaptureColor.rust)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text("Upload didn't finish")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(message + " Your scan is saved on this device — try again.")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var actions: some View {
        switch model.phase {
        case .done:
            SiteScanPrimaryButton(title: "Done", systemImage: "checkmark") { onDone() }
                .padding(.horizontal, 20).padding(.vertical, 12)
                .background(.ultraThinMaterial)
        case .failed:
            SiteScanPrimaryButton(title: "Retry upload", systemImage: "arrow.clockwise") {
                Task { await model.upload() }
            }
            .padding(.horizontal, 20).padding(.vertical, 12)
            .background(.ultraThinMaterial)
        case .idle, .uploading:
            EmptyView()
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
