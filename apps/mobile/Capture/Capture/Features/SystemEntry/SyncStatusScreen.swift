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
    let siteScan: any SiteScanService
    let session: any SessionProviding
    let companion: FieldCompanionController
    let analytics: any CaptureAnalytics
    let coordinator: CaptureCoordinator

    @State private var rows: [Specimen] = []
    @State private var scanRows: [FieldScanPendingUpload] = []
    @State private var snapshot = SyncSnapshot(queued: 0, uploading: 0, failed: 0)
    @State private var retryRequest = 0
    @State private var isRetrying = false
    @State private var retryingScanID: String?
    @State private var scanRetryErrors: [String: String] = [:]
    @State private var reviewedScan: FieldScanPendingUpload?

    private var isRecoveryBusy: Bool {
        isRetrying || retryingScanID != nil
    }

    var body: some View {
        VStack(spacing: 0) {
            statusStrip
            content
            FieldCompanionHearthView(
                presentation: companion.presentation,
                onOpen: openCompanion,
                onDismiss: { companion.send(.dismiss) }
            )
            .padding(.vertical, 8)
            footer
        }
        .background(CaptureColor.paper)
        .navigationTitle("Sync")
        .navigationBarTitleDisplayMode(.large)
        .task {
            analytics.screen(CaptureScreenID.u1Sync.rawValue)
            companion.send(.collapse(hint: "Checking sync", action: nil))
            await reload()
            for await snap in sync.snapshots {
                guard !Task.isCancelled else { break }
                snapshot = snap
                await reload()
            }
        }
        .task(id: retryRequest) {
            guard retryRequest > 0 else { return }
            isRetrying = true
            defer { isRetrying = false }
            updateCompanion()
            await sync.drain()
            guard !Task.isCancelled else { return }
            await siteScan.resumePendingUploads(retryFailures: true)
            guard !Task.isCancelled else { return }
            isRetrying = false
            await reload()
        }
        .task(id: retryingScanID) {
            guard let scanID = retryingScanID else { return }
            await retryScan(id: scanID)
        }
        .alert(item: $reviewedScan) { scan in
            Alert(
                title: Text("Review \(scan.name)"),
                message: Text(reviewMessage(for: scan)),
                primaryButton: .default(Text("Retry scan")) {
                    requestScanRetry(scan, reviewConfirmed: true)
                },
                secondaryButton: .cancel()
            )
        }
        .navigationBarBackButtonHidden(isRecoveryBusy)
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
                    .foregroundStyle(CaptureColor.error)
            }
            // Degrade honestly: the depth above counts work that this run will
            // lose. Deliberately flag-independent — an off switch on the truth
            // would put the designer back where this bug found her.
            if store.openReport.losesWorkOnRelaunch {
                Text(Self.inMemoryWarning)
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("u1.sync.in-memory-warning")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }

    /// Said plainly, and in the one place the designer looks to know her work
    /// is safe. There is no recovery she can perform, so this promises none —
    /// and it must never send her to relaunch the app, which is the single
    /// action that throws away everything this run is holding in memory.
    static let inMemoryWarning =
        "Nothing you capture here is being saved on this iPhone. "
        + "Send what you have before you leave — anything still here is gone "
        + "once the app closes."

    private var pendingCount: Int { rows.count + scanRows.count }
    private var hasRetryableTransfer: Bool {
        let hasRetryableCapture = rows.contains {
            let phase = $0.transferState.phase
            return phase == .queued || phase == .uploading
                || phase == .awaitingConfirmation || phase == .retryableFailure
        }
        let hasRetryableScan = scanRows.contains {
            FieldScanRecoveryPolicy.canResumeWithoutReview(
                phase: $0.state.phase,
                retryFailures: true
            )
        }
        return hasRetryableCapture || hasRetryableScan
    }

    private var headline: String {
        if rows.contains(where: { $0.transferState.phase == .rejected })
            || scanRows.contains(where: { $0.state.phase == .rejected }) {
            return "\(pendingCount) waiting · review needed"
        }
        if snapshot.failed > 0 || snapshot.lastError != nil
            || rows.contains(where: { $0.transferState.phase == .retryableFailure })
            || scanRows.contains(where: { $0.state.phase == .retryableFailure }) {
            return "\(pendingCount) waiting · retry available"
        }
        if rows.contains(where: { $0.transferState.phase == .awaitingConfirmation })
            || scanRows.contains(where: { $0.state.phase == .awaitingConfirmation }) {
            return "\(pendingCount) waiting · confirming"
        }
        if snapshot.uploading > 0
            || rows.contains(where: { $0.transferState.phase == .uploading })
            || scanRows.contains(where: { $0.state.phase == .uploading }) {
            return "\(pendingCount) waiting · uploading"
        }
        if pendingCount == 0 { return "Everything confirmed" }
        return "\(pendingCount) safely on this device"
    }

    private var headlineColor: Color {
        if snapshot.failed > 0 || snapshot.lastError != nil
            || rows.contains(where: {
                $0.transferState.phase == .retryableFailure
                    || $0.transferState.phase == .rejected
            })
            || scanRows.contains(where: {
                $0.state.phase == .retryableFailure || $0.state.phase == .rejected
            }) {
            return CaptureColor.error
        }
        if pendingCount == 0 { return CaptureColor.success }
        return CaptureColor.inkSoft
    }

    private var headlineDetail: String? {
        snapshot.lastError
            ?? rows.compactMap { $0.transferState.errorMessage }.first
            ?? scanRows.compactMap { $0.state.errorMessage }.first
    }

    // MARK: rows

    @ViewBuilder private var content: some View {
        if rows.isEmpty && scanRows.isEmpty {
            VStack(spacing: 10) {
                Image(systemName: "checkmark.seal")
                    .font(.largeTitle)
                    .foregroundStyle(CaptureColor.success)
                Text("Everything's confirmed")
                    .font(CaptureType.body)
                    .foregroundStyle(CaptureColor.inkSoft)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    if !rows.isEmpty {
                        sectionLabel("Captures")
                        ForEach(rows, id: \.id) { specimen in
                            Button {
                                analytics.event("sync.open_row", [
                                    "status": specimen.transferState.phase.rawValue
                                ])
                                coordinator.navigate(to: .specimen(specimen.id))
                            } label: {
                                row(specimen)
                            }
                            .buttonStyle(.plain)
                            Rectangle().fill(CaptureColor.line).frame(height: 1)
                        }
                    }
                    if !scanRows.isEmpty {
                        sectionLabel("Finish-later scans")
                        ForEach(scanRows) { scan in
                            scanRow(scan)
                            Rectangle().fill(CaptureColor.line).frame(height: 1)
                        }
                    }
                }
            }
        }
    }

    private func row(_ s: Specimen) -> some View {
        let status = rowStatus(for: s.transferState)
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

    private func scanRow(_ scan: FieldScanPendingUpload) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(scan.name)
                        .font(CaptureType.bodyEmph)
                        .foregroundStyle(CaptureColor.ink)
                    Text("SITE SCAN · FINISH-LATER TRANSFER")
                        .font(CaptureType.monoSmall)
                        .foregroundStyle(CaptureColor.inkSoft)
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 4) {
                    statusPill(
                        rowStatus(for: scan.state),
                        progress: scan.state.progress
                    )
                    scanRecoveryAction(scan)
                }
            }

            if let issue = scanIssue(for: scan) {
                Text("Issue: \(issue)")
                    .font(CaptureType.footnote)
                    .foregroundStyle(CaptureColor.error)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityLabel("Transfer issue: \(issue)")
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private func scanRecoveryAction(_ scan: FieldScanPendingUpload) -> some View {
        if retryingScanID == scan.id {
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.small)
                    .tint(CaptureColor.goldenHour)
                Text("Retrying…")
                    .font(CaptureType.eyebrow)
                    .textCase(.uppercase)
                    .foregroundStyle(CaptureColor.goldenHour)
            }
            .frame(minHeight: 44)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Retrying \(scan.name)")
        } else {
            switch FieldScanRecoveryPolicy.action(for: scan.state.phase) {
            case .retry:
                Button("Retry") {
                    requestScanRetry(scan, reviewConfirmed: false)
                }
                .buttonStyle(.bordered)
                .tint(CaptureColor.success)
                .frame(minHeight: 44)
                .disabled(isRecoveryBusy)
                .accessibilityLabel("Retry \(scan.name)")
                .accessibilityHint("Retries only this site scan")
                .accessibilityIdentifier("sync.scan.\(scan.id).retry")
            case .review:
                Button("Review") {
                    reviewedScan = scan
                    analytics.event("sync.review_scan", [
                        "status": scan.state.phase.rawValue
                    ])
                }
                .buttonStyle(.bordered)
                .tint(CaptureColor.error)
                .frame(minHeight: 44)
                .disabled(isRecoveryBusy)
                .accessibilityLabel("Review \(scan.name)")
                .accessibilityHint(
                    "Shows the recorded issue and asks before retrying"
                )
                .accessibilityIdentifier("sync.scan.\(scan.id).review")
            case .none:
                EmptyView()
            }
        }
    }

    private func scanIssue(for scan: FieldScanPendingUpload) -> String? {
        if let retryError = scanRetryErrors[scan.id], !retryError.isEmpty {
            return retryError
        }
        if let recordedError = scan.state.errorMessage, !recordedError.isEmpty {
            return recordedError
        }
        return nil
    }

    private func reviewMessage(for scan: FieldScanPendingUpload) -> String {
        let issue = scanIssue(for: scan)
            ?? "No additional error detail was recorded."
        return """
        Recorded issue:
        \(issue)

        Rejected scans are not included in Retry all. Retry only after reviewing this issue.
        """
    }

    private func sectionLabel(_ title: String) -> some View {
        Text(title)
            .font(CaptureType.eyebrow)
            .textCase(.uppercase)
            .foregroundStyle(CaptureColor.inkSoft)
            .padding(.horizontal, 20)
            .padding(.top, 18)
            .padding(.bottom, 6)
    }

    private func statusPill(_ status: RowStatus, progress: Int) -> some View {
        HStack(spacing: 6) {
            if status == .uploading {
                ProgressView().controlSize(.mini).tint(CaptureColor.goldenHour)
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
                retryRequest += 1
            } label: {
                Text(isRetrying ? "Retrying…" : "Retry all")
                    .font(CaptureType.bodyEmph)
                    .foregroundStyle(CaptureColor.paper3)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(hasRetryableTransfer ? CaptureColor.success : CaptureColor.inkSoft)
                    )
            }
            .disabled(!hasRetryableTransfer || isRecoveryBusy)
            .accessibilityHint(
                "Retries queued and paused work. Rejected scans require review."
            )

            Button("Done") { coordinator.goBack() }
                .font(CaptureType.bodyEmph)
                .foregroundStyle(CaptureColor.ink)
                .padding(.vertical, 14)
                .padding(.horizontal, 16)
                .disabled(isRecoveryBusy)
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 16)
        .background(CaptureColor.paper2)
    }

    // MARK: data

    private func reload() async {
        let nextRows = captureOutbox()
            .filter { $0.transferState.phase != .complete }
            .sorted { weight($0) < weight($1) }
        let nextScanRows = await siteScan.pendingUploads()
        guard !Task.isCancelled else { return }

        let pendingScanIDs = Set(nextScanRows.map(\.id))
        rows = nextRows
        scanRows = nextScanRows
        scanRetryErrors = scanRetryErrors.filter {
            pendingScanIDs.contains($0.key)
        }
        if let reviewedScan,
           !nextScanRows.contains(where: {
               $0.id == reviewedScan.id && $0.state.phase == .rejected
           }) {
            self.reviewedScan = nil
        }
        updateCompanion()
    }

    private func captureOutbox() -> [Specimen] {
        switch localListScope {
        case .globalFixtures:
            return store.outbox()
        case .owner(let owner):
            return store.outbox(owner: owner)
        case .unavailable:
            return []
        }
    }

    private var localListScope: CaptureLocalListScope {
        CaptureOwnerProjectionPolicy.resolve(
            runsRealServices: AppConfiguration.runsRealServices,
            userID: session.userID,
            workspaceID: session.workspaceID)
    }

    // swiftlint:disable:next function_body_length
    private func updateCompanion() {
        let captureStates = rows.map(\.transferState)
        let scanStates = scanRows.map(\.state)
        let states = captureStates + scanStates

        if let retryingScanID {
            let scanName = scanRows.first(where: { $0.id == retryingScanID })?.name
                ?? "site scan"
            companion.send(.reportProgress(.init(
                activityID: "field.sync.scan.\(retryingScanID)",
                kind: .indeterminate,
                title: "Retrying \(scanName)",
                detail: "Waiting for a confirmed receipt for this scan"
            )))
            return
        }

        if isRetrying {
            let uploading = states.filter { $0.phase == .uploading }
            if snapshot.uploading > 0 || !uploading.isEmpty {
                companion.send(.reportProgress(.init(
                    activityID: "field.sync.retry",
                    kind: .averaging(percentages: uploading.map(\.progress)),
                    title: "Sending your work",
                    detail: transferCountDetail
                )))
                return
            }

            if states.contains(where: { $0.phase == .awaitingConfirmation }) {
                companion.send(.reportProgress(.init(
                    activityID: "field.sync.retry",
                    kind: .indeterminate,
                    title: "Confirming your work",
                    detail: transferCountDetail
                )))
                return
            }

            companion.send(.reportProgress(.init(
                activityID: "field.sync.retry",
                kind: .indeterminate,
                title: "Retrying your work",
                detail: "Everything remains safely on this device"
            )))
            return
        }

        if states.contains(where: { $0.phase == .rejected }) {
            companion.send(.communicate(.init(
                title: "A transfer needs review",
                detail: "It remains safely on this device and won’t be sent again until it’s reviewed."
            )))
            return
        }

        if snapshot.failed > 0 || snapshot.lastError != nil
            || states.contains(where: { $0.phase == .retryableFailure }) {
            companion.send(.communicate(.init(
                title: "A transfer paused safely",
                detail: "Nothing was lost. Use Retry all when you’re ready to continue."
            )))
            return
        }

        if states.contains(where: { $0.phase == .awaitingConfirmation }) {
            companion.send(.reportProgress(.init(
                activityID: "field.sync",
                kind: .indeterminate,
                title: "Confirming your work",
                detail: transferCountDetail
            )))
            return
        }

        let uploading = states.filter { $0.phase == .uploading }
        if snapshot.uploading > 0 || !uploading.isEmpty {
            companion.send(.reportProgress(.init(
                activityID: "field.sync",
                kind: .averaging(percentages: uploading.map(\.progress)),
                title: "Sending your work",
                detail: transferCountDetail
            )))
            return
        }

        companion.send(.collapse(hint: headline, action: nil))
    }

    private var transferCountDetail: String {
        pendingCount == 1
            ? "1 transfer is safely in progress"
            : "\(pendingCount) transfers are safely in progress"
    }

    private func openCompanion() {
        companion.send(.communicate(.init(
            title: headline,
            detail: pendingCount == 0
                ? "Everything you captured has been confirmed."
                : "Every pending item remains safely on this device until it is confirmed."
        )))
    }

    private func requestScanRetry(
        _ scan: FieldScanPendingUpload,
        reviewConfirmed: Bool
    ) {
        guard !isRecoveryBusy,
              let currentScan = scanRows.first(where: { $0.id == scan.id }),
              FieldScanRecoveryPolicy.allowsIndividualRetry(
                  phase: currentScan.state.phase,
                  reviewConfirmed: reviewConfirmed
              ) else { return }

        scanRetryErrors.removeValue(forKey: currentScan.id)
        analytics.event("sync.retry_scan", [
            "status": currentScan.state.phase.rawValue,
            "review_confirmed": reviewConfirmed ? "true" : "false"
        ])
        retryingScanID = currentScan.id
        updateCompanion()
    }

    private func retryScan(id: String) async {
        guard let scan = scanRows.first(where: { $0.id == id }) else {
            await reload()
            guard !Task.isCancelled else { return }
            companion.send(.communicate(.init(
                title: "Retry could not start",
                detail: "This scan transfer is no longer listed on this device."
            )))
            retryingScanID = nil
            return
        }

        do {
            _ = try await siteScan.retryPendingUpload(id: id)
            guard !Task.isCancelled else { return }
            scanRetryErrors.removeValue(forKey: id)
            await reload()
            guard !Task.isCancelled else { return }
            analytics.event("sync.retry_scan_succeeded")
            reportScanRetrySuccess(scan)
            retryingScanID = nil
        } catch {
            guard !Task.isCancelled else { return }
            let message = retryErrorMessage(error)
            scanRetryErrors[id] = message
            await reload()
            guard !Task.isCancelled else { return }
            analytics.event("sync.retry_scan_failed", [
                "status": scan.state.phase.rawValue
            ])
            companion.send(.communicate(.init(
                title: "Retry could not finish",
                detail: retryFailureDetail(
                    scan: scan,
                    message: message
                )
            )))
            retryingScanID = nil
        }
    }

    private func reportScanRetrySuccess(_ scan: FieldScanPendingUpload) {
        guard pendingCount > 0 else {
            companion.send(.collapse(
                hint: "\(scan.name) confirmed",
                action: nil
            ))
            return
        }

        let remaining = pendingCount == 1
            ? "1 transfer remains listed below."
            : "\(pendingCount) transfers remain listed below."
        companion.send(.communicate(.init(
            title: "\(scan.name) confirmed",
            detail: remaining
        )))
    }

    private func retryErrorMessage(_ error: Error) -> String {
        let message = error.localizedDescription
        return message.isEmpty ? "Retry could not be completed." : message
    }

    private func retryFailureDetail(
        scan: FieldScanPendingUpload,
        message: String
    ) -> String {
        if scanRows.contains(where: { $0.id == scan.id }) {
            return "\(scan.name) is still listed below. \(message)"
        }
        return message
    }

    private func weight(_ s: Specimen) -> Int {
        switch s.transferState.phase {
        case .uploading, .awaitingConfirmation: return 0
        case .retryableFailure, .rejected: return 1
        case .local, .queued: return 2
        case .complete: return 3
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
        case local, uploading, confirming, queued, retry, rejected
        func label(progress: Int) -> String {
            switch self {
            case .local: return "on device"
            case .uploading: return progress > 0 ? "uploading \(progress)%" : "uploading"
            case .confirming: return "confirming"
            case .queued: return "queued"
            case .retry: return "retry"
            case .rejected: return "review"
            }
        }
        var color: Color {
            switch self {
            case .local: return CaptureColor.inkSoft
            case .uploading: return CaptureColor.goldenHour
            case .confirming: return CaptureColor.goldenHour
            case .queued: return CaptureColor.inkSoft
            case .retry: return CaptureColor.error
            case .rejected: return CaptureColor.error
            }
        }
    }

    private func rowStatus(for transfer: CaptureTransferState) -> RowStatus {
        switch transfer.phase {
        case .local: return .local
        case .queued: return .queued
        case .uploading: return .uploading
        case .awaitingConfirmation: return .confirming
        case .retryableFailure: return .retry
        case .rejected: return .rejected
        case .complete: return .confirming
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
            siteScan: MockSiteScanService(),
            session: MockSessionProviding(),
            companion: FieldCompanionController(),
            analytics: MockCaptureAnalytics(),
            coordinator: CaptureCoordinator()
        )
    }
}
#endif
