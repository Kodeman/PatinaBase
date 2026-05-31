//
//  ScanSavedConfirmationView.swift
//  Patina
//
//  Screen 09a: shown after the user submits the post-scan review. Confirms
//  the scan was saved locally and exposes the background upload progress.
//  Replaces the implicit "Soft Landing → Style Conversation" handoff for
//  the save-first flow — the style conversation is now opt-in.
//

import SwiftUI
import SwiftData

struct ScanSavedConfirmationView: View {

    let scanId: UUID
    let onDone: () -> Void
    let onSetStyle: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Query private var packages: [RoomScanPackage]

    init(
        scanId: UUID,
        onDone: @escaping () -> Void,
        onSetStyle: @escaping () -> Void
    ) {
        self.scanId = scanId
        self.onDone = onDone
        self.onSetStyle = onSetStyle
        _packages = Query(filter: #Predicate<RoomScanPackage> { $0.scanId == scanId })
    }

    private var package: RoomScanPackage? { packages.first }

    var body: some View {
        ZStack {
            PatinaColors.offWhite.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                VStack(spacing: 16) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 52, weight: .light))
                        .foregroundStyle(PatinaColors.charcoal.opacity(0.85))

                    Text("Saved to your rooms")
                        .font(.custom("PlayfairDisplay-Italic", size: 24))
                        .foregroundStyle(PatinaColors.charcoal.opacity(0.9))
                        .multilineTextAlignment(.center)

                    if let name = displayRoomName, !name.isEmpty {
                        Text(name)
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.agedOak)
                    }

                    Text("Your scan is on this phone. We'll finish uploading it quietly in the background — you can close this anytime.")
                        .font(.custom("Inter-Regular", size: 13))
                        .foregroundStyle(PatinaColors.agedOak)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .fixedSize(horizontal: false, vertical: true)
                }

                uploadProgressCard
                    .padding(.horizontal, 24)

                Spacer()

                VStack(spacing: 12) {
                    StyleContinueButton(
                        title: "Done",
                        isEnabled: true,
                        action: onDone
                    )

                    Button(action: onSetStyle) {
                        Text("Set my style")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.agedOak)
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Continue to style conversation")
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 42)
            }
        }
    }

    // MARK: - Upload progress

    private var uploadProgressCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Uploading")
                    .font(PatinaTypography.mono)
                    .tracking(0.6)
                    .textCase(.uppercase)
                    .foregroundStyle(PatinaColors.Text.interactive)
                Spacer()
                Text(progressLabel)
                    .font(.custom("DMMono-Regular", size: 11))
                    .foregroundStyle(PatinaColors.agedOak)
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(PatinaColors.pearl.opacity(0.5))
                    Capsule()
                        .fill(PatinaColors.charcoal.opacity(0.75))
                        .frame(width: max(4, proxy.size.width * CGFloat(progressFraction)))
                        .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: progressFraction)
                }
            }
            .frame(height: 6)

            if let hint = progressHint {
                Text(hint)
                    .font(.custom("Inter-Regular", size: 12))
                    .foregroundStyle(PatinaColors.agedOak.opacity(0.85))
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(PatinaColors.softCream)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(PatinaColors.pearl, lineWidth: 1)
        )
    }

    // MARK: - Derived state

    private var displayRoomName: String? {
        if let pkg = package,
           let provided = pkg.userProvidedRoomName,
           !provided.isEmpty {
            return provided
        }
        return nil
    }

    private var progressFraction: Double {
        guard let pkg = package else { return 0 }
        let state = pkg.artifactState

        let artifactTotal = max(state.artifacts.count, 1)
        let artifactDone = state.artifacts.filter {
            $0.status == .uploaded || $0.status == .skipped
        }.count

        let photoTotal = state.photosTotal
        let photoDone = state.photosUploaded

        // Weight artifacts and photos equally — if one side is absent we fall
        // back to the other rather than showing a misleading 50%.
        let hasArtifacts = state.artifacts.isEmpty == false
        let hasPhotos = photoTotal > 0

        if hasArtifacts && hasPhotos {
            let a = Double(artifactDone) / Double(artifactTotal)
            let p = Double(photoDone) / Double(photoTotal)
            return min(1, max(0, (a + p) / 2))
        } else if hasArtifacts {
            return min(1, max(0, Double(artifactDone) / Double(artifactTotal)))
        } else if hasPhotos {
            return min(1, max(0, Double(photoDone) / Double(photoTotal)))
        } else {
            return pkg.status == .synced ? 1 : 0
        }
    }

    private var progressLabel: String {
        guard let pkg = package else { return "Pending" }
        switch pkg.status {
        case .pending:   return "Pending"
        case .syncing:   return "\(Int((progressFraction * 100).rounded()))%"
        case .synced:    return "Done"
        case .failed:    return "Paused"
        }
    }

    private var progressHint: String? {
        guard let pkg = package else {
            return "Starting upload…"
        }
        switch pkg.status {
        case .pending:
            return "Waiting to start — we'll pick it up on the next connection."
        case .syncing:
            return nil
        case .synced:
            return "All files are on our servers."
        case .failed:
            if let err = pkg.lastError, !err.isEmpty {
                return "Paused: \(err). We'll retry in the background."
            }
            return "Paused. We'll retry in the background."
        }
    }
}
