//  SyncStatusScreen.swift
//  Capture · Team F (System Surface)
//
//  U1 · Sync status & queue (route `.syncStatus`, id `u1Sync`).
//  The honest backlog: "N of M uploaded", per-row status (synced / uploading /
//  queued / retry), Retry all / Pause, and an offline-aware status strip (R4).
//  Sources: container.store.outbox() (the pending rows) + container.sync.snapshots
//  (live counts + lastError). Tap a row → V3 detail; Retry all → sync.drain().

import SwiftUI
import CaptureKit

struct SyncStatusScreen: View {
    let store: CaptureStore
    let sync: any CaptureSyncService
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @State private var rows: [Specimen] = []
    @State private var snapshot = SyncSnapshot(queued: 0, uploading: 0, failed: 0)
    @State private var isPaused = false

    var body: some View {
        VStack(spacing: 0) {
            statusStrip
            content
            footer
        }
        .background(CaptureColor.paper)
        .navigationTitle("Sync")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(isPaused ? "Resume" : "Pause") {
                    isPaused.toggle()
                    analytics.event(isPaused ? "sync.pause" : "sync.resume")
                }
                .font(CaptureType.callout)
                .foregroundStyle(isPaused ? CaptureColor.verdigris : CaptureColor.rust)
            }
        }
        .task {
            analytics.screen(CaptureScreenID.u1Sync.rawValue)
            reload()
            for await snap in sync.snapshots { snapshot = snap }
        }
        .accessibilityIdentifier(CaptureScreenID.u1Sync.rawValue)
    }

    // MARK: header strip — "3 OF 5 UPLOADED · ON WI-FI"

    private var statusStrip: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(headline)
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(headlineColor)
            if let detail = headlineDetail {
                Text(detail)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.rust)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }

    private var uploaded: Int { rows.filter { $0.status == .committed }.count }

    private var headline: String {
        let total = rows.count
        if isPaused { return "Paused · \(max(total - uploaded, snapshot.queued)) waiting" }
        if snapshot.failed > 0 || snapshot.lastError != nil { return "Offline · will retry, oldest first" }
        if snapshot.uploading > 0 { return "\(uploaded) of \(total) uploaded · uploading…" }
        if total > 0 && uploaded == total { return "All \(total) synced" }
        if total == 0 { return "Nothing waiting" }
        return "\(uploaded) of \(total) uploaded · on Wi-Fi"
    }

    private var headlineColor: Color {
        if isPaused || snapshot.failed > 0 || snapshot.lastError != nil { return CaptureColor.rust }
        if rows.count > 0 && uploaded == rows.count { return CaptureColor.verdigris }
        return CaptureColor.inkSoft
    }

    private var headlineDetail: String? {
        snapshot.lastError
    }

    // MARK: rows

    @ViewBuilder private var content: some View {
        if rows.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: "checkmark.seal")
                    .font(.largeTitle)
                    .foregroundStyle(CaptureColor.verdigris)
                Text("Everything's uploaded")
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(rows, id: \.id) { specimen in
                        Button {
                            analytics.event("sync.open_row", ["status": specimen.status.rawValue])
                            coordinator.navigate(to: .specimen(specimen.id))
                        } label: {
                            row(specimen)
                        }
                        .buttonStyle(.plain)
                        Rectangle().fill(CaptureColor.line).frame(height: 1)
                    }
                }
            }
        }
    }

    private func row(_ s: Specimen) -> some View {
        let status = rowStatus(for: s)
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(s.title ?? s.maker ?? "Untitled capture")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.ink)
                Text(summary(s))
                    .font(CaptureType.monoSmall)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            Spacer(minLength: 8)
            statusPill(status, progress: s.uploadProgress)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .contentShape(Rectangle())
    }

    private func statusPill(_ status: RowStatus, progress: Int) -> some View {
        HStack(spacing: 6) {
            if status == .uploading {
                ProgressView().controlSize(.mini).tint(CaptureColor.brass)
            }
            Text(status.label(progress: progress))
                .font(CaptureType.eyebrow)
                .textCase(.uppercase)
                .foregroundStyle(status.color)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .overlay(
            Capsule().stroke(status.color.opacity(0.5), lineWidth: 1)
        )
    }

    // MARK: footer

    private var footer: some View {
        HStack(spacing: 12) {
            Button {
                analytics.event("sync.retry_all")
                Task { await sync.drain(); reload() }
            } label: {
                Text("Retry all")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.paper3)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(isPaused || rows.isEmpty ? CaptureColor.inkSoft : CaptureColor.verdigris)
                    )
            }
            .disabled(isPaused || rows.isEmpty)

            Button("Done") { coordinator.goBack() }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 16)
        .background(CaptureColor.paper2)
    }

    // MARK: data

    private func reload() {
        // The pending outbox (ready / queued / failed), oldest-first — the
        // canonical "needs syncing" set.
        let pending = store.outbox()
        // Plus already-uploaded / in-flight captures so "N of M" reads honestly.
        let all = store.search(SpecimenQuery())
        let pendingIDs = Set(pending.map(\.id))
        let extra = all.filter {
            !pendingIDs.contains($0.id) && ($0.status == .uploading || $0.status == .committed)
        }
        rows = (pending + extra).sorted { weight($0) < weight($1) }
    }

    private func weight(_ s: Specimen) -> Int {
        switch s.status {
        case .uploading: return 0
        case .failed: return 1
        case .ready, .queued, .draft: return 2
        case .committed: return 3
        }
    }

    private func summary(_ s: Specimen) -> String {
        var parts: [String] = []
        if !s.photos.isEmpty { parts.append("\(s.photos.count) photo\(s.photos.count == 1 ? "" : "s")") }
        if !s.measurements.isEmpty { parts.append("measured") }
        if s.catalogMatchRemoteId != nil || !s.scannedCodes.isEmpty { parts.append("catalog match") }
        if s.provenance(for: .maker) == .ocr || s.provenance(for: .sku) == .ocr { parts.append("tag") }
        if s.voiceTranscript != nil { parts.append("voice") }
        if parts.isEmpty { parts.append(s.category == .unknown ? "draft" : s.category.rawValue) }
        return parts.joined(separator: " · ")
    }

    private enum RowStatus: Equatable {
        case synced, uploading, queued, retry
        func label(progress: Int) -> String {
            switch self {
            case .synced: return "synced"
            case .uploading: return progress > 0 ? "uploading \(progress)%" : "uploading"
            case .queued: return "queued"
            case .retry: return "retry"
            }
        }
        var color: Color {
            switch self {
            case .synced: return CaptureColor.verdigris
            case .uploading: return CaptureColor.brass
            case .queued: return CaptureColor.inkSoft
            case .retry: return CaptureColor.rust
            }
        }
    }

    private func rowStatus(for s: Specimen) -> RowStatus {
        switch s.status {
        case .committed: return .synced
        case .uploading: return .uploading
        case .failed: return .retry
        case .ready, .queued, .draft: return .queued
        }
    }
}

#if DEBUG
import CaptureKitMocks

#Preview {
    // swiftlint:disable:next force_try
    let store = try! CaptureStore.inMemory()
    @MainActor func make(_ title: String, status: CaptureStatus, photos: Int = 1, configure: (Specimen) -> Void = { _ in }) {
        let s = store.newDraft()
        s.title = title
        s.status = status
        for i in 0..<photos {
            let p = CapturePhoto(filename: "\(title)-\(i).heic", width: 1170, height: 1560, isPrimary: i == 0, order: i)
            p.specimen = s
            s.photos.append(p)
        }
        configure(s)
    }
    make("Lounge chair", status: .committed, photos: 4)
    make("Brass lamp", status: .uploading) { $0.uploadProgress = 60; $0.setValue("Holloway & Co.", for: .maker, source: .ocr) }
    make("Side table", status: .queued) { $0.catalogMatchRemoteId = "cat_123" }
    make("Oak console", status: .queued) { $0.addMeasurement(axis: .width, millimeters: 1400, source: .manual) }
    make("Walnut stool", status: .failed)

    return NavigationStack {
        SyncStatusScreen(
            store: store,
            sync: InMemoryCaptureSyncService(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
