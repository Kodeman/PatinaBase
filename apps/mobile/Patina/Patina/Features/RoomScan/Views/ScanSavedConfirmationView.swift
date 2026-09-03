//
//  ScanSavedConfirmationView.swift
//  Patina
//
//  Screen 09a: shown after the user submits the post-scan review. Confirms
//  the scan was saved locally and — critically — that it STAYS on the phone
//  until the user chooses to send it to a designer. Strict local-until-
//  request: no upload happens here or in the background. The primary door
//  onward is "Get design help", which opens the design-request flow with
//  this scan preselected.
//

import SwiftUI
import SwiftData

struct ScanSavedConfirmationView: View {

    let scanId: UUID
    let onDone: () -> Void
    let onSetStyle: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.appCoordinator) private var coordinator
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
            PatinaColors.Background.primary.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                VStack(spacing: 16) {
                    Image(systemName: "checkmark.circle")
                        .font(.system(size: 52, weight: .light))
                        .foregroundStyle(PatinaColors.Text.primary.opacity(0.85))

                    Text("Saved to your rooms")
                        .font(PatinaTypography.voiceLead)
                        .foregroundStyle(PatinaColors.Text.primary.opacity(0.9))
                        .multilineTextAlignment(.center)

                    if let name = displayRoomName, !name.isEmpty {
                        Text(name)
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.muted)
                    }

                    Text("Your scan stays on this phone until you send it to a designer.")
                        .font(PatinaTypography.bodySmall)
                        .foregroundStyle(PatinaColors.Text.muted)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 24)
                        .fixedSize(horizontal: false, vertical: true)
                }

                heldCard
                    .padding(.horizontal, 24)

                Spacer()

                // U36: three visually distinct levels — filled primary,
                // bordered secondary, plain-text tertiary — read top to
                // bottom in that order of prominence.
                VStack(spacing: 12) {
                    StyleContinueButton(
                        title: "Get design help",
                        isEnabled: true,
                        action: getDesignHelp
                    )

                    Button(action: onSetStyle) {
                        Text("Set my style")
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
                    .accessibilityLabel("Continue to style conversation")

                    Button(action: onDone) {
                        Text("Done")
                            .font(PatinaTypography.bodySmallMedium)
                            .foregroundStyle(PatinaColors.Text.primary.opacity(0.9))
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 42)
            }
        }
    }

    // MARK: - Held card

    private var heldCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "internaldrive")
                .font(.system(size: 18, weight: .regular))
                .foregroundStyle(PatinaColors.Text.interactive)

            VStack(alignment: .leading, spacing: 3) {
                Text("Saved on this phone")
                    .font(PatinaTypography.bodySmallMedium)
                    .foregroundStyle(PatinaColors.Text.primary.opacity(0.9))
                Text("Only you can see it. Nothing is uploaded until you send it to a designer.")
                    .font(PatinaTypography.captionRegular)
                    .foregroundStyle(PatinaColors.Text.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(PatinaColors.Background.secondary)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(PatinaColors.Border.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Saved on this phone. Nothing is uploaded until you send it to a designer."))
    }

    // MARK: - Actions

    private func getDesignHelp() {
        HapticManager.shared.impact(.light)
        coordinator.presentDesignServices(roomId: nil, preselectedScanIds: [scanId])
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
}
