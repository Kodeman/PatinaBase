//
//  ScanUploadProgressView.swift
//  Patina
//
//  Standalone upload-progress UI for a single RoomScanPackage, plus a
//  global "N scans uploading" badge observable. Wave 6 ships the
//  components; wiring them into specific screens (Room Detail card, home
//  header badge) is a follow-up once the product view surface settles.
//

import Foundation
import Observation
import SwiftUI
import SwiftData

// MARK: - Per-scan upload progress

/// Renders a single human-readable upload-progress line for
/// `package.artifactState`, plus a photo-progress line underneath. Observes
/// the package directly so SwiftData change notifications drive re-renders
/// as `RoomScanSyncService` ticks artifact state forward.
public struct ScanUploadProgressView: View {

    @Bindable public var package: RoomScanPackage

    public init(package: RoomScanPackage) {
        self.package = package
    }

    public var body: some View {
        let state = package.artifactState
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: headerIcon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(headerColor)
                Text(headerText)
                    .font(PatinaTypography.uiSmall)
                    .foregroundStyle(headerColor)
                Spacer()
                if state.photosTotal > 0 {
                    Text("\(state.photosUploaded)/\(state.photosTotal) photos")
                        .font(PatinaTypography.caption)
                        .foregroundStyle(.secondary)
                }
            }

            // U11: one human line replaces the per-artifact pill grid — the
            // reader doesn't need to know what a "world map" or "depth
            // index" is, only that their scan is on its way.
            if !state.artifacts.isEmpty {
                Text("Sending your scan — \(uploadedArtifactCount(in: state)) of \(state.artifacts.count)")
                    .font(PatinaTypography.caption)
                    .foregroundStyle(.secondary)
            }

            if let err = package.lastError, !err.isEmpty,
               package.status == .failed || package.status == .pending {
                Text(err)
                    .font(PatinaTypography.caption)
                    .foregroundStyle(.orange)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.secondary.opacity(0.08))
        )
    }

    private var headerIcon: String {
        switch package.status {
        case .pending:   return "clock"
        case .syncing:   return "arrow.up.circle"
        case .synced:    return "checkmark.circle.fill"
        case .failed:    return "exclamationmark.triangle.fill"
        case .heldLocal: return "internaldrive"
        }
    }

    private var headerColor: Color {
        switch package.status {
        case .pending:   return .secondary
        case .syncing:   return .accentColor
        case .synced:    return .green
        case .failed:    return .orange
        case .heldLocal: return .secondary
        }
    }

    private var headerText: String {
        switch package.status {
        case .pending:   return package.lastError ?? "Waiting to upload"
        case .syncing:   return "Uploading scan…"
        case .synced:    return "Uploaded"
        case .failed:    return "Upload failed — will retry"
        case .heldLocal: return "Saved on this phone"
        }
    }

    /// U11: count of artifacts that have finished uploading, for the "n of
    /// m" human-readable progress line.
    private func uploadedArtifactCount(in state: ScanPackageArtifactState) -> Int {
        state.artifacts.filter { $0.status == .uploaded }.count
    }
}

// MARK: - Global "N scans uploading" badge

/// Observable that counts `RoomScanPackage` rows currently in `.syncing`
/// state. Views bind to this via `@State` (or read it directly) and
/// trigger refresh on SwiftData `.didSave` notifications.
///
/// Constructed with a `ModelContainer` rather than a `ModelContext` so
/// background refreshes always fetch against the main-context thread.
@MainActor
@Observable
public final class ScanUploadBadge {

    public private(set) var syncingCount: Int = 0

    @ObservationIgnored private let container: ModelContainer
    @ObservationIgnored private var observer: NSObjectProtocol?

    public init(container: ModelContainer) {
        self.container = container
        self.refresh()
        self.observer = NotificationCenter.default.addObserver(
            forName: ModelContext.didSave,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            // The queue above dispatches on the main thread, but Swift 6
            // strict concurrency still requires we re-hop through a task
            // to satisfy `@MainActor`. The capture is effectively a
            // one-shot read on the main actor's isolation domain.
            let weakSelf = self
            Task { @MainActor in weakSelf?.refresh() }
        }
    }

    deinit {
        if let observer {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    public func refresh() {
        let context = container.mainContext
        let descriptor = FetchDescriptor<RoomScanPackage>(
            predicate: #Predicate { pkg in
                pkg.statusRaw == "syncing"
            }
        )
        syncingCount = (try? context.fetchCount(descriptor)) ?? 0
    }
}

/// Small pill to render `ScanUploadBadge.syncingCount` in a tab bar / home
/// header. Returns `EmptyView` when the count is zero.
public struct ScanUploadBadgeView: View {
    public var badge: ScanUploadBadge

    public init(badge: ScanUploadBadge) {
        self.badge = badge
    }

    public var body: some View {
        if badge.syncingCount > 0 {
            HStack(spacing: 4) {
                Image(systemName: "arrow.up.circle")
                    .font(.system(size: 10, weight: .semibold))
                Text("\(badge.syncingCount) uploading")
                    .font(PatinaTypography.caption)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(
                Capsule().fill(Color.accentColor)
            )
        }
    }
}
